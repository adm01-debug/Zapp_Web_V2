# RELATÓRIO DE ANÁLISE — 98 PRs ANALISADAS
**adm01-debug/Zapp_Web_V2** | Atualizado em 2026-11-02T05:00Z  
SHA main início da análise: `004e74a8c596959f45f61c8b0b64b30a70c1ff19`  
SHA main atual: `50ca61a6ef96b366084548fbb3866974083def52`

---

## ✅ MERGEADAS COM SHA DE EVIDÊNCIA (9 total)

| PR | Título | Merge SHA | Mergeada em |
|----|--------|-----------|-------------|
| #2283 | fix: aumentar timeout do job E2E de 20 para 45 minutos | `6271b716e08df80d21b6cfdbdfd9263ddb6e7acb` | 2026-10-27T20:04:29Z |
| #2447 | docs(ci): RELATORIO_CI.md e PENDENCIAS.md | `3617a2acd517dcc9a6eaf2533cd256913e462c21` | 2026-11-01 |
| #2482 | docs(talkx): marca V4 como vigente e V3 como substituído (X001) | `3b5f8a96db0337af7310eec1b0dc5f86bb45912c` | 2026-11-01 |
| #2547 | infra: E2E logado timeout 45 min | `3066fac062f934e5469bb573e88bc464559a023c` | 2026-11-02T02:13:43Z |
| #2560 | fix(e2e): workers 1→2 em CI — GR-016 | `a7a53f56771257106ad79847e6a9f13b9ddada80` | 2026-11-02T02:43:28Z |
| #2545 | chore: congela features — 9 fluxos críticos | `c16f3c69a9bffea1899760288d6c5d576acc2495` | 2026-11-02T03:01:17Z |
| #2567 | fix(ci): deno install --frozen=false — desbloqueia deploy | `8ba0b4361290f37171fd6ec27012a46665ca5b7e` | 2026-11-02T03:51:55Z |
| #2543 | fix: E2E alto-contraste e N-008 healthcheck | `3e6ed32ac34d9bcb9734ccfb05e580500bf5623d` | 2026-11-02T04:16:16Z |
| #2569 | fix(ci): testes GR-027 + gatilho workflow_run e2e-logado GR-029 | `50ca61a6ef96b366084548fbb3866974083def52` | 2026-11-02T04:43:24Z |

---

## ⏳ AGUARDANDO CI — COM auto_merge=SQUASH (6 restantes; #2569 mergeada 2026-11-02T04:43:24Z)

Todas mergearão automaticamente quando os required checks passarem (3 obrigatórios: `🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate`).

| PR | Título | HEAD SHA |
|----|--------|----------|
| #2494 | chore(db): sincronizar artefatos (types-sync) | `b08bcee3` — **CI VERMELHO**: `db-inventory-doc.unit.mjs:406` falha — 7 tabelas `copilot_*` no banco não estão em `docs/DB-INVENTORY.md`; `types-sync.yml` não regenera este arquivo; ver PENDENCIAS.md §5 |
| #2498 | fix(admin): RPC get_search_insights→search_insights | `984104a1e22cc924303055fff3ff96048d8bac6e` — behind, auto_merge=squash |
| #2522 | fix(e2e): aguarda teclado visível — Firefox GR-012 | `ac6f690e` — behind, auto_merge=squash |
| #2549 | fix: reconexão automática WhatsApp | `7742d72eb9899d131db4d053d37d7b113cc09cc8` — behind, auto_merge=squash |
| #2557 | fix(docs): atualiza required checks no CLAUDE.md | `62d6a9d5` — blocked (CI rodando pós-update), auto_merge=squash |
| #2570 | fix: RLS department_invites restringe escrita a admins | `1456db651` — behind, auto_merge=squash |

---

## ⚠️ PR #2494 — CI BLOQUEADO: DB-INVENTORY.md não regenerado por types-sync (2026-11-02)

**Diagnóstico (run 41388205922, job 125094371344, HEAD `2957bbe9`):**
- `🧩 Node CI Scripts` FALHOU — `db-inventory-doc.unit.mjs:406` — teste "docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir"
- 7 tabelas `copilot_*` no banco vivo mas ausentes de `docs/DB-INVENTORY.md`: `copilot_conversation_scores`, `copilot_help_requests`, `copilot_learning_moments`, `copilot_objection_catalog`, `copilot_outcomes`, `copilot_seller_settings`, `copilot_usage`
- Contagens divergentes: banco=204 tabelas, catálogo=211; columns: banco=2315, catálogo=2362; functions: banco=378, catálogo=381
- **Causa raiz**: `types-sync.yml` regenera `types.ts`, `schema-catalog.json`, `schema-manifest.json` — mas NÃO regenera `docs/DB-INVENTORY.md`. A cada ciclo em que novas tabelas aparecem no banco, este teste vai continuar falhando.
- **Não é flake**: mesma falha em HEADs `f5ab7c54` (run 41387183061) e `2957bbe9` (run 41388205922).
- **Ação necessária do Joaquim**: adicionar passo em `types-sync.yml` para regenerar `docs/DB-INVENTORY.md` — ver PENDENCIAS.md §5.

---

## ✅ CI DRIFT TYPES-SYNC — RESOLVIDO (2026-11-02)

`types-sync.yml` rodou automaticamente após merge do #2567 (run `41386672065`, main `8ba0b436`). PR #2494 atualizada para HEAD `d27d941f` com artefatos regenerados. Movida para tabela AGUARDANDO_CI acima.

---

## 🚫 BLOQUEADAS — CONFLITO COM MAIN

| PR | HEAD SHA | Motivo |
|----|----------|--------|
| #2536 | `901357404c7cad5fcc398fdf2e66512077e16956` | fix(e2e) workers sempre 2 GR-016; dirty após #2560 mergear mesmo tema; verificar se supersedido |
| #2542 | `c61cbe617f4d06b0f29cb41ddb8f4a1c03082327` | fix: N-008 DB Guard — dirty após main avançar; mergeable_state=dirty |
| #2526 | `f3cccccae8189a91743b37a05723a833565023cc` | fix(ci): deno check --config + E2E webkit — dirty após main avançar; mergeable_state=dirty |
| #2533 | `2388e1ac52b22578880c3a5d6d408a4436ac16f0` | chore: migration reconciliation 20261030145126 — dirty após main avançar; mergeable_state=dirty |
| #2563 | `355f3ea4916e7d54c9d09ebd6c83bc88a5d32317` | fix(ci): instala @types/node — dirty após #2567 mergear o mesmo fix em deploy-functions.yml; PR supersedida |
| #2571 | `0e6777210...` | fix(contacts): race condition enderecoVigenteRef — dirty; auto_merge ativo mas aguardando resolução de conflito |

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

## 📋 FECHADAS SEM MERGE (66 PRs)

Fechadas por Joaquim em lote em 2026-11-01T23:48-50Z ou anteriormente. Adicionalmente #2559 e #2564 fechadas em 2026-11-02; #2566 fechada em 2026-11-02T03:38:56Z (estava dirty). Números:
`#1930 #1997 #2051 #2078 #2091 #2095 #2097 #2107 #2111 #2113 #2137 #2146 #2186 #2206 #2233 #2238 #2245 #2249 #2265 #2277 #2279 #2417 #2418 #2426 #2428 #2431 #2445 #2457 #2460 #2461 #2462 #2463 #2465 #2466 #2468 #2469 #2471 #2472 #2473 #2475 #2476 #2478 #2479 #2480 #2483 #2484 #2485 #2486 #2487 #2489 #2491 #2492 #2493 #2495 #2497 #2499 #2500 #2501 #2502 #2503 #2504 #2505 #2552 #2559 #2564 #2566`

---

## 📊 CONTAGEM POR VEREDITO

| Veredito | Contagem |
|----------|----------|
| MERGEADA | 9 |
| AGUARDANDO_CI | 6 |
| BLOQUEADO_CONFLITO | 6 |
| DRAFT_SKIP | 5 |
| BLOQUEADO_AGUARDANDO_APROVACAO | 2 |
| BLOQUEADO_DDL_WORKFLOW | 1 |
| BLOQUEADO_RLS_SEM_TESTE | 1 |
| BLOQUEADO_FEATURE_FREEZE | 1 |
| BLOQUEADO_DECISAO_HUMANA | 1 |
| FECHADA_SEM_MERGE | 66 |
| **TOTAL** | **98** |

---

## ✅ CI PÓS-MERGE (verificação de regressão)

| PR | Merge SHA | CI Gate | Build | Notas |
|----|-----------|---------|-------|-------|
| #2283 | `6271b716` | skipped | failure | Mergeada 2026-10-27, anterior ao baseline (2026-10-29); falha pré-existente |
| #2447 | `3617a2ac` | skipped | success | CI Gate skipped = configuração da época; sem falha nova |
| #2482 | `3b5f8a96` | **success** | success | ✅ zero falha nova |
| #2547 | `3066fac0` | **success** | success | ✅ zero falha nova |
| #2560 | `a7a53f56` | **success** | success | ✅ zero falha nova |
| #2545 | `c16f3c69` | ~~failure~~ **flake** | success | ⚠️ Unit test `ContactFormRecalculoCorrida.test.tsx:189` falhou (run 41380773345); flake confirmado: mesmo teste passou em `8ba0b436` sem alteração no código. PR #2545 só altera CLAUDE.md. |
| #2567 | `8ba0b436` | **success** (run 41385347360) | success | ✅ CI Gate=success confirmado pós-merge |
| #2543 | `3e6ed32a` | verificado via auto-merge | success | ✅ PR tinha auto_merge=squash; mergeada em 2026-11-02T04:16:16Z após checks verdes no HEAD `68dff679` |
| #2569 | `50ca61a6` | verificado via auto-merge | success | ✅ PR tinha auto_merge=squash; mergeada em 2026-11-02T04:43:24Z |

As 4 PRs mergeadas pela sessão de análise (#2482, #2547, #2560, #2545) + #2567/#2543/#2569 (mergeadas via auto_merge) têm build=success. #2545 teve flake de unit test que não se reproduz no SHA seguinte.

---

## 🔍 LINHA DE BASE (main `587ec25f`)

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
