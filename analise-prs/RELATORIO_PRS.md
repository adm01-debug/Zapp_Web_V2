# RELATÓRIO DE ANÁLISE — TODAS AS 67 PRs ABERTAS
**adm01-debug/Zapp_Web_V2** | Gerado em 2026-11-01T22:05Z  
SHA main início: `004e74a8c596959f45f61c8b0b64b30a70c1ff19`  
SHA main atual: `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

---

## ⚠️ RISCOS E DECISÕES HUMANAS

| PR | Veredito | Razão |
|----|----------|-------|
| #2238 | BLOQUEADO_DECISAO_HUMANA | Decisão de produto requerida |
| #2137 | BLOQUEADO_RLS_SEM_TESTE | RLS alterado sem prova em Postgres temporário |
| #2097 | BLOQUEADO_CONFLITO | Conflito com main — rebase necessário |
| #2095 | BLOQUEADO_CONFLITO | Conflito com main |
| #2091 | BLOQUEADO_CONFLITO | Conflito com main |
| #2078 | BLOQUEADO_CONFLITO | Conflito com main |
| #2111 | BLOQUEADO_CONFLITO | Conflito com main |
| #2492 | BLOQUEADO_CONFLITO | Conflito com main |
| #2426 | BLOQUEADO_CONFLITO | Conflito com main |
| #2460 | BLOQUEADO_DDL_FALTANDO | DDL referenciado mas arquivo de migration ausente |
| #1997 | BLOQUEADO_DDL_WORKFLOW | Workflow de DDL bloqueado aguardando aprovação manual |
| #2493 | BLOQUEADO_FALSO_CLAUDE_MD | Modificação indevida de CLAUDE.md |
| #2457 | INCOMPLETO | Implementação incompleta — funcionalidade pela metade |
| #2468 | SUPERSEDIDA | Substituída por PR mais recente |

---

## ✅ MERGEADAS COM SHA DE EVIDÊNCIA

| PR | Título | Merge SHA | Mergeada em |
|----|--------|-----------|-------------|
| #2283 | fix: aumentar timeout do job E2E de 20 para 45 minutos | `6271b716e08df80d21b6cfdbdfd9263ddb6e7acb` | 2026-10-27T20:04:29Z |
| #2447 | docs(ci): RELATORIO_CI.md e PENDENCIAS.md | `3617a2acd517dcc9a6eaf2533cd256913e462c21` | 2026-11-01 |
| #2482 | docs(talkx): marca V4 como vigente e V3 como substituído (X001) | `3b5f8a96db0337af7310eec1b0dc5f86bb45912c` | 2026-11-01 |

---

## ⏳ AGUARDANDO CI (outage GitHub Actions ~20:30Z-22:00Z 2026-11-01)

> Todas as PRs abaixo têm CI travado por outage do GitHub Actions. Quando CI ficar verde, as PRs com `auto_merge=squash` se mergeiam automaticamente; as sem auto_merge precisam de merge manual.

### Com auto_merge=squash (merge automático quando CI verde)

| PR | HEAD SHA | Veredito CI esperado |
|----|----------|---------------------|
| #2418 | `108128f371cb945fb4b99f2a99d465ae85fe1764` | AGUARDANDO_CI |
| #2462 | `f258d5acf83cf1e8d571f1a640e04e18d35447a7` | AGUARDANDO_CI |
| #2465 | `0eed116b72533a0be5a7752307668d0f6cab8f5c` | AGUARDANDO_CI |
| #2471 | `14d1417a783ad1989beec00f25139d2cb44be86b` | AGUARDANDO_CI |
| #2475 | `ac145076c027fe78a721270a5932dc5645e9ad48` | AGUARDANDO_CI |
| #2478 | `c46e71fa1c92af8723ebfebdc8be1e4dd98fea00` | AGUARDANDO_CI |
| #2479 | `7f572d1f83b034c07c0cee8e2290e1e26c1f118a` | AGUARDANDO_CI |
| #2480 | `c5178c37dddaffa096fe8fa4a4228f4d8a128c64` | AGUARDANDO_CI |
| #2483 | `bbccc427fd38446d07ef4cbcc5519065e693728e` | AGUARDANDO_CI |
| #2484 | `de9584f20314ff94438b8cd5f007a7f6aadf19a8` | AGUARDANDO_CI |
| #2485 | `7e33fb553251711422334284ffe095153e0bf551` | AGUARDANDO_CI |
| #2486 | `34d14be76610ef39bbaf376977ef97967e9e931e` | AGUARDANDO_CI |
| #2489 | `e5fd0eb9a63b2cd01f063c9781b515367ef0384b` | AGUARDANDO_CI |
| #2491 | `07ac5c6f0550bb12ffa990435d8be820bad2d251` | AGUARDANDO_CI |
| #2495 | `4b780aaf465aef27c92d3d38a1a02bdb98ca60b7` | AGUARDANDO_CI |
| #2501 | `c6ddabeac652e3bb4a21402a82bc00b3f0b7160b` | AGUARDANDO_CI |
| #2504 | `f67082c37ce35496f366705a639465e01200b71f` | AGUARDANDO_CI |
| #1930 | `1b904f6a1f9e177dd7e55533645bc9ddb3068c7f` | AGUARDANDO_CI |

### Sem auto_merge (merge manual quando CI verde)

| PR | HEAD SHA | Estado GraphQL |
|----|----------|---------------|
| #2431 | `4940f384757f7921b3eac8d29f2cc9c40ee602a0` | BLOCKED (CI queued) |
| #2469 | `4d77db544fa415138e367303efffe1dba87eadbe` | BLOCKED (CI queued) |
| #2472 | `5c759d8f1bb355db7ae44b1a98df4f310872078f` | BLOCKED (CI queued) |
| #2473 | `7a6c255646a735687218f8a5775bca00e4375cc2` | BLOCKED (CI queued) |

### AGUARDANDO_CI_APOS_UPDATE (ci.yml reiniciou após outage)

| PR | HEAD SHA | ci.yml iniciou | Estado |
|----|----------|---------------|--------|
| #2463 | `8fa57120c82c254d58ad1f4267fc3673f3d3bd74` | 21:58Z | queued |
| #2461 | `7a8bea7d4b974bec52e1dd2eda37b67fe1b2fe37` | 22:01Z | queued |
| #2498 | `eb03117a823947804ba1659449968714c36b4ac1` | não iniciou | só db-guard |
| #2494 | (verificar) | — | AGUARDANDO_CI_APOS_UPDATE |

---

## 🚫 BLOQUEADAS (não mergear)

### Conflito com main
| PR | Motivo |
|----|--------|
| #2078 | Conflito — rebase necessário |
| #2091 | Conflito — rebase necessário |
| #2095 | Conflito — rebase necessário |
| #2097 | Conflito — rebase necessário |
| #2107 | DIRTY — mergeStateStatus=DIRTY (GraphQL 22:04Z) |
| #2111 | Conflito — rebase necessário |
| #2146 | Conflito — update_pr_branch 422 (22:20Z) |
| #2279 | Conflito — update_pr_branch 422 (22:20Z) |
| #2426 | Conflito — rebase necessário |
| #2428 | Conflito — update_pr_branch 422 (22:20Z) |
| #2492 | Conflito — rebase necessário |

### Aguardando aprovação humana
| PR | Motivo |
|----|--------|
| #2466 | Decisão de produto pendente |
| #2476 | Decisão de produto pendente |
| #2481 | Decisão de produto pendente |
| #2487 | Decisão de produto pendente |
| #2496 | Decisão de produto pendente |

### CI com falha real
| PR | Motivo |
|----|--------|
| #2233 | CI vermelho — falha real (não outage) |
| #2417 | CI vermelho — falha real |

### Outras razões
| PR | Veredito | Motivo |
|----|----------|--------|
| #1997 | BLOQUEADO_DDL_WORKFLOW | Workflow DDL aguarda aprovação humana `producao-ddl` |
| #2137 | BLOQUEADO_RLS_SEM_TESTE | RLS sem prova em Postgres temporário |
| #2238 | BLOQUEADO_DECISAO_HUMANA | Decisão de produto/negócio |
| #2460 | BLOQUEADO_DDL_FALTANDO | Arquivo de migration ausente para o DDL referenciado |
| #2493 | BLOQUEADO_FALSO_CLAUDE_MD | Modifica CLAUDE.md indevidamente |
| #2457 | INCOMPLETO | Implementação incompleta |
| #2468 | SUPERSEDIDA | Substituída por PR mais recente |

---

## 📝 DRAFT — IGNORADAS

| PR |
|----|
| #2113 |
| #2206 |
| #2245 |
| #2249 |
| #2265 |
| #2445 |
| #2500 |
| #2502 |
| #2505 |

---

## ⏭️ SKIP_WORKFLOWS

| PR | Motivo |
|----|--------|
| #2051 | Workflows ignorados (skip CI) |
| #2497 | Workflows ignorados |
| #2499 | Workflows ignorados |
| #2503 | Workflows ignorados |

---

## 📊 CONTAGEM POR VEREDITO

| Veredito | Contagem |
|----------|----------|
| MERGEADA | 3 |
| AGUARDANDO_CI | 22 |
| AGUARDANDO_CI_APOS_UPDATE | 4 |
| DRAFT_SKIP | 9 |
| BLOQUEADO_CONFLITO | 11 |
| BLOQUEADO_AGUARDANDO_APROVACAO | 5 |
| BLOQUEADO_CI | 2 |
| SKIP_WORKFLOWS | 4 |
| BLOQUEADO_DECISAO_HUMANA | 1 |
| BLOQUEADO_DDL_FALTANDO | 1 |
| BLOQUEADO_DDL_WORKFLOW | 1 |
| BLOQUEADO_RLS_SEM_TESTE | 1 |
| BLOQUEADO_FALSO_CLAUDE_MD | 1 |
| INCOMPLETO | 1 |
| SUPERSEDIDA | 1 |
| **TOTAL** | **67** |

---

## 📋 CRITÉRIO DE ANÁLISE APLICADO

Para cada PR foi verificado:
1. **Validade**: PR ainda faz sentido dado o estado atual do main?
2. **Regressão**: Algum código existente revertido/apagado? Chamadores quebrados? Permissões afrouxadas?
3. **Já implementada**: `git cherry`, patch-id, busca de símbolos/rotas em main, commits posteriores
4. **Regra de negócio**: Coincide, estende ou contradiz a regra vigente?

PRs marcadas AGUARDANDO_CI passaram em todos os 4 critérios — o único bloqueio é o CI não ter concluído.

---

## 🔍 LINHA DE BASE (main `1252bb5a`)

- **TypeCheck**: 72 erros (baseline 93, -21 via PR #2188)
- **ESLint**: 820 ocorrências (baseline atualizado)
- **Build**: passando
- **Testes unitários**: passando

Fonte: `analise-prs/baseline/` no branch `claude/busy-cannon-40szm9`, commit `0774eadc2`.

---

*Nota: CI do GitHub Actions ficou indisponível ~20:30Z–22:46Z em 2026-11-01. PRs com AGUARDANDO_CI ou AGUARDANDO_CI_APOS_UPDATE aguardam retomada dos runners. As 22 com `auto_merge=squash` se mergeiam automaticamente; as 4 sem precisam de merge manual (#2431, #2461, #2469, #2472 — atenção: #2469×#2472 conflitam no arquivo `_shared/instance_pause.ts`, mergear #2472 antes). Check-in agendado para 22:55Z. Progresso salvo em `analise-prs/progresso.json` commit `0dbba41e3`.*
