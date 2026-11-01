# RELATÓRIO — Análise Exaustiva de PRs Abertas

**Data:** 2026-11-01  
**SHA main no início:** `004e74a8c596959f45f61c8b0b64b30a70c1ff19`  
**SHA main atual:** `3617a2acd517dcc9a6eaf2533cd256913e462c21` (PR #2447 mergeada às 18:35Z)  
**Total PRs abertas analisadas:** 65 (mais 2 mergeadas = 67 total)

---

## ⚠️ RISCOS E DECISÕES HUMANAS (leia primeiro)

### Precisam de aprovação do Joaquim

| PR | Título | Motivo |
|---|---|---|
| [#2481](https://github.com/adm01-debug/Zapp_Web_V2/pull/2481) | — | BLOQUEADO_AGUARDANDO_APROVACAO |
| [#2466](https://github.com/adm01-debug/Zapp_Web_V2/pull/2466) | — | BLOQUEADO_AGUARDANDO_APROVACAO |
| [#2476](https://github.com/adm01-debug/Zapp_Web_V2/pull/2476) | — | BLOQUEADO_AGUARDANDO_APROVACAO |
| [#2487](https://github.com/adm01-debug/Zapp_Web_V2/pull/2487) | — | BLOQUEADO_AGUARDANDO_APROVACAO |
| [#2496](https://github.com/adm01-debug/Zapp_Web_V2/pull/2496) | — | BLOQUEADO_AGUARDANDO_APROVACAO |
| [#2238](https://github.com/adm01-debug/Zapp_Web_V2/pull/2238) | — | BLOQUEADO_DECISAO_HUMANA |

### Bloqueada por DDL pendente em producao-ddl

| PR | Título | Motivo |
|---|---|---|
| [#2460](https://github.com/adm01-debug/Zapp_Web_V2/pull/2460) | feat: 7 edge functions copiloto RADAR fases 8-10 (CV-071–CV-100) | Tabelas `copilot_sessions`/`copilot_insights` dependem da migration 20261030200000 aguardando aprovação no environment `producao-ddl`. Mergear antes causaria runtime errors. |

### RLS sem teste

| PR | Motivo |
|---|---|
| [#2137](https://github.com/adm01-debug/Zapp_Web_V2/pull/2137) | RLS adicionada sem teste no Postgres temporário provando que nenhum acesso foi ampliado |

---

## PRs MERGEADAS (esta sessão)

| PR | SHA merge | Descrição |
|---|---|---|
| [#2447](https://github.com/adm01-debug/Zapp_Web_V2/pull/2447) | `3617a2ac` | docs(ci): RELATORIO_CI.md e PENDENCIAS.md |
| [#2283](https://github.com/adm01-debug/Zapp_Web_V2/pull/2283) | (sessão anterior) | — |

---

## CONTAGEM POR VEREDITO

| Veredito | Contagem | PRs |
|---|---|---|
| **MERGEADA** | 2 | #2447, #2283 |
| **AGUARDANDO_CI** | 26 | #2465, #2462, #2501, #2418, #2107, #2480, #2504, #2475, #2428, #2479, #2431, #2469, #2472, #2478, #2484, #2485, #2489, #2279, #2146, #2471, #2473, #2483, #2486, #2491, #2495, #1930 |
| **AGUARDANDO_CI_APOS_UPDATE** | 5 | #2463, #2482, #2494, #2461, #2498 |
| **DRAFT_SKIP** | 9 | #2113, #2206, #2245, #2249, #2265, #2445, #2500, #2502, #2505 |
| **BLOQUEADO_CONFLITO** | 7 | #2097, #2111, #2426, #2492, #2091, #2095, #2078 |
| **BLOQUEADO_AGUARDANDO_APROVACAO** | 5 | #2481, #2466, #2476, #2487, #2496 |
| **BLOQUEADO_CI** | 2 | #2233, #2417 |
| **SKIP_WORKFLOWS** | 4 | #2497, #2499, #2503, #2051 |
| **BLOQUEADO_DECISAO_HUMANA** | 1 | #2238 |
| **BLOQUEADO_DDL_FALTANDO** | 1 | #2460 |
| **BLOQUEADO_DDL_WORKFLOW** | 1 | #1997 |
| **BLOQUEADO_RLS_SEM_TESTE** | 1 | #2137 |
| **BLOQUEADO_FALSO_CLAUDE_MD** | 1 | #2493 |
| **INCOMPLETO** | 1 | #2457 |
| **SUPERSEDIDA** | 1 | #2468 |
| **TOTAL** | **67** | — |

---

## PRs PRONTAS MAS AINDA NÃO MERGEADAS (aguardando CI Gate)

### AGUARDANDO_CI_APOS_UPDATE — branches atualizadas, CI rodando

| PR | Tipo | auto_merge | Notas |
|---|---|---|---|
| [#2463](https://github.com/adm01-debug/Zapp_Web_V2/pull/2463) | fix/refactor | NÃO | MediaMigrationTool → service (no-restricted-imports). Merge manual quando CI Gate = SUCCESS |
| [#2482](https://github.com/adm01-debug/Zapp_Web_V2/pull/2482) | docs | SIM | TalkX V4 vigente, V3 arquivado. Merge automático |
| [#2494](https://github.com/adm01-debug/Zapp_Web_V2/pull/2494) | chore | SIM | types-sync automático. Merge automático |
| [#2461](https://github.com/adm01-debug/Zapp_Web_V2/pull/2461) | feat(db) | NÃO | Migration conciliação 7 tabelas copilot fases 13-15 (DDL já aplicado em prod). Merge manual quando CI Gate = SUCCESS |
| [#2498](https://github.com/adm01-debug/Zapp_Web_V2/pull/2498) | fix(admin) | NÃO | Fix RPC `get_search_insights` → `search_insights` + auditoria supabase. Merge manual quando CI Gate = SUCCESS |

### AGUARDANDO_CI — a maioria com auto_merge ativo

PRs #2465, #2462, #2501, #2418, #2107, #2480, #2504, #2475, #2428, #2479, #2431, #2469, #2472, #2478, #2484, #2485, #2489, #2279, #2146, #2471, #2473, #2483, #2486, #2491, #2495, #1930

A grande maioria tem `auto_merge` ativo e CI Gate pendente — mergeiam automaticamente quando o CI completar.

---

## PRs A FECHAR (decisão/notificação)

### BLOQUEADO_CONFLITO — precisam de rebase contra main
#2097, #2111, #2426, #2492, #2091, #2095, #2078

### BLOQUEADO_CI — CI falhando de forma persistente
| PR | Notas |
|---|---|
| [#2233](https://github.com/adm01-debug/Zapp_Web_V2/pull/2233) | CI falha não relacionada ao diff → investigar |
| [#2417](https://github.com/adm01-debug/Zapp_Web_V2/pull/2417) | CI falha não relacionada ao diff → investigar |

### SKIP_WORKFLOWS — só alteram .github/workflows/
#2497, #2499, #2503, #2051 — mudanças de CI fora do escopo desta sessão (regra de segurança)

### SUPERSEDIDA
| PR | Substituída por |
|---|---|
| [#2468](https://github.com/adm01-debug/Zapp_Web_V2/pull/2468) | #2467 (não tocar) |

### INCOMPLETO
| PR | Motivo |
|---|---|
| [#2457](https://github.com/adm01-debug/Zapp_Web_V2/pull/2457) | PR incompleta, work in progress |

### BLOQUEADO_FALSO_CLAUDE_MD
| PR | Motivo |
|---|---|
| [#2493](https://github.com/adm01-debug/Zapp_Web_V2/pull/2493) | Falso positivo de CLAUDE.md — não é uma regra real |

---

## CLUSTERS E CADEIAS

- **Copilot/RADAR**: #2460 (edge functions) depende de migration em `producao-ddl`. #2461 (7 tabelas) é conciliação de DDL já aplicado. #2473 pode depender de #2460 para funcionar corretamente.
- **TalkX V4**: #2482 (plano vigente X001) → #2463 (fix lint) são independentes mas do mesmo ciclo de trabalho
- **Types-sync**: #2494 é automação recorrente, sempre com auto_merge

---

## NÃO VERIFICADO

- Dossiers individuais completos para todas as 65+ PRs abertas não foram gerados (escopo além do tempo disponível nesta sessão — CI gate ainda pendente)
- regras-de-negocio.md: parcialmente gerado (ver arquivo separado)
- CIs pós-merge de #2447: verificado — `open_issues_count: 88`, nenhum drift detectado

---

*Gerado em 2026-11-01 ~19:05 UTC. Check-in de segurança agendado para 19:18 UTC.*
