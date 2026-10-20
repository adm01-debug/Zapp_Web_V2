// E66 (auditoria de GitHub Actions, 2026-10-01): os dois valores que a etapa
// pede sao pinados aqui -- teto do job e origem dos retries de conexao.
//
// Por que importa: o job inteiro roda preflight + dry-run + apply + as
// validacoes de ledger/runtime do file de 1764 linhas; 25 min nao cobriam isso.
// E os retries de conexao valem SO no preflight, que e somente leitura -- no
// apply uma repeticao seria reaplicar DDL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/db-migrate.yml', import.meta.url), 'utf8');

test('E66: teto do job e 45 min', () => {
  const timeout = Number(/^    timeout-minutes: (\d+)$/m.exec(workflow)?.[1]);
  assert.equal(timeout, 45);
});

test('E66: PSQL_CONNECT_RETRIES=2 existe uma unica vez, no preflight', () => {
  const ocorrencias = [...workflow.matchAll(/PSQL_CONNECT_RETRIES/g)].length;
  assert.equal(ocorrencias, 1, 'a variavel so pode ser definida no preflight');
  const preflight = workflow.indexOf('id: preflight');
  const apply = workflow.indexOf('- name: Aplicar alvo unico ou bundle ordenado autorizado');
  assert.ok(preflight > 0 && apply > preflight, 'preflight precisa vir antes do apply');
  assert.match(workflow.slice(preflight, apply), /PSQL_CONNECT_RETRIES: '2'/);
  assert.doesNotMatch(workflow.slice(apply), /PSQL_CONNECT_RETRIES/,
    'o apply nunca define retries: repetir o push seria reaplicar DDL');
});
