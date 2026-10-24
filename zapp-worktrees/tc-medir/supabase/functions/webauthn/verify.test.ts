import {
  verifyAuthenticationAssertion,
  bytesToBase64url,
  base64urlToBytes,
  sha256,
} from './verify.ts';

// ─── CBOR encode mínimo (para construir chaves COSE no teste) ───

function encLen(major: number, n: number): number[] {
  const prefix = major << 5;
  if (n < 24) return [prefix | n];
  if (n < 256) return [prefix | 24, n];
  return [prefix | 25, (n >> 8) & 0xff, n & 0xff];
}
function encUint(n: number): number[] {
  return encLen(0, n);
}
function encNeg(n: number): number[] {
  return encLen(1, -1 - n);
}
function encIntKey(n: number): number[] {
  return n < 0 ? encNeg(n) : encUint(n);
}
function encBytes(b: Uint8Array): number[] {
  return [...encLen(2, b.length), ...b];
}
function encMap(entries: [number, number | Uint8Array][]): Uint8Array {
  const out: number[] = [...encLen(5, entries.length)];
  for (const [k, v] of entries) {
    out.push(...encIntKey(k));
    if (typeof v === 'number') out.push(...(v < 0 ? encNeg(v) : encUint(v)));
    else out.push(...encBytes(v));
  }
  return new Uint8Array(out);
}

// ─── DER (ASN.1) para assinatura ECDSA (WebAuthn usa DER) ───

function derInteger(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  const v = bytes.slice(i);
  if (v[0] & 0x80) {
    const out = new Uint8Array(v.length + 3);
    out[0] = 0x02;
    out[1] = v.length + 1;
    out[2] = 0x00;
    out.set(v, 3);
    return out;
  }
  const out = new Uint8Array(v.length + 2);
  out[0] = 0x02;
  out[1] = v.length;
  out.set(v, 2);
  return out;
}
function rawToDer(raw: Uint8Array): Uint8Array {
  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);
  const body = new Uint8Array([...derInteger(r), ...derInteger(s)]);
  const out = new Uint8Array(body.length + 2);
  out[0] = 0x30;
  out[1] = body.length;
  out.set(body, 2);
  return out;
}

const RP_ID = 'zapp-web-v2.vercel.app';
const ORIGIN = 'https://zapp-web-v2.vercel.app';
const CHALLENGE = 'c2FtcGxlLWNoYWxsZW5nZQ'; // "sample-challenge"

interface BuiltAssertion {
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  storedPublicKey: string;
  storedCounter: number;
  challenge: string;
  rpId: string;
  expectedOrigin: string;
}

async function buildAssertion(opts: {
  origin?: string;
  challenge?: string;
  counter?: number;
  flags?: number;
} = {}): Promise<BuiltAssertion> {
  const origin = opts.origin ?? ORIGIN;
  const challenge = opts.challenge ?? CHALLENGE;
  const counter = opts.counter ?? 1;
  const flags = opts.flags ?? 0x01;

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
  const x = base64urlToBytes(jwk.x!);
  const y = base64urlToBytes(jwk.y!);
  const coseKey = encMap([
    [1, 2], // kty EC2
    [3, -7], // alg ES256
    [-1, 1], // crv P-256
    [-2, x],
    [-3, y],
  ]);

  const clientDataBytes = new TextEncoder().encode(
    JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }),
  );

  const rpIdHash = await sha256(new TextEncoder().encode(RP_ID));
  const authDataBytes = new Uint8Array(37);
  authDataBytes.set(rpIdHash, 0);
  authDataBytes[32] = flags;
  authDataBytes[33] = (counter >>> 24) & 0xff;
  authDataBytes[34] = (counter >>> 16) & 0xff;
  authDataBytes[35] = (counter >>> 8) & 0xff;
  authDataBytes[36] = counter & 0xff;

  const clientDataHash = await sha256(clientDataBytes);
  const signedData = new Uint8Array(authDataBytes.length + 32);
  signedData.set(authDataBytes, 0);
  signedData.set(clientDataHash, authDataBytes.length);

  const rawSignature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      signedData as BufferSource,
    ),
  );

  return {
    clientDataJSON: bytesToBase64url(clientDataBytes),
    authenticatorData: bytesToBase64url(authDataBytes),
    signature: bytesToBase64url(rawToDer(rawSignature)),
    storedPublicKey: bytesToBase64url(coseKey),
    storedCounter: 0,
    challenge: CHALLENGE,
    rpId: RP_ID,
    expectedOrigin: ORIGIN,
  };
}

async function buildRsaAssertion(): Promise<BuiltAssertion> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const jwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
  const n = base64urlToBytes(jwk.n!);
  const e = base64urlToBytes(jwk.e!);
  const coseKey = encMap([
    [1, 3], // kty RSA
    [3, -257], // alg RS256
    [-1, n], // n (módulo)
    [-2, e], // e (expoente)
  ]);

  const clientDataBytes = new TextEncoder().encode(
    JSON.stringify({ type: 'webauthn.get', challenge: CHALLENGE, origin: ORIGIN, crossOrigin: false }),
  );

  const rpIdHash = await sha256(new TextEncoder().encode(RP_ID));
  const authDataBytes = new Uint8Array(37);
  authDataBytes.set(rpIdHash, 0);
  authDataBytes[32] = 0x01;
  authDataBytes[36] = 0x01; // counter = 1

  const clientDataHash = await sha256(clientDataBytes);
  const signedData = new Uint8Array(authDataBytes.length + 32);
  signedData.set(authDataBytes, 0);
  signedData.set(clientDataHash, authDataBytes.length);

  const rawSignature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      keyPair.privateKey,
      signedData as BufferSource,
    ),
  );

  return {
    clientDataJSON: bytesToBase64url(clientDataBytes),
    authenticatorData: bytesToBase64url(authDataBytes),
    signature: bytesToBase64url(rawSignature),
    storedPublicKey: bytesToBase64url(coseKey),
    storedCounter: 0,
    challenge: CHALLENGE,
    rpId: RP_ID,
    expectedOrigin: ORIGIN,
  };
}

function flipLastByte(b64: string): string {
  const bytes = base64urlToBytes(b64);
  bytes[bytes.length - 1] ^= 0x01;
  return bytesToBase64url(bytes);
}

// ─── Testes ───────────────────────────────────────────────────

Deno.test('webauthn: aceita asserção ES256 válida (caminho válido)', async () => {
  const a = await buildAssertion();
  const res = await verifyAuthenticationAssertion(a);
  if (!res.ok) throw new Error('esperado ok, obtido: ' + res.reason);
  if (res.newCounter !== 1) throw new Error('esperado contador 1');
});

Deno.test('webauthn: aceita asserção RS256 válida', async () => {
  const a = await buildRsaAssertion();
  const res = await verifyAuthenticationAssertion(a);
  if (!res.ok) throw new Error('esperado ok, obtido: ' + res.reason);
});

Deno.test('webauthn: rejeita ausência de signature', async () => {
  const a = await buildAssertion();
  const res = await verifyAuthenticationAssertion({ ...a, signature: '' });
  if (res.ok) throw new Error('esperado falha para signature ausente');
});

Deno.test('webauthn: rejeita ausência de authenticatorData', async () => {
  const a = await buildAssertion();
  const res = await verifyAuthenticationAssertion({ ...a, authenticatorData: '' });
  if (res.ok) throw new Error('esperado falha para authenticatorData ausente');
});

Deno.test('webauthn: rejeita ausência de clientDataJSON', async () => {
  const a = await buildAssertion();
  const res = await verifyAuthenticationAssertion({ ...a, clientDataJSON: '' });
  if (res.ok) throw new Error('esperado falha para clientDataJSON ausente');
});

Deno.test('webauthn: rejeita origem inválida', async () => {
  // Asserção assinada corretamente, porém para uma origem diferente.
  const a = await buildAssertion({ origin: 'https://evil.example.com' });
  const res = await verifyAuthenticationAssertion(a);
  if (res.ok) throw new Error('esperado falha para origem divergente');
  if (!res.ok && res.reason !== 'origin mismatch') throw new Error('esperado origin mismatch, obtido: ' + res.reason);
});

Deno.test('webauthn: rejeita challenge divergente', async () => {
  const a = await buildAssertion({ challenge: 'ZGlmZmVyZW50LWNoYWxsZW5nZQ' });
  const res = await verifyAuthenticationAssertion(a);
  if (res.ok) throw new Error('esperado falha para challenge divergente');
});

Deno.test('webauthn: rejeita assinatura inválida', async () => {
  const a = await buildAssertion();
  const res = await verifyAuthenticationAssertion({ ...a, signature: flipLastByte(a.signature) });
  if (res.ok) throw new Error('esperado falha para assinatura inválida');
});

Deno.test('webauthn: rejeita RP ID hash divergente', async () => {
  const a = await buildAssertion();
  const authData = base64urlToBytes(a.authenticatorData);
  authData[0] ^= 0xff; // corrompe o rpIdHash
  const res = await verifyAuthenticationAssertion({ ...a, authenticatorData: bytesToBase64url(authData) });
  if (res.ok) throw new Error('esperado falha para RP ID hash divergente');
});

Deno.test('webauthn: rejeita contador que não avança (replay)', async () => {
  const a = await buildAssertion({ counter: 1 });
  const res = await verifyAuthenticationAssertion({ ...a, storedCounter: 1 });
  if (res.ok) throw new Error('esperado falha para contador sem avanço');
});
