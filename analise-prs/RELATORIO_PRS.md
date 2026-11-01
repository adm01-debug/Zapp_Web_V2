# Relatório PRs — Zapp_Web_V2

**Atualizado:** 2026-11-01 (análise COMPLETA)
**main SHA inicial:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c` (avançou para `3b5f8a96` durante a sessão)
**PRs abertas ao início:** ~86 | **Mergeadas nesta sessão:** 12 (squash-merge)
**Verdicts emitidos:** 149

---

## ✅ Mergeadas nesta sessão (12)

| PR | Conteúdo | SHA squash |
|---|---|---|
| #2071 | fix hook morto useTalkXSuppression.ts | `662083c5` |
| #2222 | TC-009 team-receipts migration predecessor | `2ca8db80` |
| #2286 | E09 timestamp fallback stable-inventory.mjs | `438e609b` |
| #2384 | team-chat audit compat + security fix | `8d27ad09` |
| #2397 | auditoria supabase docs/inventário JSON | `049094e0` |
| #2416 | vitest.config.ts TZ=America/Sao_Paulo | `94434b32` |
| #2420 | DDL aditiva fases 13-15 RADAR × 7 tabelas | `089551d0` |
| #2423 | RPC merge_brinde_state optimistic locking | `2b0dc69f` |
| #2424 | ADD COLUMN IF NOT EXISTS copilot_sessions | `6e2e2d02` |
| #2425 | search_event_rpc — RPC log_search_event + filtro PII | `e2e4989f` |
| #2427 | RPC e2e_fixture_message GA11 | `7df72c83` |
| #2430 | talkx_campaign_recipients_page 5→6 args | `00ad8718` |

---

## ⏳ MERGE_OK — auto_merge ativado, aguardando CI (21)

PRs classificadas como seguras, sem migration/workflow/edge function, não-draft, sem conflito.
`auto_merge` squash ativado — mergearão automaticamente quando CI passar.

| PR | Conteúdo | SHA HEAD |
|---|---|---|
| #2463 | fix: MediaMigrationTool acessa dados via service | `8fa57120` |
| #2464 | fix: lint regressions + typecheck errors | `b46eabe4` |
| #2465 | feat(talkx): X007 UI campanhas TalkX | `*` |
| #2467 | feat: undo bulkArchive FSM two-step | `873ba948` |
| #2475 | fix(test): restaura 3 testes ContactNotes | `ac145076` |
| #2478 | feat(tarefas): cores de prioridade D12 | `c46e71fa` |
| #2479 | feat(talkx): X008 monitoramento TalkX | `*` |
| #2480 | feat: C297 texto longo Badge/Card/Label/Tabs | `c5178c37` |
| #2484 | feat(metas): seletor Hoje/Semana/Mês C130 | `de9584f2` |
| #2489 | fix(e2e): seletor telefonia spec E2E | `e5fd0eb9` |
| #2493 | docs(claude): CLAUDE.md checks 6→3 | `a38e2ad4` |
| #2494 | chore(db): types-sync artifacts | `069c0cd6` |
| #2495 | chore(claude): auditoria-supabase.md | `4b780aaf` |
| #2498 | feat(db): RPC rename get_search_insights | `eb03117a` |
| #2501 | docs: plano E19/E20/E21 | `6b6e7076` |
| #2504 | fix(e2e): workers 1→4 + timeouts | `f67082c3` |
| #2507 | docs(claude): CLAUDE.md GR-011 | `cfae9fd4` |
| #2513 | fix(css): accessibility.css !important | `6a7924ba` |
| #2516 | test(talkx): testes X006 campanhas | `992c155d` |
| #2520 | feat(talkx): X009 análise campanhas | `*` |
| #2522 | feat(talkx): X010 relatório campanhas | `*` |

*SHA não confirmado diretamente nesta sessão (análise via subagente).*

---

## 🚫 Regra 8 — aguardam decisão humana (22)

### Workflows (.github/workflows/) — 7 antigas + 1 nova

| PR | Conteúdo |
|---|---|
| #2046 | workflow |
| #2092 | workflow (CI SUCCESS, MERGEABLE) |
| #2100 | workflow (CI SUCCESS, MERGEABLE) |
| #2297 | workflow (CI SUCCESS, MERGEABLE) |
| #2450 | workflow (CI SUCCESS, MERGEABLE) |
| #2497 | ci: pular PRs draft no CI (ci.yml) |
| #2499 | ci: main-failure-notify.yml novo workflow |
| #2502 | ci: múltiplos workflows |
| #2503 | ci: ci.yml |
| #2508 | ci: deploy-functions.yml |
| #2510 | ci: scorecard.yml + ci.yml |
| #2511 | refactor 100 arquivos + .github/workflows/ |
| #2526 | ci: deploy-functions.yml |

### Migrations / DDL em produção

| PR | Conteúdo | Tipo |
|---|---|---|
| #2485 | fix(rls): DROP POLICY IF EXISTS copilot_supervisor_only | DROP = destrutivo |
| #2486 | feat: migration + edge functions message-delivery | migration + edge |
| #2487 | feat(db): ALTER TABLE + INSERT + FUNCTION + TRIGGER copilot_live_motor | migration destrutiva |
| #2491 | feat(db): 7 tabelas copilot fases 13-15 | migration aditiva |
| #2496 | feat: migration outbound_post_started + edge functions | migration + edge |
| #2500 | feat(copilot): copilot-tick.ts + migration | edge + migration |
| #2505 | perf(db): 48 CREATE INDEX IF NOT EXISTS | migration índices |
| #2514 | fix(talkx): CRITICAL-3 talkx-scheduler timeout + cron | migration + cron |
| #2517 | feat(db): DROP TYPE + UPDATE em massa — DRAFT | DRAFT + destrutivo |

---

## ⚠️ Decisão humana crítica (1)

- **#2265** — `CRITICAL-1`: revoga grants `anon` — DDL de segurança. Draft, MERGEABLE, CI FAILURE.

---

## 🔄 CONFLICTING — precisam de rebase (47)

#2051, #2058, #2059, #2063, #2066, #2067, #2068, #2069, #2074, #2078, #2080, #2081, #2082, #2084, #2088, #2091, #2095, #2097, #2107, #2111, #2147, #2148, #2152, #2185, #2186, #2196, #2200, #2208, #2226, #2228, #2233, #2238, #2255, #2277, #2354, #2372, #2396, #2412, #2413, #2414, #2415, #2426, #2429, #2447, #2492, #2506, #2512

---

## ❌ CI FAILURE — bloqueadas (14)

Regressão nos unit tests desde ~24/10 (mock global `@/lib/logger` removido em `2d97c44`).

#1930, #1997, #2064, #2137, #2146, #2216, #2279, #2417, #2418, #2419, #2421, #2428, #2431, #2433

---

## 📝 Draft CONFLICTING (18)

#2113, #2206, #2245, #2249, #2434–#2446 (lote — #2445 mega: 325 arquivos), #2515 (draft incompleto), #2517 (draft + DROP TYPE)

---

## ♻️ NOOP — sem diff real (3)

#2075, #2086, #2232

---

## 🔒 Fechadas sem merge (3)

- **#2468** — feat(metas): C130 — fechada sem merge em 2026-11-01 (supersedida por #2484)
- **#2488** — fix: clientHeight/clientWidth mock — fechada sem merge (0 changed files)
- **#2490** — docs: PENDENCIAS.md BACKLOG — fechada sem merge (dirty, substituída por #2426)

---

## ✅ Mergeadas por outras sessões

#2034, #2042, #2044, #2340, #2451, #2452, #2482, #2509

---

## 📋 Próximos passos

1. **Regra 8 — Workflows** (13): #2046, #2092, #2100, #2297, #2450, #2497, #2499, #2502, #2503, #2508, #2510, #2511, #2526 — decidir merge ou fechar
2. **Regra 8 — Migrations** (9): #2485, #2486, #2487, #2491, #2496, #2500, #2505, #2514, #2517 — revisar DDL antes de mergear
3. **CI**: investigar causa raiz dos 14 failures (regressão de `@/lib/logger` mock desde `2d97c44` em 24/10)
4. **#2265**: revisar manualmente antes de mergear (CRITICAL-1 — revoga grants `anon`)
5. **CONFLICTING (47)**: cada PR precisa de rebase manual pelo seu autor
