import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
test('Edge contract CI pins its runtime and isolated frozen lock', () => {
  const workflow = read('../../.github/workflows/ci.yml');
  assert.match(workflow, /DENO_VERSION="v2\.9\.5"/);
  assert.match(workflow, /8b010a3b1a4a0188a67cdb8a7a27348b2a501af78aec7fc74f2ace167368d530/);
  assert.match(workflow, /deno test --config scripts\/ci\/deno\.json --frozen --allow-env/);
  // E49: lista hardcoded substituída por glob; verificar o glob em vez do path literal
  assert.match(workflow, /supabase\/functions\/\*\*\/\*\.test\.ts/);
  const config = JSON.parse(read('./deno.json'));
  assert.deepEqual(config.lock, { path: './deno.lock', frozen: true });
  assert.equal(config.nodeModulesDir, 'none');
  const lock = JSON.parse(read('./deno.lock'));
  assert.equal(lock.version, '5');
  assert.ok(Object.keys(lock.remote ?? {}).length > 0);
  for (const digest of Object.values(lock.remote)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.match(read('../../.gitignore'), /^!scripts\/ci\/deno\.lock$/m);
});
