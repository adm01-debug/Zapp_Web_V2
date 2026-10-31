# Relatório PRs — Zapp_Web_V2

**Atualizado:** 2026-10-31  
**main SHA:** `e2e4989faaa46f5baa2028e69563a9a7eb9a8d76`  
**PRs abertas:** ~82 | **Mergeadas nesta sessão:** 13

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

## 🚫 Regra 8 — aguardam decisão humana (5)

PRs tocando `.github/workflows/` — não mergear em autopilot:

- **#2046** — workflow
- **#2092** — workflow (MERGEABLE + CI SUCCESS)
- **#2100** — workflow (MERGEABLE + CI SUCCESS)
- **#2297** — workflow (MERGEABLE + CI SUCCESS)
- **#2450** — workflow (MERGEABLE + CI SUCCESS)

---

## ⚠️ Decisão humana crítica (1)

- **#2265** — `CRITICAL-1`: revoga grants para role `anon` — DDL de segurança. Draft, MERGEABLE, CI FAILURE.

---

## 🔄 CONFLICTING — precisam de rebase (44)

#2051, #2058, #2059, #2063, #2066, #2067, #2068, #2069, #2074, #2078, #2080, #2081, #2082, #2084, #2088, #2091, #2095, #2097, #2107, #2111, #2147, #2148, #2152, #2185, #2186, #2196, #2200, #2208, #2226, #2228, #2233, #2238, #2255, #2277, #2354, #2372, #2396, #2412, #2413, #2414, #2415, #2426, #2429, #2447

---

## ❌ CI FAILURE — bloqueadas por testes (14)

Regressão nos unit tests desde ~24/10. Fix do TZ (#2416) já mergeado.

#1930, #1997, #2064, #2137, #2146, #2216, #2279, #2417, #2418, #2419, #2421, #2428, #2431, #2433

---

## 📝 Draft CONFLICTING (17)

#2113, #2206, #2245, #2249, #2434–#2446 (lote), #2445 (mega: 325 arquivos)

---

## ♻️ NOOP — sem diff real (3)

#2075, #2086, #2232

---

## 📋 Próximos passos

1. **Regra 8**: decidir sobre #2092, #2100, #2297, #2450 (CI verde, apenas workflows)
2. **CONFLICTING**: rebase local nas 44 PRs — cada rebase desbloqueará nova rodada de merges
3. **CI**: investigar causa raiz dos ~14 failures (regressão desde 24/10)
4. **#2265**: revisar manualmente antes de mergear (DDL crítico)
5. **#2445**: avaliar fechar (mega-branch com 325 arquivos, CONFLICTING)
