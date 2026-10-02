/**
 * Contrato: todo script de CLI que imprime dado nao-confiavel em log precisa
 * neutralizar quebras de linha e caracteres de controle (jssecurity:S5145 —
 * log injection). Sem isso, um valor vindo de API/banco/arquivo forja linhas de
 * log, inclusive anotacoes `::error::` / `::warning::` do GitHub Actions.
 *
 * Este contrato NAO reimplementa a assercao: cada `*.unit.mjs` ja exercita o
 * script de verdade em processo filho, com `fetch` stubado. Ele existe porque o
 * step `node --test` do workflow cobre `scripts/ci/`, `scripts/edge-deploy/`,
 * `scripts/talkx/` e um arquivo avulso de `scripts/db-audit/` — mas nao
 * `scripts/qa/` nem a raiz de `scripts/`. Sem esta ponte, os testes abaixo
 * ficariam orfaos e a protecao nao rodaria no CI.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SUITES = [
  'scripts/qa/prova-visao-classificadores.unit.mjs',
  'scripts/team-chat-db-validate.unit.mjs',
];

describe('contrato: sanitizacao de log nos scripts de CLI', () => {
  for (const suite of SUITES) {
    it(`${suite} neutraliza quebras de linha vindas de fora`, () => {
      const saida = execFileSync(process.execPath, ['--test', resolve(suite)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(saida).toMatch(/pass \d+/);
      expect(saida).not.toMatch(/\bfail [1-9]/);
    });
  }
});
