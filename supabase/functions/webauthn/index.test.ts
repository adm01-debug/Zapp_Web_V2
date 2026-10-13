// Prova do defeito (t_27db3c90): o login com passkey SEM e-mail não autentica.
//
// O `authentication-options` anônimo grava o desafio em `webauthn_challenges`
// com `user_id = null` (credencial descobrível). O `verify-authentication`
// antigo procurava o desafio por `user_id` da credencial — nunca achava — e
// respondia 400 "Challenge not found or expired". O teste chama o handler REAL
// com um cliente service_role falso (sem banco/credencial real) e uma asserção
// ES256 assinada de verdade.
//
// Vermelho antes: o handler não tinha seam (`handleWebAuthn`) e o fluxo
// descobrível falhava com 400. Verde depois: 200 e o desafio é de uso único.

import {
  handleWebAuthn,
  type WebAuthnCallerClient,
  type WebAuthnDeps,
} from './index.ts';
import { bytesToBase64url, base64urlToBytes, sha256 } from './verify.ts';

const RP_ID = 'zapp-web-v2.vercel.app';
const ORIGIN = 'https://zapp-web-v2.vercel.app';
const USER_ID = '11111111-1111-4111-8111-111111111111';

type Row = Record<string, unknown>;

// ─── Cliente service_role falso (sem rede, sem banco) ───────────────────────

function makeStore() {
  return {
    webauthn_challenges: [] as Row[],
    passkey_credentials: [] as Row[],
    profiles: [] as Row[],
  };
}

type Store = ReturnType<typeof makeStore>;

function makeFakeAdmin(store: Store): unknown {
  function builder(table: string) {
    const filters: Array<[string, unknown]> = [];
    const ilikes: Array<[string, string]> = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let orderCol: string | null = null;
    let limitN: number | null = null;

    const rows = (): Row[] => (store as Record<string, Row[]>)[table] ?? [];

    const matches = (r: Row): boolean =>
      filters.every(([c, v]) => r[c] === v) &&
      ilikes.every(([c, v]) => String(r[c] ?? '').toLowerCase() === v);

    async function resolve(single: boolean): Promise<{ data: unknown; error: unknown }> {
      if (mode === 'insert') {
        const arr = Array.isArray(payload) ? payload : [payload as Row];
        for (const r of arr) {
          const row: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r };
          if (table === 'webauthn_challenges' && !row.expires_at) {
            row.expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          }
          rows().push(row);
        }
        return { data: null, error: null };
      }
      if (mode === 'update') {
        for (const r of rows()) if (matches(r)) Object.assign(r, payload);
        return { data: null, error: null };
      }
      if (mode === 'delete') {
        (store as Record<string, Row[]>)[table] = rows().filter((r) => !matches(r));
        return { data: null, error: null };
      }
      let found = rows().filter(matches);
      if (orderCol) {
        const col = orderCol;
        found = [...found].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1));
      }
      if (limitN != null) found = found.slice(0, limitN);
      if (single) return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { message: 'no rows' } };
      return { data: found, error: null };
    }

    const q = {
      select: (_cols?: string) => q,
      insert: (row: Row | Row[]) => { mode = 'insert'; payload = row; return q; },
      update: (patch: Row) => { mode = 'update'; payload = patch; return q; },
      delete: () => { mode = 'delete'; return q; },
      eq: (col: string, val: unknown) => { filters.push([col, val]); return q; },
      ilike: (col: string, val: string) => { ilikes.push([col, val.toLowerCase()]); return q; },
      order: (col: string) => { orderCol = col; return q; },
      limit: (n: number) => { limitN = n; return q; },
      single: () => resolve(true),
      maybeSingle: () => resolve(false),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        resolve(false).then(onFulfilled, onRejected),
    };
    return q;
  }

  return {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: null, error: null }),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: 'passkey-user@example.test' } }, error: null }) } },
  };
}

function makeDeps(store: Store, overrides: Partial<WebAuthnDeps> = {}): WebAuthnDeps {
  const caller: WebAuthnCallerClient = {
    auth: { getClaims: async () => ({ data: { claims: { sub: undefined } }, error: null }) },
  };
  return {
    // O cliente real do supabase-js é estruturalmente enorme; o handler só usa
    // `.from()/.rpc()/.auth.admin` — o fake cobre exatamente esse contrato.
    admin: makeFakeAdmin(store) as unknown as WebAuthnDeps['admin'],
    createCallerClient: () => caller,
    enforceRateLimit: async () => ({ allowed: true }),
    ...overrides,
  };
}

function request(action: string, extra: Row = {}): Request {
  return new Request('https://zapp-web-v2.vercel.app/functions/v1/webauthn', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
}

// ─── Asserção ES256 real (mesma construção de verify.test.ts) ───────────────

function encLen(major: number, n: number): number[] {
  const prefix = major << 5;
  if (n < 24) return [prefix | n];
  if (n < 256) return [prefix | 24, n];
  return [prefix | 25, (n >> 8) & 0xff, n & 0xff];
}
function encBytes(b: Uint8Array): number[] { return [...encLen(2, b.length), ...b]; }
function encMap(entries: [number, number | Uint8Array][]): Uint8Array {
  const out: number[] = [...encLen(5, entries.length)];
  for (const [k, v] of entries) {
    out.push(...(k < 0 ? encLen(1, -1 - k) : encLen(0, k)));
    if (typeof v === 'number') out.push(...(v < 0 ? encLen(1, -1 - v) : encLen(0, v)));
    else out.push(...encBytes(v));
  }
  return new Uint8Array(out);
}
function derInteger(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  const v = bytes.slice(i);
  if (v[0] & 0x80) {
    const out = new Uint8Array(v.length + 3);
    out[0] = 0x02; out[1] = v.length + 1; out[2] = 0x00; out.set(v, 3);
    return out;
  }
  const out = new Uint8Array(v.length + 2);
  out[0] = 0x02; out[1] = v.length; out.set(v, 2);
  return out;
}
function rawToDer(raw: Uint8Array): Uint8Array {
  const body = new Uint8Array([...derInteger(raw.slice(0, 32)), ...derInteger(raw.slice(32, 64))]);
  const out = new Uint8Array(body.length + 2);
  out[0] = 0x30; out[1] = body.length; out.set(body, 2);
  return out;
}

async function buildAssertion(challenge: string, counter = 1): Promise<{
  credential: Row;
  storedPublicKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
  const coseKey = encMap([
    [1, 2], [3, -7], [-1, 1],
    [-2, base64urlToBytes(jwk.x!)], [-3, base64urlToBytes(jwk.y!)],
  ]);

  const clientDataBytes = new TextEncoder().encode(
    JSON.stringify({ type: 'webauthn.get', challenge, origin: ORIGIN, crossOrigin: false }),
  );
  const rpIdHash = await sha256(new TextEncoder().encode(RP_ID));
  const authDataBytes = new Uint8Array(37);
  authDataBytes.set(rpIdHash, 0);
  authDataBytes[32] = 0x01;
  authDataBytes[33] = (counter >>> 24) & 0xff;
  authDataBytes[34] = (counter >>> 16) & 0xff;
  authDataBytes[35] = (counter >>> 8) & 0xff;
  authDataBytes[36] = counter & 0xff;

  const clientDataHash = await sha256(clientDataBytes);
  const signedData = new Uint8Array(authDataBytes.length + 32);
  signedData.set(authDataBytes, 0);
  signedData.set(clientDataHash, authDataBytes.length);
  const rawSignature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signedData as BufferSource),
  );

  return {
    storedPublicKey: bytesToBase64url(coseKey),
    credential: {
      id: 'cred-id-abc',
      type: 'public-key',
      response: {
        clientDataJSON: bytesToBase64url(clientDataBytes),
        authenticatorData: bytesToBase64url(authDataBytes),
        signature: bytesToBase64url(rawToDer(rawSignature)),
      },
    },
  };
}

// ─── Testes ─────────────────────────────────────────────────────────────────

Deno.test('webauthn: login com passkey SEM e-mail autentica (fluxo descobrível)', async () => {
  const store = makeStore();
  const deps = makeDeps(store);

  const optRes = await handleWebAuthn(request('authentication-options'), deps);
  if (optRes.status !== 200) throw new Error('options esperado 200, obtido ' + optRes.status);
  const { options } = await optRes.json() as { options: { challenge: string } };
  if (!options?.challenge) throw new Error('options sem challenge');

  // O desafio anônimo foi gravado com user_id nulo (credencial descobrível).
  if (store.webauthn_challenges[0].user_id !== null) throw new Error('desafio deveria ter user_id nulo');
  // A credencial existe, mas o handler não sabe para quem — só pelo desafio assinado.
  const built = await buildAssertion(options.challenge);
  store.passkey_credentials.push({ id: 'cred-row-1', user_id: USER_ID, credential_id: 'cred-id-abc', public_key: built.storedPublicKey, counter: 0 });

  const verRes = await handleWebAuthn(request('verify-authentication', { credential: built.credential }), deps);
  const body = await verRes.json() as { success?: boolean; userId?: string; userEmail?: string; error?: string };
  if (verRes.status !== 200 || body.success !== true) {
    throw new Error('verify-authentication esperado 200/success, obtido ' + verRes.status + ' ' + JSON.stringify(body));
  }
  if (body.userId !== USER_ID) throw new Error('userId errado: ' + body.userId);
  if (body.userEmail !== 'passkey-user@example.test') throw new Error('userEmail errado');
});

Deno.test('webauthn: desafio é de USO ÚNICO (replay da mesma asserção é negado)', async () => {
  const store = makeStore();
  const deps = makeDeps(store);

  const optRes = await handleWebAuthn(request('authentication-options'), deps);
  const { options } = await optRes.json() as { options: { challenge: string } };
  const built = await buildAssertion(options.challenge);
  store.passkey_credentials.push({ id: 'cred-row-1', user_id: USER_ID, credential_id: 'cred-id-abc', public_key: built.storedPublicKey, counter: 0 });

  const first = await handleWebAuthn(request('verify-authentication', { credential: built.credential }), deps);
  if (first.status !== 200) throw new Error('primeira autenticação esperada 200, obtido ' + first.status);
  if (store.webauthn_challenges.length !== 0) throw new Error('desafio deveria ter sido consumido');

  const replay = await handleWebAuthn(request('verify-authentication', { credential: built.credential }), deps);
  if (replay.status === 200) throw new Error('replay deveria ser negado, obtido 200');
  if (store.webauthn_challenges.length !== 0) throw new Error('store de desafios não deveria crescer no replay');
});

Deno.test('webauthn: desafio expirado é negado', async () => {
  const store = makeStore();
  const deps = makeDeps(store);
  const built = await buildAssertion('Y2hhbGxlbmdlLWV4cGlyYWRv');
  store.passkey_credentials.push({ id: 'cred-row-1', user_id: USER_ID, credential_id: 'cred-id-abc', public_key: built.storedPublicKey, counter: 0 });
  store.webauthn_challenges.push({
    id: 'chal-old', user_id: null, challenge: 'Y2hhbGxlbmdlLWV4cGlyYWRv', type: 'authentication',
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
  });

  const res = await handleWebAuthn(request('verify-authentication', { credential: built.credential }), deps);
  if (res.status === 200) throw new Error('desafio expirado deveria ser negado');
});

Deno.test('webauthn: desafio de OUTRA conta é negado', async () => {
  const store = makeStore();
  const deps = makeDeps(store);
  const built = await buildAssertion('ZGVzYWZpby1kZS1vdXRyYS1jb250YQ');
  store.passkey_credentials.push({ id: 'cred-row-1', user_id: USER_ID, credential_id: 'cred-id-abc', public_key: built.storedPublicKey, counter: 0 });
  store.webauthn_challenges.push({
    id: 'chal-other', user_id: '22222222-2222-4222-8222-222222222222', challenge: 'ZGVzYWZpby1kZS1vdXRyYS1jb250YQ',
    type: 'authentication', created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });

  const res = await handleWebAuthn(request('verify-authentication', { credential: built.credential }), deps);
  if (res.status === 200) throw new Error('desafio de outra conta deveria ser negado');
});
