import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectStableAttestation, inventorySnapshot, fetchRemoteInventory, CANONICAL_PROJECT } from './stable-inventory.mjs';

const manifest = JSON.parse(await readFile(new URL('../../supabase/deployment-manifest.json', import.meta.url)));
const rows = manifest.functions.map((fn, i) => ({ slug: fn.name, id: `fn-${i}`, version: 2, status: 'ACTIVE', verify_jwt: fn.verify_jwt, ezbr_sha256: 'a'.repeat(64), updated_at: '2026-09-22T12:00:00.000Z' }));
const before = inventorySnapshot(rows.map(fn => ({ ...fn, version: 1 })), CANONICAL_PROJECT);
function simulate(sequence, options = {}) {
  let tick = Date.parse('2026-09-22T12:01:00Z');
  let calls = 0;
  return collectStableAttestation({ manifest, before, gitSha: 'a'.repeat(40), runId: '123', deploymentScope: 'all',
    now: () => tick, sleep: async ms => { tick += ms; }, intervalMs: 10, minimumObservationMs: 60, consecutiveSamples: 3, maxAttempts: 18,
    fetchInventory: async () => { const value = sequence[Math.min(calls++, sequence.length - 1)]; if (value instanceof Error) throw value; return value; }, ...options });
}

test('requires a minimum observation window, consecutive samples and advanced versions', async () => {
  const result = await simulate([rows]);
  assert.equal(result.verification.samples.length, 7);
  assert.equal(result.verification.observation_ms, 60);
  assert.equal(result.verification.source_to_bundle_equivalence_proven, false);
  assert.equal(result.function_count, manifest.functions.length);
});
test('late bundle changes reset stable streak even without changed source', async () => {
  const changed = rows.map((fn, i) => i === 0 ? { ...fn, version: 3, ezbr_sha256: 'b'.repeat(64) } : fn);
  const result = await simulate([rows, rows, rows, rows, rows, rows, changed]);
  assert.equal(result.verification.samples.length, 9);
  assert.equal(result.functions[0].remote_version, 3);
});
test('unchanged pre-deploy inventory never attests success', async () => {
  await assert.rejects(simulate([before.functions]), /NOT attested/);
});
for (const [name, patch] of Object.entries({ failed: { status: 'FAILED' }, version: { version: null }, digest: { ezbr_sha256: 'invalid-hash-16-chars' }, timestamp: { updated_at: 'invalid' }, identity: { id: null }, jwt: { verify_jwt: !rows[0].verify_jwt } })) {
  test(`rejects ${name} drift`, async () => {
    await assert.rejects(simulate([rows.map((fn, i) => i === 0 ? { ...fn, ...patch } : fn)]), /NOT attested/);
  });
}
test('transient errors reset stability but never emit response contents', async () => {
  const result = await simulate([rows, rows, new Error('fixture-private-response'), rows]);
  assert.equal(result.verification.samples[2].valid, false);
  assert.doesNotMatch(JSON.stringify(result), /fixture-private-response/);
});
test('inventory row order does not produce false drift', async () => {
  const result = await simulate([rows, [...rows].reverse(), rows]);
  assert.equal(result.verification.consecutive_samples, 7);
});
test('partial deployment reports unrelated changes separately', async () => {
  const result = await simulate([rows], { deploymentScope: rows[0].slug });
  assert.equal(result.verification.selected_functions.length, 1);
  assert.equal(result.verification.changed_outside_scope.length, rows.length - 1);
});
test('wrong project rejected before any request', async () => {
  let called = false;
  await assert.rejects(fetchRemoteInventory({ projectRef: 'wrong', token: 'fixture', fetchImpl: () => { called = true; } }), /Canonical/);
  assert.equal(called, false);
  await assert.rejects(simulate([rows], { before: { ...before, project_ref: 'wrong' } }), /project mismatch/);
});
test('unknown scope and invalid polling configuration rejected', async () => {
  await assert.rejects(simulate([rows], { deploymentScope: 'absent' }), /Unknown/);
  await assert.rejects(simulate([rows], { consecutiveSamples: 1 }), /policy/);
});
test('API failures omit response payload, transport error and authorization token', async () => {
  await assert.rejects(fetchRemoteInventory({ projectRef: CANONICAL_PROJECT, token: 'fixture-private', fetchImpl: async () => { throw new Error('fixture-private'); } }), /transport failure/);
  await assert.rejects(fetchRemoteInventory({ projectRef: CANONICAL_PROJECT, token: 'fixture-private', fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'fixture-private' }) }), /^Error: Management API HTTP 401$/);
});
test('snapshot whitelists metadata and rejects duplicates', () => {
  assert.doesNotMatch(JSON.stringify(inventorySnapshot(rows.map(fn => ({ ...fn, secret: 'fixture-private' })), CANONICAL_PROJECT)), /fixture-private/);
  assert.throws(() => inventorySnapshot([...rows, rows[0]], CANONICAL_PROJECT), /duplicate/);
});
