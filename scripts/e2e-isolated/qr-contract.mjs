import { createHash } from 'node:crypto';
import { ORIGIN, PROVIDER_ORIGIN, fail } from './runtime-contract.mjs';

// QR version 3, encoded with ReportLab 4.4.9 and independently decoded with
// jsQR 1.4.0. The payload is harmless text, never a WhatsApp pairing secret.
export const QR_FIXTURE = Object.freeze({
  id: 'e2e71190-7005-4509-a000-0000000000c0',
  instance: 'e2e-qr-local',
  name: '[E2E isolado] QR sintético',
  phone: '00000000001',
  email: 'qr.admin.e2e@example.invalid',
  payload: "ZAPP-E2E-SYNTHETIC-QR-NO-PAIRING-V1",
  image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASgAAAEoCAIAAABkZftOAAAFdUlEQVR4nO3dQW4bMRAAwSjw/7/svGAT0OCkSanqbGjXgho8DEi+vr+/fwH/1+/6BeATCQ8CwoOA8CAgPAgIDwLCg4DwICA8CAgPAsKDgPAgIDwICA8CwoOA8CAgPAgIDwLCg4DwICA8CAgPAsKDgPAgIDwICA8CwoOA8CAgPAgIDwLCg8DX9ANer9f0I7Z4uifw6f2n7xVc/d5W33+X1e/h9t/DLlY8CAgPAsKDgPAgIDwICA8CwoPA+BzvyfSc5Ek1R5p+7uq8cdff7/JpvwcrHgSEBwHhQUB4EBAeBIQHAeFBIJvjPdk1V6n2yz09d3qeNv3/Vu9zy+9hlRUPAsKDgPAgIDwICA8CwoOA8CBw3BzvdtNzrelzLHed58nfWfEgIDwICA8CwoOA8CAgPAgIDwLmeP9QnTO5y673P21/4O2seBAQHgSEBwHhQUB4EBAeBIQHgePmeKfNf26/F256XjfttN/DLlY8CAgPAsKDgPAgIDwICA8CwoNANse7ZT/bk13zrup+vOn7+lbd/ntYZcWDgPAgIDwICA8CwoOA8CAgPAi83nW/U6U6r9J+ubtY8SAgPAgIDwLCg4DwICA8CAgPAuP78XbNtXZ9/q7n7vr86fe/ZZ/baXPL6d+DFQ8CwoOA8CAgPAgIDwLCg4DwIDC+H296PrPr/avnPrllvmc/4c9Y8SAgPAgIDwLCg4DwICA8CAgPAtkc78kt+/Hede735LR53fT81n48eEPCg4DwICA8CAgPAsKDgPAgMH6u5i3znF12zQN3zc1Wn7tqel/lrvc87XxRKx4EhAcB4UFAeBAQHgSEBwHhQWB8jrfqXc9jrP6v6bnf6udU++hOm/da8SAgPAgIDwLCg4DwICA8CAgPAtkcb9dcpbofb3q/2Wlzp1WnnVN62vdsxYOA8CAgPAgIDwLCg4DwICA8CIzfj7eqOo+xmgdOO+18ztPutXM/HnwQ4UFAeBAQHgSEBwHhQUB4EMj24+06Z/KWOVL196e55T2nWfEgIDwICA8CwoOA8CAgPAgIDwLHnatZna+46/NXP+eW+/2mn1vdB+hcTfggwoOA8CAgPAgIDwLCg4DwIDB+ruYtc6rp96zeZ/qcydPO5zztHrwnVjwICA8CwoOA8CAgPAgIDwLCg8D4frxqfnXaHOy051bzrunzVN2PBzwSHgSEBwHhQUB4EBAeBIQHgfH9eLvcvk9s9fNP+7+enPZ9rj7XuZrwQYQHAeFBQHgQEB4EhAcB4UHguHM1b9kPNn2/3y3fW+X2+Z4VDwLCg4DwICA8CAgPAsKDgPAgcM1+vMr0vrXpOdIt9xM+Oe3ewl2seBAQHgSEBwHhQUB4EBAeBIQHgeP241WqcylPc9q5oKf9/S5WPAgIDwLCg4DwICA8CAgPAsKDwFf14Gof1Or87bRzNaf3ud2y/23X92M/HnwQ4UFAeBAQHgSEBwHhQUB4EMjmeE+mz7HcpboH78nqXGt6/2G1X7HaX7fKigcB4UFAeBAQHgSEBwHhQUB4EDhujnea6XnX6nyvOjey2n84/TnO1YQPIjwICA8CwoOA8CAgPAgIDwLmeD902vmTp+1Dm54rTp93Os2KBwHhQUB4EBAeBIQHAeFBQHgQOG6Od9r5h9U9ddP7zZ7ccr/cab+TVVY8CAgPAsKDgPAgIDwICA8CwoNANsc7bX/UqunzLW+/J3D1Xr7TzgudZsWDgPAgIDwICA8CwoOA8CAgPAi8bt/XBDey4kFAeBAQHgSEBwHhQUB4EBAeBIQHAeFBQHgQEB4EhAcB4UFAeBAQHgSEBwHhQUB4EBAeBIQHAeFBQHgQEB4EhAcB4UFAeBAQHgSEBwHhQUB4EBAeBP4A+Go2ZW3l4/YAAAAASUVORK5CYII=",
  imageSha256: "87e6339692e917c19b96faaddb59c8d11f5fa8c192f88d614ad1f9863613e37a",
  imageBytes: 1454,
  imageWidth: 296,
});
export const QR_SEED_PATH = '/output/qr-seed-ready.json';
export const QR_FIELDS = 'id,name,phone_number,instance_id,status,qr_code,is_default,created_by,updated_at';
export const QR_SEED_FLAGS = Object.freeze([
  'admin_auth_real', 'admin_rls', 'fixture_disconnected', 'token_scoped',
  'provider_disconnected', 'existing_fixtures_preserved',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validQrId = value => typeof value === 'string' && UUID.test(value);
export const qrFail = code => fail('qr-' + code);

export function validateQrSeedProof(value, expected) {
  if (!value || value.schema !== 1 || value.run_id !== expected.runId ||
      value.source_sha !== expected.sourceSha || value.origin !== ORIGIN ||
      value.network_namespace !== expected.networkNamespace ||
      value.anon_key_sha256 !== expected.anonHash ||
      !validQrId(value.user_id) || !validQrId(value.profile_id) ||
      value.connection_id !== QR_FIXTURE.id || value.instance_id !== QR_FIXTURE.instance ||
      QR_SEED_FLAGS.some(flag => value[flag] !== true)) qrFail('seed-proof');
  return { userId: value.user_id, profileId: value.profile_id };
}

export function assertQrImage(value) {
  if (value !== QR_FIXTURE.image) qrFail('image-mismatch');
  const bytes = Buffer.from(value.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.length !== QR_FIXTURE.imageBytes ||
      createHash('sha256').update(bytes).digest('hex') !== QR_FIXTURE.imageSha256) qrFail('image-mismatch');
  return QR_FIXTURE.imageSha256;
}

export function assertQrRow(rows, profileId, status) {
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row || row.id !== QR_FIXTURE.id || row.instance_id !== QR_FIXTURE.instance ||
      row.name !== QR_FIXTURE.name || row.phone_number !== QR_FIXTURE.phone ||
      row.created_by !== profileId || row.is_default !== false ||
      !['disconnected', 'qr_pending'].includes(row.status) ||
      (status !== undefined && row.status !== status) ||
      typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) qrFail('fixture-row');
  if (row.status === 'qr_pending') assertQrImage(row.qr_code);
  else if (row.qr_code !== null) qrFail('fixture-row');
  return row;
}

export function assertQrProviderEvidence(value, expected) {
  const qr = value?.qr;
  if (value?.schema !== 1 || value.run_id !== expected.runId || value.source_sha !== expected.sourceSha ||
      value.origin !== PROVIDER_ORIGIN || value.network_namespace !== expected.networkNamespace ||
      !qr || qr.instance !== QR_FIXTURE.instance || qr.image_sha256 !== QR_FIXTURE.imageSha256 ||
      ['generation', 'connects', 'qr_reads', 'status_reads', 'delivered'].some(key =>
        !Number.isSafeInteger(qr[key]) || qr[key] < 0) ||
      qr.delivered !== 0 || qr.generation !== qr.connects) qrFail('provider-evidence');
  return { ...qr };
}

/** Closed, bounded JSON: no response bodies or remote messages enter errors. */
export async function readQrJson(response, code, expectedStatus = 200) {
  if (response?.status !== expectedStatus || response.redirected) {
    try { void response?.body?.cancel().catch(() => {}); } catch { /* best effort */ }
    qrFail(code + '-http');
  }
  let reader;
  try {
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (let count = 0; count < 128; count++) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
      if (!(value instanceof Uint8Array) || !value.length || (size += value.length) > 65536) throw new Error();
      chunks.push(value);
    }
    throw new Error();
  } catch { qrFail(code + '-json'); }
  finally { try { void reader?.cancel().catch(() => {}); } catch { /* best effort */ } }
}

export function qrJwt(token, role, now, userId) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || claims.role !== role || !Number.isFinite(claims.exp) ||
        claims.exp * 1000 <= now || (userId !== undefined && claims.sub !== userId)) throw new Error();
    return claims;
  } catch { qrFail('credential'); }
}

