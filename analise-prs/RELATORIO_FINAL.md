# Relatório Final — Análise de 67 PRs Abertas

**Data:** 2026-11-01  
**Main SHA:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`  
**Total aberto:** 67 PRs  

---

## 🚨 ALERTA CRÍTICO — 15 PRs da Regra 8 com auto_merge ATIVO

**Se o CI passar, estas PRs vão se mergear automaticamente sem aprovação de Joaquim.**  
Todas envolvem migrations, edge functions, RLS ou workflows — Regra 8 exige aprovação humana.

| # | Título | Por que Regra 8 |
|---|---|---|
| **#2426** | fix(ci): corrigir timeout do branch-hygiene-audit | .github/workflows |
| **#2460** | feat: 7 edge functions copiloto RADAR fases 8-10 | Edge functions novas |
| **#2471** | infra: investigação de pausas — migration IP2-A | Migration em produção |
| **#2473** | feat: conectar 7 hooks Copiloto às edge functions AI | Edge functions |
| **#2481** | fix(rls): WITH CHECK explícito em 8 policies UPDATE | RLS — amplia/muda permissões |
| **#2485** | fix: RLS copilot — INSERT learning_moments e UPDATE | RLS — amplia/muda permissões |
| **#2486** | feat: motor e telas do RADAR Copiloto (CV-021–060) | Componente grande + possível migration |
| **#2487** | feat: migration 20261030200000 — motor Copiloto RADAR | ⚠️ MIGRATION em produção |
| **#2491** | fix: reconciliar migration 20261030145126 | Migration (7 tabelas copilot) |
| **#2499** | feat(ci): notificação WhatsApp em falha crítica na main | .github/workflows (E90) |
| **#2503** | fix(ci): E69+E71 — parallelizar build/typecheck | .github/workflows |
| **#2505** | fix: HIGH-3 — 57 índices de FK sem cobertura | DDL (57 CREATE INDEX) |
| **#2508** | fix(ci): corrige typecheck das edges — npm @types/node | .github/workflows / edge functions |
| **#2510** | ci(W85/W86/W87): OpenSSF Scorecard + dependency-review | .github/workflows novos |
| **#2514** | fix: CRITICAL-3 — talkx-scheduler 9,3% timeout arranque | Migration + cron functions |

**Ação imediata:** desativar `auto_merge` nestas 15 PRs via GitHub UI → Settings da PR → "Disable auto-merge".

---

## Resumo por Categoria

| Categoria | Quantidade |
|---|---|
| ✅ MERGE_OK (auto_merge ativo, CI decidirá) | 22 |
| ⚠️ DECISAO_HUMANA — Regra 8 (aguarda Joaquim) | ~28 |
| 🔴 DECISAO_HUMANA + auto_merge ATIVO (crítico) | 15 |
| 📝 DRAFT | 8 |
| 💥 CONFLITO (dirty) | 3 |
| 🔒 FECHADA_SEM_MERGE | 2 |
| ⚡ CONFLITO INTER-PR | 2 (#2417 vs #2431) |

---

## ✅ PRs MERGE_OK — auto_merge ativo, CI decidirá

Estas são seguras — tocam apenas front-end, docs, testes, config não-sensível. Quando o CI passar, se auto-mergeiam corretamente.

| # | Título | Evidência |
|---|---|---|
| #1930 | feat(db-audit): W21 — check-migration-drift --classificar | Script de audit, não DDL |
| #2418 | docs: plano de correções e melhorias — 190 etapas | Docs |
| #2463 | fix: MediaMigrationTool acessa dados via service | Front-end only |
| #2464 | fix: resolve lint regressions and existing typecheck errors | Front-end/lint |
| #2465 | docs(consolidacao): registra baseline técnica de 01/11 | Docs |
| #2467 | feat: undo do bulkArchive restaura waiting/resolved/closed | Front-end |
| #2475 | fix(test): restaura os 3 testes de ContactNotes afrouxados | Tests |
| #2478 | feat(tarefas): cores de prioridade D12 — Média âmbar, Alta/Urgente vermelha | Front-end UI |
| #2479 | docs(resgate): mapa do delta pós 24/10 do trabalho local | Docs |
| #2480 | feat: C297 — visual de texto longo em Badge, Card, Label, Tag | Front-end UI |
| #2484 | feat(metas): seletor Hoje/Semana/Mês na aba Metas (C130) | Front-end UI |
| #2494 | chore(db): sincronizar artefatos derivados do banco | Types/catalog sync |
| #2495 | chore: adiciona comando /auditoria-supabase | Docs/config |
| #2498 | fix(admin): corrige RPC get_search_insights → search_insights | Front-end fix |
| #2501 | chore(plano): marcar E19/E20/E21 como [x] | Docs |
| #2504 | fix(e2e): workers CI 1→4 + timeouts explícitos nos 3 testes | E2E tests |
| #2507 | fix(docs): CLAUDE.md — corrige referências de '6 checks' para '3 checks' | Docs |
| #2513 | fix: contraste WCAG AA no modo alto contraste escuro | Front-end CSS |
| #2516 | fix(talkx): caso de aceite X006 — Limites de Envio | Front-end |
| #2520 | feat(talkx): criar base de demonstração determinística das 16 campanhas | Front-end |
| #2522 | fix(e2e): aguarda teclado visível antes do primeiro clique | E2E tests |
| #2532 | docs(gf): BACKLOG_TAREFAS.md GF-001..056 [x] + PENDENCIAS.md | Docs |

---

## ⚠️ PRs DECISAO_HUMANA — Aguardam aprovação de Joaquim

### Migrations em produção (Supabase `tnnnlkbymytvtqngbbqh`)

| # | Título | Tipo | Destrutiva? |
|---|---|---|---|
| #2461 | feat(db): 7 tabelas copiloto fases 13-15 | 7 tabelas novas | Não (aditiva) |
| #2471 | infra: investigação de pausas — migration IP2-A | Migration nova | Não verificado |
| #2483 | fix: adiciona brinde_state em copilot_sessions | ALTER TABLE provável | Não verificado |
| #2487 | ⚠️ feat: migration 20261030200000 — motor RADAR | Migration grande | Não verificado |
| #2491 | fix: reconciliar migration 20261030145126 | 7 tabelas copilot | Não (reconciliação) |
| #2505 | fix: HIGH-3 — 57 índices de FK sem cobertura | 57 CREATE INDEX | Não (aditivo) |
| #2514 | **CRITICAL-3** — talkx-scheduler 9,3% timeout | Migration + cron | Não verificado |

### Edge functions (Supabase Functions)

| # | Título | Novas funções |
|---|---|---|
| #2460 | feat: 7 edge functions copiloto RADAR fases 8-10 | 7 funções novas |
| #2473 | feat: conectar 7 hooks Copiloto às edge functions AI | Modifica funções existentes |

### RLS / Permissões

| # | Título | Impacto |
|---|---|---|
| #2481 | fix(rls): WITH CHECK explícito em 8 policies UPDATE | Restringe UPDATE (mais seguro) |
| #2485 | fix: RLS copilot — INSERT learning_moments e UPDATE scores | RLS copilot |

### .github/workflows

| # | Título | Workflows tocados |
|---|---|---|
| #2426 | fix(ci): corrigir timeout do branch-hygiene-audit | branch-hygiene-audit.yml |
| #2499 | feat(ci): notificação WhatsApp em falha crítica na main | ci.yml |
| #2503 | fix(ci): E69+E71 — parallelizar build/typecheck | ci.yml |
| #2508 | fix(ci): corrige typecheck das edges | deploy-functions.yml |
| #2510 | ci(W85/W86/W87): OpenSSF Scorecard + dependency-review | 3 workflows novos |
| #2526 | fix(ci): deno check --config + waitForAppliedTheme | deploy-functions.yml |

### Outros (grande escopo / indeterminado)

| # | Título | Motivo |
|---|---|---|
| #2457 | feat(db): investigação de incidentes de pausa de instância | DB + possível migration |
| #2466 | feat(message-delivery): carimbo do POST iniciado (PD-79) | Pode ter migration |
| #2469 | feat: completa pausa de instância (C121) | Pode ter migration |
| #2472 | feat: pausa de instância segura a entrega de mensagens | Pode ter migration |
| #2476 | feat: cron do Multiplix retoma dispatch pausado | Cron (pg_cron) |
| #2486 | feat: motor e telas do RADAR Copiloto (CV-021–060) | Componente grande |
| #2496 | feat(message-delivery): carimbo do POST iniciado (duplicata?) | Possível duplicata |
| #2497 | (sem dossier completo) | Pendente |
| #2500 | fix: CV-052 — commit atômico session+insights via RPC | RPC nova no banco |
| #2511 | (100 arquivos + workflows) | Escopo enorme |

---

## 📝 PRs DRAFT — Não mergear

| # | Título |
|---|---|
| #2502 | docs: atualiza perímetro do GitHub e checkboxes do plano GA0 |
| #2515 | fix: pre-aquecer cache Deno antes do baseline N-017 |
| #2517 | feat(talkx): catálogo de motivos de supressão com RLS e FK |
| #2519 | fix: corrige 6 falhas de CI + documenta bloqueios pré-existentes |
| #2523 | chore(analise-prs): relatório completo de 30 PRs abertas |
| #2525 | docs(ci): RELATORIO_CI e PENDENCIAS — estado real 2026-11-01 |
| #2527 | fix(ci): adicionar --config ao deno check em deploy-functions |
| #2529 | feat(talkx): RPCs analíticas de campanha |
| #2530 | feat(talkx): RPCs de métricas de biblioteca de templates |
| #2531 | feat(talkx): RPC de fila por segmento da campanha |

---

## 💥 PRs com CONFLITO de merge (dirty)

| # | Título |
|---|---|
| #2078 | ci(F3): baseline strict=false — opção A sem fila serial |
| #2492 | fix: fila-merge retry p/ JSON truncado + testes paginação |
| #2506 | docs(audit): auditoria Supabase tnnnlkbymytvtqngbbqh — 47 achados |
| #2512 | (conflito dirty) |

---

## 🔒 PRs FECHADAS sem merge

| # | Título |
|---|---|
| #2468 | (fechada — supersedida por #2484) |
| #2488 | fix: clientHeight/clientWidth mock no setup de testes |
| #2490 | docs: GF-001..056 — PENDENCIAS.md e BACKLOG_TAREFAS.md |

---

## ⚡ Conflito inter-PR: #2417 vs #2431

Ambas tocam `src/test/setup.ts`:
- **#2417** — fix(tests): mocks clientHeight/clientWidth e spy HTMLElement — tem `auto_merge` ativo
- **#2431** — fix(ci): docker-shim protege roles pg_*; setup.ts usa Element mock — mais completa, sem auto_merge

**Recomendação:** mergear #2431 (mais completa), fechar #2417.  
**Atenção:** #2417 tem `auto_merge` ativo — se CI passar antes de #2431 ser mergeada, vai entrar primeiro.

---

## Novas PRs abertas durante esta sessão (#2533, #2534, #2535)

Sem análise — abertas depois do início desta sessão. Verificar na próxima rodada.

---

## Recomendações imediatas para Joaquim

1. **URGENTE** — Desativar `auto_merge` nas 15 PRs da Regra 8 listadas no topo.
2. **CRITICAL-3** — Revisar e aprovar #2514 (talkx-scheduler 9,3% falha timeout) com prioridade.
3. **Migrations aditivas prontas para revisar:** #2461 (7 tabelas copilot), #2491 (reconciliação), #2505 (57 FK indexes) — não-destrutivas, provavelmente seguras.
4. **Workflows prontos para revisar:** #2508, #2503, #2499, #2426, #2510 — fixes de CI.
5. **Conflito #2417 vs #2431** — mergear #2431, fechar #2417.
