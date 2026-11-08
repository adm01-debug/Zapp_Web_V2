import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./verificar-docs-realtime.mjs', import.meta.url));
const RAIZ = path.resolve(path.dirname(SCRIPT), '../..');

function executar() {
  return spawnSync(process.execPath, [SCRIPT], { cwd: RAIZ, encoding: 'utf8' });
}

test('o processo inicia sem erro de spawn', () => {
  const r = executar();
  assert.equal(r.error, undefined, String(r.error));
});

test('exit code e 0 (ok) ou 1 (erros de doc) — nao ha crash de sintaxe JS', () => {
  const r = executar();
  assert.ok([0, 1].includes(r.status ?? -1), `exit code inesperado: ${r.status}\n${r.stderr}`);
});

test('em caso de sucesso, stdout comeca com "OK:" e lista estatisticas', () => {
  const r = executar();
  if (r.status === 0) {
    assert.match(r.stdout.trim(), /^OK:/);
    assert.match(r.stdout, /\d+ canal/);
    assert.match(r.stdout, /\d+ cita/);
  }
});

test('em caso de falha, stderr contem "FALHOU" e pelo menos um problema com " - "', () => {
  const r = executar();
  if (r.status !== 0) {
    assert.match(r.stderr, /FALHOU/);
    const problemas = r.stderr.split('\n').filter((l) => l.startsWith(' - '));
    assert.ok(problemas.length > 0, `FALHOU sem linhas de problema: ${r.stderr}`);
  }
});

test('o script nao vaza stack trace nao tratado no stderr', () => {
  const r = executar();
  assert.doesNotMatch(r.stderr, /at Object\.<anonymous>|Cannot read propert/);
});
