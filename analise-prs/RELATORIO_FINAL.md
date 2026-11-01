# Relatório Final — Análise de PRs em Aberto
**Data:** 2026-11-01  
**Sessão:** Análise exaustiva das PRs abertas de `adm01-debug/Zapp_Web_V2`  
**Main SHA analisado:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

---

## ⚠️ ALERTA URGENTE — PR #2487

**PR #2487 tem `auto_merge=true` ativo e é DECISAO_HUMANA (migration DDL em produção).**  
Se o CI passar, ela vai mergear automaticamente sem aprovação humana.  
**Joaquim deve desabilitar `auto_merge` na PR #2487 imediatamente.**  
Link: https://github.com/adm01-debug/Zapp_Web_V2/pull/2487

---

## Resumo por Categoria

| Status | Quantidade | PRs |
|---|---|---|
| MERGE_OK | 11 | #2489, #2493, #2494, #2495, #2498, #2501, #2504, #2507, #2513, #2516, #2524 |
| MERGEAR (manual) | 5 | #2418, #2465, #2479, #2520, #2522 |
| MERGEAR_COM_RESSALVA | 2 | #2417, #2431 |
| MERGE_OK_AUTO_MERGE_PENDING | 9 | #2462, #2463, #2464, #2467, #2475, #2478, #2480, #2484, #2532 |
| DECISAO_HUMANA (Regra 8) | 26 | #2426, #2457, #2460, #2461, #2466, #2469, #2471, #2472, #2473, #2476, #2481, #2483, #2485, #2486, #2487⚠️, #2491, #2496, #2497, #2499, #2502, #2503, #2508, #2510, #2511, #2514, #2526 |
| AGUARDANDO_APROVACAO | 2 | #2500, #2505 |
| DRAFT | 6 | #2519, #2525, #2527, #2529, #2530, #2531 |
| CONFLITO | 3 | #2492, #2506, #2512 |
| FECHADA_SEM_MERGE | 3 | #2468, #2488, #2490 |
| IMPOSSIVEL_MERGE | 1 | #2078 |

**Total dossiers:** 68

---

## Tabela Completa

| PR | Status | Título |
|---|---|---|
| [#2078](https://github.com/adm01-debug/Zapp_Web_V2/pull/2078) | IMPOSSIVEL_MERGE | ci(F3): baseline strict=false — opção A sem fila serial |
| [#2417](https://github.com/adm01-debug/Zapp_Web_V2/pull/2417) | MERGEAR_COM_RESSALVA | fix(tests): mocks clientHeight/clientWidth e spy HTMLElement |
| [#2418](https://github.com/adm01-debug/Zapp_Web_V2/pull/2418) | MERGEAR | docs: plano de correções e melhorias — 190 etapas (2026-10-19) |
| [#2426](https://github.com/adm01-debug/Zapp_Web_V2/pull/2426) | DECISAO_HUMANA | fix(ci): corrigir timeout do branch-hygiene-audit e baseline do Realtime |
| [#2431](https://github.com/adm01-debug/Zapp_Web_V2/pull/2431) | MERGEAR_COM_RESSALVA | fix(ci): docker-shim protege roles pg_*; setup.ts usa Element.prototype + clientHeight |
| [#2457](https://github.com/adm01-debug/Zapp_Web_V2/pull/2457) | DECISAO_HUMANA | feat: investigação instance_pause + UI de diagnóstico |
| [#2460](https://github.com/adm01-debug/Zapp_Web_V2/pull/2460) | DECISAO_HUMANA | feat(copilot): edge functions AI fases 8–14 (7 funções) + CI fix |
| [#2461](https://github.com/adm01-debug/Zapp_Web_V2/pull/2461) | DECISAO_HUMANA | feat(copilot): fases 1–3 e 15 — tabelas base + RLS (7 tabelas) |
| [#2462](https://github.com/adm01-debug/Zapp_Web_V2/pull/2462) | MERGE_OK_AUTO_MERGE_PENDING | chore: auditoria Supabase — relatório e progresso finais (2026-10-25) |
| [#2463](https://github.com/adm01-debug/Zapp_Web_V2/pull/2463) | MERGE_OK_AUTO_MERGE_PENDING | fix: MediaMigrationTool acessa dados via service |
| [#2464](https://github.com/adm01-debug/Zapp_Web_V2/pull/2464) | MERGE_OK_AUTO_MERGE_PENDING | fix: resolve lint regressions and existing typecheck errors |
| [#2465](https://github.com/adm01-debug/Zapp_Web_V2/pull/2465) | MERGEAR | docs: baseline consolidação 01/11/2026 |
| [#2466](https://github.com/adm01-debug/Zapp_Web_V2/pull/2466) | DECISAO_HUMANA | feat(copilot): edge functions CV-001..007 + migration |
| [#2467](https://github.com/adm01-debug/Zapp_Web_V2/pull/2467) | MERGE_OK_AUTO_MERGE_PENDING | feat: undo do bulkArchive restaura waiting/resolved/closed em dois passos |
| [#2468](https://github.com/adm01-debug/Zapp_Web_V2/pull/2468) | FECHADA_SEM_MERGE | feat(metas): seletor Hoje/Semana/Mês na aba Metas (C130 — recuperação) |
| [#2469](https://github.com/adm01-debug/Zapp_Web_V2/pull/2469) | DECISAO_HUMANA | feat(instance-pause): detectar instância pausada em evolution-api e multiplix-send |
| [#2471](https://github.com/adm01-debug/Zapp_Web_V2/pull/2471) | DECISAO_HUMANA | fix(db): migration instance_pause_investigation + teste |
| [#2472](https://github.com/adm01-debug/Zapp_Web_V2/pull/2472) | DECISAO_HUMANA | feat(instance-pause): orquestrador + integração message-delivery/multiplix/talkx |
| [#2473](https://github.com/adm01-debug/Zapp_Web_V2/pull/2473) | DECISAO_HUMANA | feat: conectar 7 hooks do Copiloto às edge functions AI (fases 8–14) |
| [#2475](https://github.com/adm01-debug/Zapp_Web_V2/pull/2475) | MERGE_OK_AUTO_MERGE_PENDING | fix(test): restaura 3 testes de ContactNotes afrouxados pela #2281 |
| [#2476](https://github.com/adm01-debug/Zapp_Web_V2/pull/2476) | DECISAO_HUMANA | feat(multiplix): cron retoma instância pausada (C121) |
| [#2478](https://github.com/adm01-debug/Zapp_Web_V2/pull/2478) | MERGE_OK_AUTO_MERGE_PENDING | feat(tarefas): cores de prioridade D12 |
| [#2479](https://github.com/adm01-debug/Zapp_Web_V2/pull/2479) | MERGEAR | docs: MAPA_pos-24-10 e progresso_pos-24-10 |
| [#2480](https://github.com/adm01-debug/Zapp_Web_V2/pull/2480) | MERGE_OK_AUTO_MERGE_PENDING | feat: C297 — visual de texto longo em Badge, Card, Label, Tabs |
| [#2481](https://github.com/adm01-debug/Zapp_Web_V2/pull/2481) | DECISAO_HUMANA | fix(rls): WITH CHECK explícito em policies de UPDATE |
| [#2483](https://github.com/adm01-debug/Zapp_Web_V2/pull/2483) | DECISAO_HUMANA | feat(copilot): coluna brinde_state em copilot_sessions (CV-026) |
| [#2484](https://github.com/adm01-debug/Zapp_Web_V2/pull/2484) | MERGE_OK_AUTO_MERGE_PENDING | feat(metas): seletor Hoje/Semana/Mês na aba Metas (C130, resgate) |
| [#2485](https://github.com/adm01-debug/Zapp_Web_V2/pull/2485) | DECISAO_HUMANA | fix(rls): corrigir políticas RLS — DROP POLICY IF EXISTS |
| [#2486](https://github.com/adm01-debug/Zapp_Web_V2/pull/2486) | DECISAO_HUMANA | feat(copilot): RADAR — 34 arquivos + novas edge functions |
| [#2487](https://github.com/adm01-debug/Zapp_Web_V2/pull/2487) | DECISAO_HUMANA ⚠️ | fix(db): corrigir trigger de notificações — DROP TRIGGER IF EXISTS |
| [#2488](https://github.com/adm01-debug/Zapp_Web_V2/pull/2488) | FECHADA_SEM_MERGE | fix: clientHeight/clientWidth mock no setup de testes |
| [#2489](https://github.com/adm01-debug/Zapp_Web_V2/pull/2489) | MERGE_OK | fix(e2e): corrigir seletor de telefonia no spec E2E |
| [#2490](https://github.com/adm01-debug/Zapp_Web_V2/pull/2490) | FECHADA_SEM_MERGE | docs: GF-001..056 — PENDENCIAS.md e BACKLOG_TAREFAS.md atualizados |
| [#2491](https://github.com/adm01-debug/Zapp_Web_V2/pull/2491) | DECISAO_HUMANA | feat(db): migration copilot_fases13_15 — 7 tabelas novas |
| [#2492](https://github.com/adm01-debug/Zapp_Web_V2/pull/2492) | CONFLITO | docs: fila-merge + testes + documentação |
| [#2493](https://github.com/adm01-debug/Zapp_Web_V2/pull/2493) | MERGE_OK | chore: atualizar CLAUDE.md e plano de tarefas |
| [#2494](https://github.com/adm01-debug/Zapp_Web_V2/pull/2494) | MERGE_OK | chore(types): sincronização automática de tipos TypeScript |
| [#2495](https://github.com/adm01-debug/Zapp_Web_V2/pull/2495) | MERGE_OK | chore: adicionar comandos .claude/commands/ |
| [#2496](https://github.com/adm01-debug/Zapp_Web_V2/pull/2496) | DECISAO_HUMANA | feat(edge): message-delivery — envio multimídia e fases 1-4 |
| [#2497](https://github.com/adm01-debug/Zapp_Web_V2/pull/2497) | DECISAO_HUMANA | ci: pular PRs draft no CI |
| [#2498](https://github.com/adm01-debug/Zapp_Web_V2/pull/2498) | MERGE_OK | feat(rpc): renomear search_insights → search_contacts_insights + testes |
| [#2499](https://github.com/adm01-debug/Zapp_Web_V2/pull/2499) | DECISAO_HUMANA | ci: adicionar workflow main-failure-notify.yml |
| [#2500](https://github.com/adm01-debug/Zapp_Web_V2/pull/2500) | AGUARDANDO_APROVACAO | feat(edge): copilot-tick + migration RPC copilot |
| [#2501](https://github.com/adm01-debug/Zapp_Web_V2/pull/2501) | MERGE_OK | docs: planos E19/E20/E21 |
| [#2502](https://github.com/adm01-debug/Zapp_Web_V2/pull/2502) | DECISAO_HUMANA | ci(draft): filtrar PRs draft no CI (v2) |
| [#2503](https://github.com/adm01-debug/Zapp_Web_V2/pull/2503) | DECISAO_HUMANA | ci: ajustes em ci.yml |
| [#2504](https://github.com/adm01-debug/Zapp_Web_V2/pull/2504) | MERGE_OK | test(e2e): aumentar workers de 1→4 e ajustar timeouts |
| [#2505](https://github.com/adm01-debug/Zapp_Web_V2/pull/2505) | AGUARDANDO_APROVACAO | perf(db): adicionar 57 índices FK em tabelas de referência |
| [#2506](https://github.com/adm01-debug/Zapp_Web_V2/pull/2506) | CONFLITO | docs: auditoria de 22 documentos |
| [#2507](https://github.com/adm01-debug/Zapp_Web_V2/pull/2507) | MERGE_OK | docs: corrigir CLAUDE.md — 6 checks → 3 checks obrigatórios |
| [#2508](https://github.com/adm01-debug/Zapp_Web_V2/pull/2508) | DECISAO_HUMANA | ci: dispatch manual deploy-functions.yml |
| [#2510](https://github.com/adm01-debug/Zapp_Web_V2/pull/2510) | DECISAO_HUMANA | ci: adicionar scorecard.yml + ajuste ci.yml + CLAUDE.md |
| [#2511](https://github.com/adm01-debug/Zapp_Web_V2/pull/2511) | DECISAO_HUMANA | refactor: 100 arquivos — reestruturação de componentes e workflows |
| [#2512](https://github.com/adm01-debug/Zapp_Web_V2/pull/2512) | CONFLITO | feat: grande reestruturação (138 arquivos) |
| [#2513](https://github.com/adm01-debug/Zapp_Web_V2/pull/2513) | MERGE_OK | fix(ui): corrigir contraste WCAG em componentes CSS |
| [#2514](https://github.com/adm01-debug/Zapp_Web_V2/pull/2514) | DECISAO_HUMANA | fix: CRITICAL-3 — talkx-scheduler 9,3% de falha por timeout de arranque |
| [#2515](https://github.com/adm01-debug/Zapp_Web_V2/pull/2515) | DECISAO_HUMANA | feat: nova feature (DRAFT) |
| [#2516](https://github.com/adm01-debug/Zapp_Web_V2/pull/2516) | MERGE_OK | test(talkx): testes X006 para campanhas TalkX |
| [#2517](https://github.com/adm01-debug/Zapp_Web_V2/pull/2517) | DECISAO_HUMANA | feat(db): migration com DROP TYPE + UPDATE em massa (DRAFT) |
| [#2519](https://github.com/adm01-debug/Zapp_Web_V2/pull/2519) | DRAFT | fix: corrige 6 falhas de CI + documenta bloqueios pré-existentes |
| [#2520](https://github.com/adm01-debug/Zapp_Web_V2/pull/2520) | MERGEAR | feat(talkx): criar base de demonstração determinística das 17 telas (X003) |
| [#2522](https://github.com/adm01-debug/Zapp_Web_V2/pull/2522) | MERGEAR | fix(e2e): aguarda teclado visível antes do primeiro clique — Firefox GR-012 |
| [#2524](https://github.com/adm01-debug/Zapp_Web_V2/pull/2524) | MERGE_OK | fix: adiciona gte/lte ao mock chainable em useAdminData.select.test.ts |
| [#2525](https://github.com/adm01-debug/Zapp_Web_V2/pull/2525) | DRAFT | docs(ci): RELATORIO_CI e PENDENCIAS — estado real 2026-11-01 |
| [#2526](https://github.com/adm01-debug/Zapp_Web_V2/pull/2526) | DECISAO_HUMANA | fix(ci): deno check --config + waitForAppliedTheme corrigem deploy-functions e E2E webkit |
| [#2527](https://github.com/adm01-debug/Zapp_Web_V2/pull/2527) | DRAFT | fix(ci): adicionar --config ao deno check em deploy-functions |
| [#2529](https://github.com/adm01-debug/Zapp_Web_V2/pull/2529) | DRAFT | feat(talkx): RPCs analíticas de campanha — heatmap, top segmentos |
| [#2530](https://github.com/adm01-debug/Zapp_Web_V2/pull/2530) | DRAFT | feat(talkx): RPCs de métricas da biblioteca de templates (X044–X050) |
| [#2531](https://github.com/adm01-debug/Zapp_Web_V2/pull/2531) | DRAFT | feat(talkx): RPC de fila por segmento da campanha (X058) |
| [#2532](https://github.com/adm01-debug/Zapp_Web_V2/pull/2532) | MERGE_OK_AUTO_MERGE_PENDING | docs(gf): BACKLOG_TAREFAS.md GF-001..056 [x] + PENDENCIAS.md — sessão S6 |

---

## PRs que Merecem Atenção Imediata

### 🔴 Mergeáveis que precisam de ação manual (MERGE_OK sem auto_merge)
- **#2489** — fix(e2e): seletor de telefonia
- **#2493** — chore: atualizar CLAUDE.md
- **#2494** — chore(types): sincronização de tipos  
- **#2495** — chore: comandos .claude/commands/
- **#2498** — feat(rpc): search_contacts_insights
- **#2501** — docs: planos E19/E20/E21
- **#2504** — test(e2e): aumentar workers
- **#2507** — docs: corrigir CLAUDE.md
- **#2513** — fix(ui): contraste WCAG
- **#2516** — test(talkx): testes X006
- **#2524** — fix: mock gte/lte (sem auto_merge)

### 🟡 MERGEAR — precisam de merge manual (sem auto_merge habilitado)
- **#2418** — docs: plano 190 etapas
- **#2465** — docs: baseline 01/11
- **#2479** — docs: MAPA_pos-24-10
- **#2520** — feat(talkx): base demo X003
- **#2522** — fix(e2e): Firefox GR-012

### 🟡 MERGEAR_COM_RESSALVA — ressalvas nos dossiers
- **#2417** — fix(tests): mocks (verificar ressalva)
- **#2431** — fix(ci): docker-shim (verificar ressalva)

### ⚠️ DECISAO_HUMANA com possíveis conflitos
- **#2457 e #2471** — concorrentes (mesmo tema `instance_pause_investigation`)
- **#2469 e #2472** — sobreposição (mesmas edge functions)
- **#2462 e #2241** — sobreposição em `auditoria-supabase/`

---

## Baseline de Referência

- **main SHA:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`
- **Typecheck:** SIGABRT/OOM no CI (limitação de memória do runner, não erro de código)
- **Build:** Sucesso
- **Testes unitários:** 136 falhas de baseline (pré-existentes no main, não regressão das PRs)
- **Fonte:** CI run 40189526836 em commit `2d97c44`
