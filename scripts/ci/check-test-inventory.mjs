#!/usr/bin/env node
// E48: verifica que todo .test.ts (supabase/functions/) e .test.sh (scripts/db-audit/)
// tem correspondente registrado em ci.yml / db-guard.yml.
// E49: quando ci.yml usa $(git ls-files 'supabase/functions/**/*.test.ts'), a
// comparação individual de .test.ts é desnecessária (o glob cobre todos).
// E50: ai-block03-vocabulary-contract, talkx-settings-rls e
// user-settings-sound-integrity-contract movidos da ALLOWLIST para db-guard.yml.
// R2-INF-013: o inventário só olhava .test.ts e .test.sh — as suites Node de scripts/
// (.test.mjs, .unit.mjs, .integration.mjs) eram invisíveis. Quatro suites já existiam fora
// dos globos de CI e ninguém notava; uma suite nova nascia sem passo nenhum e este
// verificador continuava dizendo OK. Agora todo caminho/globo de suite Node citado em um
// bloco `run:` de QUALQUER workflow conta como coberto (linha comentada dentro do bloco não
// conta: passo desligado por comentário não executa), e o que não aparece em nenhum bloco
// `run:` precisa estar na ALLOWLIST_NODE com justificativa.

import { readFileSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { resolverExecutavel } from '../lib/seguranca-processo.mjs';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '../../..');

export const RAIZ = root;

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function listarArquivosNoDisco(relDir) {
  const base = join(root, relDir);
  const out = [];
  function visitar(abs, rel) {
    for (const nome of readdirSync(abs).sort()) {
      const filhoAbs = join(abs, nome);
      const filhoRel = rel ? `${rel}/${nome}` : nome;
      const st = statSync(filhoAbs);
      if (st.isDirectory()) visitar(filhoAbs, filhoRel);
      else if (st.isFile()) out.push(filhoRel);
    }
  }
  visitar(base, relDir);
  return out;
}

function gitLsFilesOuDisco(relDir) {
  try {
    const resultado = spawnSync(resolverExecutavel('git'), ['ls-files', relDir], { cwd: root, encoding: 'utf8' });
    if (typeof resultado.stdout === 'string') return resultado.stdout.split('\n').filter(Boolean);
  } catch {
    // O CI também executa este arquivo via `deno test` sem --allow-sys/--allow-run.
    // Nesse modo o shim Node de Deno não deixa `fs.access(X_OK)`/child_process
    // observar o git; o checkout do runner é limpo, então a varredura do disco é
    // equivalente para este inventário.
  }
  return listarArquivosNoDisco(relDir);
}

// Testes conhecidos ainda fora do CI; remover linha quando a etapa correspondente mergear.
const ALLOWLIST = new Set([
  // --- .test.sh — TalkX features em andamento; registrar em db-guard.yml quando prontas ---
  // X034: harness de integração do motor com o provedor falso (Postgres descartável + PostgREST +
  // fake-evolution). Roda no passo Deno/harness da Fase 3; promover em db-guard.yml quando maduro.
  'scripts/db-audit/talkx-engine-provider.test.sh',
  'scripts/db-audit/talk-me-client-privileges.test.sh',
  'scripts/db-audit/talkx-current-template-version.test.sh',
  'scripts/db-audit/talkx-v23-draft-step.test.sh',
  'scripts/db-audit/talkx-v25-owner.test.sh',
  'scripts/db-audit/talkx-v26-template-version.test.sh',
  // --- .test.sh — prova em container descartável (docker); passo de YAML
  // a promover em db-guard.yml pelo dono do workflow (agente não edita workflow).
  // Item 293 (R2-DB-005): prova que a associação reminders→conversation_tasks preserva a
  // identidade da origem (título+dono+contato+horários) com bijeção. Promover quando o
  // docker descartável estiver disponível no runner do db-guard.yml.
  'scripts/db-audit/reminders-migracao-identidade.test.sh',
  'scripts/db-audit/pg-cron-escalonamento.test.sh',
  'scripts/db-audit/talkx-optout.test.sh',
  'scripts/db-audit/talkx-overview-stats.test.sh',
  'scripts/db-audit/talkx-campaign-segments.test.sh',
  // N-118 (item t_f0720c47): versiona a prova SQL de talkx_campaign_window_open em PG 17
  // descartável (docker local) contra a migration 20261011000003 — fuso da campanha,
  // meia-noite no DND, business_hours com days, fail-closed e autorização sob roles reais.
  // Passo de uma linha em db-guard.yml — promover pelo dono do workflow.
  'scripts/db-audit/talkx-campaign-window-open.test.sh',
  // #464 (CAIXA-7eb1): mede a divergência de replay do E27 (publicação supabase_realtime) nos
  // próprios arquivos, em PG 17 descartável — a mesma receita do talkx-settings-replay-idempotent.
  'scripts/db-audit/talkx-e27-replay-divergence.test.sh',
  // IA-131 (item 133): cadeia real ia033→ia131 em PG 17 descartável (docker local) — prova que a
  // modalidade declarada antes continua declarada quando o `audio_stt` entra. Passo de uma linha em
  // db-guard.yml — promover pelo dono do workflow.
  'scripts/db-audit/ia131-audio-stt-cadeia.test.sh',
  // MX03 / item 47: prova, em Postgres descartavel, que a conclusao do dispatch Multiplix
  // decide pela fila por item (multiplix_delivery_items) quando ela existe. O passo no
  // db-guard.yml e uma linha (`bash scripts/db-audit/multiplix-completion-item-queue.test.sh`)
  // e fica para o dono do workflow.
  'scripts/db-audit/multiplix-completion-item-queue.test.sh',
  // --- .test.sh OFFLINE (sem docker, sem banco): roda em qualquer runner. O passo no
  // db-guard.yml e uma linha — `bash scripts/db-audit/replay-classify.test.sh` — e cabe
  // junto de gen-types.test.sh; promover pelo dono do workflow.
  'scripts/db-audit/replay-classify.test.sh',
  // --- .test.sh — prova em container descartável (docker) do R2-DB-008 (item 295):
  // encerrar→reabrir→encerrar no mesmo dia. Depende de docker (como os demais deste bloco);
  // o passo no db-guard.yml é uma linha `bash scripts/db-audit/conversation-closures-reopen-same-day.test.sh`
  // e cabe junto dos outros testes de container — promover pelo dono do workflow.
  'scripts/db-audit/conversation-closures-reopen-same-day.test.sh',
  // R2-INF-014 (item 361): harness do replay-local.sh com um `docker` de mentira no PATH
  // (offline, sem docker daemon e sem banco). Prova nome unico por run + rotulo de posse, o
  // nao-destrutivo em container alheio, o digest fixado, o aborto em bootstrap falho e o trap.
  // Passo de uma linha em db-guard.yml — promover pelo dono do workflow.
  'scripts/db-audit/replay-local-harness.test.sh',
  // E44 (F6): prova que o REVOKE de grants de `whatsapp_connections` (anon na tabela
  // e nas 3 views; authenticated em TRUNCATE/TRIGGER/REFERENCES) vale como o PAPEL
  // real e que a linha `-- Rollback:` da migration restaura — Postgres 17
  // descartável (docker). Passo de YAML a promover em db-guard.yml pelo dono do workflow.
  'scripts/db-audit/e44-whatsapp-connections-anon-grants.test.sh',
]);

// Suites Node (scripts/**/*.test.mjs, *.unit.mjs, *.integration.mjs) que hoje não têm passo em
// workflow nenhum. Todas rodam offline (`node --test <arquivo>`); a promoção é uma linha em
// ci.yml/db-guard.yml — do dono do workflow (agente não edita workflow). R2-INF-013: as quatro
// primeiras já existiam quando a auditoria (2026-10-03) apontou o defeito; as três de
// ui-audit entraram depois (2026-10-05) e ficaram invisíveis pelo mesmo motivo.
export const ALLOWLIST_NODE = new Set([
  // Valida um plano de catálogo sintético contra o repositório (offline).
  'scripts/catalog/validate-plan.test.mjs',
  // Prova o resolvedor de executáveis usado por várias guardas (offline).
  'scripts/lib/seguranca-processo.test.mjs',
  // Prova os provadores de visão com `fetch` stubbed (offline).
  'scripts/qa/prova-visao-classificadores.unit.mjs',
  // Prova o log do validador de banco do team chat com `fetch` stubbed (offline).
  'scripts/team-chat-db-validate.unit.mjs',
  // Auditorias de layout/UI lidas do próprio repositório (offline).
  'scripts/ui-audit/contacts-navy-header.unit.mjs',
  'scripts/ui-audit/layout-guard.unit.mjs',
  'scripts/ui-audit/view-container-padding.unit.mjs',
  // R2-INF-010: prova o contrato da resposta do `mcp_exec` no runner da suite de banco
  // (runner de verdade em child process, `fetch` stubbed); offline. A promoção a um bloco
  // `run:` de ci.yml é do dono do workflow.
  'scripts/db-tests/run-all.unit.mjs',
]);

// ── 1. .test.ts: disco vs ci.yml ───────────────────────────────────────────────

const testTsOnDisk = gitLsFilesOuDisco('supabase/functions')
  .filter(f => f.endsWith('.test.ts'));

const ciYaml = read('.github/workflows/ci.yml');

// E49: se ci.yml usa o glob, todos os .test.ts são cobertos automaticamente.
const CI_TS_GLOB = "supabase/functions/**/*.test.ts";
const ciUsesGlob = ciYaml.includes(CI_TS_GLOB);

// ── 2. .test.sh: disco vs db-guard.yml ────────────────────────────────────────

const testShOnDisk = gitLsFilesOuDisco('scripts/db-audit')
  .filter(f => f.endsWith('.test.sh'));

const dbGuardYaml = read('.github/workflows/db-guard.yml');
const testShInGuard = new Set(
  [...dbGuardYaml.matchAll(/\bscripts\/db-audit\/\S+\.test\.sh\b/g)].map(m => m[0])
);

// ── 3. Suites Node: disco vs passos de workflow ───────────────────────────────
// O caminho da suite conta como coberto quando aparece dentro de um bloco `run:` de algum
// workflow — exatamente onde o runner a executa (com `node --test` ou direto com `node`).
// Citação em comentário, nome de etapa ou `env:` NÃO conta: é o que separa registro de execução.

const SUFIXO_SUITE_NODE = /\.(?:test|unit|integration)\.mjs$/;
const CAMINHO_SUITE_NODE = /scripts\/[A-Za-z0-9_./*-]+\.(?:test|unit|integration)\.mjs/g;

/**
 * Caminhos e globos de suíte citados nos blocos `run:` de um workflow, para o padrão
 * informado. Um caminho só conta se estiver DENTRO de um bloco `run:`: citação em
 * comentário, nome de etapa ou `env:` NÃO conta — é o que separa registro de execução.
 */
export function padroesDeBlocosRun(yaml, padraoCaminho) {
  const linhas = String(yaml).split('\n');
  const padroes = new Set();
  for (let i = 0; i < linhas.length; i += 1) {
    const abertura = /^(\s*)run:\s*(.*)$/.exec(linhas[i]);
    if (!abertura) continue;
    const recuo = abertura[1].length;
    const bloco = [abertura[2]];
    for (let j = i + 1; j < linhas.length; j += 1) {
      const linha = linhas[j];
      if (linha.trim() === '') continue; // linha vazia não fecha o bloco
      if (linha.length - linha.trimStart().length <= recuo) break;
      if (linha.trimStart().startsWith('#')) continue; // passo comentado não executa nada
      bloco.push(linha);
    }
    for (const padrao of bloco.join('\n').match(padraoCaminho) ?? []) padroes.add(padrao);
  }
  return [...padroes].sort();
}

/** Caminhos e globos de suites Node citados nos blocos `run:` de um workflow. */
export function padroesNodeDeWorkflow(yaml) {
  return padroesDeBlocosRun(yaml, CAMINHO_SUITE_NODE);
}

/** Casa um caminho com um glob simples: `*` não atravessa `/`, `**` atravessa. */
export function casaPadrao(arquivo, padrao) {
  if (!padrao.includes('*')) return arquivo === padrao;
  const expressao = padrao
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${expressao}$`).test(arquivo);
}

/** Suites Node sem nenhum bloco `run:` que as execute (fora da ALLOWLIST_NODE). */
export function orfaosNode(suites, padroes, allowlist = ALLOWLIST_NODE) {
  return suites.filter(f => !padroes.some(p => casaPadrao(f, p)) && !allowlist.has(f));
}

/** Suites Node versionadas em scripts/, do disco. */
export function suitesNodeNoDisco() {
  return gitLsFilesOuDisco('scripts')
    .filter(f => SUFIXO_SUITE_NODE.test(f));
}

/** Todo caminho/globo de suite Node declarado nos blocos `run:` dos workflows do repositório. */
export function padroesNodeDosWorkflows() {
  const dir = join(root, '.github/workflows');
  return readdirSync(dir)
    .filter(f => /\.ya?ml$/.test(f))
    .flatMap(f => padroesNodeDeWorkflow(readFileSync(join(dir, f), 'utf8')));
}

export function suitesNodeOrfas() {
  return orfaosNode(suitesNodeNoDisco(), padroesNodeDosWorkflows());
}

// ── 3b. Suítes SQL (.sql): disco vs passos de workflow ────────────────────────
// t_fceba6d5: as suítes .sql de supabase/tests/ e scripts/db-tests/ eram INVISÍVEIS ao
// inventário (mesmo defeito que o R2-INF-013 consertou para as suites Node). Uma suíte nova
// nascia sem passo nenhum e o verificador continuava dizendo OK. Agora todo caminho/globo de
// .sql citado em um bloco `run:` de QUALQUER workflow conta como coberto; o que não aparece
// em bloco nenhum precisa estar na ALLOWLIST_SQL com justificativa.

const DIRS_SUITE_SQL = ['supabase/tests', 'scripts/db-tests'];
const CAMINHO_SUITE_SQL = /(?:supabase\/tests|scripts\/db-tests)\/[A-Za-z0-9_./*-]+\.sql/g;

// Suítes SQL conhecidas ainda fora do CI; remover linha quando a etapa correspondente mergear.
// Medições de t_fceba6d5 (PostgreSQL 17 descartável): as auto-contidas rodam pelo runner
// scripts/db-tests/run-suites-postgres.sh; as demais dependem de bootstrap próprio.
export const ALLOWLIST_SQL = new Set([
  // supabase/tests — auto-contida, mas a migration sob teste (20261007095739, t_89af1a99)
  // ainda não está na branch do dia. O runner já a executa; falha só em `No such file`.
  // Promover quando a migration integrar (o padrão relativo do arquivo passa a servir).
  'supabase/tests/indeterminate_optout_outbox.sql',
  // supabase/tests — dependem do envelope `mcp_exec` (SET LOCAL ROLE + request.jwt.claims do
  // PostgREST) para provar autorização; precisam do harness de sessão antes do passo no CI.
  'supabase/tests/ai_jobs_lease_efeito_incerto.sql',
  'supabase/tests/inbox_agregado_por_contato.sql',
  'supabase/tests/transfer_conversation_atomicidade.sql',
  // supabase/tests — família RLS/dashboard que roda como service_role (BYPASSRLS) e NÃO prova
  // enforcement. Supersedidas por scripts/db-audit/dashboard-rls-authorization.test.sh, que
  // prova o mesmo sob PAPÉIS REAIS; reduzir conforme o dono do dashboard decidir.
  'supabase/tests/dashboard_kpi_edge_cases.sql',
  'supabase/tests/dashboard_rpc_filters.sql',
  'supabase/tests/rls_dashboard.sql',
  'supabase/tests/rls_whatsapp_media_select_via_messages.sql',
  'supabase/tests/rls_conversation_tab_counts_files_total.sql',
  // scripts/db-tests — harness LEGADO que aplica as suítes pelo `mcp_exec`/service_role
  // (run-all.mjs) contra o banco canônico; nunca pôde rodar no CI por design. As suítes
  // dependem do schema COMPLETO: no PG limpo 01 e 05 degeneram em PASS vazio (0 objetos) e
  // 02/03/04 falham por relação ausente (medido). Promover com bootstrap próprio.
  'scripts/db-tests/01-security-grants.sql',
  'scripts/db-tests/02-fsm-transitions.sql',
  'scripts/db-tests/03-gamification-bounds.sql',
  'scripts/db-tests/04-schema-contracts.sql',
  'scripts/db-tests/05-rls-smoke.sql',
]);

/** Suítes SQL sem nenhum bloco `run:` que as execute (fora da ALLOWLIST_SQL). */
export function orfaosSql(suites, padroes, allowlist = ALLOWLIST_SQL) {
  return suites.filter(f => !padroes.some(p => casaPadrao(f, p)) && !allowlist.has(f));
}

/** Suítes SQL versionadas em supabase/tests/ e scripts/db-tests/, do disco. */
export function suitesSqlNoDisco() {
  return DIRS_SUITE_SQL
    .flatMap(d => gitLsFilesOuDisco(d))
    .filter(f => f.endsWith('.sql'))
    .sort();
}

/** Caminhos e globos de suítes SQL citados nos blocos `run:` de um workflow. */
export function padroesSqlDeWorkflow(yaml) {
  return padroesDeBlocosRun(yaml, CAMINHO_SUITE_SQL);
}

/** Todo caminho/globo de suíte SQL declarado nos blocos `run:` dos workflows do repositório. */
export function padroesSqlDosWorkflows() {
  const dir = join(root, '.github/workflows');
  return readdirSync(dir)
    .filter(f => /\.ya?ml$/.test(f))
    .flatMap(f => padroesSqlDeWorkflow(readFileSync(join(dir, f), 'utf8')));
}

export function suitesSqlOrfas() {
  return orfaosSql(suitesSqlNoDisco(), padroesSqlDosWorkflows());
}

// ── 4. Detectar órfãos ────────────────────────────────────────────────────────

/**
 * Roda o inventário inteiro e devolve a lista de órfãos (`[]` = tudo coberto).
 * O teste importa esta função; o CI roda o arquivo direto (ver `principal`).
 */
export function orfaosDoInventario() {
  const orphans = [];

  if (!ciUsesGlob) {
    // Sem glob: comparação individual de .test.ts contra a lista em ci.yml.
    const testTsInCi = new Set(
      [...ciYaml.matchAll(/\bsupabase\/functions\/\S+\.test\.ts\b/g)].map(m => m[0])
    );
    for (const f of testTsOnDisk) {
      if (!testTsInCi.has(f) && !ALLOWLIST.has(f)) {
        orphans.push({ file: f, yaml: 'ci.yml' });
      }
    }
  }

  for (const f of testShOnDisk) {
    if (!testShInGuard.has(f) && !ALLOWLIST.has(f)) {
      orphans.push({ file: f, yaml: 'db-guard.yml' });
    }
  }

  for (const f of suitesNodeOrfas()) {
    orphans.push({ file: f, yaml: 'nenhum bloco run: de workflow' });
  }

  for (const f of suitesSqlOrfas()) {
    orphans.push({ file: f, yaml: 'nenhum bloco run: de workflow' });
  }

  return orphans;
}

// ── 5. Reportar ───────────────────────────────────────────────────────────────

function principal() {
  const orphans = orfaosDoInventario();

  if (orphans.length === 0) {
    const nodeMsg = `${suitesNodeNoDisco().length} suite(s) Node cobertas por bloco run: (${ALLOWLIST_NODE.size} na allowlist)`;
    const sqlMsg = `${suitesSqlNoDisco().length} suíte(s) SQL cobertas por bloco run: (${ALLOWLIST_SQL.size} na allowlist)`;
    if (ciUsesGlob) {
      console.log(`check-test-inventory: OK — ci.yml usa glob (${CI_TS_GLOB}); ${nodeMsg}; ${sqlMsg}; .test.sh verificados individualmente`);
    } else {
      console.log(`check-test-inventory: OK — todos os testes têm correspondente no CI YAML; ${nodeMsg}; ${sqlMsg}`);
    }
    return 0;
  }

  console.error('check-test-inventory: FALHOU — testes no disco sem correspondente no CI YAML:');
  for (const { file, yaml } of orphans) {
    console.error(`  ${file}  (não encontrado em ${yaml})`);
  }
  console.error(`\nTotal: ${orphans.length} teste(s) órfão(s).`);
  console.error('Adicione ao YAML correspondente ou inclua na ALLOWLIST (test.sh) / ALLOWLIST_NODE (suite Node) / ALLOWLIST_SQL (suíte SQL) com justificativa.');
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(principal());
}
