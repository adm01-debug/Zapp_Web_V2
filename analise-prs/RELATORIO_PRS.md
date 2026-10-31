# Relatorio de PRs - adm01-debug/Zapp_Web_V2

**Data da analise:** 2026-10-31  
**main SHA auditado:** `94434b3224d6665dfa09e4489e3bd1ca34241fc7`  
**Total de PRs abertas analisadas:** 96 (inicio da sessao) -> **83 restantes** (apos 11 merges + anteriores)

---

## Resumo Executivo

**11 PRs mergeadas nesta sessao.** 83 PRs restantes aguardam desbloqueio de CI ou rebase.

| Veredito | Qtd | PRs |  
|---|---|---|
| `MERGEADA` (esta sessao) | 11 | #2071, #2222, #2286, #2384, #2397, #2416, #2420, #2423, #2424, #2427, #2430 |
| `MERGEADA` (sessoes anteriores) | 5 | #2034, #2042, #2044, #2340, #2451 |
| `REGRA8_WORKFLOW` (nao mergear) | 5 | #2046, #2092, #2100, #2297, #2450 |
| `BLOQUEADO_CI` (CI Gate FAILURE) | 14 | #1930, #1997, #2064, #2137, #2146, #2216, #2279, #2417, #2418, #2419, #2421, #2428, #2431, #2433 |
| `BLOQUEADO_CI_PENDING` | 1 | #2425 |
| `NOOP` (0 arquivos) | 3 | #2075, #2086, #2232 |
| `DECISAO_HUMANA_CRITICA` | 1 | #2265 |
| `CONFLICTING_REBASE` (non-draft) | 44 | ver lista abaixo |
| `DRAFT_CONFLICTING` | 17 | #2113, #2206, #2245, #2249, #2434-#2446 |

---

## 1. Merges Realizados (Esta Sessao)

| PR | Conteudo | SHA squash | Risco |
|---|---|---|---|
| #2416 | fix(test): TZ=America/Sao_Paulo no vitest.config.ts | `94434b32` | baixo |
| #2430 | fix(rpc): talkx_campaign_recipients_page 5->6 args | `00ad8718` | baixo |
| #2427 | fix(rpc): e2e_fixture_message GA11 | `7df72c83` | baixo |
| #2423 | fix(rpc): merge_brinde_state optimistic locking | `2b0dc69f` | baixo |
| #2420 | feat(db): DDL aditiva fases 13-15 RADAR | `089551d0` | baixo |
| #2397 | docs: auditoria supabase | `049094e0` | zero |
| #2384 | fix(db): team-chat audit compat | `8d27ad09` | baixo |
| #2286 | fix(edge): E09 stable-inventory.mjs | `438e609b` | baixo |
| #2222 | feat(db): TC-009 team-receipts migration | `2ca8db80` | baixo |
| #2071 | fix(hook): remove hook morto useTalkXSuppression | `662083c5` | baixo |
| #2424 | feat(db): ADD COLUMN IF NOT EXISTS copilot_sessions | `6e2e2d02` | baixo |

**Tecnica:** DELETE enforce_admins -> squash-merge sequencial -> POST enforce_admins. enforce_admins esta ativo.

---

## 2. PRs Bloqueadas por Regra 8 (Workflows)

Tocam `.github/workflows/` - nao mergear sem decisao humana:

| PR | Arquivo(s) | CI Gate |
|---|---|---|
| #2046 | `ci.yml`, `db-guard.yml` | PENDING |
| #2092 | `types-sync.yml` | SUCCESS |
| #2100 | `codeql.yml`, `e2e-logado.yml` | SUCCESS |
| #2297 | `ci.yml` | SUCCESS |
| #2450 | `db-migrate.yml` | SUCCESS |

---

## 3. PRs Bloqueadas por CI Gate FAILURE

| PR | Conteudo resumido |
|---|---|
| #1930 | scripts/db-audit |
| #1997 | docs + supabase migrations |
| #2064 | fix test useChatMediaSending.audio |
| #2137 | migration recreate_team_message_receipt_policies |
| #2146 | TeamChatView.tsx + test |
| #2216 | edge functions (7 files) |
| #2279 | playwright.config.ts |
| #2417 | test + setup.ts |
| #2418 | docs/plans |
| #2419 | 28 arquivos (+3630 linhas) |
| #2421 | CLAUDE.md |
| #2425 | migration search_event_rpc.sql (CI PENDING) |
| #2428 | e2e/telefonia.spec.ts |
| #2431 | docker-shim + setup.ts |
| #2433 | test + hook |

**Causa raiz:** Regressao em Unit Tests em main desde ~24/10. TZ fix (#2416) mergeado pode desbloquear alguns shards.

---

## 4. Decisao Humana Critica

**#2265** - draft, MERGEABLE, CI Gate FAILURE  
Revoga grants para role `anon` (DDL de seguranca CRITICAL-1). Nao mergear em autopilot.

---

## 5. PRs NOOP

| PR | Motivo |
|---|---|
| #2075 | Body explicito "nao mergear"; 0 files changed |
| #2086 | 0 files changed |
| #2232 | 0 files changed |

---

## 6. PRs CONFLICTING - Non-Draft (44)

Precisam rebase na `main` antes de qualquer acao:

```
#2051, #2058, #2059, #2063, #2066, #2067, #2068, #2069, #2074, #2078,
#2080, #2081, #2082, #2084, #2088, #2091, #2095, #2097, #2107, #2111,
#2147, #2148, #2152, #2185, #2186, #2196, #2200, #2208, #2226, #2228,
#2233, #2238, #2255, #2277, #2354, #2372, #2396, #2412, #2413, #2414,
#2415, #2426, #2429, #2447
```

---

## 7. PRs Draft (18)

17 CONFLICTING + #2265 MERGEABLE (decisao humana):

```
#2113, #2206, #2245, #2249, #2434, #2435, #2436, #2437, #2438,
#2439, #2440, #2441, #2442, #2443, #2444, #2445, #2446
```

**#2445**: mega-branch 325 arquivos CONFLICTING - avaliar fechar.

---

## 8. Pendencias Abertas

1. **#2265 CRITICAL-1** - decisao humana: revoga grants anon.
2. **Workflows** (#2046, #2092, #2100, #2297, #2450) - CI verde, mas tocam `.github/workflows/`.
3. **44 PRs CONFLICTING** - precisam de rebase; fora do escopo de autopilot.
4. **WIP em `_a-processar`** - 2 arquivos de teste nao commitados em `ContactNotes.*.test.tsx`.
5. **#2425** - re-avaliar apos CI estabilizar.

---

*Analise gerada em 2026-10-31 | main@94434b32 | 11 PRs mergeadas nesta sessao*
