// TC-014 (item #58) — guarda de regressão das GUARDAS GLOBAIS.
//
// A branch em quarentena `claude/confident-babbage-ivgmmn` (nunca mergeada) trocou
// duas guardas globais por versões incompatíveis:
//   - `scripts/db-audit/runtime-config.test.sh` virou `psql "${DESTINO_URL}"` (alvo
//     remoto, fora de container) devolvendo `SKIP` + `exit 0` quando a conexão
//     falha — ou seja, falha de validação passaria a contar como "aprovado";
//   - `scripts/db-audit/realtime-publication-baseline.json` perdeu
//     `schema_version`/`project_ref`/`tables` e a cobertura de todos os módulos,
//     virando só `team_chat_tables` (5 objetos).
//
// Nada disso está no código atual; este teste existe para que a substituição não
// entre silenciosamente num resgate futuro da branch. Ele falha (VERMELHO) se a
// guarda for enfraquecida de novo, e passa (VERDE) no estado correto. A prova é de
// COMPORTAMENTO: o teste global é EXECUTADO de verdade, e a baseline é lida pelo
// código real (loadRealtimeBaseline / validarBaselineRealtime), não por cópias.
//
// Roda no workflow db-guard: `node --test scripts/db-audit/*.test.mjs`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRealtimeBaseline, validarBaselineRealtime } from './check-runtime-config.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT_RUNTIME = 'scripts/db-audit/runtime-config.test.sh';

// Forma exata da baseline da branch em quarentena — evidência em
// docs/reconciliation/evidence/branch_quarantine.json (disposição
// QUARANTINE_GUARD_REGRESSION, specific_findings TC-014).
const baselineDoRamoEmQuarentena = {
  captured_at: '2026-09-29',
  publication: 'supabase_realtime',
  team_chat_tables: [
    { schema: 'public', table: 'team_conversations' },
    { schema: 'public', table: 'team_conversation_members' },
    { schema: 'public', table: 'team_messages' },
    { schema: 'public', table: 'team_message_reactions' },
    { schema: 'public', table: 'team_message_receipts' },
  ],
};

/**
 * Executa o teste global real com `docker` e `psql` indisponíveis (shims que falham,
 * na frente do PATH) e um DESTINO_URL de mentira no ambiente. O cenário é "a validação
 * NÃO pôde ocorrer": o script tem de falhar (exit != 0) e nunca anunciar sucesso. O
 * `psql` de PATH é armadilha: se o script passar a consultar um banco remoto por
 * DESTINO_URL (defeito da branch em quarentena), o marcador aparece.
 */
function rodarTesteGlobalSemRuntime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardas-globais-'));
  const marcadorPsql = path.join(dir, 'psql-foi-chamado');
  const shimDocker = path.join(dir, 'docker');
  const shimPsql = path.join(dir, 'psql');
  fs.writeFileSync(shimDocker, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  fs.writeFileSync(shimPsql, `#!/bin/sh\n: > ${JSON.stringify(marcadorPsql)}\nexit 1\n`, { mode: 0o755 });
  const resultado = spawnSync('bash', [SCRIPT_RUNTIME], {
    cwd: RAIZ,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GUARD_PSQL_MARKER: marcadorPsql,
      // Alvo remoto claramente fictício: só existe para o ramo antigo tentar conectar.
      DESTINO_URL: 'postgres://guard-fixture@not-a-database.invalid/postgres',
    },
  });
  return { resultado, marcadorPsql };
}

test('runtime-config.test.sh falha quando a validação não ocorre (nunca vira SKIP exit 0)', () => {
  const { resultado } = rodarTesteGlobalSemRuntime();
  const saida = `${resultado.stdout}${resultado.stderr}`;
  assert.doesNotMatch(saida, /SKIP/, 'falha de conexão não pode ser resultado aprovado');
  assert.notEqual(resultado.status, 0, 'sem runtime validado o teste global tem de sair != 0');
});

test('runtime-config.test.sh valida em ambiente isolado, sem banco remoto por DESTINO_URL', () => {
  const { resultado, marcadorPsql } = rodarTesteGlobalSemRuntime();
  assert.equal(fs.existsSync(marcadorPsql), false, 'o teste global chamou psql do PATH (alvo remoto)');
  assert.doesNotMatch(`${resultado.stdout}${resultado.stderr}`, /DESTINO_URL/);
});

test('baseline global da publicação conserva o contrato (lida pelo código real)', () => {
  const tabelas = loadRealtimeBaseline(); // contrato em check-runtime-config.mjs
  const bruta = JSON.parse(
    fs.readFileSync(new URL('./realtime-publication-baseline.json', import.meta.url), 'utf8'),
  );
  assert.equal(bruta.schema_version, 1);
  assert.equal(bruta.publication, 'supabase_realtime');
  assert.ok(typeof bruta.project_ref === 'string' && bruta.project_ref.length > 0);
  assert.equal(bruta.team_chat_tables, undefined, 'baseline reduzida a team_chat_tables');
  assert.ok(tabelas.length > 10, 'baseline reduzida ao escopo de um único módulo');
});

test('baseline global da publicação cobre todos os módulos, não só o Team Chat', () => {
  const tabelas = new Set(loadRealtimeBaseline());
  // Âncoras de módulos distintos que a publicação global sempre carregou: se a
  // baseline for reduzida ao escopo de um módulo, ao menos uma some.
  const ancorasDeModulo = [
    'public.messages',
    'public.email_messages',
    'public.contacts',
    'public.calls',
    'public.notifications',
    'public.queues',
    'public.sales_deals',
    'public.payment_links',
    'public.talkx_campaigns',
    'public.whatsapp_connections',
    'public.team_messages',
  ];
  for (const tabela of ancorasDeModulo) {
    assert.ok(tabelas.has(tabela), `baseline perdeu a cobertura de ${tabela}`);
  }
});

test('o contrato real rejeita a baseline reduzida da branch em quarentena', () => {
  assert.throws(
    () => validarBaselineRealtime(baselineDoRamoEmQuarentena),
    /Invalid Realtime publication baseline/,
  );
});
