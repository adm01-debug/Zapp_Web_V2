import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
test('Edge contract CI pins its runtime and isolated frozen lock', () => {
  const workflow = read('../../.github/workflows/ci.yml');
  assert.match(workflow, /deno-version: '2\.9\.5'/);
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

test('Edge Functions usam o mesmo runtime pinado e o mesmo lock frozen da CI', () => {
  // supabase/functions/deno.json e a config que o Deno descobre sozinho ao typecheckar/rodar
  // uma edge pela linha de comando (sem --config). Ele tem de apontar exatamente para o lock
  // isolado da CI, para nao existir uma segunda copia de lock (drift silencioso).
  const edgeConfig = JSON.parse(read('../../supabase/functions/deno.json'));
  assert.deepEqual(edgeConfig.lock, { path: '../../scripts/ci/deno.lock', frozen: true });
  assert.equal(edgeConfig.nodeModulesDir, 'none');
  const edgeDir = path.dirname(fileURLToPath(new URL('../../supabase/functions/deno.json', import.meta.url)));
  const resolvedLock = path.resolve(edgeDir, edgeConfig.lock.path);
  assert.equal(resolvedLock, path.resolve(fileURLToPath(new URL('./deno.lock', import.meta.url))));
  assert.ok(fs.existsSync(resolvedLock), `lock do edge inexistente: ${resolvedLock}`);
  // Uma unica versao de runtime no repositorio: o db-guard fixa a MESMA do ci.yml.
  assert.match(read('../../.github/workflows/db-guard.yml'), /deno-version: '2\.9\.5'/);
});
