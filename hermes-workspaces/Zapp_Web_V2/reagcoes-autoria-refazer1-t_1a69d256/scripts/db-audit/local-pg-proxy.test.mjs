import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./local-pg-proxy.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');

function executar(proxyDir) {
  // Sem DESTINO_URL: se a guarda de caminho aceitar, o script para mais adiante
  // com exit 1 ("DESTINO_URL nao definida") — nunca chega a abrir socket algum.
  return spawnSync(process.execPath, [SCRIPT, proxyDir], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DESTINO_URL: '' },
  });
}

test('rejeita diretorio do proxy absoluto fora das raizes permitidas', () => {
  const result = executar(path.resolve(ROOT, '..', '..', 'pg-proxy-fora'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fora das raizes permitidas/);
});

test('rejeita diretorio do proxy com travessia', () => {
  const result = executar('../../../../etc/pg-proxy');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fora das raizes permitidas/);
});

test('aceita diretorio temporario do sistema (uso legitimo do gen-types.sh)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-proxy-test-'));
  const result = executar(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.doesNotMatch(result.stderr, /fora das raizes permitidas/);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DESTINO_URL nao definida/);
});
