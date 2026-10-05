import {
  verifyAuthenticationAssertion,
  bytesToBase64url,
  base64urlToBytes,
} from './verify.ts';
import { buildAssertion, buildRsaAssertion, flipLastByte } from './_test-utils.ts';

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
