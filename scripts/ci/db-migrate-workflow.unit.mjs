// E66 (auditoria de GitHub Actions, 2026-10-01) + GA13: tetos por job e origem
// dos retries de conexao.
//
// GA13 dividiu o workflow em dois jobs: preflight (so leitura: ledger +
// dry-run + runtime, 20 min) e apply (push + validacoes do lote, 45 min).
// E os retries de conexao valem SO no preflight, que e somente leitura -- no
// apply uma repeticao seria reaplicar DDL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { endurecerDestinoTls, SUPABASE_CA_PATH } from '../db-audit/database-identity.mjs';
import { withPsqlEnvironment } from '../db-audit/psql-environment.mjs';

const workflow = await readFile(new URL('../../.github/workflows/db-migrate.yml', import.meta.url), 'utf8');

test('E66: teto do preflight e 20 min e do apply e 45 min (GA13)', () => {
  const ini = (nome) => workflow.indexOf(`\n  ${nome}:\n`);
  const pre = workflow.slice(ini('preflight'), ini('apply'));
  const apply = workflow.slice(ini('apply'));
  assert.equal(/^    timeout-minutes: (\d+)$/m.exec(pre)?.[1], '20');
  assert.equal(/^    timeout-minutes: (\d+)$/m.exec(apply)?.[1], '45');
});

test('E66: PSQL_CONNECT_RETRIES=2 existe uma unica vez, no preflight', () => {
  const ocorrencias = [...workflow.matchAll(/PSQL_CONNECT_RETRIES/g)].length;
  assert.equal(ocorrencias, 1, 'a variavel so pode ser definida no preflight');
  const preflight = workflow.indexOf('id: preflight');
  const apply = workflow.indexOf('- name: Aplicar lote autorizado');
  assert.ok(preflight > 0 && apply > preflight, 'preflight precisa vir antes do apply');
  assert.match(workflow.slice(preflight, apply), /PSQL_CONNECT_RETRIES: '2'/);
  assert.doesNotMatch(workflow.slice(apply), /PSQL_CONNECT_RETRIES/,
    'o apply nunca define retries: repetir o push seria reaplicar DDL');
});

// R2-INF-003 (reauditoria de 03/10/2026) + GA13: cada job endurece o proprio
// DSN (GITHUB_ENV nao atravessa jobs), sempre isolando o secret bruto em
// DESTINO_URL_RAW. Invariante: o secret aparece exatamente 2x (uma por job),
// sempre no passo que endurece; nenhum passo redeclara o valor endurecido.
test('R2-INF-003: o secret bruto aparece uma vez por job, so no passo que endurece o DSN', () => {
  const ocorrencias = [...workflow.matchAll(/secrets\.DESTINO_URL/g)];
  assert.equal(ocorrencias.length, 2,
    'um job nao herda GITHUB_ENV do outro: cada job le o secret uma vez, no passo que endurece');
  assert.doesNotMatch(workflow, /DESTINO_URL:\s*\$\{\{\s*secrets\.DESTINO_URL\s*\}\}/,
    'redeclarar o secret sobrescreve o DESTINO_URL endurecido e perde o verify-full');
  assert.match(workflow, /DESTINO_URL_RAW:\s*\$\{\{\s*secrets\.DESTINO_URL\s*\}\}/,
    'a leitura do secret tem de continuar isolada em DESTINO_URL_RAW');
});

test('R2-INF-003: cadeia secret -> endurecer -> transporte entrega verify-full e CA pinada ao psql', async () => {
  // O teste exercita as MESMAS funcoes que o workflow invoca — endurecerDestinoTls
  // na producao do DSN e withPsqlEnvironment (via psql-safe.mjs) no transporte.
  assert.match(workflow, /endurecerDestinoTls\(process\.env\.DESTINO_URL_RAW\)/);
  assert.match(workflow, /appendFileSync\(process\.env\.GITHUB_ENV, `DESTINO_URL=\$\{tls\.connectionString\}\\n`\)/);
  const psqlSafe = await readFile(new URL('../db-audit/psql-safe.mjs', import.meta.url), 'utf8');
  assert.match(psqlSafe, /process\.env\.DESTINO_URL/);
  assert.match(psqlSafe, /withPsqlEnvironment\(url,/);
  const bruto = 'postgresql://postgres.abcdefghijklmnopqrst:***@aws-0.pooler.supabase.invalid:6543/postgres';
  const tls = endurecerDestinoTls(bruto);
  assert.deepEqual(tls.erros, []);
  const capturar = (url) => {
    let filho;
    withPsqlEnvironment(url, (env) => { filho = env; }, { baseEnv: {} });
    return filho;
  };
  // O defeito provado: entregar o DSN bruto ao transporte (efeito da
  // redeclaracao removida acima) nao entrega sslmode ao processo filho.
  assert.equal(capturar(bruto).PGSSLMODE, undefined,
    'o DSN bruto nao carrega sslmode — era isso que os passos recebiam');
  const endurecido = capturar(tls.connectionString);
  assert.equal(endurecido.PGSSLMODE, 'verify-full');
  assert.equal(endurecido.PGSSLROOTCERT, SUPABASE_CA_PATH);
});

test('R2-INF-003: o CLI do Supabase recebe o mesmo DSN endurecido via GITHUB_ENV', () => {
  // A validacao exporta SUPABASE_DB_URL no GITHUB_ENV com a MESMA string
  // endurecida (e ja mascarada) de DESTINO_URL. A invariante e de fonte unica:
  // nenhum passo redeclara SUPABASE_DB_URL nem puxa DESTINO_URL pelo contexto
  // de expressao — todos os passos herdam o valor gravado no GITHUB_ENV.
  // Comentarios citam o padrao errado de proposito; a invariante vale no YAML/JS executavel.
  const executavel = workflow
    .split('\n')
    .filter((l) => { const t = l.trimStart(); return !t.startsWith('#') && !t.startsWith('//'); })
    .join('\n');
  assert.doesNotMatch(executavel, /\$\{\{\s*env\.DESTINO_URL\s*\}\}/,
    'DESTINO_URL nao pode ser redeclarado por expressao: o valor sai do GITHUB_ENV');
  assert.match(workflow,
    /appendFileSync\(process\.env\.GITHUB_ENV, `SUPABASE_DB_URL=\$\{tls\.connectionString\}\\n`\)/,
    'o mesmo DSN endurecido tem de sair no GITHUB_ENV para o CLI do Supabase');
  const passosCli = [...workflow.matchAll(/^      - name: (Dry-run oficial do Supabase CLI|Aplicar lote autorizado)$/gm)];
  assert.equal(passosCli.length, 2, 'os dois passos do CLI continuam no workflow');
  // O CLI herda o valor do GITHUB_ENV: nenhum dos dois declara SUPABASE_DB_URL sozinho.
  assert.doesNotMatch(executavel, /^\s+SUPABASE_DB_URL: /m,
    'nenhum passo redeclara SUPABASE_DB_URL: o CLI herda o valor do GITHUB_ENV');
});
