import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./validate-plan.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');

function executar(argumento) {
  const args = argumento === undefined ? [SCRIPT] : [SCRIPT, argumento];
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
}

test('rejeita caminho relativo que escapa do repositorio', () => {
  const result = executar('../../../../etc/passwd');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fora das raizes permitidas/);
});

test('rejeita caminho absoluto fora do repositorio e do temporario', () => {
  const fora = path.resolve(ROOT, '..', '..', 'fora-da-raiz.json');
  const result = executar(fora);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fora das raizes permitidas/);
});

test('aceita o caminho default do plano dentro do repositorio', () => {
  // O plano pode estar valido ou nao (divida conhecida do E54); o que este caso
  // garante e que o caminho default do repositorio nao e barrado pela guarda.
  const result = executar();
  assert.doesNotMatch(result.stderr, /fora das raizes permitidas/);
});
