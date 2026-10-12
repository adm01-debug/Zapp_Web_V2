# Área 07 — Infraestrutura, CI/GitHub Actions, banco, segurança, LGPD, backup, observabilidade, performance, qualidade e programa de agentes

Varredura somente-leitura em `adm01-debug/Zapp_Web_V2` (HEAD `99aa53f`, main de 09/10, lida em 11/10/2026).
Além do código, foram feitas leituras **só-GET** na API do GitHub (check-runs do HEAD, runs de workflow, issues, branches, tags, releases, alertas de Code Scanning) e uma leitura do workflow N8N `67dWSoWEPUGTX5mA`. Nenhum SQL, deploy ou escrita.
Convenção: `C` = concluído (verificado), `P` = PARCIAL, `N` = NAO_INICIADO, `B` = BLOQUEADO, `D` = DIVERGENTE, `NV` = não verificável a partir do repositório.

---

## 1. Fontes lidas

| Caminho | Tipo | Nº etapas/itens | Data | Vigente/substituído |
|---|---|---|---|---|
| docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md | plano | 100 (E01–E100) | 01/10 (reconc. 05/10) | **vigente** |
| docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-09-26.md / -09-27.md | plano | 100 cada | 26–27/09 | substituídos (só conferido o que ficou para trás via E99) |
| docs/reconciliation/reports/modules/CI_100.md | status/reconciliação | 100 | 03/10 | ponto de partida (baseline `2e7cf81`) |
| docs/audits/PLANO_BANCO_UNICO_200_ETAPAS_2026-09-24.md | plano | 201 (200 + 51a) | 24/09 (nota TRA-001 04/10) | "NÃO EXECUTÁVEL" (baseline divergente) |
| docs/reconciliation/reports/modules/BANCO_UNICO_201.md | reconciliação | 201 | 03/10 | — |
| docs/audits/PLANO_CORRECOES_50_ETAPAS_2026-09-16.md | plano | 50 (99 checkboxes) | 16/09 (sync 03/10) | encerrado → herdado pelo de 20/09 |
| docs/audits/PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md | plano | 50 (+E39-b) | 20/09 (reverif. 26/09) | vigente para banco/perf (CI passou ao plano de 01/10) |
| docs/audits/DIVIDA_LINT_FATIAS_2026-09-29.md | plano | 6 fatias | 29/09 | vigente |
| docs/reconciliation/reports/modules/REMAINING_CURRENT_PLANS.md | reconciliação | 56 | 03/10 | — |
| docs/plans/PLANO_100_ETAPAS_WORKFLOWS_2026-09-27.md | plano | 100 | 27/09 | **não é deste repositório** (58 workflows, runners `vps-zapp`, "ZAPP web v3") |
| docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md | plano | 100 | 01/09 | vigente (programa de engenharia) |
| docs/reconciliation/reports/modules/ENGINEERING_PROGRAMS.md + evidence/assessment-engineering_programs.json.gz | reconciliação | 200 (Paridade + Cline) | 03/10 | — |
| docs/plans/AUTOMACAO_ONDAS_DOS_PLANOS_2026-10-07.md | plano (motor de gatilhos) | 55 cartões | 07/10 | vigente (cartões de UI de outras áreas; motor fora do repo) |
| docs/plans/PENDENCIAS_DO_DONO_2026-10-08.md | status | ~35 cartões arquivados | 08/10 | vigente |
| docs/plans/PLANO_95_POR_CENTO_2026-10-08.md | plano (fábrica) | ~20 ações | 08/10 | vigente |
| docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md | plano | 29 cartões + §5 | 07/10 | vigente ("Estado de execução: a preencher") |
| docs/plans/PLANO_SEGUNDA_LEVA_CARTOES_2026-10-08.md + SEGUNDA_LEVA_CARTOES_2026-10-08.tsv | plano + cartões | 253 (≈88 da área) | 08/10 | vigente |
| docs/plans/PLANO_SEGUNDA_LEVA_MELHORIAS_2026-10-08_RASCUNHO.md | rascunho de plano | levas 2A–2E + checklist (29) | 08/10 | rascunho p/ decisão |
| docs/plans/TERCEIRA_LEVA_CARTOES_2026-10-08.tsv | cartões | 180 (131 Talk X, 49 Multiplix; nenhum "não-Talk X" fora do Multiplix) | 08/10 | vigente; só TL-015/049/050/099 tocam a área |
| HANDOFF_MISSION_10-10.md | handoff | 4 "próximas oportunidades" | 12/06 | histórico (bancos desativados) |
| docs/handoffs/HANDOFF-melhorias50-f4-2026-10-03.md | handoff | 4 passos | 03/10 | vigente |
| docs/reconciliation/FINAL_RECONCILIATION_REPORT_2026-10-03.md, EXECUTION_WAVES.md, OPEN_RISKS.md, FINDINGS.md/.json | status/achados | 104 achados (área: IA-WEBHOOK-001, TRA-001/007/008/009, IA-EGRESS-001) | 03/10 | ponto de partida |
| docs/reconciliation/AGENT_TOOLING_PLAN_2026-10-03.md / GRILL_ME_PLAN_REVIEW_2026-10-03.md | plano | AT-001..018 + GM-001..006 | 03/10 | parcialmente revogado por ARQUITETURA_V2 (04/10) |
| docs/reconciliation/SAFE_CLEANUP_PLAN.md, RESIDUE_REGISTRY.md | plano/registro | regras de limpeza | 03/10 | vigente (regras, sem etapas numeradas) |
| docs/reconciliation/reports/modules/HISTORICAL_DATABASE.md | reconciliação | 200 (auditorias DB 27/08 e 28/08) | 03/10 | histórico |
| docs/audits/ARQUITETURA_V2_DESCOBERTAS.md | ADR/decisões da fábrica | 19 decisões | 04/10 (toque 09/10) | vigente |
| docs/audits/AUDITORIA_AGENTES_2026-10-08.md | auditoria | 12 gaps + 7 correções | 08/10 | vigente |
| docs/audits/SEGURANCA_{EDGE_FUNCTIONS,FRONTEND,RLS_CONTATOS_MENSAGENS,RLS_TAREFAS_EMAIL_LIGACOES,DEFINER_GRANTS_STORAGE,SAIDAS_DE_INFORMACAO}_2026-10-07.md | relatórios (Y24–Y29) | 12 achados P0/P1 + ~40 P2/P3 | 07/10 | vigente |
| docs/LGPD-RETENTION-POLICY.md | política | checklist 14 | 11/04 ("Aprovado") | vigente |
| docs/BACKUP-RECOVERY-STRATEGY.md | estratégia | checklist 7 | 11/04 ("Aprovado") | vigente |
| docs/INCIDENT-RUNBOOK.md, DEPLOYMENT.md, WEBHOOK_SECURITY.md, MIGRATIONS.md, DB-SECURITY.md, SECURITY.md, RLS_MIGRATION_INSTRUCTIONS.md (raiz = docs/) | runbooks/docs | — | vários | vigentes |
| docs/runbooks/{slo,deploy,secret-rotation,cron-secret-rotation,…}.md, docs/ops/runbook-pg-cron-capacidade.md, docs/security/secret-surface-inventory.md | runbooks | slo.md: 4 próximos passos | 05/09–08/10 | vigentes |
| docs/ci/README.md (gerado), performance-budget.json, CLAUDE.md | docs/config | — | 05–09/10 | vigentes |
| Código: .github/workflows/*.yml (16), .github/toolchain.json, scripts/ci/*, scripts/db-audit/*, supabase/config.toml, supabase/functions/_shared/*, playwright.config.ts, vitest.config.ts, e2e/*, supabase/schema-{catalog,manifest}.json | código | — | HEAD | — |
| GitHub API (só leitura): check-runs do HEAD, runs `e2e-logado`/`settings-guard`/main, issues abertas, branches, tags, releases, Code Scanning | runtime | — | 11/10 | — |
| N8N `67dWSoWEPUGTX5mA` (Graph Sync — Dispatcher), só leitura | runtime | 1 | 11/10 | — |

---

## 2. Placar por plano

| Plano | Total | Concluído (verificado) | Parcial | Não iniciado | Bloqueado | Não verificável |
|---|---|---|---|---|---|---|
| GitHub Actions 100 (01/10) | 100 | 67 (inclui 3 superadas: E01/E04/E07) | 9 | 9 | 12 | 3 |
| Correções 50 (16/09) | 50 | 35 (28 + 7 sucedidas por outro plano/automação) | 2 | 0 | 4 | 9 (máquina local do Joaquim) |
| Melhorias 50 (20/09) | 50 | 39 | 4 | 1 | 4 | 2 (E07/E08 divergentes, 403 adm.) |
| Dívida de lint — 6 fatias | 6 | 1 (F6) | 5 | 0 | 0 | 0 |
| Banco Único 201 | 201 | 0 (+8 obsoletos/superados) | 0 | 0 | 175 (decisão do dono: plano não executável) | 18 (entregas do Singu_V2) |
| Paridade V1/V3 100 | 100 | 2 | 71 (inclui 1 regressão ativa: 072) | 21 | 6 (decisão de produto) | 0 |
| Workflows 100 (27/09, `docs/plans`) | 100 | — | — | — | — | 100 (plano do repo ZAPP web **v3**, não se aplica) |
| Pendências do Dono (08/10) — itens da área | 26 | 3 | 4 | 10 | 7 | 2 |
| 2ª leva — CI/DevOps | 51 | 8 | 7 | 11 | 8 | 17 |
| 2ª leva — Performance | 19 | 2 | 6 | 6 | 1 | 4 |
| 2ª leva — seleção infra/segurança de outros módulos | 18 | 4 | 5 | 8 | 1 | 0 |
| Qualidade paralela 29 cartões + §5 | 30 | 17 | 5 | 0 | 0 | 8 (Y01–Y08 não conferidos um a um) |
| Achados P0/P1 dos relatórios de segurança de 07/10 | 12 | 5 | 0 | 7 | 0 | 0 |
| Agent Tooling AT-001..018 + GM-001..006 | 24 | 3 (GM-001..003, documentais) | 0 | 0 | 18 (8 rejeitados + 10 adiados por decisão de 04/10) | 3 |
| Plano 95% (fábrica) | 20 | 1 | 0 | 0 | 0 | 19 (ferramental fora do repo) |
| LGPD — checklist da política | 14 | 0 | 1 | 10 | 0 | 3 |
| Backup/Recovery — checklist | 7 | 0 | 0 | 3 | 2 | 2 |
| slo.md — próximos passos | 4 | 1 | 1 | 2 | 0 | 0 |
| Histórico de banco 200 (27–28/08) | 200 | 7 (+16 superados/NA) | 64 | 3 | 25 | 85 (números da reconciliação de 03/10, não reverificados) |

Critério: "Concluído" exige artefato no código/workflow ou medição via API em 11/10; etapas "superadas/revogadas" por decisão posterior contam como concluídas (sem ação) e estão indicadas. Itens cuja prova depende de painel/admin (branch protection com 403, PITR, segredos, máquina WSL do Joaquim, kanban Hermes) são "NV". O plano de 27/09 em `docs/plans` não foi pontuado porque descreve outro repositório.

---

## 3. Pendências detalhadas

Contagem das linhas pendentes nas tabelas abaixo (algumas linhas agrupam vários itens, por exemplo "Rascunho 2A" com 15 e "Blocos 3/7/8/9" com 40): **NAO_INICIADO 56** · **PARCIAL 42** · **BLOQUEADO 29** · **DIVERGENTE 5** (mais 23 divergências doc × código na seção 4) · **não verificável 9**. Total de 141 linhas pendentes. Outras 16 linhas aparecem como "C" só para registrar o contexto.

### 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

Mudanças verificadas depois da reconciliação de 03/10: E12, E19, E20, E21 (types-sync, 06–09/10), E47 (DB offline verde no HEAD), E68 (cache Playwright), E72 (artifacts), E75 parcial (`.github/toolchain.json`), E83 (código existe, mas não dispara — ver abaixo), E91 (TRA-007 corrigido).

| ID | Funcionalidade | Estado | Planejado | Existe hoje (evidência) | Falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| E09 | E2E logado verde | D | 3 specs vermelhos corrigidos ou em fixme com issue; 5 verdes seguidos | `e2e-logado.yml:49` `timeout-minutes: 15`; API: **60/60 últimos runs `cancelled`** (03/10→09/10), último verde 02/10 (run 37040113129); check do HEAD `🎭 E2E logado` = cancelled | Aumentar timeout ou dividir projetos; obter 5 verdes | Fluxos com login real (enviar, conversar, catálogo, Talk X) não são testados desde 02/10 — quebra em produção passa sem ninguém ver | P0 | — |
| E83 | Alerta da suíte logada | D | Issue `[e2e-logado]` em falha, fecha ao recuperar | `e2e-logado.yml:220-221` passo com `if: failure()`; run cancelado por timeout não é `failure` → nenhuma issue aberta (lista de issues abertas não tem `[e2e-logado]`) | Tratar `cancelled()`/timeout como falha no alerta | Suíte morta há 9 dias sem nenhum aviso | P0 | E09 |
| E13 | Settings guard | D | Guard que detecta regressão e abre issue | `settings-guard.yml` + `scripts/ci/github-settings-guard.mjs:118-128`: `checarRepo` compara campos de merge que o `GITHUB_TOKEN` recebe `null` → "7 divergências" falsas; API: **34/34 runs `failure`, 0 sucesso**; issue #1854 com 27 comentários | Tratar `null` como "NÃO VERIFICÁVEL" (como já faz para 403) ou usar token/App com `administration:read` | Alarme falso a cada 6 h: ninguém mais olha; uma regressão real de proteção da `main` passaria despercebida | P1 | E36 (identidade com escopo adm.) |
| E05 | Zero issues de alerta | P | #1342/#888 fechadas, 0 issues de alerta | #1454 `[types-sync]` aberta com **62 comentários** (>20, viola a regra do CLAUDE.md "Issues de alerta"); #1854 com 27 | Fechar e reabrir limpas; resolver causa | Ruído esconde alerta real | P2 | — |
| E22 | Auto-merge do PR de sync | P | label `automerge-ok` + `gh pr merge --auto` | `types-sync.yml:546` só `labels: types-sync`; sem passo de auto-merge | Habilitar auto-merge do PR `[auto]` | PR de tipos fica esperando humano; drift volta a acumular | P2 | E15(b) decidida |
| E33 | Fechar alerta CodeQL #13 | D | `validation.ts` sem stack ao cliente; alerta `fixed` | Code Scanning (API): #13 **aberto** (`_shared/validation.ts:146`) e #31 novo na mesma classe (`validation.ts:211`, 05/10) | Corrigir as duas linhas e confirmar `fixed` | Edge pode devolver detalhe interno de erro a quem chama | P2 | — |
| E62 | db-migrate enxuto | P | Workflow ~150 linhas | `db-migrate.yml` = 1.510 linhas (12 contratos extraídos p/ `run-runtime-contract.mjs`) | Decisão (b) completa sem perder as 17 validações | Manutenção cara do caminho de DDL em produção | P3 | decisão do dono |
| E75 | Fonte única de toolchain | P | `toolchain.json` + nenhum YAML com versão literal | `.github/toolchain.json` existe (lote 09/10); `check-workflow-pins.mjs:91-131` compara drift; YAML ainda literalizam `1.4.0`, `2.116.0`, `playwright@1.63.0` (`ci.yml:398`) | Workflows lerem do JSON (ou aceitar o drift-check como alternativa formal) | Atualização de versão continua manual em vários lugares | P3 | — |
| E87 | Quarentena E2E formal | P | `quarantine.json` + fixme com prazo | `e2e/quarantine.json` vazio; **39** `test.fixme`/`test.skip` soltos em `e2e/*.spec.ts` (ex.: `navegacao-modulos.spec.ts:1018`, `busca-global-paleta.spec.ts:249-320`) | Mover fixmes para a quarentena com issue/prazo | Defeitos conhecidos sem dono nem prazo | P2 | — |
| E24 | Service role fora do repo | N | `SUPABASE_SERVICE_ROLE_KEY` em environment `e2e-producao` | `e2e-logado.yml:178,202` lê `secrets.SUPABASE_SERVICE_ROLE_KEY` (nível repo) | Mover para environment | Chave mestra de produção acessível a qualquer job do repo público | P1 | ação adm. do dono |
| E53 | Resumo de drift em 1 linha | N | `version | disco | ledger | motivo` no topo | `scripts/db-audit/check-migration-drift.mjs` sem esse formato (grep vazio) | Implementar + snapshot test | Diagnóstico de drift lento | P3 | — |
| E67 | Cache do Bun | N | `actions/cache` de `~/.bun/install/cache` | 0 ocorrências de cache do Bun nos 16 YAML | Adicionar | Minutos de CI e espera de PR | P3 | — |
| E69 | Paralelizar ci.yml | N | test/security/e2e sem `needs: lint` | `ci.yml:207,258,314,364` ainda `needs: lint-and-typecheck` | Remover dependência serial | PR verde leva mais tempo | P3 | — |
| E70 | Job "🦕 Edge contracts" | N | Separar Deno/Go do lint | Deno/Go dentro de `lint-and-typecheck` (`ci.yml:71-103`) | Criar job | Lint lento; base para E100 | P3 | — |
| E71 | Pular jobs pesados em draft | N | `if: !draft` | nada encontrado | Implementar | Custo de CI | P3 | — |
| E77 | Bump semanal de toolchain | N | `scripts/ci/bump-toolchain.mjs` | arquivo não existe; Dependabot só bun/actions/gomod (`.github/dependabot.yml:7,49,88`) | Script + agenda | Versões envelhecem sem aviso | P3 | E75 |
| E81 | Ajuste Playwright | N | retries 2 só logados, trace retain-on-failure, video off | `playwright.config.ts:29,33,37` retries 1 / workers 1 / trace on-first-retry | Ajustar após medição | Flaky e tempo do E2E | P3 | — |
| E88 | E2E de PR só Chromium | N | firefox-auth/webkit-auth para o e2e-logado | `ci.yml:416` ainda roda firefox-auth, webkit-auth e email-navy nos 3 engines | Mover | PR mais lento | P3 | — |
| E10 | SonarCloud | B | Ajustar/desinstalar/manter Quality Gate | Check `SonarCloud Code Analysis` = **failure** no HEAD | Decisão do dono | Vermelho permanente na main normaliza "vermelho" | P2 | Joaquim |
| E25 | RPC de limpeza E2E | B | `e2e_cleanup_conversation_closures()` no lugar do curl com service role | `e2e-logado.yml:184,208` `curl -X DELETE` com service role; RPC não existe em migrations | DDL + troca | Mesmo risco de E24 | P1 | decisão/DDL |
| E26 | Role `ci_readonly` | B | `DESTINO_URL_RO` para guardas | 0 ocorrências de `ci_readonly`/`DESTINO_URL_RO` | Criar role + secret | Guardas leem produção com credencial de escrita | P2 | DDL de role (dono) |
| E34/E36 | Revisão real / conta de agentes | B | Segunda identidade + `prevent_self_review` | CODEOWNERS só `@adm01-debug` (`.github/CODEOWNERS`); baseline `required_approving_review_count: 0` | Conta/GitHub App dos agentes | Nenhum gate humano real em produção | P2 | decisão de negócio |
| E61 | Rollback automático de edge | B | `rollback_on_smoke_failure` | não existe em `deploy-functions.yml` | Implementar com ensaio | Edge quebrada fica no ar até ação manual (agora com deploy automático no push) | P2 | Joaquim presente |
| E80 | Concurrency por SHA na main | B | Decidir com número (>20 %) | Medição de 08/10 (PENDENCIAS_DO_DONO): 0/16 cancelamentos desde 05/10 | Decisão registrada | Baixo | P3 | dono |
| E86 | Supabase local p/ suíte logada | B | `supabase start` + seed em CI | E2E logado depende de fixtures em produção (`e2e/README.md`) | Decisão de custo | E2E toca produção | P2 | dono |
| E89 | Podar GitHub Apps | B | Ficar com ≤3 bots | sem evidência (lista de apps não legível pelo token) | Decisão | Ruído em PR | P3 | dono |
| E90 | Notificar falha da main por WhatsApp | B | N8N → Evolution GO | nada em workflows | Decidir destino/dedupe | Falhas (deploy automático, guarda vivo) sem aviso fora do Actions | P1 | dono |
| E94 | Apagar environments órfãos | B | `copilot`, `Preview`, `Production` | `github-settings-baseline.json` ainda lista os 3 em `environments_para_apagar` | Confirmar Vercel e apagar | Baixo | P3 | dono |
| E100 | "Edge contracts" obrigatório | B | 7º required check | depende de E70 inexistente | — | — | P3 | E70 |
| E30/E37/E73 | allowed_actions / validity checks / limpeza de artifacts | NV | Medição administrativa | Baseline declara `selected`; 403 no guard | Leitura adm. | — | P3 | token adm. |

### 3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| M-E04 / C-E11 / SL-135 | Remotos ≤ 25 | N | ≤25 branches remotos | API: **54 branches** (35 `claude/*` de 26/09–02/10, 10 `hermes/*`, `dia/2026-10-07` e `dia/2026-10-08` já squash-mergeados) | Podar mergeados/abandonados | Confusão sobre trabalho vivo; viola CLAUDE.md §3 | P3 | guarda proíbe agente |
| M-E07/E08 | Política de merge / `enforce_admins` | D | Decisão aplicada + merge sem bypass | `github-settings-baseline.json:9-11` declara `enforce_admins: true`, approvals 0; checkboxes abertos; leitura ao vivo 403 | Marcar com evidência adm. | — | P3 | token adm. |
| M-E13 | Concurrency em todos os workflows | P | `concurrency` em 100 % | `talkx-status-regen.yml` sem `concurrency` (grep 0) | Adicionar | Runs simultâneos do placar | P3 | — |
| M-E15 / C-E23 | Índices sem uso (472/675) | B | Planilha + remoção em lotes | `stats_reset=null` (26/09) impede 30 dias de estatística | Janela de observação | Escrita e disco mais caros | P2 | tempo/estatística |
| M-E21 / C-E33 / SL-029 | PITR + teste de restore | B | Evidência PITR + restore em ambiente descartável | `BACKUP-RECOVERY-STRATEGY.md:315-321` checklist 0/7; nenhum registro de restore | Executar e documentar | Sem prova de que dá para recuperar dados após incidente | P1 | Joaquim (painel Supabase) |
| M-E24 / C-E20 | Replay integral verde | P | Replay de todas as migrations | `scripts/db-audit/replay-known-failures.json` com **21** falhas esperadas; `replay-local-harness.test.sh` e `replay-classify.test.sh` estão na ALLOWLIST (fora do CI) (`scripts/ci/check-test-inventory.mjs:58-66`) | Ligar ao db-guard; reduzir as 21 | Banco local ≠ produção em pontos conhecidos | P2 | dono do workflow |
| M-E29 | Rotação de secrets >90 d | B | Rotacionar Evolution/IA | `docs/runbooks/secret-rotation.md:173-176` sem data; issue #380 (13/09) aberta | Rotacionar e registrar datas | Credencial vazada continua válida | P1 | Joaquim |
| M-E30 | Rate limit nas edges expostas | P | Limite em todo webhook | `evolution-webhook`, `talkx-link`, `csp-report`, `auth-login`, `fetch-link-preview` têm; **`elevenlabs-webhook`, `gmail-webhook`, `whatsapp-webhook`, `sync-call-records` não** (grep 0) | Adicionar `enforceRateLimit` | Abuso/custo nos webhooks públicos | P2 | — |
| M-E36 / SL-229 | Web Vitals reais × alvos | P | Comparar Vercel Analytics com alvos | `src/lib/speed-insights.ts` lazy; nenhum relatório de comparação | Medir e ajustar | Metas de desempenho sem dado real | P3 | — |
| M-E44 / C-E40 / SL-213 | MCPs quebrados | B | 0 falhas por sessão | Nesta sessão o `CLOUDFLARE - MCP - WORK` falhou (410) | Remover/consertar | Ruído e tempo de agente | P3 | Joaquim |
| C-E01/E02/E04/E06/E08/E09/E10/E41/E49 | Bundle, stashes, branches locais, worktrees, MCP renomeado | NV | Higiene da máquina local | fora do repositório | — | — | P3 | máquina do Joaquim |
| C-E35 | Alertas operacionais (conexões, disco, backup, erro de edge) | P | Alertas + runbook | Só detector de pg_cron no Talk X (`20261009180000_pg_cron_detector_timeouts_e_falhas_seguidas.sql`); nada de disco/conexões/backup | Configurar alertas | Incidente de banco só é visto quando o usuário reclama | P1 | dono (painel) |
| C-E31 | Índices faltantes com carga | B | `EXPLAIN` antes/depois | depende do baseline de queries (E19 fechado) | Executar | Consultas lentas | P3 | — |

### 3.3 Dívida de lint (6 fatias)

| ID | Fatia | Estado | Planejado | Existe hoje (`scripts/ci/eslint-baseline.json`, 498 issues em 274 arquivos, 09/10) | Falta | Impacto | Prior. | Dep. |
|---|---|---|---|---|---|---|---|---|
| F1 | Mecânicas seguras | P | 10 → 0 | `use-memo` 3 + `incompatible-library` 2 | 5 casos | Baixo | P3 | — |
| F2 | only-export-components | P | 98 → 0 | 96 | extrair exports | HMR recarrega a árvore inteira | P3 | — |
| F3 | react-hooks/* | P | 179 (na verdade 233) | set-state-in-effect 87, refs 87, exhaustive-deps 22, purity 8, preserve-memo 5, outros 3 | refatorar por diretório | Bugs sutis de estado/render | P2 | — |
| F4 | no-explicit-any | P | 335 + 13 → 0 | 61 + 0 | tipar os 61 | Erros de tipo escapam | P3 | — |
| F5 | no-restricted-imports | P | 133 → 0 | 124 | trocar imports | Arquitetura sem fronteira | P3 | — |
| F6 | constant-condition + ban-ts-comment | C | 86 → 0 | 0 | — | — | — | — |

### 3.4 Plano de Banco Único (201) — trilha "banco único" Singu

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dep. |
|---|---|---|---|---|---|---|---|---|
| BU-Fases 0–10 (175 etapas) | Unificar ZAPP no Singu (schema `zapp`, `can_access`, carteira, cutover) | B | Migrar ZAPP para o banco do CRM com autorização por carteira/departamento | Nada no repo: 0 `CREATE SCHEMA zapp`, 0 `can_access`/`department_entity_access`/`liberado_comercial` em migrations/src/functions; plano marcado "NÃO EXECUTÁVEL" (STATUS TRA-001) | Refazer baseline (Cloud `tnnnlkbymytvtqngbbqh` × Singu) e decidir arquitetura | Sem unificação, cliente/WhatsApp e CRM seguem em bancos separados com integração viva (`crm-integration`, `external-db-*`) | P2 | decisão do dono (arquitetura) |
| BU-E09–E26 (18) | Contenção de segurança no Singu | NV | REVOKE/RLS no Singu | Declaradas "FEITO" em PRs do `Singu_V2` (outro repo) | Revalidar no Singu | Segurança do CRM externo | P2 | acesso ao Singu |
| BU-E02/E46 etc. (6) / E03/E05 (2) | Backup do self-hosted, congelamento, graphify antigo | C (obsoleto) | — | baseline divergente / superado | — | — | — | — |

### 3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dep. |
|---|---|---|---|---|---|---|---|---|
| 001 / SL-035 | Hooks de commit | P | husky + lint-staged + commitlint | `.husky/commit-msg` → `scripts/ci/commit-msg-lint.mjs` (sem dependência nova); pre-commit/pre-push existem; sem lint-staged | Decidir se lint-staged é necessário | Baixo | P3 | regra "sem dependência nova" |
| 004 / SL-146 | CODEOWNERS por área + ownership-gate | B | Dono por área efetivo | `.github/CODEOWNERS` todas as áreas → `@adm01-debug`; sem revisão obrigatória | 2º colaborador | Nenhuma revisão humana obrigatória | P3 | contratação/conta |
| 008 / SL-121 | PR Size Gate + Notify CI Failure | N | Workflows dedicados + WhatsApp <2 min | nenhum `pr-size-gate`/`notify-ci-failure` | Implementar | Falhas na main sem aviso | P2 | E90 |
| 009/010 / SL-122 | ESTADO.md, FEATURE_REGISTRY.md, TESTING_CONVENTION.md | N | Registros canônicos | arquivos não existem | Escrever | Agentes/novos devs sem mapa único | P3 | — |
| 016 / SL-123 | Cobertura com ratchet por pasta/arquivo | P | Baseline + aperto semanal | `vitest.config.ts:13-42` pisos fixos em `src/lib`/`src/services`; `perFile` explicitamente não ligado (comentário linha 42) | Ratchet por escopo | Código sem teste entra sem barreira | P2 | — |
| 017 | Flaky detector + regression gate | N | Detectar testes instáveis | nada | Implementar | Flaky mascara regressão | P3 | — |
| 018 | Nightly E2E completo + regressão visual | P | Nightly 6 views light/dark | snapshots parciais; e2e-logado (único com login) não conclui | Nightly real | — | P3 | E09 |
| 019 | Fuzz/stress de edges | N | 200 ev/min p95<800 ms | nada | Implementar | Capacidade desconhecida | P3 | — |
| 031/032 / SL-056 / SL-037 | Sentry front + edges | N (B: escolha de SaaS) | SDK, túnel, release tagging, breadcrumbs `catalog.*` | `src/components/integrations/SentryIntegrationView.tsx:33-36` diz "não existe integração real"; 0 `@sentry`; erro do front vai para `audit_logs` (`errorReporter`) | Escolher Sentry/GlitchTip e instrumentar | Erros em produção sem stack nem alerta | P1 | decisão do dono |
| 033 / SL-230/231 | Web Vitals → edge `client-observability` | P | Coleta real com fonte única | Speed Insights lazy; coletor próprio manual | Edge de coleta | — | P3 | — |
| 034 | Correlation ID ponta a ponta | P | `x-request-id` do clique ao webhook | `_shared/observability.ts` (`withRequestId`) usado em health/status/metrics; `docs/runbooks/slo.md` (F91) diz que o id não atravessa os 3 saltos | Propagar | Rastrear 1 envio exige garimpo | P2 | — |
| 035 / SL-051 | Edges health/status/metrics | P (avançou em 09/10) | Endpoints + scrape externo | `supabase/functions/{health,status,metrics}` (lote #1911, Prometheus com auth); sem scraper/monitor configurado | Ligar monitor externo | — | P2 | SL-003 |
| 036 | db-health-monitor + snapshots | N | Snapshots de tamanho | nada no catálogo | Implementar | Crescimento do banco sem histórico | P3 | — |
| 039 | Self-test HMAC de webhooks | P | Páginas + self-test | `webhook-diagnostic`/helpers; sem self-test | — | — | P3 | — |
| 041–045 / SL-057 | contract-kit 422, versionamento, `invokeEdge`, paridade FE↔edge | P/N | Contrato único | `validation.ts` comum; sem `invokeEdge`/`contract-versions` | — | Formatos de erro divergentes | P3 | — |
| 046–049 / SL-188 | Registry de provedores, provider fake, Cloud API, switchover | N/B | 2º provedor WhatsApp | só adapter GO | Decisão (048) | Dependência de um único provedor | P2 | decisão de conta Meta |
| 051 | Convite com token TTL | N | `invite-user` | não existe | — | — | P3 | — |
| 052 | Revogar sessão por dispositivo | P | revoke-session + diálogo | `20261004181921_revoke_auth_sessions.sql` (revogação global); sem por-dispositivo | UI/edge por sessão | — | P3 | — |
| 055 | Logs de segurança/alertas de ACL | P | tabelas dedicadas | só `audit_logs` | — | — | P3 | — |
| 057 | Scanner de arquivos (VirusTotal) | B | upload seguro | quarentena UI; sem scanner | decisão/chave | Arquivo malicioso recebido não é varrido | P2 | dono |
| 058 | Jobs LGPD | P | jobs agendados + pedidos de exclusão + consentimento | ver 3.8 | — | — | P1 | — |
| 060 / 091 | CSP enforce + headers | P | CSP aplicado | `validation.ts:116-125` `Content-Security-Policy-Report-Only` nas edges; front em report-only | Promover a enforce | XSS menos contido | P2 | — |
| 079 | Cron administrável | N | UI de pg_cron | nada | — | Jobs só visíveis no SQL | P3 | — |
| 092 | bundle-secret-guard pós-deploy | P | Varredura diária do bundle | gitleaks em fonte; sem varredura do bundle publicado | — | — | P3 | — |
| 093 / SL-226 | PWA/Service Worker | B | Religar SW + banner | `src/config/service_worker.ts` false (decisão) | Decisão | Sem push/offline | P3 | dono |
| 095 / SL-232 | Ratchets TS/@ts-nocheck/dead-code | P | knip + tighten semanal | typecheck/implicit-any/lint ratchets existem; `tsconfig.app.json:28` `strict: false` | knip/aperto | — | P3 | — |
| 099 / SL-221 | MCP server real read-only | N | JSON-RPC com RLS | só `mcp_exec` (gateway) | — | — | P3 | — |
| Blocos 3, 7, 8, 9 (40 itens) | Resiliência de envio, inbox, CRM, e-mail | P/N | DLQ, fila offline, circuit breaker por instância (027), pausa por instância (028), tracking de e-mail etc. | ver ENGINEERING_PROGRAMS (03/10): 021–030 com 4 N; 072 regressão ativa | — | Envio sem DLQ/breaker por instância | P2 | outras áreas |

### 3.6 Pendências do Dono (08/10) — itens da área

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dep. |
|---|---|---|---|---|---|---|---|---|
| SL-001 | Merge do PR #1343 | C | — | PR mergeado (CI_100 E03) | — | — | — | — |
| SL-136 | Aposentar dispatcher N8N | C (com ressalva) | Desativar Graph Sync | N8N API: `active: false`, última edição 29/08 | **Arquivar o workflow e rotacionar a credencial de infraestrutura gravada sem cofre nos nós HTTP** (detalhe fora do repositório público) | Credencial de infraestrutura legível por quem abre o N8N | P1 | Joaquim |
| SL-145 | Tabela canônica do perímetro | C | — | CLAUDE.md "Perímetro do GitHub" | — | — | — | — |
| SL-006 | E2E logado na main | N (regressão) | Login real até o envio | ver E09 | ver E09 | ver E09 | P0 | — |
| SL-003 / SL-102 | Monitor de uptime externo + SLO | N | Check de `/version.json` com alerta | `docs/runbooks/slo.md` "O que não existe hoje: monitor externo"; nada no repo | Configurar monitor (UptimeRobot/BetterStack/N8N) | Site fora do ar só é percebido por usuário | P1 | dono |
| SL-037 | Sentry breadcrumbs catálogo + alerta | N | Alerta `CATALOG_UPSTREAM_ERROR >5/min` | sem Sentry | — | — | P2 | Sentry |
| SL-029 | Restore de backup | B | ver M-E21 | — | — | — | P1 | dono |
| SL-058 | Perfil somente-leitura | N | Novo papel + RLS | `app_role` = admin, supervisor, agent, special_agent (`20251215025014…sql:2`, `20260329175853…sql:2`) | Papel + policies | Auditor/diretoria não tem acesso só de leitura; ou recebe acesso de escrita | P2 | trilha de banco |
| SL-062 | `departments.whatsapp_api_key` → Vault | P | DROP COLUMN, segredo no Vault | `20261006213734_team_chat_f10_department_whatsapp_safe_config.sql` deixa de devolver o segredo em claro; coluna continua em texto puro | Mover para Vault + DROP | Segredo de WhatsApp em tabela comum | P1 | trilha de banco |
| SL-103 | Initial JS ≤ 300 KB | N | 300 KB | `performance-budget.json:4` teto **343 KB** (subiu 340→341→343); lote 09/10 mediu 334,9 KB | Code-splitting | Carregamento inicial lento em celular/4G | P2 | decisão de escopo |
| SL-120 / SL-124 | Edge contracts / DB Live Guard obrigatórios | B / D | Required checks | E70 inexistente; DB Live Guard não roda em PR por desenho (CLAUDE.md) → SL-124 contradiz o desenho | Rever o cartão SL-124 | — | P3 | — |
| SL-121 | Sentinel/PR size/notify | N | ver 008 | — | — | — | P2 | — |
| SL-129 / SL-142 / SL-146 | Apps, approvals=1, CODEOWNERS | B | — | ver E89/E36/004 | — | — | P3 | dono |
| SL-135 | Remotos ≤25 | N | ver M-E04 | 54 | — | — | P3 | — |
| SL-148 / SL-158 | Tags `v2.0.0-hostinger`, `catalog-v1.0.0` + release notes | N | Releases versionadas | API: **0 releases**; tags só `talkx-v1.0.0` e dezenas de `edge-deploy/*` de 03/10 | Criar tags/releases | Sem ponto de retorno nomeado para rollback | P3 | dono |
| SL-159 / E90 | Notificar falha da main por WhatsApp | N | N8N + Evolution | nada | — | — | P1 | dono |
| TL-099 | Revogar token GitHub vazado | B | Revogar PAT e gerar fine-grained | cartão NV no TSV; sem evidência de revogação | Revogar | Token com acesso ao GitHub possivelmente válido | P0 | Joaquim |
| SL-130 / SL-147 | `--update-baseline` próprio / `.nvmrc 20.19.0` | NV | — | `.nvmrc` = 24 e `toolchain.json` node 24 (cartão contradiz o toolchain) | Reavaliar cartão | — | P3 | — |
| SL-161 / SL-179 / SL-232 | Dívida ESLint por módulo / budget e ratchets | P | — | ver 3.3 | — | — | P3 | — |

### 3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dep. |
|---|---|---|---|---|---|---|---|---|
| SL-023/024 | Dedupe de falha do types-sync / filtro head_branch | C (TSV divergente) | E20/E21 | `types-sync.yml:445-486`, `:600-605` (09/10) | — | — | — | — |
| SL-025 | Auto-merge do sync | P | E22 | ver E22 | — | — | P2 | — |
| SL-026/120 | Edge contracts | N/B | E70/E100 | — | — | — | P3 | — |
| SL-027 | Política Deno/lock | C | doc + lock | `scripts/ci/DENO_REPRODUCIBILITY.md`, `scripts/ci/deno.lock` | — | — | — | — |
| SL-031 | Ajuste Playwright | N | E81 | — | — | — | P3 | — |
| SL-032 | approvals, audit prod bloqueante, husky, Node 24 | P | — | audit-prod bloqueante (`ci.yml:343`), husky, Node 24 OK; approvals=0 | approvals (B) | — | P3 | dono |
| SL-095/097/098 | Cache Bun, paralelizar, drafts | N | E67/E69/E71 | — | — | — | P3 | — |
| SL-096/100 | Cache Playwright / artifacts | C | E68/E72 | `ci.yml:386-404`, `ci.yml:241-247,284-290,421-428` | — | — | — | — |
| SL-104 | UPDATE "marcar como lido" 551 ms | N | Remover `REPLICA IDENTITY FULL` de `messages` | nenhuma migration altera `messages` (só email_messages/whisper/team_messages) | Avaliar e ajustar | Marcar conversa como lida lento | P2 | trilha de banco |
| SL-105 | FCP<1,5 s, TTI<3 s, Lighthouse>90 | N | Metas web | sem medição registrada | Medir | — | P3 | — |
| SL-115 | Concorrência 30k/100k, sort | N | Medir | — | — | Escala desconhecida | P3 | — |
| SL-117/119/121/122/123 | Bump toolchain, E2E auth no logado, sentinel, docs canônicos, perFile | N | — | ver E77/E88/008/009/016 | — | — | P3 | — |
| SL-125/091/092 | Baseline ESLint | P | 522 → 0 | 498 | — | — | P3 | — |
| SL-137 | Prettier + ESLint Tailwind | P | ambos | prettier-plugin-tailwindcss sim; eslint-plugin-tailwindcss não | — | — | P3 | regra sem dependência nova |
| SL-149 | E2E fluxo de mensagens + runbook | P | — | specs existem, mas só no e2e-logado (não conclui) | — | — | P2 | E09 |
| SL-226/233 | Service Worker / chunks >500 kB | B / P | — | SW desligado; `largest-chunk` 550 KB | — | — | P3 | — |
| SL-050 | Zod no corpo do `evolution-api` | N | Schema | `supabase/functions/evolution-api/index.ts` sem `z.object` (grep 0) | Validar corpo | Entrada malformada chega ao provedor | P2 | — |
| SL-061 | Evolution webhook sem assinatura | C (decidido) | strictMode | `evolution-webhook/index.ts:33-55` token obrigatório por padrão (`EVOLUTION_WEBHOOK_ENFORCE=token`); valor ao vivo NV | Confirmar secret no painel | — | P3 | — |
| SL-090 | noImplicitAny | C | — | `tsconfig.app.json:18` | — | — | — | — |
| SL-184 | `docs/DB-INVENTORY.md` | N | Inventário do banco | não existe | Gerar do catálogo | — | P3 | — |
| SL-212 | `public/version.json` com Evolution antiga | N (resíduo) | Corrigir | `public/version.json` aponta `evolution.atomicabr.com.br`, buildDate 13/06; o build sobrescreve via `vite.config.ts:17-24` | Remover arquivo estático | Confusão em diagnóstico | P3 | — |
| SL-220/221 | `rpc_app_bootstrap`, MCP server real | N | — | — | — | — | P3 | — |
| SL-222 | Duplicata useDebounce.test | C | — | removida | — | — | — | — |
| SL-225 | Camada de serviços | P | hooks sem Supabase direto | `src/services/*.service.ts` (12) | Migrar hooks restantes | — | P3 | — |
| Rascunho 2A (15 itens) | Segurança do banco: R1 team-chat-files, "Aberto 1" (reassign_*/skill_based_assign sem guard), M4 user_roles, gamificação, tcm_insert_member | N | Migrations locais + testes | nenhuma migration nova sobre esses objetos depois de 06/10 (só 4 migrations em 09/10, outros temas) | Executar a leva 2A | Escalada/abuso de RPCs ainda possível | P1 | aprovação do dono |
| Rascunho 2B (11) | Segurança edge/IA (voice-design sem papel, voice_id livre, kill switch, quota fail-open, ledger de custo, mascarar CPF no ai-proxy) | N/P | — | (área IA; não reverificado item a item) | — | Custo/abuso de IA | P1 | outra área |

### 3.8 LGPD, backup, observabilidade e segurança operacional

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dep. |
|---|---|---|---|---|---|---|---|---|
| LGPD-1 | Purge/anonimização por prazo | N | `lgpd-purge` semanal; contatos/mensagens 2 anos, logs 90 dias | catálogo: só `purge_talkx_expired_data` e `ai_rate_limit_purge`; 0 funções de anonimização; 0 `anonymized_at`; nenhum cron de expurgo geral | Implementar jobs | Dados pessoais guardados sem prazo — risco legal (LGPD art. 15/16) | P0 | decisão de prazos/DPO |
| LGPD-2 | Exportação/portabilidade e exclusão a pedido do titular | N | Função de exportação + SLA 15 dias | nada no src/edges (grep vazio) | Implementar | Não há como atender pedido do titular no prazo | P1 | — |
| LGPD-3 | DPO, RIPD, registro de atividades | N | Processos e docs | `LGPD-RETENTION-POLICY.md:350` DPO "[A definir]"; checklist 0/14 com Status "Aprovado" | Nomear DPO, RIPD | Exigência legal sem responsável | P1 | dono |
| BKP-1 | PITR, backup semanal, drill, widget | N/B | ver checklist | nada | — | ver M-E21 | P1 | dono |
| OBS-1 | Alerta de desconexão do WhatsApp | P | `connection_health_logs` 2 amostras → aviso ao admin | `connection-health-check/index.ts:134-136` gera alerta interno; cron existe (`20261002541230_pg_cron_escalonar_jobs.sql`) | Aviso fora do app | Instância caída à noite só vista de manhã | P2 | — |
| OBS-2 | View `slo_inbound_latency_daily` | N | p50/p95 diário | não existe no catálogo | Criar | SLO de latência sem histórico | P3 | — |
| OBS-3 | Notificação de deploy automático com falha | N | — | `deploy-functions.yml:1-5` "avisa: operador que disparou"; desde 07/10 dispara em push sem operador | Alerta/issue em falha | Edge quebrada em produção sem ninguém avisado | P1 | — |
| SEC-ROT | Rotação de credenciais (Evolution, service_role, senha DB, Lovable Bearer, MCP) | B | Rotacionar e registrar | issue #380 aberta desde 13/09; AUDITORIA_AGENTES: "Bearer do lovable continua válido" | Rotacionar | Credenciais antigas possivelmente expostas | P1 | Joaquim |
| SEC-GMAIL | OIDC Gmail bloqueante | C (com risco) | Bloquear antes do service role | `gmail-webhook/index.ts:115-131` (R2-API-021) exige `GMAIL_OIDC_AUDIENCE/EMAIL` | Confirmar secrets no painel (NV) | Se faltarem, todo push do Gmail é recusado | P2 | painel |
| SEC-ELEVEN | Replay/insert no webhook ElevenLabs (IA-WEBHOOK-001) | C | dedupe + 5xx em falha | `elevenlabs-webhook/index.ts:8-23` (dedupe_key único) | — | — | — | — |

### 3.9 Achados de segurança de 07/10 (Y24–Y29) — tratamento previsto no §5 do plano de qualidade

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dep. |
|---|---|---|---|---|---|---|---|---|
| SEC-RLS_TAREFAS_EMAIL_LIGACOES-01 | INSERT de histórico fora do escopo (deal_activities, calls, conversation_tasks) | N | Migration restringindo `deal_id`/`contact_id` ao alcance | nenhuma migration posterior a 07/10 sobre essas policies | Corrigir + prova | Atendente grava histórico em negócio/contato que não é dele | P0 | trilha de banco |
| SEC-SAIDAS_DE_INFORMACAO-01 | Gate de download em 2 de 10 caminhos | N | Todo download passa por `useDownloadPermission` | só `MediaPreview.tsx:37` e `ImagePreview.tsx:22`; `catalogExport.ts:222` (`triggerCsvDownload`), anexos Gmail, fotos de produto sem gate | Aplicar gate | Usuário sem permissão baixa arquivos/listas (viola a regra "nenhuma informação sai") | P0 | — |
| SEC-SAIDAS_DE_INFORMACAO-02 | CSV de envios do catálogo com nome de cliente/agente | N | Gate ou remover PII | `useCatalogSendHistory.ts:172-190` monta CSV com `contact_name`, `agent_name` | Gate/remover | Exportação de dado pessoal sem controle | P0 | — |
| SEC-RLS_CONTATOS_MENSAGENS-01 | Mensagem "do cliente" forjável | N | `sender='agent'` no WITH CHECK | última policy `20260925120000_fix_messages_insert_rls_contact_visibility.sql` sem condição de `sender` | Migration | Histórico/SLA falsificável por agente | P1 | trilha de banco |
| SEC-RLS_CONTATOS_MENSAGENS-02/03 | Oráculos de UUID (`require_contact_edit_permission`, `can_delete_contacts`) | N | Erro uniforme | sem migration posterior | Migration | Descobrir IDs de contatos alheios | P1 | — |
| SEC-DEFINER_GRANTS_STORAGE-01 | `media_url` autoriza mídia privada | N | Corrigir policy de 03/10 | `20261003142707_whatsapp_media_recebida_select_via_messages.sql:30` sem correção posterior | Migration | Leitura de mídia privada de outra conversa | P1 | — |
| SEC-EDGE_FUNCTIONS-01/02/03 | external-db-bridge/proxy sem papel; fetch-link-preview sem rate limit | C | — | lote #1911 (09/10): papel admin/supervisor e rate limit | — | — | — | — |
| SEC-SAIDAS-03 / SEC-FRONTEND-01 | Figurinha p/ bucket público; JWT para host não validado | C | — | `MessageBubble.tsx:38`; `useTalkXTemplates.ts:180` | — | — | — | — |
| SEC-EDGE-04/05/08/09/10 | listUsers sem paginação, CORS `*`, HTML sem escape, erro do provedor no 502 | N | — | `webauthn/index.ts:148`, `get-call-recording/index.ts:72`, `talkx-report/index.ts:217` | Corrigir (P2/P3) | Vazamento menor / enumeração | P3 | — |
| SEC-FRONTEND-02 | `href` sem validação (XSS no clique) | N | `isSafeHttpUrl` | `Contact360Helpers.tsx:136,245` | Aplicar guard existente | Script malicioso vindo do CRM roda com a sessão do atendente | P2 | — |
| Y09/Y10/Y12 | E2E navegação, tarefas/quadro, busca global | P | Rodar no CI | specs existem, mas caem no catch-all `chromium-authenticated` do e2e-logado (que não conclui) | Projeto próprio deslogado no ci.yml | Cobertura só no papel | P2 | E09 |
| Y11 | E2E telefonia | P | Rodar no CI | projeto `chromium-telefonia` (`playwright.config.ts:107-110`) não aparece em nenhum workflow (grep) | Incluir no ci.yml | idem | P2 | dono do workflow |
| Y01–Y08 | Testes de hooks/lib/services | NV | 36 arquivos | não conferido arquivo a arquivo | — | — | — | — |

### 3.10 Programa de agentes (fábrica de cartões) e ferramentas

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dep. |
|---|---|---|---|---|---|---|---|---|
| P95-3.1..3.4 | `hermes-tarefa-fechar` (FATOS MEDIDOS, vermelho→verde, portão no fechar, cartão no workspace), skills `relato-que-passa`/`armadilhas-*`, Jev retreinado | NV | Aceite de 1ª ≥60 % (15/10), ≥80 % (sem. 2) | ferramental em `~/arquitetura-v2` e `~/.hermes` (fora do repo) | Medição semanal publicada | Lotes vermelhos e retrabalho | P2 | máquina do Joaquim |
| P95-3.5 | Cartões de CI/baseline saem da fila dos agentes | C | — | `PENDENCIAS_DO_DONO_2026-10-08.md` seção "Acréscimo do plano 95%" | — | — | — | — |
| AG-08/10 | Rotacionar Bearer Lovable; `command_allowlist` e `fail_closed` dos hooks secundários | B | — | AUDITORIA_AGENTES "Não aplicado" | Decisão | Agente com permissões amplas (`git reset --hard`, `rm -r`) | P2 | Joaquim |
| AG-08/10 | 10 migrations multi-instrução gravadas como 1 statement no ledger | NV | Regra 7 do CLAUDE.md | relatado em AUDITORIA_AGENTES:55 | Reescrever `statements` | Ledger não descreve o que rodou; replay/guarda enganados | P2 | leitura do ledger |
| CLAUDE §0 | Ferramentas `zapp-db-local`/`zapp-db-guard`/`zapp-verify`/`zapp-db-ler` | P | Banco local por worktree, portão local | só na WSL do Joaquim ("fora deste repositório"); no repo: `scripts/db-audit/replay-local.sh`, `src/config/supabase.ts` (desvio local) | Versionar as ferramentas ou receita | Fábrica não reproduzível fora da máquina do dono | P2 | — |
| AT-008..016 | Claude-Mem e Headroom (memória/compressão) | B (rejeitados) | POCs | `ARQUITETURA_V2_DESCOBERTAS.md:40` "Rejeitados" (04/10) | Atualizar o plano AT | — | P3 | — |
| AT-001..007, 011, 017, 018 | Cartographer e avaliação conjunta | B (adiados) | POC | `ARQUITETURA_V2_DESCOBERTAS.md:41` "Adiados: Cartographer (Fase 3)" | — | — | P3 | — |
| GM-004..006 | Grill Me executável por agente | NV | Instalar/validar | `ARQUITETURA_V2:43` manda instalar `mattpocock/skills/grill-me`; sem prova de uso | Evidência | — | P3 | — |
| AUTOMACAO_ONDAS | Motor de gatilhos (55 cartões de UI) | NV | timer `v2-gatilhos` | fora do repo | — | — | — | — |

---

## 4. Divergências doc × código

1. **Deploy de Edge Functions.** CLAUDE.md ("Merge em main NÃO deploya edge function… sobem só por workflow_dispatch") e `docs/runbooks/deploy.md:33` ("não é automático em push") × `.github/workflows/deploy-functions.yml:28-38` (gatilho `push` em `supabase/functions/**` desde 07/10, PR #1901); API: 4 deploys por push desde 03/10.
2. `docs/runbooks/deploy.md:21` "3 checks obrigatórios" × branch protection (API de branches) com **6** contexts.
3. CLAUDE.md "Frescura do Grafo": dispatcher N8N "existe e está ativo" × N8N API `active: false` (sem edição desde 29/08).
4. CLAUDE.md "Issues de alerta >20 comentários → fechar e reabrir" × #1454 `[types-sync]` (62 comentários) e #1854 `[settings-guard]` (27) abertas.
5. CLAUDE.md ("403 administrativo é limite de evidência… marca NÃO VERIFICÁVEL, não regressão") × `scripts/ci/github-settings-guard.mjs:118-128`, que trata `null` como divergência: 34/34 runs falham com "7 divergências" falsas e comentam #1854 a cada 6 h.
6. PLANO_GITHUB_ACTIONS E33 ("[x] entregue… alerta #13") × Code Scanning: #13 aberto (`validation.ts:146`) e #31 novo (`validation.ts:211`).
7. PLANO_GITHUB_ACTIONS E83 ("alerta na falha e fecha ao recuperar") × `e2e-logado.yml:49,221`: timeout de 15 min gera `cancelled`, `if: failure()` não dispara; 60/60 runs cancelados, nenhuma issue.
8. PLANO_MELHORIAS_50 E07/E08 com checkbox aberto × `github-settings-baseline.json:9-11` e tabela do CLAUDE.md declarando `enforce_admins: true` e approvals 0 (decidido) — não verificável ao vivo (403).
9. `SEGUNDA_LEVA_CARTOES_2026-10-08.tsv`: SL-023/024 "NAO_IMPLEMENTADA", SL-096/100/116 × código entregue (`types-sync.yml:445-605`, `ci.yml:386-428`, `.github/toolchain.json`).
10. SL-124 ("DB Live Guard obrigatório") × CLAUDE.md (o guarda não roda em PR por desenho; torná-lo obrigatório congelaria os merges).
11. SL-147 (".nvmrc para 20.19.0") × `.nvmrc` = 24 e `.github/toolchain.json` `"node": "24"`.
12. AGENT_TOOLING_PLAN (03/10: Claude-Mem/Headroom "planejados, POC pendente") × `ARQUITETURA_V2_DESCOBERTAS.md:40-41` (04/10: rejeitados; Cartographer adiado).
13. GRILL_ME_PLAN_REVIEW (referência RobMitt) × `ARQUITETURA_V2_DESCOBERTAS.md:43` (`mattpocock/skills/grill-me`).
14. `docs/LGPD-RETENTION-POLICY.md` "Status: Aprovado" × checklist 0/14 e catálogo sem nenhuma função de expurgo/anonimização geral.
15. `docs/BACKUP-RECOVERY-STRATEGY.md` "Status: Aprovado" × checklist 0/7, nenhum registro de restore.
16. `docs/plans/PLANO_100_ETAPAS_WORKFLOWS_2026-09-27.md` (58 workflows, runners `vps-zapp`, "ZAPP web v3") arquivado em 08/10 neste repositório (16 workflows) sem nota de que é de outro repo.
17. CLAUDE.md §0 regras 2–3 (DDL só pelo lote via `db-migrate.yml`; nada antes do merge) × mensagem do commit `ecfdb26` (#1911): `20261009170000`/`180000` "aplicadas e conferidas" e `20261009150000` "criadas antes do merge", via `db_query`.
18. CLAUDE.md §3 ("Branch mergeado = deletado no mesmo turno") × 54 branches remotos, incluindo `dia/2026-10-07` e `dia/2026-10-08` já squash-mergeados.
19. Meta Initial JS 300 KB (SL-103, Melhorias E34) × `performance-budget.json:4` subindo o teto para 343 KB.
20. `public/version.json` (Evolution `atomicabr`, build 13/06) × CLAUDE.md §2 (Evolution GO Hostinger); o build sobrescreve o arquivo (`vite.config.ts:17-24`), o estático é resíduo.
21. `docs/runbooks/slo.md` "O que não existe hoje: cron do health check" × cron já agendado (`20261002541230_pg_cron_escalonar_jobs.sql`).
22. PLANO_MELHORIAS_50 E28 ("10 edges com verify_jwt=false") × `supabase/config.toml` com **14** exceções (todas comentadas/justificadas).
23. PLANO_QUALIDADE_PARALELA §6 "Estado de execução: a preencher" × 23 dos 29 entregáveis já no repositório (relatórios, docs `MODULO_*`, specs Y09–Y12).

---

## 5. Achados fora dos planos

- **Credencial de infraestrutura gravada sem cofre** nos nós HTTP do workflow N8N do dispatcher (inativo, não arquivado). Detalhe fora do repositório público; é preciso rotacionar e arquivar.
- **settings-guard nunca passou** (0/34): falso positivo estrutural (ver divergência 5). O perímetro da `main` está sem vigilância automática real.
- **e2e-logado**: timeout de 15 min (`e2e-logado.yml:49`) menor que a duração da suíte depois que entraram mapa, catálogo e Talk X; cancela sempre por volta de 15,4 min.
- **Projetos Playwright órfãos**: `chromium-telefonia` e `chromium-onboarding-dispensar` (`playwright.config.ts:95-110`) não aparecem em nenhum workflow; `chromium-talkx-launch` só roda no `e2e-talkx.yml`.
- **17 `.test.sh` e 8 suítes Node fora do CI**, em allowlist "a promover pelo dono do workflow" (`scripts/ci/check-test-inventory.mjs:31-93`), entre eles o harness do replay local e o `ia131`.
- **Mutação do mapa** (`🧬 Mutação do mapa`) com falha no HEAD (não bloqueante); SonarCloud com falha no HEAD.
- **Code Scanning: 8 alertas abertos**: 2 de severidade alta em código real, #30 (`js/xss-through-dom`, `src/components/talkx/kit/preview.tsx:70`) e #27/#28 (`js/biased-cryptographic-random`, `src/lib/secureRandom.ts:16`, `supabase/functions/_shared/secure-random.ts:9`); os outros são em testes.
- **PR #1899 aberta desde 06/10** (CORS para `zappweb.app.br`, 28 comentários): `EXACT_ALLOWED_ORIGINS` só aceita `zapp-web-v2.vercel.app` (`_shared/validation.ts:97-99`). Se o domínio oficial mudar, as edges recusam o app.
- **CSP só em Report-Only** nas edges (`validation.ts:124`) e no front.
- **Service role no teardown do E2E** em produção (`e2e-logado.yml:172-210`) com `curl DELETE` em duas tabelas.
- **`REPLICA IDENTITY FULL` em `messages`** continua (causa do UPDATE de "lido" lento em `docs/audits/slow-queries-2026-09.md`).
- **`talkx-status-regen.yml` sem `concurrency`**. Também há dezenas de tags `edge-deploy/*` (de 03/10) que nunca foram limpas. Nenhuma release existe.
- **Issues de 13/09 sem dono**: #380 (rotação Evolution GO), #377 (auditoria de banco), #376 (cobertura), #374 (`any`). Há também os bugs de segurança #1265/#1266/#1267 de 30/09 (Team Chat/Multiplix fail-open por GUC), ainda abertos.
- **Tela Sentry simulada** (`SentryIntegrationView.tsx`): recusa ativar porque não existe backend. O usuário vê uma integração que não existe.
- **Ferramentas da fábrica fora do repo** (`zapp-verify`, `zapp-db-local`, `~/arquitetura-v2`): o portão local e o banco local não podem ser reproduzidos por outro executor.
- **`deploy-functions` automático sem revisor** (`producao-edge-functions` sem `required_reviewers`) e sem rollback automático (E61). Um merge publica direto em produção.

---

## 6. Top 10 da área

1. **E2E com login real morto desde 02/10.** 60/60 runs foram cancelados por timeout de 15 min e o alerta não dispara, então regressões de envio, conversa, catálogo e Talk X chegam à produção sem aviso.
2. **7 achados P0/P1 de segurança de 07/10 seguem abertos**: escrita fora do escopo em histórico (RLS_TAREFAS-01), downloads e CSV com dados pessoais sem permissão (SAIDAS-01/02), mensagem "do cliente" forjável e oráculos de UUID (RLS_CONTATOS-01/02/03), mídia privada via `media_url` (DEFINER-01).
3. **LGPD só no papel.** Não há expurgo ou anonimização por prazo, exportação para o titular nem DPO; existe apenas o expurgo do Talk X. É risco legal direto.
4. **Backup sem prova.** PITR não foi confirmado e nunca se fez restore em ambiente descartável. Ninguém sabe se dá para recuperar dados.
5. **Sem observabilidade de produção.** Não há Sentry nem monitor externo de uptime. Falhas do deploy automático de edges, do guarda vivo e da main não avisam ninguém fora do Actions (E90/SL-159).
6. **Credenciais pendentes.** Rotação de Evolution, service_role e Bearer Lovable; token GitHub do TL-099; credencial de infraestrutura sem cofre num workflow N8N inativo; `SUPABASE_SERVICE_ROLE_KEY` em secret de repositório público usado pelo E2E (E24/E25).
7. **settings-guard quebrado** (falso alarme a cada 6 h). Somado à falta de segunda identidade e de revisão obrigatória, a proteção da `main` fica sem vigilância.
8. **Banco: governança de dados incompleta.** `departments.whatsapp_api_key` em texto puro (fora do Vault), sem perfil somente-leitura, leva 2A de RLS/guards não executada, replay local com 21 falhas conhecidas fora do CI e ledger com statements colapsados (NV).
9. **Code Scanning com 8 alertas** (XSS de severidade alta no Talk X e random enviesado) e SonarCloud vermelho permanente na main.
10. **Custo e velocidade de engenharia.** 54 branches (meta ≤25); CI sem cache do Bun, serial e rodando em draft; 25 suítes de teste fora do CI; Initial JS com teto de 343 KB (meta 300); dívida de lint em 498.
