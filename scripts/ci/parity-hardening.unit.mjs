import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
test('production parity requires live legs, and runtime metadata is archived', () => {
  const workflow = read('../../.github/workflows/db-live-guard.yml');
  assert.match(workflow, /check-triple-parity\.mjs --require-live/);
  assert.match(workflow, /check-runtime-config\.mjs \/tmp\/runtime-config\.json/);
  assert.match(workflow, /\/tmp\/runtime-config\.json\n/);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.ok(workflow.indexOf('Exigir credencial do banco oficial') < workflow.indexOf('Auditar configuracao runtime'));
});
test('deployment brackets mutation with snapshots and stable post-collection', () => {
  const workflow = read('../../.github/workflows/deploy-functions.yml');
  const before = workflow.indexOf('collect-remote.mjs" --snapshot');
  const deploy = workflow.indexOf('      - name: Deploy\n');
  const after = workflow.indexOf('collect-remote.mjs" \\');
  assert.ok(before > 0 && before < deploy && deploy < after);
  assert.match(workflow, /--before "\$EVIDENCE_DIR\/edge-before\.json"/);
  assert.doesNotMatch(workflow, /node scripts\/edge-deploy\/verify-remote\.mjs/);
  assert.match(workflow, /Source\/bundle binary equivalence: NOT proven/);
  assert.match(workflow, /git archive "\$GITHUB_SHA" scripts\/edge-deploy/);
  assert.equal((workflow.match(/\$RUNNER_TEMP\/edge-tooling\/scripts\/edge-deploy\/collect-remote\.mjs/g) || []).length, 2);
});
test('runtime SQL is exercised on disposable PostgreSQL in PRs', () => {
  const workflow = read('../../.github/workflows/db-guard.yml');
  assert.match(workflow, /retry-disposable-postgres-test\.sh bash scripts\/db-audit\/runtime-config\.test\.sh/);
});
test('DB guard installs the pinned AST dependency before checking Realtime subscriptions', () => {
  const workflow = read('../../.github/workflows/db-guard.yml');
  const install = workflow.indexOf('bun install --frozen-lockfile');
  const realtimeGuard = workflow.indexOf('node scripts/db-audit/check-realtime-subscriptions.mjs');

  assert.match(workflow, /oven-sh\/setup-bun@[0-9a-f]{40}/);
  assert.ok(install > 0 && install < realtimeGuard);
});
test('PR guard exercises libpq transport with real client authentication, not only SQL fixtures', () => {
  assert.match(read('../../.github/workflows/db-guard.yml'),
    /retry-disposable-postgres-test\.sh node scripts\/db-audit\/psql-environment\.integration\.mjs/);
});
