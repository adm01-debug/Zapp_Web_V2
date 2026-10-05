// Wrapper do teste fim-a-fim do lote do db-migrate.yml.
//
// O criterio da etapa pede o teste em shell (ledger e saida de dry-run
// simulados em arquivos), mas o CI so descobre *.unit.mjs nesta pasta — sem
// este wrapper o .test.sh nunca rodaria fora da maquina de quem escreveu e a
// garantia voltaria a ser texto. Mesmo modelo do db-migrate-preflight-scope.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const raiz = join(fileURLToPath(import.meta.url), '../../..');

test('lote do db-migrate atravessa preflight + contrato generico + dry-run (teste em shell)', () => {
  const r = spawnSync(
    resolverExecutavel('bash'),
    ['scripts/ci/db-migrate-lote-fim-a-fim.test.sh'],
    { cwd: raiz, encoding: 'utf8' },
  );
  assert.equal(
    r.status,
    0,
    `teste shell falhou (status ${r.status}):\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
  );
});
