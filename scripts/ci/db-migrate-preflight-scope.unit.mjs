// Wrapper do teste em shell do preflight do db-migrate.yml.
//
// O criterio da etapa pede o teste em shell (ledger simulado em arquivos), mas
// o CI so descobre *.unit.mjs nesta pasta — sem este wrapper o .test.sh nunca
// rodaria fora da maquina de quem escreveu e a garantia voltaria a ser texto.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const raiz = join(fileURLToPath(import.meta.url), '../../..');

test('preflight do db-migrate aceita lote exato (teste em shell)', () => {
  const r = spawnSync(
    resolverExecutavel('bash'),
    ['scripts/ci/db-migrate-preflight-scope.test.sh'],
    { cwd: raiz, encoding: 'utf8' },
  );
  assert.equal(
    r.status,
    0,
    `teste shell falhou (status ${r.status}):\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
  );
});
