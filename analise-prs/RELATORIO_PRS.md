# Relatório PRs — Zapp_Web_V2

**Atualizado:** 2026-11-01  
**main SHA:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`  
**PRs abertas:** ~86 | **Mergeadas nesta sessão:** 13 (todas por squash-merge)

---

## ✅ Mergeadas nesta sessão (13)

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

## ⏳ MERGE_OK — auto_merge ativado, aguardando CI (10)

PRs classificadas como seguras, sem migration/workflow/edge function, não-draft, sem conflito.  
`auto_merge` squash ativado — mergearão automaticamente quando CI passar.

| PR | Conteúdo | SHA HEAD | auto_merge |
|---|---|---|---|
| #2489 | fix(e2e): seletor telefonia spec E2E | `e5fd0eb9` | ✓ squash |
| #2493 | docs(claude): CLAUDE.md atualizar checks 6→3 | `a38e2ad4` | ✓ squash |
| #2494 | chore(db): types-sync — artifacts DB (types.ts, schema-catalog, manifesto) | `069c0cd6` | ✓ squash |
| #2495 | chore(claude): auditoria-supabase.md comando | `4b780aaf` | ✓ squash |
| #2498 | feat(db): RPC rename get_search_insights→search_insights + auditoria | `eb03117a` | ✓ squash |
| #2501 | docs: plano E19/E20/E21 | `6b6e7076` | ✓ squash |
| #2504 | fix(e2e): workers 1→4 + timeouts | `f67082c3` | ✓ squash |
| #2507 | docs(claude): CLAUDE.md GR-011 checks 6→3 | `cfae9fd4` | ✓ squash |
| #2513 | fix(css): accessibility.css !important + test | `6a7924ba` | ✓ squash |
| #2516 | test(talkx): testes X006 campanhas TalkX | `992c155d` | ✓ squash |

---

## 🚫 Regra 8 — aguardam decisão humana (21 novas + anteriores)

### Anteriores (da sessão anterior)

PRs tocando `.github/workflows/` — não mergear em autopilot:

- **#2046** — workflow
- **#2092** — workflow (MERGEABLE + CI SUCCESS)
- **#2100** — workflow (MERGEABLE + CI SUCCESS)
- **#2297** — workflow (MERGEABLE + CI SUCCESS)
- **#2450** — workflow (MERGEABLE + CI SUCCESS)

### Novas — Regra 8 (PRs #2485–#2517)

**Migrations (#2485–#2517):**

| PR | Conteúdo | Motivo bloqueio |
|---|---|---|
| #2485 | fix(rls): DROP POLICY IF EXISTS copilot_supervisor_only | DROP POLICY = destrutivo |
| #2486 | feat: migration + edge functions message-delivery (34 arquivos) | migration + edge function |
| #2487 | feat(db): migration ALTER TABLE + INSERT + FUNCTION + TRIGGER copilot_live_motor | migration destrutiva |
| #2491 | feat(db): migration 7 tabelas copilot fases 13-15 | migration aditiva mas requer aprovação |
| #2496 | feat: migration outbound_post_started + edge functions evolution-webhook | migration + edge function |
| #2500 | feat(copilot): copilot-tick.ts + migration | edge function + migration |
| #2505 | perf(db): migration 48 CREATE INDEX IF NOT EXISTS high3-fk-indexes | migration (CREATE INDEX) |
| #2514 | fix(talkx): CRITICAL-3 talkx-scheduler timeout + cron startup | migration + cron functions |
| #2517 | feat(db): DROP TYPE + UPDATE em massa — DRAFT | DRAFT + operação destrutiva irrecuperável |

**Workflows (.github/workflows/):**

| PR | Conteúdo |
|---|---|
| #2497 | ci: pular PRs draft no CI — altera ci.yml |
| #2499 | ci: main-failure-notify.yml — novo workflow |
| #2502 | ci: múltiplos workflows alterados |
| #2503 | ci: altera ci.yml |
| #2508 | ci: altera deploy-functions.yml |
| #2510 | ci: scorecard.yml + ci.yml |
| #2511 | refactor: 100 arquivos incluindo .github/workflows/ |

---

## ⚠️ Decisão humana crítica (1)

- **#2265** — `CRITICAL-1`: revoga grants para role `anon` — DDL de segurança. Draft, MERGEABLE, CI FAILURE.

---

## 🔄 CONFLICTING — precisam de rebase (47)

### Anteriores (44)
#2051, #2058, #2059, #2063, #2066, #2067, #2068, #2069, #2074, #2078, #2080, #2081, #2082, #2084, #2088, #2091, #2095, #2097, #2107, #2111, #2147, #2148, #2152, #2185, #2186, #2196, #2200, #2208, #2226, #2228, #2233, #2238, #2255, #2277, #2354, #2372, #2396, #2412, #2413, #2414, #2415, #2426, #2429, #2447

### Novas (3)
- **#2492** — docs: fila-merge + testes + documentação (`mergeable_state: dirty`)
- **#2506** — feat(talkx): talkx-scheduler + monitoring 2771 linhas (`mergeable_state: dirty`)
- **#2512** — 138 arquivos, 43 commits (`mergeable_state: dirty`)

---

## ❌ CI FAILURE — bloqueadas por testes (14)

Regressão nos unit tests desde ~24/10. Fix do TZ (#2416) já mergeado.

#1930, #1997, #2064, #2137, #2146, #2216, #2279, #2417, #2418, #2419, #2421, #2428, #2431, #2433

---

## 📝 Draft CONFLICTING (17)

#2113, #2206, #2245, #2249, #2434–#2446 (lote), #2445 (mega: 325 arquivos)

**Drafts novos (Regra 8):**
- #2515 — draft genérico, incompleto
- #2517 — draft + DROP TYPE + UPDATE em massa (destrutivo)

---

## ♻️ NOOP — sem diff real (3)

#2075, #2086, #2232

---

## 🔒 Fechadas sem merge por outras sessões (2)

- **#2488** — fix: clientHeight/clientWidth mock no setup de testes — fechada sem merge (0 changed files, state=closed)
- **#2490** — docs: GF-001..056 PENDENCIAS.md e BACKLOG_TAREFAS.md — fechada sem merge (dirty, substituída por #2426)

---

## ✅ Mergeadas por outras sessões (cobertura completa)

#2034, #2042, #2044, #2340, #2451, #2452, #2482 (docs talkx V4 X001), #2509 (feat talkx V4 X002)

---

## 📋 Próximos passos

1. **Regra 8 — Workflows**: decidir sobre #2046, #2092, #2100, #2297, #2450, #2497, #2499, #2502, #2503, #2508, #2510, #2511 (CI verde, aguardam aprovação humana)
2. **CONFLICTING**: rebase local nas 47 PRs (44 antigas + #2492, #2506, #2512) — cada rebase desbloqueará nova rodada
3. **Regra 8 — Migrations**: revisar #2485, #2486, #2487, #2491, #2496, #2500, #2505, #2514, #2517
4. **#2265**: revisar manualmente antes de mergear (DDL crítico — revoga grants `anon`)
5. **CI**: investigar causa raiz dos ~14 failures (regressão desde 24/10)
