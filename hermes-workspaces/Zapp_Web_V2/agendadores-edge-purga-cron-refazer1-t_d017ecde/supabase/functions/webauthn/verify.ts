// verify.ts — Verificação criptográfica de asserção WebAuthn (falha fechada).
// Sem dependências externas: usa apenas WebCrypto. Consumido por
// supabase/functions/webauthn/index.ts e exercitado diretamente por verify.test.ts.
//
// R2-AUTH-001: a verificação só aceita a autenticação quando a resposta traz e
// valida, em conjunto, `signature`, `authenticatorData` e `clientDataJSON`, com
// challenge, origem, RP ID e assinatura conferidos de verdade. Ausência, formato
// inválido ou divergência em qualquer um desses itens falha de forma fechada.

// ─── base64url ────────────────────────────────────────────────

export function bytesToBase64url(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── sha256 ───────────────────────────────────────────────────

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(digest);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

// ─── CBOR (subconjunto mínimo do que aparece em WebAuthn) ─────

export function cborDecode(bytes: Uint8Array): unknown {
  let offset = 0;

  function readByte(): number {
    if (offset >= bytes.length) throw new Error('CBOR: unexpected end');
    return bytes[offset++];
  }
  function readBytes(n: number): Uint8Array {
    if (offset + n > bytes.length) throw new Error('CBOR: truncated');
    const out = bytes.slice(offset, offset + n);
    offset += n;
    return out;
  }
  function readLen(additional: number): number {
    if (additional < 24) return additional;
    if (additional === 24) return readByte();
    if (additional === 25) {
      const b = readBytes(2);
      return (b[0] << 8) | b[1];
    }
    if (additional === 26) {
      const b = readBytes(4);
      return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    }
    if (additional === 27) {
      const b = readBytes(8);
      const hi = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
      const lo = ((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) >>> 0;
      return hi * 4294967296 + lo;
    }
    throw new Error('CBOR: unsupported length/indefinite');
  }

  function decode(): unknown {
    const initial = readByte();
    const major = initial >> 5;
    const additional = initial & 0x1f;
    switch (major) {
      case 0:
        return readLen(additional);
      case 1:
        return -1 - readLen(additional);
      case 2:
        return readBytes(readLen(additional));
      case 3:
        return new TextDecoder().decode(readBytes(readLen(additional)));
      case 4: {
        const n = readLen(additional);
        const arr: unknown[] = [];
        for (let i = 0; i < n; i++) arr.push(decode());
        return arr;
      }
      case 5: {
        const n = readLen(additional);
        const map = new Map<number | string, unknown>();
        for (let i = 0; i < n; i++) {
          const k = decode();
          const v = decode();
          map.set(k as number | string, v);
        }
        return map;
      }
      case 6:
        throw new Error('CBOR: tags unsupported');
      case 7: {
        if (additional === 20) return false;
        if (additional === 21) return true;
        if (additional === 22) return null;
        throw new Error('CBOR: unsupported simple/float value');
      }
      default:
        throw new Error('CBOR: unsupported major type ' + major);
    }
  }

  return decode();
}

// ─── COSE → WebCrypto ────────────────────────────────────────
// Labels COSE (RFC 9052/9053): 1=kty, 3=alg; EC2: -1=crv, -2=x, -3=y;
// RSA: -1=n (módulo), -2=e (expoente).

const COSE_KTY = 1;
const COSE_ALG = 3;
const COSE_CRV = -1;
const COSE_X = -2;
const COSE_Y = -3;
const COSE_N = -1;
const COSE_E = -2;

const COSE_KTY_EC2 = 2;
const COSE_KTY_RSA = 3;
const COSE_ALG_ES256 = -7;
const COSE_ALG_RS256 = -257;
const COSE_CRV_P256 = 1;

function stripLeadingZeros(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  return b.slice(i);
}

function padLeft(b: Uint8Array, len: number): Uint8Array {
  if (b.length === len) return b;
  if (b.length > len) throw new Error('value too long to pad to ' + len);
  const out = new Uint8Array(len);
  out.set(b, len - b.length);
  return out;
}

export interface CoseCryptoKey {
  algorithm: 'ECDSA' | 'RSASSA-PKCS1-v1_5';
  cryptoKey: CryptoKey;
}

export async function coseKeyToCrypto(coseBytes: Uint8Array): Promise<CoseCryptoKey> {
  const decoded = cborDecode(coseBytes);
  if (!(decoded instanceof Map)) throw new Error('COSE key is not a CBOR map');
  const kty = decoded.get(COSE_KTY);
  const alg = decoded.get(COSE_ALG);

  if (kty === COSE_KTY_EC2) {
    if (alg !== COSE_ALG_ES256) throw new Error('unsupported EC2 algorithm: ' + alg);
    if (decoded.get(COSE_CRV) !== COSE_CRV_P256) throw new Error('unsupported EC2 curve');
    const x = decoded.get(COSE_X);
    const y = decoded.get(COSE_Y);
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw new Error('EC2 key missing x/y');
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToBase64url(padLeft(stripLeadingZeros(x), 32)),
      y: bytesToBase64url(padLeft(stripLeadingZeros(y), 32)),
    };
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk as unknown as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return { algorithm: 'ECDSA', cryptoKey };
  }

  if (kty === COSE_KTY_RSA) {
    if (alg !== COSE_ALG_RS256) throw new Error('unsupported RSA algorithm: ' + alg);
    const n = decoded.get(COSE_N);
    const e = decoded.get(COSE_E);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) throw new Error('RSA key missing n/e');
    const jwk = {
      kty: 'RSA',
      n: bytesToBase64url(stripLeadingZeros(n)),
      e: bytesToBase64url(stripLeadingZeros(e)),
      alg: 'RS256',
    };
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk as unknown as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return { algorithm: 'RSASSA-PKCS1-v1_5', cryptoKey };
  }

  throw new Error('unsupported COSE key type: ' + kty);
}

// ─── Extração da chave pública da credencial ─────────────────

export function extractPublicKeyFromAuthData(authData: Uint8Array): Uint8Array {
  let offset = 37; // rpIdHash(32) + flags(1) + signCount(4)
  if (authData.length < offset + 18) throw new Error('authData too short for attested credential data');
  offset += 16; // aaguid
  const credIdLen = (authData[offset] << 8) | authData[offset + 1];
  offset += 2 + credIdLen;
  if (offset >= authData.length) throw new Error('authData missing credential public key');
  return authData.slice(offset);
}

// Aceita tanto a chave COSE pura quanto o attestationObject legado (o qual,
// antes da correção, era gravado na coluna public_key).
export function extractCredentialPublicKey(stored: Uint8Array): Uint8Array {
  const decoded = cborDecode(stored);
  if (decoded instanceof Map) {
    const authData = decoded.get('authData');
    if (authData instanceof Uint8Array) return extractPublicKeyFromAuthData(authData);
  }
  return stored;
}

// ─── Conversão DER → IEEE P1363 (assinatura ECDSA ES256) ─────
// WebAuthn exige assinatura ECDSA em ASN.1 DER; WebCrypto verifica em P1363.

function derToRawEcdsa(der: Uint8Array): Uint8Array {
  if (der.length < 8 || der[0] !== 0x30 || der[1] >= 0x80) {
    throw new Error('invalid ECDSA DER signature');
  }
  let offset = 2; // pula 0x30 + tamanho (forma curta)
  if (der[offset] !== 0x02) throw new Error('invalid DER: missing r');
  const rLen = der[offset + 1];
  offset += 2;
  const r = padLeft(stripLeadingZeros(der.slice(offset, offset + rLen)), 32);
  offset += rLen;
  if (der[offset] !== 0x02) throw new Error('invalid DER: missing s');
  const sLen = der[offset + 1];
  offset += 2;
  const s = padLeft(stripLeadingZeros(der.slice(offset, offset + sLen)), 32);
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return out;
}

// ─── Verificação da asserção ─────────────────────────────────

export interface AssertionInput {
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  storedPublicKey: string;
  storedCounter: number;
  challenge: string;
  rpId: string;
  expectedOrigin: string;
}

export type AssertionResult =
  | { ok: true; newCounter: number }
  | { ok: false; reason: string };

export async function verifyAuthenticationAssertion(input: AssertionInput): Promise<AssertionResult> {
  // 1. Presença dos três campos assinados — falha fechada na ausência.
  if (!input.clientDataJSON || !input.authenticatorData || !input.signature) {
    return { ok: false, reason: 'missing signature, authenticatorData or clientDataJSON' };
  }
  if (!input.storedPublicKey) return { ok: false, reason: 'credential has no stored public key' };

  let clientDataBytes: Uint8Array;
  let authDataBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    clientDataBytes = base64urlToBytes(input.clientDataJSON);
    authDataBytes = base64urlToBytes(input.authenticatorData);
    signatureBytes = base64urlToBytes(input.signature);
  } catch {
    return { ok: false, reason: 'invalid base64url encoding' };
  }

  // 2. clientDataJSON: tipo, challenge e origem.
  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown };
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  } catch {
    return { ok: false, reason: 'invalid clientDataJSON' };
  }
  if (clientData.type !== 'webauthn.get') return { ok: false, reason: 'invalid client data type' };
  if (clientData.challenge !== input.challenge) return { ok: false, reason: 'challenge mismatch' };
  if (clientData.origin !== input.expectedOrigin) return { ok: false, reason: 'origin mismatch' };

  // 3. authenticatorData: tamanho, hash do RP ID e flag de presença do usuário.
  if (authDataBytes.length < 37) return { ok: false, reason: 'authenticatorData too short' };
  const rpIdHash = authDataBytes.slice(0, 32);
  const expectedRpIdHash = await sha256(new TextEncoder().encode(input.rpId));
  if (!constantTimeEqual(rpIdHash, expectedRpIdHash)) return { ok: false, reason: 'RP ID hash mismatch' };

  const flags = authDataBytes[32];
  if ((flags & 0x01) === 0) return { ok: false, reason: 'user presence flag not set' };

  const newCounter = readUint32BE(authDataBytes, 33);

  // 4. Assinatura sobre authenticatorData || SHA-256(clientDataJSON).
  let verified = false;
  try {
    const coseBytes = extractCredentialPublicKey(base64urlToBytes(input.storedPublicKey));
    const cose = await coseKeyToCrypto(coseBytes);
    const clientDataHash = await sha256(clientDataBytes);
    const signedData = new Uint8Array(authDataBytes.length + 32);
    signedData.set(authDataBytes, 0);
    signedData.set(clientDataHash, authDataBytes.length);
    const signature = cose.algorithm === 'ECDSA' ? derToRawEcdsa(signatureBytes) : signatureBytes;
    const algorithm =
      cose.algorithm === 'ECDSA'
        ? { name: 'ECDSA', hash: 'SHA-256' }
        : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    verified = await crypto.subtle.verify(
      algorithm as AlgorithmIdentifier,
      cose.cryptoKey,
      signature as BufferSource,
      signedData as BufferSource,
    );
  } catch {
    verified = false;
  }
  if (!verified) return { ok: false, reason: 'invalid signature' };

  // 5. Anti-replay: o contador assinado deve avançar quando ambos os lados o controlam.
  if (input.storedCounter > 0 && newCounter > 0 && newCounter <= input.storedCounter) {
    return { ok: false, reason: 'signature counter did not advance' };
  }

  return { ok: true, newCounter };
}
