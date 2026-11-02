# RELATÓRIO DE ANÁLISE — 91 PRs ANALISADAS
**adm01-debug/Zapp_Web_V2** | Atualizado em 2026-11-02T03:00Z  
SHA main início da análise: `004e74a8c596959f45f61c8b0b64b30a70c1ff19`  
SHA main atual: `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

---

## ✅ MERGEADAS COM SHA DE EVIDÊNCIA

| PR | Título | Merge SHA | Mergeada em |
|----|--------|-----------|-------------|
| #2283 | fix: aumentar timeout do job E2E de 20 para 45 minutos | `6271b716e08df80d21b6cfdbdfd9263ddb6e7acb` | 2026-10-27T20:04:29Z |
| #2447 | docs(ci): RELATORIO_CI.md e PENDENCIAS.md | `3617a2acd517dcc9a6eaf2533cd256913e462c21` | 2026-11-01 |
| #2482 | docs(talkx): marca V4 como vigente e V3 como substituído (X001) | `3b5f8a96db0337af7310eec1b0dc5f86bb45912c` | 2026-11-01 |

---

## ⏳ AGUARDANDO CI — COM auto_merge=SQUASH

Todas mergearão automaticamente quando os 3 required checks passarem:
`✅ CI Gate (required check)`, `🏗️ Build`, `🔎 TypeCheck`

| PR | Título (resumo) | HEAD SHA |
|----|-----------------|----------|
| #1930 | — aguardando CI | `1b904f6a1f9` |
| #2418 | — aguardando CI | `108128f371c` |
| #2462 | — aguardando CI | `f258d5acf83` |
| #2465 | — aguardando CI | `0eed116b725` |
| #2471 | — aguardando CI | `14d1417a783` |
| #2475 | — aguardando CI | `ac145076c02` |
| #2478 | — aguardando CI | `c46e71fa1c9` |
| #2479 | — aguardando CI | `7f572d1f83b` |
| #2480 | — aguardando CI | `c5178c37ddd` |
| #2483 | — aguardando CI | `bbccc427fd3` |
| #2484 | — aguardando CI | `de9584f2031` |
| #2485 | — aguardando CI | `7e33fb55325` |
| #2486 | — aguardando CI | `34d14be7661` |
| #2491 | — aguardando CI | `07ac5c6f055` |
| #2495 | — aguardando CI | `4b780aaf465` |
| #2498 | fix(admin): RPC get_search_insights→search_insights | `eb03117a823` |
| #2501 | — aguardando CI | `c6ddabeac65` |
| #2504 | — aguardando CI | `f67082c37ce` |
| #2522 | fix(e2e): aguarda teclado visível (Firefox GR-012) | `06a692502df` |
| #2526 | fix(ci): deno check --config + E2E webkit | — |
| #2533 | chore: migration reconciliation 20261030145126 | — |
| #2536 | fix(e2e): workers sempre 2 — timeout Email fixture | — |
| #2542 | fix: N-008 DB Guard N008_POSTGRES_IMAGE | — |
| #2543 | fix: E2E alto-contraste e N-008 healthcheck | — |
| #2545 | chore: congela features — 9 fluxos críticos | — |
| #2547 | infra: E2E logado timeout 45 min | — |
| #2549 | fix: reconexão automática WhatsApp | — |
| #2557 | fix(docs): atualiza required checks no CLAUDE.md | — |
| #2559 | fix(ci): corrige mocks supabase e dependência migrations | — |
| #2560 | fix(e2e): workers 1→2 em CI — GR-016 | — |
| #2563 | fix(ci): instala @types/node via npm após deno install | `355f3ea4916` |

---

## ⏳ AGUARDANDO CI — SEM auto_merge (merge manual necessário)

| PR | HEAD SHA | Observação |
|----|----------|------------|
| #2431 | `4940f384757` | Sem auto_merge |
| #2469 | `4d77db544fa` | Conflita com #2472 em `_shared/instance_pause.ts` |
| #2472 | `5c759d8f1bb` | Mergear antes de #2469 |
| #2473 | `7a6c255646a` | Sem auto_merge |

---

## ⏳ AGUARDANDO_CI_APOS_UPDATE

| PR | Descrição |
|----|-----------|
| #2461 | CI reiniciado após outage |
| #2463 | CI reiniciado após outage |
| #2494 | CI aguardando após update |

---

## 🚫 BLOQUEADAS — REQUEREM JOAQUIM

| PR | Veredito | Motivo |
|----|----------|--------|
| #2481 | BLOQUEADO_AGUARDANDO_APROVACAO | DDL em produção (WITH CHECK RLS) — corpo diz "AGUARDANDO APROVAÇÃO DO JOAQUIM". auto_merge **desabilitado**. |
| #2561 | BLOQUEADO_AGUARDANDO_APROVACAO | DDL em produção (convites departamento RLS) — requer aprovação. |
| #2496 | BLOQUEADO_DDL_WORKFLOW | Feature freeze + DDL em produção sem aprovação. |
| #2562 | BLOQUEADO_FEATURE_FREEZE | feat(lgpd) — feature nova, fora do escopo do freeze. |
| #2466 | BLOQUEADO_AGUARDANDO_APROVACAO | Decisão de produto pendente. |
| #2476 | BLOQUEADO_AGUARDANDO_APROVACAO | Decisão de produto pendente. |
| #2487 | BLOQUEADO_AGUARDANDO_APROVACAO | Decisão de produto pendente. |

---

## 🚫 BLOQUEADAS — CI VERMELHO (falha real, não outage)

| PR | Motivo |
|----|--------|
| #2233 | CI vermelho — falha real |
| #2417 | CI vermelho — falha real |

---

## 🚫 BLOQUEADAS — CONFLITO COM MAIN

| PR | Motivo |
|----|--------|
| #2078 | Conflito — rebase necessário |
| #2091 | Conflito — rebase necessário |
| #2095 | Conflito — rebase necessário |
| #2097 | Conflito — rebase necessário |
| #2107 | DIRTY — mergeStateStatus=DIRTY |
| #2111 | Conflito — rebase necessário |
| #2426 | Conflito — rebase necessário |
| #2492 | Conflito — rebase necessário |

---

## 🚫 BLOQUEADAS — OUTRAS RAZÕES

| PR | Veredito | Motivo |
|----|----------|--------|
| #1997 | BLOQUEADO_DDL_WORKFLOW | Workflow DDL aguarda aprovação `producao-ddl` |
| #2137 | BLOQUEADO_RLS_SEM_TESTE | RLS alterado sem prova em Postgres temporário |
| #2238 | BLOQUEADO_DECISAO_HUMANA | Decisão de produto/negócio requerida |
| #2460 | BLOQUEADO_DDL_FALTANDO | Arquivo de migration ausente |
| #2493 | BLOQUEADO_FALSO_CLAUDE_MD | Modifica CLAUDE.md indevidamente |
| #2457 | INCOMPLETO | Implementação incompleta |
| #2468 | SUPERSEDIDA | Substituída por PR mais recente |
| #2551 | BLOQUEADO_RLS_SEM_TESTE | Título diz fix(ci) mas contém 3 migrations RLS + 12 arquivos; sem testes Postgres temporário. auto_merge **desabilitado**. |

---

## 📝 DRAFT — IGNORADAS (feature freeze)

| PR | Título |
|----|--------|
| #2113 | draft |
| #2206 | draft |
| #2245 | draft |
| #2249 | draft |
| #2265 | draft |
| #2445 | draft |
| #2500 | draft |
| #2502 | draft |
| #2505 | draft |
| #2539 | fix: reconcilia migrations 20261026 (draft) |
| #2553 | feat: Dialog→TalkXDialogShell (draft — feature freeze) |
| #2555 | feat: useTalkXLifecycle (draft — feature freeze) |
| #2556 | feat: E2E reload test URL (draft — feature freeze) |
| #2558 | feat(talkx): trilha navegação (draft — feature freeze) |

---

## ⏭️ SKIP_WORKFLOWS

| PR | Motivo |
|----|--------|
| #2051 | Workflows ignorados (skip CI) |
| #2497 | Workflows ignorados |
| #2499 | Workflows ignorados |
| #2503 | Workflows ignorados |

---

## 📋 FECHADAS SEM MERGE

| PR | Motivo |
|----|--------|
| #2146 | Fechada sem merge |
| #2186 | Fechada sem merge |
| #2277 | Fechada sem merge |
| #2279 | Fechada sem merge |
| #2428 | Fechada sem merge |
| #2489 | Fechada sem merge |
| #2492 | Fechada sem merge |
| #2552 | Fechada sem merge |

---

## 📊 CONTAGEM POR VEREDITO

| Veredito | Contagem |
|----------|----------|
| MERGEADA | 3 |
| AGUARDANDO_CI | 36 |
| AGUARDANDO_CI_APOS_UPDATE | 3 |
| DRAFT_SKIP | 14 |
| BLOQUEADO_CONFLITO | 7 |
| BLOQUEADO_AGUARDANDO_APROVACAO | 5 |
| BLOQUEADO_CI | 2 |
| SKIP_WORKFLOWS | 4 |
| BLOQUEADO_DECISAO_HUMANA | 1 |
| BLOQUEADO_DDL_FALTANDO | 1 |
| BLOQUEADO_DDL_WORKFLOW | 2 |
| BLOQUEADO_RLS_SEM_TESTE | 2 |
| BLOQUEADO_FALSO_CLAUDE_MD | 1 |
| INCOMPLETO | 1 |
| SUPERSEDIDA | 1 |
| BLOQUEADO_FEATURE_FREEZE | 1 |
| FECHADA_SEM_MERGE | 8 |
| **TOTAL** | **92** |

*Nota: TOTAL 92 inclui PRs fechadas; PRs_ANALISADAS=91 (algumas fechadas não listadas no endpoint open).*

---

## 🔍 LINHA DE BASE (main `1252bb5a`)

- **TypeCheck**: 3 erros no main atual (ratchet baseline=93 histórico)
- **ESLint**: 813 problems (ratchet baseline=820; 7 removidas, 0 novas)
- **Build**: passando
- **Testes unitários**: passando

Fonte: `analise-prs/baseline/` — commit `05c6aca3f` branch `claude/busy-cannon-40szm9`

---

## 📋 CRITÉRIO DE ANÁLISE APLICADO

Para cada PR foi verificado:
1. **Validade**: PR ainda faz sentido dado o estado atual do main?
2. **Regressão**: Algum código existente revertido/apagado? Chamadores quebrados? Permissões afrouxadas?
3. **Já implementada**: `git cherry`, patch-id, busca de símbolos/rotas em main, commits posteriores
4. **Regra de negócio**: Coincide, estende ou contradiz a regra vigente?

PRs marcadas AGUARDANDO_CI passaram em todos os 4 critérios.

---

## ⚠️ AUTO_MERGE DESABILITADO EXPLICITAMENTE

| PR | Motivo |
|----|--------|
| #2481 | Corpo diz "AGUARDANDO APROVAÇÃO DO JOAQUIM — DDL em produção" |
| #2551 | BLOQUEADO_RLS_SEM_TESTE — título enganoso; 3 migrations RLS sem testes |

---

*Progresso salvo em `analise-prs/progresso.json` | Dossies individuais em `analise-prs/dossies/`*
