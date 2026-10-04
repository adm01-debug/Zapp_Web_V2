// Read-only synthetic probe. Reviewed source hashes and HEAD are checked before import.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = '/workspace/scratch/f8f9b9cbce53/reaudit/source';
const out = '/workspace/scratch/f8f9b9cbce53/reaudit/reports/infra';
const pins = JSON.parse(readFileSync(`${out}/second-pass-probe-pins.json`, 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), pins.baseline_sha);
for (const [path, sha] of Object.entries(pins.sources)) {
  assert.equal(digest(readFileSync(`${root}/${path}`)), sha, `source drift: ${path}`);
}
let blockedNetworkAttempts = 0;
globalThis.fetch = () => { blockedNetworkAttempts += 1; throw new Error('Network forbidden by offline probe'); };
const { collectStableAttestation, inventorySnapshot, CANONICAL_PROJECT } = await import(pathToFileURL(`${root}/scripts/edge-deploy/stable-inventory.mjs`));
const manifest = JSON.parse(readFileSync(`${root}/supabase/deployment-manifest.json`, 'utf8'));
const oldRows = manifest.functions.map((fn, i) => ({
  slug: fn.name, id: `synthetic-${i}`, version: 7, status: 'ACTIVE', verify_jwt: fn.verify_jwt,
  ezbr_sha256: '1'.repeat(64), updated_at: '2026-09-01T00:00:00.000Z',
}));
const started = Date.parse('2026-10-04T12:00:00.000Z');
let now = started;
let observations = 0;
const result = await collectStableAttestation({
  manifest, before: inventorySnapshot(oldRows, CANONICAL_PROJECT),
  gitSha: pins.baseline_sha, runId: '900000001', deploymentScope: 'all',
  knownUnchanged: [], now: () => now, sleep: async ms => { now += ms; }, log: () => {},
  fetchInventory: async () => {
    observations += 1;
    // A new bundle is delayed by 70 seconds in the simulated Management API.
    return now - started < 70_000 ? oldRows : oldRows.map(x => ({
      ...x, version: 8, ezbr_sha256: '2'.repeat(64), updated_at: '2026-10-04T12:00:00.000Z',
    }));
  },
});
assert.equal(now - started, 60_000);
assert.equal(observations, 7);
assert.ok(result.functions.every(x => x.remote_version === 7));
assert.equal(result.verification.accepted_without_version_bump.length, manifest.functions.length);
assert.equal(blockedNetworkAttempts, 0);
const report = {
  schema_version: 1, baseline_sha: pins.baseline_sha,
  source_pins: 'second-pass-probe-pins.json',
  probe_id: 'stale_remote_metadata_attested', finding_id: 'R2-INF-017', status: 'confirmed',
  fixture: 'All remote metadata retains pre-deploy version 7 until 70 seconds; CLI unchanged list is empty.',
  observed: { accepted_at_ms: now - started, synthetic_inventory_calls: observations,
    attested_remote_versions: [...new Set(result.functions.map(x => x.remote_version))],
    known_unchanged_count: 0, selected_count: result.verification.selected_functions.length,
    accepted_without_version_bump_count: result.verification.accepted_without_version_bump.length,
    new_version_scheduled_at_ms: 70_000, source_to_bundle_equivalence_proven: result.verification.source_to_bundle_equivalence_proven },
  limits: 'Synthetic metadata tests the reviewed collector, not a deployment or observed live latency. The artifact already disclaims binary equivalence; the defect is premature attribution of selected deployment versions.',
  blocked_network_attempts: blockedNetworkAttempts, product_network_requests: 0, production_writes: 0,
};
writeFileSync(`${out}/second-pass-offline-probes.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ probe_id: report.probe_id, status: report.status, observed: report.observed }));
