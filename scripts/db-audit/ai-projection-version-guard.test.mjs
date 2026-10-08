// R2-INF-023 — ensaio da trava ATÔMICA de versão da projeção de IA
// (migration 20261006160117_ai_context_version_atomic_persist.sql).
//
// Sobe um PostgreSQL descartável, reproduz o estado ANTERIOR aplicando as
// migrations REAIS (20260930110000 = função de 3 argumentos com o predicado
// `<= p_analyzed_at`; 20260930150000 = ACL só-service_role) e assina:
//
//   BLOCO A — o defeito existe na função antiga: a análise A (timestamp
//             posterior, contexto já superado) SUBSTITUI a projeção que B
//             acabou de gravar. É a prova do vermelho: sem a correção, o
//             BLOCO B não existe e o ensaio inteiro falha.
//   BLOCO B — migration nova aplicada: a mesma tentativa de A devolve
//             superseded, NÃO grava a linha de análise e preserva B;
//             controle projeta; a versão nunca retrocede no tempo;
//             p_should_project=false grava a análise sem tocar em contacts;
//             a comparação acontece SOB LOCK (chamada bloqueia num
//             SELECT ... FOR UPDATE concorrente e decide pela versão nova);
//             ACL: anon/authenticated não executam, service_role executa;
//             a sobrecarga antiga não existe mais;
//             o Rollback restaura assinatura, corpo e GRANTs.
//
// Roda com `node --test scripts/db-audit/ai-projection-version-guard.test.mjs`
// (o db-guard.yml já cobre `node --test scripts/db-audit/*.test.mjs`).
// Sem docker o teste FALHA com mensagem clara — nunca sai pulado com código 0.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const MIGRATION_ANTIGA = join(ROOT, 'supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql');
const MIGRATION_VOCAB = join(ROOT, 'supabase/migrations/20260930150000_ai_block03_vocabulary_contract.sql');
const MIGRATION_NOVA = join(ROOT, 'supabase/migrations/20261006160117_ai_context_version_atomic_persist.sql');
const CONTAINER = `zapp-v2-ai-projection-guard-${process.pid}`;
const DOCKER = resolverExecutavel('docker');
const PSQL = ['exec', CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'];

const CONTATO = 'd0000000-0000-0000-0000-000000000123';
const ANALISE_B = JSON.stringify({ summary: 'resumo de B', sentiment: 'positivo', ai_priority: 'high' });
const ANALISE_A = JSON.stringify({ summary: 'resumo de A', sentiment: 'negativo', ai_priority: 'urgent' });
const T_B = '2026-10-06T10:00:00Z';
const T_A = '2026-10-06T10:00:05Z';
const T_C = '2026-10-06T10:00:10Z';

function docker(args, opts = {}) {
  return execFileSync(DOCKER, args, { encoding: 'utf8', ...opts });
}

/** psql -c: devolve a saída crua. */
function psql(sql) {
  return docker([...PSQL, '-c', sql]);
}

/** psql com arquivo via stdin (migrations). */
function psqlFile(file) {
  return execFileSync(DOCKER, [...PSQL.slice(0, 1), '-i', ...PSQL.slice(1)], {
    input: readFileSync(file, 'utf8'),
    encoding: 'utf8',
  });
}

/** Resultado da última linha (chamadas de preparação imprimem antes). */
function psqlLast(sql) {
  const out = psql(sql).trim().split('\n');
  return out[out.length - 1];
}

function pass(label) {
  console.log(`[PASS] ${label}`);
}

function fail(label, detalhe = '') {
  console.error(`[FAIL] ${label}${detalhe ? ` — ${detalhe}` : ''}`);
  assert.fail(`${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

function expectValue(label, expected, sql) {
  const actual = psqlLast(sql);
  if (actual !== expected) fail(label, `esperado '${expected}', obtido '${actual}'`);
  pass(label);
}

function expectError(label, needle, sql) {
  const r = spawnSync(DOCKER, [...PSQL, '-c', '\\set VERBOSITY verbose', '-c', sql], { encoding: 'utf8' });
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === 0) fail(label, `deveria falhar, mas passou: ${saida}`);
  if (!saida.includes(needle)) fail(label, `esperava '${needle}' no erro: ${saida}`);
  pass(label);
}

/** Extrai o bloco `-- Rollback:` do cabeçalho da migration (comentários contíguos). */
function extrairRollback(file) {
  const linhas = readFileSync(file, 'utf8').split('\n');
  const inicio = linhas.findIndex((l) => /^--\s*Rollback:\s*\S/.test(l));
  assert.notEqual(inicio, -1, 'migration sem linha `-- Rollback:` preenchida');
  const sql = [linhas[inicio].replace(/^--\s*Rollback:\s*/, '')];
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const m = linhas[i].match(/^--\s?(.*)$/);
    if (!m) break;
    sql.push(m[1]);
  }
  return sql.join('\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chamada da RPC de 3 argumentos (assinatura antiga). */
function rpc3(analysis, analyzedAt) {
  return `SELECT public.persist_conversation_analysis('${CONTATO}', '${analysis}'::jsonb, '${analyzedAt}'::timestamptz)`;
}

/** Chamada da RPC nova, devolvendo um campo do jsonb de retorno. */
function rpc5(campo, analysis, analyzedAt, expected, shouldProject) {
  const exp = expected === null ? 'null' : `'${expected}'::timestamptz`;
  return `SELECT (public.persist_conversation_analysis('${CONTATO}', '${analysis}'::jsonb, '${analyzedAt}'::timestamptz, ${exp}, ${shouldProject}))->>'${campo}'`;
}

/** Chamada da RPC nova, devolvendo o jsonb de retorno inteiro (parseado). */
function rpc5Json(analysis, analyzedAt, expected, shouldProject) {
  const exp = expected === null ? 'null' : `'${expected}'::timestamptz`;
  const sql = `SELECT public.persist_conversation_analysis('${CONTATO}', '${analysis}'::jsonb, '${analyzedAt}'::timestamptz, ${exp}, ${shouldProject})`;
  return JSON.parse(psqlLast(sql));
}

/** Zera projeção e histórico do contato de teste. */
const RESET = `DELETE FROM public.conversation_analyses WHERE contact_id='${CONTATO}';
UPDATE public.contacts SET ai_sentiment=null, ai_priority=null, ai_projection_updated_at=null, ai_projection_analysis_id=null WHERE id='${CONTATO}';`;

const PRE_SQL = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- Superfície mínima fiel ao banco real: as migrations aplicadas em seguida
-- completam as colunas do bloco de IA.
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  ai_sentiment text,
  ai_priority text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  analyzed_by uuid,
  summary text NOT NULL,
  sentiment text,
  sentiment_score integer,
  customer_satisfaction integer,
  key_points text[],
  next_steps text[],
  topics text[],
  urgency text,
  status text NOT NULL DEFAULT 'pendente',
  message_count integer,
  department text,
  relationship_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  tag_name text,
  confidence numeric,
  source text
);

-- Grants de tabela do serviço (a RPC é security invoker: quem executa precisa
-- dos privilégios de tabela, como no banco real).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_analyses TO service_role;
GRANT SELECT, UPDATE ON public.contacts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_tags TO service_role;

INSERT INTO public.contacts (id) VALUES ('${CONTATO}');
`;

test('R2-INF-023: trava atômica de versão da projeção (Postgres descartável)', { timeout: 300000 }, async () => {
  // Sem docker o ensaio FALHA — prova ausente não pode sair como sucesso.
  const info = spawnSync(DOCKER, ['info'], { encoding: 'utf8' });
  assert.equal(info.status, 0, `docker indisponível — o ensaio não pode ser pulado: ${info.stderr ?? ''}`);

  const tmp = mkdtempSync(join(tmpdir(), 'ai-projection-guard-'));
  try {
    docker(['run', '--rm', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=test_only', 'postgres:17-alpine']);
    let pronto = 0;
    for (let i = 0; i < 90 && pronto < 2; i += 1) {
      const r = spawnSync(DOCKER, [...PSQL, '-c', 'SELECT 1'], { encoding: 'utf8' });
      pronto = r.status === 0 ? pronto + 1 : 0;
      if (pronto < 2) await sleep(1000);
    }
    assert.ok(pronto >= 2, 'PostgreSQL descartável não ficou pronto de forma estável');

    const pre = join(tmp, 'pre.sql');
    writeFileSync(pre, PRE_SQL);
    psqlFile(pre);

    // Estado ANTERIOR real: as duas migrations históricas do bloco.
    psqlFile(MIGRATION_ANTIGA);
    psqlFile(MIGRATION_VOCAB);
    pass('estado anterior montado (migrations reais 20260930110000 + 20260930150000)');

    // ─── BLOCO A: o defeito existe na função de 3 argumentos ────────────────
    console.log('── BLOCO A: defeito (função antiga, predicado <= p_analyzed_at) ──');
    expectValue('A: B projeta a versão T_B', 'true', `${rpc3(ANALISE_B, T_B)} ->> 'projected'`);
    expectValue('A: projeção de B no contato', 'positivo', `SELECT ai_sentiment FROM public.contacts WHERE id='${CONTATO}'`);
    // A (contexto superado) chega com timestamp POSTERIOR: o predicado aceita.
    expectValue('A: a análise antiga também "projeta" (T_B <= T_A)', 'true', `${rpc3(ANALISE_A, T_A)} ->> 'projected'`);
    expectValue('A: DEFEITO — A substituiu o sentimento projetado por B', 'negativo', `SELECT ai_sentiment FROM public.contacts WHERE id='${CONTATO}'`);
    expectValue('A: DEFEITO — a versão da projeção virou a de A', '2026-10-06 10:00:05+00', `SELECT ai_projection_updated_at FROM public.contacts WHERE id='${CONTATO}'`);

    // ─── BLOCO B: migration nova aplicada ────────────────────────────────────
    console.log('── BLOCO B: aplicando a migration nova ──');
    psqlFile(MIGRATION_NOVA);
    pass('migration 20261006160117 aplicou sem erro');
    psql(RESET);

    console.log('── BLOCO B: interleaving da auditoria (leitura A -> commit B -> A persiste) ──');
    // B mede "sem projeção" (expected null) e projeta.
    const retB = rpc5Json(ANALISE_B, T_B, null, true);
    assert.deepEqual({ projected: retB.projected, superseded: retB.superseded }, { projected: true, superseded: false });
    pass('B: projeta com a versão esperada correta (null), superseded=false');
    assert.ok(retB.analysis_id, 'B: analysis_id devolvido');
    // A leu "sem projeção" ANTES de B commitar; ao persistir, a trava recusa.
    const retA = rpc5Json(ANALISE_A, T_A, null, true);
    assert.equal(retA.superseded, true);
    assert.equal(retA.analysis_id, null);
    pass('B: A devolve superseded=true sem analysis_id');
    expectValue('B: A não gravou linha de análise (cancelado não persiste)', '1',
      `SELECT count(*) FROM public.conversation_analyses WHERE contact_id='${CONTATO}'`);
    expectValue('B: projeção do contato continua a de B', 'positivo', `SELECT ai_sentiment FROM public.contacts WHERE id='${CONTATO}'`);
    expectValue('B: versão continua a de B (T_B)', '2026-10-06 10:00:00+00',
      `SELECT ai_projection_updated_at FROM public.contacts WHERE id='${CONTATO}'`);

    console.log('── BLOCO B: controle e recência ──');
    const retC = rpc5Json(ANALISE_A, T_C, T_B, true);
    assert.equal(retC.projected, true);
    pass('B: controle — expected = versão corrente projeta');
    expectValue('B: controle — análise gravada', '2',
      `SELECT count(*) FROM public.conversation_analyses WHERE contact_id='${CONTATO}'`);
    expectValue('B: controle — versão avançou para T_C', '2026-10-06 10:00:10+00',
      `SELECT ai_projection_updated_at FROM public.contacts WHERE id='${CONTATO}'`);
    // p_analyzed_at mais ANTIGO que a versão vigente: a versão não retrocede.
    const retD = rpc5Json(ANALISE_B, T_A, T_C, true);
    assert.equal(retD.projected, true);
    pass('B: recência — grava com expected=T_C e p_analyzed_at antigo');
    expectValue('B: recência — versão = T_C + 1us (nunca retrocede)', 't',
      `SELECT ai_projection_updated_at = '2026-10-06T10:00:10.000001Z'::timestamptz FROM public.contacts WHERE id='${CONTATO}'`);

    console.log('── BLOCO B: versão não medida (p_should_project=false) ──');
    const antesSemProjecao = psqlLast(`SELECT ai_projection_updated_at FROM public.contacts WHERE id='${CONTATO}'`);
    const retSem = rpc5Json(ANALISE_B, '2026-10-06T10:00:20Z', null, false);
    assert.deepEqual({ superseded: retSem.superseded, projected: retSem.projected }, { superseded: false, projected: false });
    assert.ok(retSem.analysis_id, 'B: não medido — analysis_id devolvido (a análise grava)');
    pass('B: não medido — análise grava, superseded=false e projected=false');
    expectValue('B: não medido — linha de análise existe', '4',
      `SELECT count(*) FROM public.conversation_analyses WHERE contact_id='${CONTATO}'`);
    expectValue('B: não medido — projeção NÃO foi tocada', antesSemProjecao,
      `SELECT ai_projection_updated_at FROM public.contacts WHERE id='${CONTATO}'`);

    console.log('── BLOCO B: a comparação acontece SOB LOCK da linha ──');
    // Recalibra a versão para um valor conhecido.
    psql(`UPDATE public.contacts SET ai_projection_updated_at='2026-10-06T11:00:00Z' WHERE id='${CONTATO}'`);
    // Sessão concorrente: trava a linha, segura ~2s e avança a versão.
    const lockSql = "SELECT ai_projection_updated_at FROM public.contacts WHERE id='" + CONTATO + "' FOR UPDATE; " +
      "SELECT pg_sleep(1.0); " +
      "UPDATE public.contacts SET ai_projection_updated_at='2026-10-06T11:00:02Z' WHERE id='" + CONTATO + "'; " +
      "SELECT pg_sleep(1.0);";
    const locker = spawn(DOCKER, [...PSQL, '-c', lockSql], { stdio: 'ignore' });
    const lockerSaiu = new Promise((res) => locker.on('close', res));
    await sleep(400); // garante que o FOR UPDATE já foi adquirido

    const t0 = Date.now();
    const supersededSobLock = psqlLast(rpc5('superseded', ANALISE_A, '2026-10-06T11:00:05Z', '2026-10-06T11:00:00Z', true));
    const elapsed = Date.now() - t0;
    await lockerSaiu;
    if (supersededSobLock !== 'true') fail('lock: A com versão esperada velha deveria voltar superseded', `obtido '${supersededSobLock}'`);
    pass(`lock: chamada da RPC BLOQUEOU ~${elapsed}ms no FOR UPDATE concorrente`);
    assert.ok(elapsed >= 1000, `lock: a chamada deveria ter bloqueado (~1,6s de lock), levou só ${elapsed}ms — a comparação não esperou a linha`);
    expectValue('lock: depois do lock, A viu a versão NOVA (devolveu superseded)', '2026-10-06 11:00:02+00',
      `SELECT ai_projection_updated_at FROM public.contacts WHERE id='${CONTATO}'`);
    expectValue('lock: análise bloqueada não foi gravada', '0',
      `SELECT count(*) FROM public.conversation_analyses WHERE contact_id='${CONTATO}' AND summary='resumo de A' AND analyzed_at='2026-10-06T11:00:05Z'`);

    console.log('── BLOCO B: ACL — só service_role executa a assinatura nova ──');
    for (const papel of ['anon', 'authenticated']) {
      expectValue(`ACL: ${papel} sem EXECUTE na assinatura nova`, 'f',
        `SELECT has_function_privilege('${papel}','public.persist_conversation_analysis(uuid,jsonb,timestamptz,timestamptz,boolean)','EXECUTE')`);
      expectError(`ACL: ${papel} é recusado executando`, 'permission denied',
        `SET ROLE ${papel}; SELECT public.persist_conversation_analysis('${CONTATO}', '{}'::jsonb, now(), null, true)`);
    }
    expectValue('ACL: service_role tem EXECUTE na assinatura nova', 't',
      `SELECT has_function_privilege('service_role','public.persist_conversation_analysis(uuid,jsonb,timestamptz,timestamptz,boolean)','EXECUTE')`);
    expectValue('ACL: service_role executa de fato', 'false',
      `SET ROLE service_role; SELECT (public.persist_conversation_analysis('${CONTATO}', '{"summary":"svc"}'::jsonb, now(), null, false))->>'superseded'`);

    console.log('── BLOCO B: a sobrecarga antiga não existe mais ──');
    expectValue('assinatura de 3 argumentos foi DROPada', 't',
      `SELECT to_regprocedure('public.persist_conversation_analysis(uuid,jsonb,timestamptz)') IS NULL`);
    expectError('chamada com 3 argumentos não existe (proteção não é opcional)', 'does not exist',
      rpc3(ANALISE_A, T_A));

    // ─── Rollback ────────────────────────────────────────────────────────────
    console.log('── Rollback: restaura assinatura, corpo e GRANTs ──');
    const rollback = extrairRollback(MIGRATION_NOVA);
    const rollbackFile = join(tmp, 'rollback.sql');
    writeFileSync(rollbackFile, rollback);
    psqlFile(rollbackFile);
    pass('rollback aplicou sem erro');
    expectValue('rollback: assinatura nova sumiu', 't',
      `SELECT to_regprocedure('public.persist_conversation_analysis(uuid,jsonb,timestamptz,timestamptz,boolean)') IS NULL`);
    expectValue('rollback: assinatura de 3 argumentos restaurada', 't',
      `SELECT to_regprocedure('public.persist_conversation_analysis(uuid,jsonb,timestamptz)') IS NOT NULL`);
    expectValue('rollback: service_role com EXECUTE restaurado', 't',
      `SELECT has_function_privilege('service_role','public.persist_conversation_analysis(uuid,jsonb,timestamptz)','EXECUTE')`);
    expectValue('rollback: authenticated sem EXECUTE restaurado', 'f',
      `SELECT has_function_privilege('authenticated','public.persist_conversation_analysis(uuid,jsonb,timestamptz)','EXECUTE')`);
    // Corpo antigo de volta: o predicado `<= p_analyzed_at` torna a aceitar A.
    psql(RESET);
    expectValue('rollback: corpo antigo — B projeta', 'true', `${rpc3(ANALISE_B, T_B)} ->> 'projected'`);
    expectValue('rollback: corpo antigo — A substitui B de novo (defeito de volta)', 'true',
      `${rpc3(ANALISE_A, T_A)} ->> 'projected'`);
    expectValue('rollback: DEFEITO restaurado — sentimento é o de A', 'negativo',
      `SELECT ai_sentiment FROM public.contacts WHERE id='${CONTATO}'`);

    console.log('[OK] R2-INF-023 verificado: trava de versão atômica, lock real, ACL e rollback');
  } finally {
    try {
      docker(['rm', '-f', CONTAINER]);
    } catch {
      /* container já removido ou nunca subiu */
    }
    rmSync(tmp, { recursive: true, force: true });
  }
});
