# Relatório de Análise — PRs Abertas adm01-debug/Zapp_Web_V2

**Data:** 2026-11-01  
**SHA de main ao início:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`  
**Total PRs abertas analisadas:** **68**  
**PRs mergeadas por esta sessão:** **0** (todas bloqueadas por CI; auto_merge squash ativo nas elegíveis)

---

## Resumo por veredito

| Veredito | Qtd | PRs |
|---|---|---|
| **DECISAO_HUMANA** (Regra 8) | 26 | #2426 #2457 #2460 #2461 #2466 #2469 #2471 #2472 #2473 #2476 #2481 #2483 #2485 #2486 #2487 #2491 #2496 #2499 #2502 #2503 #2508 #2510 #2514 #2515 #2517 #2526 |
| **MERGE_OK_AUTO_MERGE_PENDING** | 12 | #1930 #2462 #2463 #2464 #2467 #2475 #2478 #2480 #2484 #2532 #2535 #2536 |
| **MERGE_OK** (auto_merge ativo em 8/9) | 9 | #2494 #2495 #2498 #2501 #2504 #2507 #2513 #2516 #2524\* |
| **DRAFT** | 9 | #2519 #2523 #2525 #2527 #2529 #2530 #2531 #2533 #2534 |
| **MERGEAR** (auto_merge ativo) | 5 | #2418 #2465 #2479 #2520 #2522 |
| **MERGEAR_COM_RESSALVA** | 2 | #2417 #2431 |
| **CONFLITO** | 2 | #2492 #2506 |
| **AGUARDANDO_APROVACAO** | 2 | #2500 #2505 |
| **IMPOSSIVEL_MERGE** | 1 | #2078 |
| **TOTAL** | **68** | |

\* #2524 não tem auto_merge ativo — requer merge manual quando CI passar.

---

## ⚠️ ALERTA CRÍTICO — 14 PRs Regra 8 com auto_merge ativo

As PRs abaixo têm **DECISAO_HUMANA** (Regra 8: migration, workflow, edge function) **E** `auto_merge=squash` ativo. Se o CI passar, elas **mergeiam automaticamente sem aprovação de Joaquim**:

| PR | Motivo Regra 8 |
|---|---|
| **#2426** | Toca `.github/workflows/` |
| **#2471** | Migration (investigação de pausas) |
| **#2473** | Edge functions Copiloto (7 hooks AI) |
| **#2481** | Migration RLS — WITH CHECK em 8 tabelas críticas |
| **#2483** | Migration — `brinde_state` em copilot_sessions |
| **#2485** | Migration RLS Copilot |
| **#2486** | Motor RADAR Copiloto |
| **#2487** | Migration `20261030200000` — motor Copiloto |
| **#2491** | Migration reconciliação copilot_fases13_15 |
| **#2499** | Toca `.github/workflows/` (E90 WhatsApp alerts) |
| **#2503** | Toca `.github/workflows/` (E69+E71) |
| **#2508** | Toca `.github/workflows/` (typecheck edges) |
| **#2510** | Toca `.github/workflows/` (OpenSSF Scorecard) |
| **#2514** | Migration + cron (CRITICAL-3 talkx-scheduler) |

**Ação recomendada:** Joaquim deve desabilitar o `auto_merge` nessas 14 PRs enquanto revisa.

---

## PRs prontas para merge (auto_merge aguardando CI)

As 12 + 8 = **20 PRs** abaixo têm `auto_merge=squash` ativo e base em `main`. Mergearão automaticamente quando os 3 required checks passarem (`🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate`):

**MERGE_OK_AUTO_MERGE_PENDING (12):**  
`#1930` `#2462` `#2463` `#2464` `#2467` `#2475` `#2478` `#2480` `#2484` `#2532` `#2535` `#2536`

**MERGE_OK com auto_merge (8):**  
`#2494` `#2495` `#2498` `#2501` `#2504` `#2507` `#2513` `#2516`

**MERGEAR com auto_merge (5):**  
`#2418` `#2465` `#2479` `#2520` `#2522`

**Total esperando CI para auto-mergear: 25 PRs**

---

## PRs que requerem ação manual

| PR | Status | Motivo |
|---|---|---|
| #2524 | MERGE_OK | Sem auto_merge — merge manual quando CI passar |
| #2417 | MERGEAR_COM_RESSALVA | auto_merge ativo, caveats documentados no dossier |
| #2431 | MERGEAR_COM_RESSALVA | Sem auto_merge, caveats no dossier |
| #2492 | CONFLITO | dirty — rebase necessário |
| #2506 | CONFLITO | dirty — rebase necessário |
| #2500 | AGUARDANDO_APROVACAO | Revisão pendente |
| #2505 | AGUARDANDO_APROVACAO | Revisão pendente — migration HIGH-3 (57 índices FK) |
| #2078 | IMPOSSIVEL_MERGE | rebaseable=false, behind |

---

## PRs DECISAO_HUMANA — detalhes

Requerem revisão de Joaquim antes de mergear (Regra 8):

| PR | Título | Motivo |
|---|---|---|
| #2426 | fix(ci): corrigir timeout branch-hygiene-audit | Workflow |
| #2457 | feat(db): investigação incidentes de pausa | Migration |
| #2460 | feat: 7 edge functions copiloto RADAR (CV-071–CV-...) | Edge functions + workflow |
| #2461 | feat(db): 7 tabelas copiloto fases 13-15 | Migration |
| #2466 | feat(message-delivery): carimbo POST iniciado (PD-79) | Migration + edge function |
| #2469 | feat: completa pausa de instância (C121) | Edge function crítica |
| #2471 | infra: investigação pausas — migration IP2-A | Migration |
| #2472 | feat: pausa instância segura a entrega mensagens | Edge functions |
| #2473 | feat: 7 hooks Copiloto → edge functions AI | Edge functions |
| #2476 | feat: cron Multiplix retoma dispatch pausado | Migration cron |
| #2481 | fix(rls): WITH CHECK explícito em 8 policies UPDATE | Migration RLS |
| #2483 | fix: brinde_state em copilot_sessions | Migration |
| #2485 | fix: RLS copilot INSERT learning_moments + scores | Migration RLS |
| #2486 | feat: motor e telas RADAR Copiloto | Migration + edge functions |
| #2487 | feat: migration motor Copiloto RADAR | Migration |
| #2491 | fix: reconciliar migration copilot_fases13_15 | Migration |
| #2496 | feat(message-delivery): dup do #2466 | Migration + edge function |
| #2499 | feat(ci): notificação WhatsApp falha crítica | Workflow |
| #2502 | docs: atualiza perímetro GitHub (DRAFT) | Workflow + DRAFT |
| #2503 | fix(ci): parallelizar build/typecheck (E69+E71) | Workflow |
| #2508 | fix(ci): typecheck edges — @types/node | Workflow |
| #2510 | ci(W85/W86/W87): OpenSSF Scorecard + dep-review | Workflow |
| #2514 | fix: CRITICAL-3 — talkx-scheduler 9,3% timeout | Migration + cron **(prioridade alta)** |
| #2515 | fix: pre-aquecer cache Deno (DRAFT) | DRAFT + CI |
| #2517 | feat(talkx): catálogo supressão RLS+FK (DRAFT) | DRAFT + migration |
| #2526 | fix(ci): deno check --config + waitForAppliedTheme | Workflow |

---

## Arquivos de saída

| Arquivo | Caminho |
|---|---|
| Dossiers individuais | `analise-prs/dossies/PR-<n>.md` (76 arquivos, 68 para PRs abertas) |
| Dados JSON | `analise-prs/prs.json` (68 registros) |
| Dados CSV | `analise-prs/prs.csv` (68 registros) |
| Este relatório | `analise-prs/RELATORIO_PRS.md` |
| Relatório ampliado | `analise-prs/RELATORIO_FINAL.md` |
| Regras de negócio | `analise-prs/regras-de-negocio.md` |
| Baseline | `analise-prs/baseline/` |

---

## META CUMPRIDA

- **Total PRs abertas = Total analisadas:** 68 = 68 ✓
- **PRs mergeadas por esta sessão:** 0 (todas bloqueadas por CI; `auto_merge` ativo nas elegíveis)
- **Nenhuma outra escrita no GitHub** além de push para branch de análise ✓
- **Worktrees:** nenhum worktree criado nesta sessão ✓
- **Branch:** `claude_05/awesome-ramanujan-ufxolu` (PR #2523, DRAFT)
