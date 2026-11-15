# Resgate de branches e PRs — 2026-11-15

Varredura de **todas** as 299 branches do remoto e das PRs fechadas sem merge cujo commit
sobrevive em `refs/pull/<n>/head`. Cada item recebeu três camadas de prova independentes antes de
qualquer veredito. Nada aqui é opinião: todo veredito tem arquivo:linha, SHA ou consulta ao banco.

## Método (as três camadas)

1. **Mecânica, por arquivo.** Para cada item, `merge-base..ponta`; cada arquivo tocado comparado por
   blob com a `main`; cada trecho testado com `git apply --cached -R` (se reaplica ao contrário, está
   na `main`) e, quando o patch conflita, linha a linha contra a versão atual do arquivo.
2. **Semântica, por agente.** Um agente leu o diff hunk a hunk e decidiu, com evidência, se a
   intenção já vive na `main` de outra forma, se o alvo foi removido de propósito, ou se o trabalho
   está ausente. Migrations e RPCs foram conferidas em produção por `SELECT` (somente leitura).
3. **Adversarial.** Um segundo agente recebeu só o dossiê e a tarefa de **refutar** o veredito.
   Para quem seria apagado, procurou um hunk útil ausente; para quem foi dado como perdido,
   procurou o equivalente na `main`. Vale o veredito dele.

### Camada extra: trabalho que a própria branch removeu

O diff `merge-base..ponta` **não** mostra o que um commit intermediário adicionou e um commit
posterior da mesma branch apagou. Isso já escondeu trabalho real neste repo (na PR #2879 o último
commit, intitulado *fecha SQL injection*, foi justamente quem removeu a validação). Varremos os
commits intermediários de todos os itens: 47 tinham linhas nessa condição e foram reexaminados um a
um. Resultado: 45 refatoração interna da própria branch, 2 mistos, **nenhuma reversão de trabalho**.

## Resultado

| Veredito | Itens | Significado |
|---|---|---|
| INCORPORADA | 162 | o trabalho está na `main`, provado arquivo por arquivo |
| OBSOLETA | 105 | o alvo foi removido ou substituído de propósito; portar seria regressão |
| PERDIDA_PARCIAL | 54 | parte entrou, parte não |
| PERDIDA_TOTAL | 5 | nada do trabalho útil está na `main` |
| DECISAO_DONO | 3 | custo externo recorrente ou contradição de regra vigente |
| **Total** | **329** | 328 com verificação adversarial |

## O que ainda há para aproveitar

62 itens têm lacuna real. Cada linha abaixo aponta o dossiê com os trechos exatos para portar.

### Alto valor (16)

| Item | Veredito | PR | O que falta |
|---|---|---|---|
| [`claude__charming-mccarthy-jbxy56`](dossies/claude__charming-mccarthy-jbxy56.md) | PERDIDA_PARCIAL | #2537 | `scripts/ci/redigir-relatorio.mjs`; `scripts/ci/redigir-relatorio.unit.mjs`; `.github/workflows/deploy-functions.yml`; `scripts/ci/deploy-functions-workflow.unit.mjs` |
| [`claude__feat-completar-c121-261101-1330`](dossies/claude__feat-completar-c121-261101-1330.md) | PERDIDA_PARCIAL | #2469 | `supabase/functions/evolution-api/index.ts`; `supabase/functions/_shared/instance-pause-actions.ts`; `src/components/connections/InstancePausesPanel.tsx`; `src/hooks/connections/useInstancePauses.ts`; `src/components/con |
| [`claude__feat-copiloto-edges-261101-1330`](dossies/claude__feat-copiloto-edges-261101-1330.md) | PERDIDA_PARCIAL | #2460 | `supabase/functions/_shared/ai-feature-flags.ts`; `supabase/functions/ai-multimodal-analysis/index.ts` |
| [`claude__feat-talkx-x048-estados-servico-261101-2100`](dossies/claude__feat-talkx-x048-estados-servico-261101-2100.md) | PERDIDA_PARCIAL | #2548 | `src/pages/ViewRouter.tsx` |
| [`claude__fix-copilot-tick-atomicity-261101-1430`](dossies/claude__fix-copilot-tick-atomicity-261101-1430.md) | PERDIDA_PARCIAL | #2500 | `supabase/migrations/<nova versão>_copilot_commit_tick_rpc.sql`; `supabase/functions/_shared/copilot-tick.ts` |
| [`claude__fix-ga-fase1-lote-banco-261020-2200`](dossies/claude__fix-ga-fase1-lote-banco-261020-2200.md) | PERDIDA_TOTAL | #2125 | `scripts/db-audit/check-migration-drift.mjs`; `scripts/db-audit/lote-pendente.mjs`; `.github/workflows/db-live-guard.yml`; `.github/workflows/types-sync.yml` |
| [`claude__fix-ga-fase23-edge-e2e-261020-2200`](dossies/claude__fix-ga-fase23-edge-e2e-261020-2200.md) | PERDIDA_PARCIAL | #2128 | `scripts/ci/ci-e2e-projects.unit.mjs`; `.github/workflows/deploy-functions.yml` |
| [`claude__fix-ga-resto-dbmigrate-20261021-0729`](dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md) | PERDIDA_PARCIAL | #2142 | `.github/workflows/db-migrate.yml`; `scripts/db-audit/compose-confirm-hash.mjs`; `scripts/db-audit/provar-lote.sh`; `scripts/db-audit/calcular-lote.sh`; `scripts/db-audit/dry-run-plan.mjs` |
| [`claude__fix-ga-resto-sonar-contracts-20261021-0726`](dossies/claude__fix-ga-resto-sonar-contracts-20261021-0726.md) | PERDIDA_PARCIAL | #2145 | `.github/workflows/types-sync.yml` |
| [`claude__fix-ga-resto-typessync-20261021-0730`](dossies/claude__fix-ga-resto-typessync-20261021-0730.md) | PERDIDA_PARCIAL | #2143 | `.github/workflows/types-sync.yml`; `.github/workflows/types-sync.yml` |
| [`claude__fix-unit-tests-pre-existentes-261024-1700`](dossies/claude__fix-unit-tests-pre-existentes-261024-1700.md) | PERDIDA_PARCIAL | #2219 | `src/components/mfa/MFAVerify.tsx` |
| [`claude__radar-motor-copilot-live-301030`](dossies/claude__radar-motor-copilot-live-301030.md) | DECISAO_DONO | #2381 | `src/components/inbox/chat/ChatInputArea.tsx` |
| [`claude__w21-classificar-migration-drift`](dossies/claude__w21-classificar-migration-drift.md) | PERDIDA_TOTAL | #1930 | `scripts/db-audit/check-migration-drift.mjs` |
| [`claude_pink__cool-dijkstra-xk9ek2`](dossies/claude_pink__cool-dijkstra-xk9ek2.md) | PERDIDA_PARCIAL | #2502 | `.github/workflows/deploy-functions.yml` |
| [`codex__publish-followup-20261021`](dossies/codex__publish-followup-20261021.md) | PERDIDA_PARCIAL | #2442 | `src/components/inbox/useGlobalSearchData.ts`; `src/components/inbox/GlobalSearch.tsx`; `src/components/talkx/useCampaignEditor.ts` |
| [`resolve-2381-from-main`](dossies/resolve-2381-from-main.md) | PERDIDA_PARCIAL | #2419 | `src/components/inbox/chat/ChatInputArea.tsx` |

### Valor médio (36)

| Item | Veredito | PR | O que falta |
|---|---|---|---|
| [`claude_05__serene-feynman-3uuurw`](dossies/claude_05__serene-feynman-3uuurw.md) | PERDIDA_PARCIAL | #2498 | `src/components/admin/SearchInsightsView.tsx` |
| [`claude__chore-auditoria-supabase-final-251025-1655`](dossies/claude__chore-auditoria-supabase-final-251025-1655.md) | OBSOLETA | #2255 | `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` |
| [`claude__chore-secdef-guard-ci-test-261107-1600`](dossies/claude__chore-secdef-guard-ci-test-261107-1600.md) | PERDIDA_TOTAL | — | `scripts/db-audit/secdef-guard-check.test.sh`; `.github/workflows/db-guard.yml` |
| [`claude__feat-E90-main-failure-notify-261101-1730`](dossies/claude__feat-E90-main-failure-notify-261101-1730.md) | DECISAO_DONO | #2499 | `.github/workflows/main-failure-notify.yml`; `.github/workflows/notifica-falha-main.yml` |
| [`claude__feat-completar-c121-ddl-261101-1345`](dossies/claude__feat-completar-c121-ddl-261101-1345.md) | PERDIDA_PARCIAL | #2470 | `supabase/tests/instance_pause_investigation.sql` |
| [`claude__feat-copiloto-cv011-020-migrations-261016-1930`](dossies/claude__feat-copiloto-cv011-020-migrations-261016-1930.md) | PERDIDA_PARCIAL | #1997 | `supabase/migrations/20261016193400_copilot_presence.sql`; `supabase/migrations/20261016193500_copilot_retention.sql` |
| [`claude__feat-cores-prioridade-d12-261101-1425`](dossies/claude__feat-cores-prioridade-d12-261101-1425.md) | PERDIDA_PARCIAL | #2478 | `src/components/tasks/__tests__/movimentoEContraste.test.tsx`; `src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` |
| [`claude__feat-incidentes-pausa-investigados-261024-1640`](dossies/claude__feat-incidentes-pausa-investigados-261024-1640.md) | PERDIDA_PARCIAL | #2457 | `supabase/tests/instance_pause_investigation.sql` |
| [`claude__feat-radar-motor-telas-261101-1330`](dossies/claude__feat-radar-motor-telas-261101-1330.md) | PERDIDA_PARCIAL | #2486 | `src/components/inbox/chat/ChatInputArea.tsx` |
| [`claude__feat-talkx-x070-suppression-reasons-261101-2230`](dossies/claude__feat-talkx-x070-suppression-reasons-261101-2230.md) | PERDIDA_PARCIAL | #2517 | `scripts/db-audit/talkx-suppression-reasons.test.sh` |
| [`claude__feat-ui-visual-texto-longo-261101-1445`](dossies/claude__feat-ui-visual-texto-longo-261101-1445.md) | PERDIDA_PARCIAL | #2480 | `src/components/ui/card.tsx`; `src/components/ui/label.tsx`; `src/components/ui/tabs.tsx`; `src/components/ui/__tests__/primitivos-texto-longo-a11y.test.tsx` |
| [`claude__festive-faraday-kv669k`](dossies/claude__festive-faraday-kv669k.md) | OBSOLETA | #2506 | `auditoria-supabase/propostas/FIX-S09-001.md` |
| [`claude__fix-bulk-archive-rls-message-261101-2250`](dossies/claude__fix-bulk-archive-rls-message-261101-2250.md) | PERDIDA_PARCIAL | #2534 | `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` |
| [`claude__fix-ci-E69-E71-draft-filter-261101-1830`](dossies/claude__fix-ci-E69-E71-draft-filter-261101-1830.md) | PERDIDA_PARCIAL | #2503 | `.github/workflows/ci.yml`; `.github/workflows/ci.yml` |
| [`claude__fix-copilot-rls-supervisor-261101-1530`](dossies/claude__fix-copilot-rls-supervisor-261101-1530.md) | PERDIDA_PARCIAL | #2485 | `supabase/migrations/20261031150000_copilot_rls_supervisor_only.sql` |
| [`claude__fix-db-live-migrations-261107-1623`](dossies/claude__fix-db-live-migrations-261107-1623.md) | PERDIDA_PARCIAL | #2780 | `supabase/migrations/20261107121000_message_reactions_one_per_agent.sql`; `supabase/migrations/20261107122000_contacts_phone_search_digits.sql`; `scripts/db-audit/migration-evidence.json` |
| [`claude__fix-db-migrate-ga04-ga05-261016-0011`](dossies/claude__fix-db-migrate-ga04-ga05-261016-0011.md) | PERDIDA_PARCIAL | #2036 | `scripts/ci/verify-ledger-statements.unit.mjs` |
| [`claude__fix-ga-fase0-banco-e2e-261020-2200`](dossies/claude__fix-ga-fase0-banco-e2e-261020-2200.md) | PERDIDA_PARCIAL | #2124 | `.github/workflows/ci.yml`; `scripts/ci/verify-ledger-statements.unit.mjs`; `scripts/ci/confirm-hash.unit.mjs` |
| [`claude__fix-ga-fase78-perimetro-custo-261020-2200`](dossies/claude__fix-ga-fase78-perimetro-custo-261020-2200.md) | PERDIDA_PARCIAL | #2129 | `scripts/ci/actions-kpi.mjs`; `scripts/ci/actions-kpi.unit.mjs`; `.github/workflows/branch-hygiene-audit.yml`; `.github/workflows/ci.yml`; `.github/workflows/e2e-talkx.yml`; `scripts/ci/allowed-action |
| [`claude__fix-paleta-filtros-celebracoes-261025-2110`](dossies/claude__fix-paleta-filtros-celebracoes-261025-2110.md) | PERDIDA_PARCIAL | #2266 | `src/hooks/gamification/__tests__/useAgentCelebrations.test.tsx`; `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` |
| [`claude__fix-radar-fase6-cv056-shortcuts-261108-2335`](dossies/claude__fix-radar-fase6-cv056-shortcuts-261108-2335.md) | DECISAO_DONO | #2872 | `src/hooks/shortcuts/defaultShortcuts.ts`; `src/components/inbox/ChatPanel.tsx`; `src/components/copilot/RadarPhase6Panel.tsx`; `src/hooks/copilot/useRadarPanel.ts` |
| [`claude__fix-talkx-cron-startup-timeout-261025-1700`](dossies/claude__fix-talkx-cron-startup-timeout-261025-1700.md) | OBSOLETA | #2245 | `supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql` |
| [`claude__fix-talkx-segmentos-estimativa-261025-2110`](dossies/claude__fix-talkx-segmentos-estimativa-261025-2110.md) | PERDIDA_PARCIAL | #2269 | `src/hooks/integrations/useTalkXSegments.ts`; `src/hooks/integrations/useTalkXSegments.ts`; `src/components/talkx/TalkXSegments.tsx`; `src/hooks/integrations/__tests__/useTalkXSegments.estimativa.test |
| [`claude__fix-talkx-segmentos-regressao-261101-1944`](dossies/claude__fix-talkx-segmentos-regressao-261101-1944.md) | PERDIDA_TOTAL | #2535 | `src/components/talkx/TalkXSegments.tsx`; `src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx` |
| [`claude__fix-teste-notas-titulo-erro-261101-1410`](dossies/claude__fix-teste-notas-titulo-erro-261101-1410.md) | PERDIDA_PARCIAL | #2475 | `src/components/contacts/__tests__/ContactNotes.editarFixar.test.tsx` |
| [`claude__infra-c121-ddl-261101-1350`](dossies/claude__infra-c121-ddl-261101-1350.md) | PERDIDA_PARCIAL | #2471 | `supabase/migrations/20261111181000_instance_pause_investigation.sql`; `supabase/tests/instance_pause_investigation.sql` |
| [`claude__loving-lovelace-esc3l2`](dossies/claude__loving-lovelace-esc3l2.md) | OBSOLETA | #2186 | `auditoria-supabase/propostas/P01_add_with_check_update_policies.sql` |
| [`claude__w85-w86-w87-ossf-scorecard`](dossies/claude__w85-w86-w87-ossf-scorecard.md) | PERDIDA_PARCIAL | #2051 | `.github/workflows/ci.yml` |
| [`claude_juca__practical-rubin-8xnw0u`](dossies/claude_juca__practical-rubin-8xnw0u.md) | PERDIDA_PARCIAL | — | `src/components/talkx/talkxTemplateFile.ts`; `src/components/talkx/TalkXTemplateImportDialog.tsx`; `src/components/talkx/TalkXTemplates.tsx`; `src/components/talkx/TalkXOverview.tsx`; `src/components/ |
| [`fix__ci-verde-261021`](dossies/fix__ci-verde-261021.md) | OBSOLETA | #2155 #2444 | `supabase/functions/evolution-api/index.ts` |
| [`fix__f1a-lote-b-useteamchatnotifications`](dossies/fix__f1a-lote-b-useteamchatnotifications.md) | PERDIDA_PARCIAL | #2080 | `src/hooks/chat/useTeamChatNotifications.ts`; `src/hooks/chat/__tests__/useTeamChatNotifications.canal-estavel.test.tsx` |
| [`hermes__robustez-primitivos-ui-2610121626bec5-2610141859e423`](dossies/hermes__robustez-primitivos-ui-2610121626bec5-2610141859e423.md) | PERDIDA_PARCIAL | — | `src/components/ui/dialog.tsx`; `src/components/ui/skip-link.tsx`; `src/components/ui/visually-hidden.tsx`; `src/components/ui/table.tsx`; `src/components/ui/__tests__/robustez-primitivos.test.tsx` |
| [`pr-213`](dossies/pr-213.md) | PERDIDA_PARCIAL | #213 | `.github/workflows/ci.yml` |
| [`pr-2190`](dossies/pr-2190.md) | OBSOLETA | #2190 | `scripts/db-audit/talkx-campaign-recipients-page.test.sh` |
| [`pr-2550`](dossies/pr-2550.md) | PERDIDA_PARCIAL | #2550 | `src/components/talkx/TalkXOverview.tsx`; `src/components/talkx/kit/states.tsx`; `src/components/talkx/__tests__/TalkXOverview.bulk.test.tsx` |
| [`pr-2926`](dossies/pr-2926.md) | PERDIDA_PARCIAL | #2926 | `scripts/maintenance/run.mjs`; `scripts/maintenance/config.json`; `scripts/maintenance/run.mjs`; `scripts/maintenance/run.mjs`; `scripts/maintenance/lib.mjs`; `scripts/maintenance/maintenance.unit.mjs |

### Perda só de valor baixo ou nenhum (16)

Classificados como perdidos, mas o que falta é comentário, formatação, relatório datado ou
asserção que não morde. Detalhe em cada dossiê.

- [`claude__busy-cannon-40szm9`](dossies/claude__busy-cannon-40szm9.md) — PERDIDA_PARCIAL · #2614
- [`claude__chore-plano-E19-E20-E21-261101-1740`](dossies/claude__chore-plano-E19-E20-E21-261101-1740.md) — PERDIDA_PARCIAL · #2501
- [`claude__confident-bardeen-ndq0ch`](dossies/claude__confident-bardeen-ndq0ch.md) — PERDIDA_PARCIAL · #2195
- [`claude__docs-g9-absorb-261019-1300`](dossies/claude__docs-g9-absorb-261019-1300.md) — PERDIDA_PARCIAL · #2107
- [`claude__feat-copiloto-hooks-261101-1500`](dossies/claude__feat-copiloto-hooks-261101-1500.md) — PERDIDA_PARCIAL · #2473
- [`claude__feat-multiplix-cron-instancia-pausada-261101-1410`](dossies/claude__feat-multiplix-cron-instancia-pausada-261101-1410.md) — PERDIDA_PARCIAL · #2476
- [`claude__feat-pausa-entrega-campanhas-261101-1400`](dossies/claude__feat-pausa-entrega-campanhas-261101-1400.md) — PERDIDA_PARCIAL · #2472
- [`claude__fix-E71-draft-skip-security-e2e-261101-1200`](dossies/claude__fix-E71-draft-skip-security-e2e-261101-1200.md) — PERDIDA_PARCIAL · #2497
- [`claude__fix-codex-findings-161016-1906`](dossies/claude__fix-codex-findings-161016-1906.md) — PERDIDA_PARCIAL · #2770
- [`claude__fix-db-guard-pguser-261019-1430`](dossies/claude__fix-db-guard-pguser-261019-1430.md) — PERDIDA_PARCIAL · #2104
- [`claude__fix-ga-resto-docs-regen-20261021-0726`](dossies/claude__fix-ga-resto-docs-regen-20261021-0726.md) — PERDIDA_PARCIAL · #2144
- [`claude__ga-ci-batch-ga49-ga54-ga60-ga64-231023`](dossies/claude__ga-ci-batch-ga49-ga54-ga60-ga64-231023.md) — PERDIDA_PARCIAL · #2197
- [`claude__kind-gates-87mwoe`](dossies/claude__kind-gates-87mwoe.md) — PERDIDA_PARCIAL · #2185
- [`claude__tender-heisenberg-a4jk3s`](dossies/claude__tender-heisenberg-a4jk3s.md) — PERDIDA_PARCIAL · #1979
- [`codex__consolida-docs-deploy-ga98`](dossies/codex__consolida-docs-deploy-ga98.md) — PERDIDA_TOTAL · —
- [`hermes__telefonia-fase8-motion-a11y-responsivo-2610031530007c`](dossies/hermes__telefonia-fase8-motion-a11y-responsivo-2610031530007c.md) — PERDIDA_PARCIAL · —

## Decisões que são do dono

- [`claude__feat-E90-main-failure-notify-261101-1730`](dossies/claude__feat-E90-main-failure-notify-261101-1730.md) — Branch (PR #2499, fechada pelo congelamento de features) criava aviso por WhatsApp quando workflow crítico falha na main (via Evolution GO direto do GitHub Actions) e um dedup de 1h nos comentários da issue [falha-main]. Nada disso está na main: hoje falha na main só abre/comenta issue (notifica-fal
- [`claude__fix-radar-fase6-cv056-shortcuts-261108-2335`](dossies/claude__fix-radar-fase6-cv056-shortcuts-261108-2335.md) — A branch entrega a Fase 6 do Copiloto RADAR (painel flutuante na conversa, CV-051-060) com atalho Ctrl+Shift+A. A main já tem um painel da MESMA fase, feito por outro agente, com API incompatível: portar esta branch sobrescreve o hook useRadarPanel e quebra o painel que já está na main. São duas tel
- [`claude__radar-motor-copilot-live-301030`](dossies/claude__radar-motor-copilot-live-301030.md) — Motor do Copiloto RADAR (copilot.tick, migration, worker), banco, hooks, 11 componentes e testes já estão na main via #2828 e #3127 (migration byte-idêntica renomeada para 20261115010000, aplicada em produção, capacidade semeada desligada); a main ainda melhorou o motor (parse do envelope do provedo

## Provados incorporados ou obsoletos

Os 267 itens restantes têm prova completa nos dossiês. **Nenhuma branch foi apagada com base só
nesta tabela**: a decisão de apagar ficou com o dono. As 15 apagadas em 15/11 estão listadas em
`branches-apagadas.md`, e o commit de cada uma segue recuperável em `refs/pull/<n>/head`.

<details><summary>Lista completa (267)</summary>

| Item | Veredito | PR | ponta |
|---|---|---|---|
| `Github_Copilotauditorias-anteriores-reconciliacao` | OBSOLETA | — | 141d30b34 |
| `automation__inventario-estado` | INCORPORADA | #2848 | 72de368f7 |
| `chore__analise-prs-261024-2325` | INCORPORADA | #2242 | 1c871e471 |
| `claude_04__clever-ramanujan-xllbpo` | INCORPORADA | #2277 | 63865d2fd |
| `claude_04__dazzling-archimedes-n9k59w` | INCORPORADA | #2527 | 15d3bb73e |
| `claude_04__gifted-ride-xq3mj4` | OBSOLETA | #2525 | fb3676d4a |
| `claude_04__intelligent-babbage-bo2g5s` | OBSOLETA | #2601 | 1adaffb06 |
| `claude_04__nice-cori-7snz6b` | INCORPORADA | #2274 | 2f74d378c |
| `claude_04__pensive-tesla-ixtl9w` | OBSOLETA | #2526 | f3cccccae |
| `claude_04__trusting-newton-duiglt` | OBSOLETA | #2540 | fddda42f3 |
| `claude_05__awesome-ramanujan-ufxolu` | OBSOLETA | — | 5cc25fbfe |
| `claude_05__festive-carson-ub43wu` | INCORPORADA | — | 697e94dd6 |
| `claude_05__wonderful-goodall-94qjyg` | INCORPORADA | #2838 | 1defc1da9 |
| `claude_05__zen-feynman-29b7ix` | OBSOLETA | #2211 | c49753c71 |
| `claude__archived-undo-constraint-fix` | OBSOLETA | #2433 | eb98aad24 |
| `claude__auditoria-temp-261101` | OBSOLETA | #2462 | f258d5acf |
| `claude__br-dossies-lote1-261031` | INCORPORADA | #2413 | 278354677 |
| `claude__br-dossies-lote2-261031` | INCORPORADA | #2415 | 599e60294 |
| `claude__br-dossies-lote4-261031` | INCORPORADA | #2429 | 01fff64d1 |
| `claude__chore-auditoria-supabase-final-251025-1655` | OBSOLETA | #2255 | f5d524607 |
| `claude__chore-claude-md-required-checks-261101-1600` | OBSOLETA | #2493 | a38e2ad40 |
| `claude__chore-cmd-auditoria-supabase-261101-1430` | OBSOLETA | #2495 | 4b780aaf4 |
| `claude__chore-docs-relatorio-261112-0910` | OBSOLETA | — | 47980f813 |
| `claude__chore-mapa-resgate-pos-24-10-261101-1415` | OBSOLETA | #2479 | 7f572d1f8 |
| `claude__chore-pacote3-merge-261113-2325` | INCORPORADA | #3048 | 36c9f9336 |
| `claude__chore-prod-readiness-261112-1421` | INCORPORADA | #3022 | dc3424ee5 |
| `claude__chore-reconcile-ledger-drift-261101-2249` | INCORPORADA | #2533 | 2388e1ac5 |
| `claude__chore-relatorio-ci-261112-0803` | OBSOLETA | #2980 | 47bdaa7fd |
| `claude__chore-relatorio-ci-261112-0940` | INCORPORADA | #2990 | 5c655b681 |
| `claude__chore-relatorio-ci-261112-1340` | INCORPORADA | #2998 | 33d723e79 |
| `claude__chore-remove-hook-morto-talksuppression-261024-1541` | OBSOLETA | #2230 | fd9096ce1 |
| `claude__chore-sync-catalog-grants-baseline-261107-1354` | OBSOLETA | — | e30d4ca08 |
| `claude__chore-testes-edges-261112-1202` | INCORPORADA | #3012 | 62a75e9a4 |
| `claude__ci-deploy-functions-build-id-261114-0017` | INCORPORADA | #3055 | 801b605aa |
| `claude__dia-2026-10-19-ct011-hmac-talkx-artefatos-231023` | OBSOLETA | #2196 | d3bef1973 |
| `claude__ecstatic-bardeen-twiveb` | OBSOLETA | — | 7305ed4f3 |
| `claude__feat-bulk-archive-two-step-undo-261101-0800` | OBSOLETA | #2467 | 873ba9480 |
| `claude__feat-ci-local-espelho-261111` | INCORPORADA | #2970 | 26e264747 |
| `claude__feat-contexto-ia-261103-0728` | INCORPORADA | #2661 | f1614500e |
| `claude__feat-copilot-radar-20261108-1800` | OBSOLETA | #2831 | be78e6cfa |
| `claude__feat-copiloto-ddl-261101-1330` | INCORPORADA | #2461 | 7a8bea7d4 |
| `claude__feat-copiloto-edge-fases8-10-261024-1700` | OBSOLETA | #2217 | e9d2e0fa6 |
| `claude__feat-copiloto-edge-fns-fases8-15-261024-1615` | OBSOLETA | #2216 | 235d73a56 |
| `claude__feat-copiloto-edges-fases8-10-261024-1545` | INCORPORADA | #2215 | 46d6a02d9 |
| `claude__feat-copiloto-fases13-15-ddl-261024-1530` | INCORPORADA | #2214 | 0072cc1d1 |
| `claude__feat-e71-skip-draft-prs-281026-0250` | OBSOLETA | #2295 | 68bf4153b |
| `claude__feat-e75-toolchain-env-281028-0600` | OBSOLETA | #2298 | 307023ef8 |
| `claude__feat-evolution-rotas-pendentes-261112` | INCORPORADA | #3020 | d7a90d1c2 |
| `claude__feat-evolution-ui-orfas-261112` | INCORPORADA | #3011 | facaca425 |
| `claude__feat-message-delivery-post-iniciado-261024-1719` | INCORPORADA | #2238 | 3d18fbf14 |
| `claude__feat-message-delivery-post-iniciado-261101-1330` | INCORPORADA | #2466 | ec9f2e9c3 |
| `claude__feat-message-delivery-post-iniciado-261101-1937` | INCORPORADA | #2528 | 229bb20a3 |
| `claude__feat-metas-seletor-periodo-261101-1208` | INCORPORADA | #2484 | de9584f20 |
| `claude__feat-radar-fase6-261108-1933` | OBSOLETA | #2825 | 03e96a700 |
| `claude__feat-radar-migration-261101-1550` | INCORPORADA | #2487 | 0789ca734 |
| `claude__feat-radar-panels-8to15-261108-1906` | INCORPORADA | #2820 | 5472e4768 |
| `claude__feat-remove-special-agent-261113` | INCORPORADA | #3033 | 08625ec76 |
| `claude__feat-talkx-relatorio-concluida-261112-1158` | INCORPORADA | #3009 | 331ceb96f |
| `claude__feat-talkx-x003-demo-fixtures-261101-2143` | OBSOLETA | #2520 | f9ca26332 |
| `claude__feat-talkx-x047-matrix-estados-261101-2030` | OBSOLETA | #2546 | 8f619c709 |
| `claude__feat-talkx-x053-breadcrumb-261102-1130` | INCORPORADA | #2558 | 21be44c62 |
| `claude__feat-talkx-x054-cmdk-261108-0100` | INCORPORADA | #2788 | 2bbbe224e |
| `claude__feat-talkx-x058-campaign-queue-segment-261101-2300` | INCORPORADA | #2531 | 74ac91878 |
| `claude__feat-talkx-x074-analytics-rpcs-261101-2300` | INCORPORADA | #2529 | 2f1dc1a11 |
| `claude__feat-talkx-x086-template-metrics-rpcs-261101-2300` | INCORPORADA | #2530 | 421226c4a |
| `claude__feat-teamchat-cid-261021-0758` | INCORPORADA | #2146 | c6d0f9780 |
| `claude__feat-x051-talkx-lifecycle-2611081915` | INCORPORADA | #2812 | bbdf443d4 |
| `claude__festive-faraday-kv669k` | OBSOLETA | #2506 | e3fa619cf |
| `claude__fix-axe-email-webkit-contrast-261101-2325` | INCORPORADA | #2541 | 7ddc2cc94 |
| `claude__fix-canonical-receipt-policies-261020-2005` | OBSOLETA | #2137 | f632880fc |
| `claude__fix-ci-contratos-cache-261020-2320` | OBSOLETA | #2123 | d90d3f78f |
| `claude__fix-ci-gr027-261102-0100` | INCORPORADA | #2559 | 3caf2e3bf |
| `claude__fix-ci-n008-261101-2340` | OBSOLETA | #2542 | c61cbe617 |
| `claude__fix-ci-talkx-report-test-261108-2152` | INCORPORADA | #2851 | 5c97aa006 |
| `claude__fix-ci-tests-261019-1200` | OBSOLETA | #2098 | 16a4c54f0 |
| `claude__fix-ci-tests-batch2-2610-1830` | INCORPORADA | #2233 | af0bb57e2 |
| `claude__fix-ci-workflows-261030-0830` | OBSOLETA | #2372 | 1a8c80963 |
| `claude__fix-ci-workflows-hxupgs` | OBSOLETA | — | aac5bfceb |
| `claude__fix-claude-md-gr011-261102-0100` | INCORPORADA | #2557 | 631d210e3 |
| `claude__fix-codeql-checkout-sha-261109-1920` | INCORPORADA | #2906 | 7bf81f91c |
| `claude__fix-console-gmail-409-261112` | INCORPORADA | #2993 | 3e4a44373 |
| `claude__fix-console-sip-gate-261112` | INCORPORADA | #2994 | 25e6e43c3 |
| `claude__fix-console-status-msgs-261112` | INCORPORADA | #2999 | c06fadc2a |
| `claude__fix-console-typing-closed-261112` | INCORPORADA | #2995 | 43c34c85e |
| `claude__fix-conversas-go-perf-261113` | INCORPORADA | #3036 | bb3a00877 |
| `claude__fix-conversas-p0-p1-backend-261113` | INCORPORADA | #3037 | 7002ba64c |
| `claude__fix-copilot-brinde-state-261101-1500` | INCORPORADA | #2483 | bbccc427f |
| `claude__fix-db-guard-b0c-261024-1527` | INCORPORADA | #2226 | 4aab75adf |
| `claude__fix-db-live-guard-dup-261109-1800` | OBSOLETA | #2904 | ff8bafdfc |
| `claude__fix-deno-check-config-261101-2157` | INCORPORADA | #2521 | e39684071 |
| `claude__fix-deno-check-config-261102-0630` | INCORPORADA | #2578 | cee44e042 |
| `claude__fix-deno-modules-dir-261102-0450` | OBSOLETA | #2580 | 38656b5a0 |
| `claude__fix-department-invites-rls-261114-1200` | INCORPORADA | #3108 | 14a17d19d |
| `claude__fix-deploy-deno-check-node-modules-261030-1200` | OBSOLETA | #2380 | ea3af3e1e |
| `claude__fix-deploy-deno-frozen-v2` | INCORPORADA | #2412 | ae1adcf5f |
| `claude__fix-deploy-frozen-oct31` | OBSOLETA | #2409 | 6521a05f2 |
| `claude__fix-deploy-functions-types-node-011101` | INCORPORADA | #2508 | e5e03afa5 |
| `claude__fix-e2e-logado-w71-gr029-261102` | INCORPORADA | #2564 | e00c8857b |
| `claude__fix-e2e-mock-app-bootstrap-261024-1527` | INCORPORADA | #2225 | 33e6cd02c |
| `claude__fix-e2e-onboarding-modal-oculta-261114-0709` | INCORPORADA | #3072 | eeeace208 |
| `claude__fix-e2e-talkx-ajuda-ctrlk-261113-1629` | OBSOLETA | #3040 | ea59665e2 |
| `claude__fix-e2e-telefonia-teclado-261101-1558` | INCORPORADA | #2489 | e5fd0eb9a |
| `claude__fix-e2e-workers-ci-timeout-271027-0924` | OBSOLETA | #2279 | c2055dff9 |
| `claude__fix-e2e-workers-timeout-tests-011101-1800` | OBSOLETA | #2504 | 3153268fe |
| `claude__fix-email-navy-contrast-261101-2057` | OBSOLETA | #2513 | b1ff2f007 |
| `claude__fix-eslint-no-secret-compare-261110-2350` | INCORPORADA | #2932 | 847ffd1c4 |
| `claude__fix-esm-sh-import-regression-261108-2319` | INCORPORADA | #2878 | 60514ecae |
| `claude__fix-esm-sh-regression-261108-2320` | INCORPORADA | #2862 | db7fc3750 |
| `claude__fix-esm-sh-regression-261108-2340` | INCORPORADA | #2868 | 890f8996a |
| `claude__fix-evolution-connect-500-261113-1721` | OBSOLETA | #3041 | d8a2c92d8 |
| `claude__fix-evolution-go-gaps-d6-261019-1548` | OBSOLETA | #2113 | 5615e53d9 |
| `claude__fix-evolution-instance-bypass-261112` | INCORPORADA | #3024 | 7379d8fcd |
| `claude__fix-evolution-integra-cadeia-261113-1052` | INCORPORADA | #3030 | 1c341407a |
| `claude__fix-evolution-rotas-orfas-261112` | INCORPORADA | #3008 | 125b39d39 |
| `claude__fix-external-db-bridge-column-injection-261108-2319` | INCORPORADA | #2879 | bc00f4027 |
| `claude__fix-external-db-bridge-validation-261108-2335` | INCORPORADA | #2877 | 413e05cc7 |
| `claude__fix-fila-merge-retry-json-261101-1605` | INCORPORADA | #2492 | e5abad156 |
| `claude__fix-fila-offline-sem-dono-261025-2110` | INCORPORADA | #2267 | e84afb824 |
| `claude__fix-gmail-409-integra-261113-1102` | INCORPORADA | #3031 | a15b724b9 |
| `claude__fix-gmail-oauth-token-expose-20261108-1900` | INCORPORADA | #2811 | 6c4610ef7 |
| `claude__fix-gr011-311101` | OBSOLETA | — | 7589315b0 |
| `claude__fix-gr011-required-checks-311031` | INCORPORADA | #2421 | ebc6956fb |
| `claude__fix-gr016-playwright-workers-011101` | INCORPORADA | #2536 | 901357404 |
| `claude__fix-gr023-ossf-scorecard` | OBSOLETA | — | de5df6dfd |
| `claude__fix-grants-baseline-pos-2822-261111` | INCORPORADA | #2973 | d27cb593e |
| `claude__fix-health-check-414-261109-2011` | OBSOLETA | — | e808365e3 |
| `claude__fix-healthcheck-http414-261109-1900` | OBSOLETA | #2907 | d088b315d |
| `claude__fix-high3-fk-indexes-261101-1830` | INCORPORADA | #2505 | 65012f35e |
| `claude__fix-inventario-vault-cron-edges-261111-0315` | INCORPORADA | #2943 | 79fa2ea51 |
| `claude__fix-known-violations-copilot-feedback-261023-2035` | OBSOLETA | #2206 | 61f88092f |
| `claude__fix-lint-mediamigration-service-261101-1250` | INCORPORADA | #2463 | 8fa57120c |
| `claude__fix-logger-vitest-mock-261017-1000` | OBSOLETA | #2035 | bdfa4e670 |
| `claude__fix-merge-contato-telefone-secundario-261114-0000` | INCORPORADA | #3107 | 5ed381c55 |
| `claude__fix-migration-drift-071107-1500` | OBSOLETA | #2767 | ac61366fc |
| `claude__fix-migration-drift-20261102012200-261102-0900` | INCORPORADA | #2603 | c70065af7 |
| `claude__fix-multiplix-retomar-seguro-261114` | INCORPORADA | #3089 | 941d989d2 |
| `claude__fix-n011-dinamico-261021-0759` | INCORPORADA | #2147 | 77de63cb9 |
| `claude__fix-n017-harness-261101-2115` | OBSOLETA | #2515 | ea7833bcb |
| `claude__fix-pd79-compat-pre-migration-261111` | OBSOLETA | #2972 | d4e880c76 |
| `claude__fix-pd79-resolve-somente-sending-261112-1005` | INCORPORADA | #2996 | ef837c437 |
| `claude__fix-plano-190-etapas-261019-1200` | OBSOLETA | #2418 | 108128f37 |
| `claude__fix-radar-shortcut-key-261108-2059` | OBSOLETA | #2837 | 3b3601747 |
| `claude__fix-reconcilia-261026-sem-ci-261102-0912` | INCORPORADA | — | 757b6b362 |
| `claude__fix-reconcilia-migrations-20261026-261101-2230` | INCORPORADA | #2539 | 06ae04404 |
| `claude__fix-replay-known-failures-261102-0935` | OBSOLETA | — | 86f6e8c31 |
| `claude__fix-revogar-grants-escrita-anon-261025-2115` | INCORPORADA | #2265 | eb8e6ad19 |
| `claude__fix-rls-department-invites-261101-2222` | INCORPORADA | #2561 | 15d1d4990 |
| `claude__fix-rls-update-org-261101-1420` | INCORPORADA | #2481 | 4cc19fc6c |
| `claude__fix-separator-contrast-261108-1930` | INCORPORADA | #2807 | 24d20e321 |
| `claude__fix-settings-salvar-aparencia-261025-1905` | OBSOLETA | #2263 | eded8e947 |
| `claude__fix-talkx-command-cache-261108-2320` | INCORPORADA | #2866 | d64b521fe |
| `claude__fix-talkx-cron-startup-timeout-261025-1700` | OBSOLETA | #2245 | 671b5294f |
| `claude__fix-talkx-cron-startup-timeout-261101-2200` | OBSOLETA | #2514 | 9db8ac785 |
| `claude__fix-talkx-report-empty-suite-261108-2125` | OBSOLETA | #2843 | 97732853d |
| `claude__fix-talkx-report-test-stub-20261108-2210` | OBSOLETA | #2845 | be0a4f5da |
| `claude__fix-talkx-report-test-suite-261108-2355` | INCORPORADA | #2864 | 784bb18a7 |
| `claude__fix-talkx-test-suite-261108-2330` | OBSOLETA | #2876 | a29a393e7 |
| `claude__fix-talkx-test-suite-261109-0910` | OBSOLETA | #2882 | 3ff302c6e |
| `claude__fix-talkx-wizard-remonta-rascunho-261114-0715` | INCORPORADA | #3074 | 04d30bf95 |
| `claude__fix-talkx-x006-test-limites-261101-2130` | INCORPORADA | #2516 | 992c155d1 |
| `claude__fix-talkxcampaignreport-test-261109-0454` | OBSOLETA | #2885 | 291fe3f5f |
| `claude__fix-talkxcampaignreport-tests-261109-0400` | INCORPORADA | #2884 | 2a4c94374 |
| `claude__fix-team-chat-deeplink-261108-1932` | INCORPORADA | #2818 | eb15216f3 |
| `claude__fix-telefonia-firefox-gr012` | INCORPORADA | #2428 | 0b7db6cbc |
| `claude__fix-templates-supervisor-knowledge-261025-2110` | INCORPORADA | #2268 | 101da0968 |
| `claude__fix-testes-unitarios-minimo-251025-1230` | INCORPORADA | #2249 | c1952c450 |
| `claude__fix-typecheck-suppression-261019-1342` | OBSOLETA | #2111 | ec57655d5 |
| `claude__fix-typecheck-suppression-261023-2230` | OBSOLETA | #2208 | 665432536 |
| `claude__fix-types-rpc-ausentes-251025-1230` | INCORPORADA | #2250 | ef39213ef |
| `claude__fix-unit-tests-createlogger-261019-1620` | INCORPORADA | #2110 | e34c3f4dc |
| `claude__fix-unit-tests-inbox-261023-1108` | OBSOLETA | #2417 | 1a77ca485 |
| `claude__fix-unit-tests-main-261019-1500` | INCORPORADA | #2097 | eec06ea3e |
| `claude__fix-unit-tests-mechanical-261024-1527` | OBSOLETA | #2228 | af3fa1db7 |
| `claude__fix-unit-tests-src-261024-1630` | OBSOLETA | #2221 | d31f39ae0 |
| `claude__fix-x051-remote-completion-test-261108-2057` | OBSOLETA | #2836 | 6081b1675 |
| `claude__fix-z011bc-timing-safe-261018-1855` | INCORPORADA | #2091 | 626811d3a |
| `claude__fix-z017-z020-auth-cors-261018-1950` | OBSOLETA | #2771 | 930d57a1d |
| `claude__fix-z022-z024-dbguard-ci-261018-1930` | OBSOLETA | #2093 | f0b5b7cd2 |
| `claude__focused-hopper-qhavw1` | INCORPORADA | #2586 | c4500536e |
| `claude__ga-ci-verde-261020` | OBSOLETA | #2138 | 3d4cf85c6 |
| `claude__keen-galileo-dxai3p` | OBSOLETA | #2354 | 172c19c43 |
| `claude__loving-lovelace-esc3l2` | OBSOLETA | #2186 | bc79d33b5 |
| `claude__magical-pasteur-iz2pgy` | OBSOLETA | #2199 | 48ef50d2e |
| `claude__perf-bundle-inicial-261113` | INCORPORADA | #3034 | 0ba37e1ed |
| `claude__project-thread-lrbsuz` | OBSOLETA | #2524 | 3ff941d8c |
| `claude__test-e2e-contatos-fab-261021-0819` | INCORPORADA | #2148 | 22cee627c |
| `claude__test-e2e-suite-completa-261104-1428` | INCORPORADA | — | b7c538b6b |
| `claude__test-e2e-tls-diagnostico-261104-1340` | INCORPORADA | — | 0f80b210d |
| `claude__test-e2e-webkit-tls-261104-1430` | INCORPORADA | — | 48b7ada59 |
| `claude__test-toque44-seletores-261021-0853` | INCORPORADA | #2152 | b19f9107d |
| `claude__wizardly-meitner-aejx3i` | OBSOLETA | — | 51fdf980a |
| `claude__wizardly-ride-dimxnt` | OBSOLETA | #3111 | 35bb4cba5 |
| `claude_pink__dreamy-wright-j0bser` | OBSOLETA | #2284 | b6222cd8e |
| `claude_pink__nice-hypatia-iikl82` | OBSOLETA | #2511 | 8b3efcceb |
| `claude_pink__pensive-keller-kjgdal` | INCORPORADA | #2900 | e83509308 |
| `codex__consolidacao-baseline-pr-20261101` | OBSOLETA | #2465 | 0eed116b7 |
| `codex__diagnostico-e2e-mapa-20261028` | INCORPORADA | — | 94bfe9aa1 |
| `codex__fix-failed-workflows-20261020` | OBSOLETA | #2139 #2443 | bf0ce7695 |
| `codex__fix-lint-phone-settings-20261101` | INCORPORADA | #2464 | b46eabe42 |
| `dependabot__bun__deps-semanal-0b89910d44` | OBSOLETA | #2894 | 9aee73074 |
| `docs__update-pendencias-db-live-guard-261102` | OBSOLETA | #2577 | ed50aa9f3 |
| `f3__strict-false-baseline-20261018` | OBSOLETA | #2078 | 3de493255 |
| `fix__ci-f1b-restaura-workflows-20261018` | OBSOLETA | #2056 #2446 | 4ce5a6e97 |
| `fix__ci-verde-261021` | OBSOLETA | #2155 #2444 | 64934014e |
| `fix__ci-workflows-vermelhos` | OBSOLETA | #2151 #2445 | 0770f6b5e |
| `fix__contacts-race-condition-useLayoutEffect` | INCORPORADA | #2571 | 178a79cbb |
| `fix__f1a-framer-motion-mock-voicechangerpicker-20261018` | INCORPORADA | #2062 #2434 | 3f8ee72f3 |
| `fix__f1a-logger-ttsvoice-mock-arquivos-conversa-20261018` | INCORPORADA | #2067 | 0fd17f8d1 |
| `fix__f1a-lote-b-admin-audit-page-size` | INCORPORADA | #2068 | b6faf7736 |
| `fix__f1a-lote-b-audiomemes-storage-path` | INCORPORADA | #2066 | 7fb8f4464 |
| `fix__f1a-lote-b-authprovider` | INCORPORADA | #2063 | 81543b967 |
| `fix__f1a-lote-b-batch10` | INCORPORADA | #2087 #2435 | 56187bdae |
| `fix__f1a-lote-b-batch12` | INCORPORADA | #2088 | ced1c1b49 |
| `fix__f1a-lote-b-batch2` | INCORPORADA | #2076 #2436 | d76fb9d57 |
| `fix__f1a-lote-b-batch4` | INCORPORADA | #2081 | 80a6e057a |
| `fix__f1a-lote-b-batch5` | INCORPORADA | #2082 | 226ccb78e |
| `fix__f1a-lote-b-batch6` | INCORPORADA | #2083 #2437 | 8fa1bb340 |
| `fix__f1a-lote-b-batch7` | INCORPORADA | #2084 | 295286eb0 |
| `fix__f1a-lote-b-connectioncard-dialog` | INCORPORADA | #2059 | ab0482162 |
| `fix__f1a-lote-b-hooks-misc-1` | INCORPORADA | #2074 | ff66b4565 |
| `fix__f1a-lote-b-main` | INCORPORADA | #2058 | 10d843f92 |
| `fix__f1a-lote-b-realtime-channel-mock` | INCORPORADA | #2065 #2438 | adeae7592 |
| `fix__f1a-lote-b-talkxsegments` | INCORPORADA | #2072 #2439 | 81e743089 |
| `fix__f1a-lote-b-useadmindata-createuser-avatar` | INCORPORADA | #2070 #2440 | 8e37dd43e |
| `fix__f1a-lote-b-useadmindata-select` | INCORPORADA | #2069 | cbef3bcab |
| `fix__f1a-supabase-channel-mock-audiomeme-20261018` | INCORPORADA | #2064 | 54a6c5661 |
| `fix__reconciliar-migration-copilot-fases13-15` | INCORPORADA | #2491 | 07ac5c6f0 |
| `fix__sincronizar-migrations-sql-divergente-261101-0400` | OBSOLETA | — | 2e2f97fb9 |
| `fix__types-rpc-ausentes-261025` | INCORPORADA | #2244 #2441 | 9fe3cd827 |
| `local__fase0-banco-local` | INCORPORADA | — | 1bee59c5a |
| `pr-123` | OBSOLETA | #123 | fb285d431 |
| `pr-1991` | OBSOLETA | #1991 | 8836e94c8 |
| `pr-1998` | OBSOLETA | #1998 | d6625dd1e |
| `pr-2000` | INCORPORADA | #2000 | 81adcfd82 |
| `pr-2002` | OBSOLETA | #2002 | 9c8283f05 |
| `pr-2003` | INCORPORADA | #2003 | b93278e0d |
| `pr-206` | OBSOLETA | #206 | 0411dcfec |
| `pr-2190` | OBSOLETA | #2190 | 639720699 |
| `pr-2361` | INCORPORADA | #2361 | b3530f843 |
| `pr-2430` | INCORPORADA | #2430 | 6e2e7e9d6 |
| `pr-2496` | INCORPORADA | #2496 | ecfe39404 |
| `pr-2589` | OBSOLETA | #2589 | b43e7ccd7 |
| `pr-2870` | INCORPORADA | #2870 | 48fd3845c |
| `pr-2971` | OBSOLETA | #2971 | fd56c405c |
| `pr-2977` | INCORPORADA | #2977 | dcc59b5c2 |
| `pr-3016` | OBSOLETA | #3016 | 1c067b913 |
| `pr-3017` | OBSOLETA | #3017 | 168079b3f |
| `pr-3018` | OBSOLETA | #3018 | ebe6a1e60 |
| `pr-3067` | INCORPORADA | #3067 | f3309ef2b |
| `pr-3076` | INCORPORADA | #3076 | d794cbc4f |
| `pr-3088` | INCORPORADA | #3088 | 39ab99fa9 |
| `pr-3093` | INCORPORADA | #3093 | e8b42887b |
| `pr-3095` | INCORPORADA | #3095 | 52a66647c |
| `pr-3097` | INCORPORADA | #3097 | 3d6e63d71 |
| `pr-3101` | INCORPORADA | #3101 | 1296303a0 |
| `pr-3105` | INCORPORADA | #3105 | 0c107329a |
| `pr-3106` | INCORPORADA | #3106 | 2d6df4117 |
| `pr-3114` | INCORPORADA | #3114 | 94d60dc0d |
| `pr-3117` | INCORPORADA | #3117 | 1845537c4 |
| `pr-3120` | OBSOLETA | #3120 | d1ccc2912 |
| `pr-3130` | INCORPORADA | #3130 | 734d71885 |
| `pr-3132` | INCORPORADA | #3132 | af8d74114 |
| `pr-3133` | INCORPORADA | #3133 | 1c7a9b4dc |
| `pr-3134` | INCORPORADA | #3134 | 1f10af37c |
| `pr-606` | INCORPORADA | #606 | 5159bce36 |
| `pr-981` | OBSOLETA | #981 | 656d7d776 |
| `resolve-2199-from-main` | OBSOLETA | #2431 | 4940f3847 |

</details>

## Como usar isto

- Portar uma lacuna: abra `dossies/<id>.md`, seção *lacunas*/*O que falta para portar*. O trecho
  está lá, já conferido contra a `main` de 15/11 (`dac285f62`).
- Antes de portar, releia a seção *Verificação adversarial* do mesmo dossiê: ela costuma corrigir a
  receita (vários ports precisam ser reimplementados, não cherry-picked, porque a `main` evoluiu).
- `vereditos.json` traz o mesmo índice em formato legível por programa.
