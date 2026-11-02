# RELATÓRIO DE ANÁLISE — 94 PRs ANALISADAS
**adm01-debug/Zapp_Web_V2** | Atualizado em 2026-11-02T07:00Z  
SHA main início da análise: `004e74a8c596959f45f61c8b0b64b30a70c1ff19`  
SHA main atual: `c16f3c69a9bffea1899760288d6c5d576acc2495` (após merge #2545)

---

## ✅ MERGEADAS COM SHA DE EVIDÊNCIA (6 total)

| PR | Título | Merge SHA | Mergeada em |
|----|--------|-----------|-------------|
| #2283 | fix: aumentar timeout do job E2E de 20 para 45 minutos | `6271b716e08df80d21b6cfdbdfd9263ddb6e7acb` | 2026-10-27T20:04:29Z |
| #2447 | docs(ci): RELATORIO_CI.md e PENDENCIAS.md | `3617a2acd517dcc9a6eaf2533cd256913e462c21` | 2026-11-01 |
| #2482 | docs(talkx): marca V4 como vigente e V3 como substituído (X001) | `3b5f8a96db0337af7310eec1b0dc5f86bb45912c` | 2026-11-01 |
| #2547 | infra: E2E logado timeout 45 min | `3066fac062f934e5469bb573e88bc464559a023c` | 2026-11-02T02:13:43Z |
| #2560 | fix(e2e): workers 1→2 em CI — GR-016 | `a7a53f56771257106ad79847e6a9f13b9ddada80` | 2026-11-02T02:43:28Z |
| #2545 | chore: congela features — 9 fluxos críticos | `c16f3c69a9bffea1899760288d6c5d576acc2495` | 2026-11-02T03:01:17Z |

---

## ⏳ AGUARDANDO CI — COM auto_merge=SQUASH (9 + 1)

Todas mergearão automaticamente quando os required checks passarem (3 obrigatórios: `🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate`).

| PR | Título | HEAD SHA |
|----|--------|----------|
| #2494 | chore(db): sincronizar artefatos (types-sync) | `b936b6453b848862ebf6efed6f1f453fa0812a7f` |
| #2498 | fix(admin): RPC get_search_insights→search_insights | `984104a1e22cc924303055fff3ff96048d8bac6e` |
| #2522 | fix(e2e): aguarda teclado visível — Firefox GR-012 | `737518f952999dad4f023e9eb36270bd6203ed75` |
| #2526 | fix(ci): deno check --config + E2E webkit | `f3cccccae8189a91743b37a05723a833565023cc` |
| #2533 | chore: migration reconciliation 20261030145126 | `2388e1ac52b22578880c3a5d6d408a4436ac16f0` |
| #2542 | fix: N-008 DB Guard N008_POSTGRES_IMAGE | `c61cbe617f4d06b0f29cb41ddb8f4a1c03082327` |
| #2543 | fix: E2E alto-contraste e N-008 healthcheck | `68dff679c1551472f7b5c06a0bf0855c920fc7eb` |
| #2549 | fix: reconexão automática WhatsApp | `7742d72eb9899d131db4d053d37d7b113cc09cc8` |
| #2557 | fix(docs): atualiza required checks no CLAUDE.md | `93cfc9d09660ba91d932554a1f2e6b782e569de6` |
| #2563 | fix(ci): instala @types/node via npm após deno install | `355f3ea4916e7d54c9d09ebd6c83bc88a5d32317` |

---

## ⏳ AGUARDANDO_CI_APOS_UPDATE

| PR | HEAD SHA | Observação |
|----|----------|------------|
| #2494 | `b936b6453b848862ebf6efed6f1f453fa0812a7f` | CI não iniciou no novo head SHA (bot push); auto_merge=SQUASH |

---

## 🚫 BLOQUEADAS — CONFLITO COM MAIN

| PR | HEAD SHA | Motivo |
|----|----------|--------|
| #2536 | `901357404c7cad5fcc398fdf2e66512077e16956` | fix(e2e) workers sempre 2 GR-016; dirty após #2560 mergear mesmo tema; verificar se supersedido |
| #2566 | `f12084606dcdd9d9d8c71605ab0235e9126431ee` | fix(ci) GR-027+GR-029 (mocks supabase + e2e-logado workflow_run); dirty — precisa resolver conflito; auto_merge=SQUASH |

---

## 🚫 BLOQUEADAS — REQUEREM JOAQUIM

| PR | Veredito | Motivo |
|----|----------|--------|
| #2481 | BLOQUEADO_AGUARDANDO_APROVACAO | DDL em produção (WITH CHECK RLS) — corpo diz "AGUARDANDO APROVAÇÃO DO JOAQUIM". auto_merge **desabilitado** (re-desabilitado 2026-11-02T06). |
| #2561 | BLOQUEADO_AGUARDANDO_APROVACAO | DDL em produção (convites departamento RLS) — requer aprovação. |
| #2496 | BLOQUEADO_DDL_WORKFLOW | Feature freeze + DDL em produção sem aprovação. |
| #2562 | BLOQUEADO_FEATURE_FREEZE | feat(lgpd) — feature nova, fora do escopo do freeze. |
| #2565 | BLOQUEADO_DECISAO_HUMANA | CLAUDE.md revisado — conflita com #2557 (ambas tocam CLAUDE.md); PR body diz que #2565 torna #2557 redundante; Joaquim decide qual mergear e qual fechar. |

---

## 🚫 BLOQUEADAS — RLS SEM TESTE

| PR | Motivo |
|----|--------|
| #2551 | Título diz fix(ci) mas contém 3 migrations RLS + 12 arquivos; sem testes Postgres temporário. auto_merge **desabilitado** (re-desabilitado 2026-11-02T06). |

---

## 📝 DRAFT — IGNORADAS (feature freeze)

| PR | Título |
|----|--------|
| #2539 | fix: reconcilia migrations 20261026 (draft) |
| #2553 | feat: Dialog→TalkXDialogShell (draft — feature freeze) |
| #2555 | feat: useTalkXLifecycle (draft — feature freeze) |
| #2556 | feat: E2E reload test URL (draft — feature freeze) |
| #2558 | feat(talkx): trilha navegação (draft — feature freeze) |

---

## 📋 FECHADAS SEM MERGE (63 PRs)

Fechadas por Joaquim em lote em 2026-11-01T23:48-50Z ou anteriormente. Números:
`#1930 #1997 #2051 #2078 #2091 #2095 #2097 #2107 #2111 #2113 #2137 #2146 #2186 #2206 #2233 #2238 #2245 #2249 #2265 #2277 #2279 #2417 #2418 #2426 #2428 #2431 #2445 #2457 #2460 #2461 #2462 #2463 #2465 #2466 #2468 #2469 #2471 #2472 #2473 #2475 #2476 #2478 #2479 #2480 #2483 #2484 #2485 #2486 #2487 #2489 #2491 #2492 #2493 #2495 #2497 #2499 #2500 #2501 #2502 #2503 #2504 #2505 #2552`

---

## 📊 CONTAGEM POR VEREDITO

| Veredito | Contagem |
|----------|----------|
| MERGEADA | 5 |
| AGUARDANDO_CI | 13 |
| AGUARDANDO_CI_APOS_UPDATE | 1 |
| BLOQUEADO_CONFLITO | 1 |
| DRAFT_SKIP | 5 |
| BLOQUEADO_AGUARDANDO_APROVACAO | 2 |
| BLOQUEADO_DDL_WORKFLOW | 1 |
| BLOQUEADO_RLS_SEM_TESTE | 1 |
| BLOQUEADO_FEATURE_FREEZE | 1 |
| BLOQUEADO_DECISAO_HUMANA | 1 |
| FECHADA_SEM_MERGE | 63 |
| **TOTAL** | **94** |

---

## 🔍 LINHA DE BASE (main `a7a53f56`)

- **TypeCheck**: 3 erros no main atual (ratchet baseline=93 histórico)
- **ESLint**: 813 problems (ratchet baseline=820; 7 removidas, 0 novas)
- **Build**: passando
- **Testes unitários**: passando

Fonte: `analise-prs/baseline/` — commit `05c6aca3f` branch `claude/busy-cannon-40szm9`

---

## ⚠️ AUTO_MERGE DESABILITADO EXPLICITAMENTE

| PR | Motivo |
|----|--------|
| #2481 | Corpo diz "AGUARDANDO APROVAÇÃO DO JOAQUIM — DDL em produção" |
| #2551 | BLOQUEADO_RLS_SEM_TESTE — título enganoso; 3 migrations RLS sem testes |

---

## 📋 CRITÉRIO DE ANÁLISE APLICADO

Para cada PR foi verificado:
1. **Validade**: PR ainda faz sentido dado o estado atual do main?
2. **Regressão**: Algum código existente revertido/apagado? Chamadores quebrados? Permissões afrouxadas?
3. **Já implementada**: `git cherry`, patch-id, busca de símbolos/rotas em main, commits posteriores
4. **Regra de negócio**: Coincide, estende ou contradiz a regra vigente?

PRs marcadas AGUARDANDO_CI passaram em todos os 4 critérios.

---

*Progresso salvo em `analise-prs/progresso.json` | Dossies individuais em `analise-prs/dossies/`*
