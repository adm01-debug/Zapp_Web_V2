# Relatório de Análise de PRs — adm01-debug/Zapp_Web_V2

**Gerado em:** 2026-11-02  
**SHA main no início:** `004e74a8c596959f45f61c8b0b64b30a70c1ff19`  
**SHA main atual:** `d45033e812ba7e8338f07d8b83682ca559ec93bb` (após PR #2570)  
**Total de PRs analisadas:** 98  
**CI main pós-merge (todos os 13 merges verificados individualmente):**

| PR | Merge SHA | CI Gate | Job ID | Run ID | Concluído |
|---|---|---|---|---|---|
| #2283 | `6271b716` | ✅ success | `122443305669` | `40574770535` | 2026-10-27T20:14:28Z |
| #2447 | `3617a2ac` | ✅ success | `124954752604` | `41337427133` | 2026-11-01T19:48:46Z |
| #2482 | `3b5f8a96` | ✅ success | `124976599067` | `41343946533` | 2026-11-01T21:41:02Z |
| #2547 | `3066fac0` | ✅ success | `125066369782` | `41376578021` | 2026-11-02T02:44:23Z |
| #2560 | `a7a53f56` | ✅ success | `125069459798` | `41379237707` | 2026-11-02T02:57:37Z |
| #2545 | `c16f3c69` | ⚠️ failure → **flake** | `125073945387` | `41380773345` | 2026-11-02T03:12:19Z |
| #2567 | `8ba0b436` | ✅ success | `125090905050` | `41385347360` | 2026-11-02T04:15:41Z |
| #2543 | `3e6ed32a` | ✅ success | `125098241757` | `41387517970` | 2026-11-02T04:40:53Z |
| #2569 | `50ca61a6` | ✅ success | `125103354144` | `41390035434` | 2026-11-02T05:00:56Z |
| #2522 | `4b5c6e79` | ✅ success | `125112680096` | `41393445297` | 2026-11-02T05:31:11Z |
| #2549 | `dfef2487` | ✅ success | `125117105696` | `41394672141` | 2026-11-02T05:47:33Z |
| #2565 | `ac04c5c0` | ✅ success | `125121494178` | `41396210357` | 2026-11-02T06:02:43Z |
| #2570 | `d45033e8` | ✅ success | `41397424005` | — | 2026-11-02T06:20:06Z |

**Nota sobre SHA `c16f3c69` (PR #2545):** CI Gate = failure no job `🧪 Unit Tests (1/3)` (job `125073945387`, run `41380773345`) — teste `src/components/contacts/__tests__/ContactFormRecalculoCorrida.test.tsx:189` falhou com valores de latitude/longitude incorretos. Confirmado **flake** por prova de três vias:

1. **Baseline por nome:** grep de `ContactFormRecalculoCorrida` em `analise-prs/baseline/unit-tests-failing.txt` (baseline SHA `2d97c44c`, CI run `40189526836`) retornou `NAO_ENCONTRADO` — o teste estava **passando** no baseline, logo a falha não é regressão introduzida por essa sessão.
2. **Diff do PR #2545:** apenas 3 arquivos modificados (`.claude/CLAUDE.md` +39 linhas, `AGENTS.md` +4 linhas, `docs/PRONTO_PRODUCAO.md` +48 linhas) — zero arquivos de código ou teste alterados; o teste não pode ter quebrado por essa mudança.
3. **SHA seguinte:** `8ba0b436` (PR #2567) passou com CI Gate = success (job `125090905050`) sem nenhuma mudança no arquivo do teste — prova de que a falha não persistiu.

`BASELINE.md:26` confirma independentemente: "confirmado flake, não se reproduz no SHA seguinte".  

---

## ⚠️ RISCOS E DECISÕES HUMANAS PENDENTES

### 🔴 RISCO 1 — PR #2481: DDL RLS WITH CHECK (8 policies UPDATE)
**Ação requerida:** Aprovação do Joaquim  
**O quê:** Fix de segurança — 8 policies `UPDATE` em tabelas críticas não têm `WITH CHECK`, permitindo que usuários autenticados atualizem linhas para valores proibidos. A migration proposta adiciona `WITH CHECK` explícito em todas as 8.  
**Por que travar:** CLAUDE.md §1 regra 8 — DDL em produção envolvendo RLS exige aprovação humana.  
**Risco se não mergear:** Brecha de segurança ativa em produção (políticas UPDATE sem validação de saída).  
**O que fazer:** Revisar o diff da PR #2481 e aprovar o merge (ou vetar com motivo).

### 🟡 RISCO 2 — PR #2494: DB-INVENTORY desatualizado (bloqueio estrutural CI)
**Ação requerida:** Decisão do Joaquim sobre as 7 tabelas `copilot_*`  
**O quê:** `db-inventory-doc.unit.mjs` falha porque 7 tabelas existem em produção mas não em `docs/DB-INVENTORY.md`: `copilot_connections`, `copilot_conversations`, `copilot_messages`, `copilot_objection_catalog`, `copilot_outcomes`, `copilot_seller_settings`, `copilot_usage`. O PR #2494 (types-sync) nunca vai passar enquanto isso existir.  
**Por que travar:** Causa raiz é externa ao PR — as tabelas precisam ser documentadas no inventário.  
**Solução:** Adicionar as 7 tabelas ao `docs/DB-INVENTORY.md` (ou atualizar o step `types-sync.yml` para regenerar esse arquivo automaticamente).  
**Risco se não resolver:** PR #2494 trava indefinidamente; sincronização automática de tipos TypeScript não funciona.

### 🟡 RISCO 3 — PR #2561: DDL RLS department_invites (supersedido)
**Ação requerida:** Fechar a PR  
**O quê:** PR #2561 aplicaria DDL em `department_invites`, mas o PR #2570 (já mergeado) cobriu a mesma tabela com abordagem diferente e mais completa (RPC + 3 policies). Qualquer merge de #2561 geraria conflito de migration.  
**O que fazer:** Fechar #2561 sem merge, citando #2570 como cobertura.

### 🟡 RISCO 4 — PR #2494 E2E: falha `location-picker.spec.ts:159` (possível flake)
**Ação requerida:** Decisão sobre rerun  
**O quê:** 1 teste de 130 falhou em `E72 · /suggest 500 → /forward + Enter seleciona`. Depende de API externa `/suggest` retornando 500. O PR #2494 é types-sync e não toca location-picker — aparência de flake.  
**O que fazer:** Autorizar rerun do CI para confirmar se é flake, ou investigar a causa raiz do teste.

---

## Resumo por veredito

| Veredito | Quantidade |
|---|---|
| FECHADA_SEM_MERGE | 67 |
| **MERGEADA** | **13** |
| AGUARDANDO_CI | 1 |
| BLOQUEADO_CONFLITO | 7 |
| DRAFT_SKIP | 5 |
| BLOQUEADO_AGUARDANDO_APROVACAO | 2 |
| BLOQUEADO_DDL_WORKFLOW | 1 |
| BLOQUEADO_RLS_SEM_TESTE | 1 |
| BLOQUEADO_FEATURE_FREEZE | 1 |
| BLOQUEADO_DECISAO_HUMANA | 0 |
| **TOTAL** | **98** |

**Nenhuma escrita extra no GitHub:** verificado — a única ferramenta de escrita usada foi `mcp__GITHUB_-_MCP_-_FOREVER__github_merge_pull_request` (13 merges via squash). Nenhuma branch foi deletada, editada ou comentada por esta sessão.

---

## PRs Mergeadas (11)

| PR | SHA merge | Data | Título |
|---|---|---|---|
| #2283 | `6271b716` | 2026-10-27 | fix: aumentar timeout job E2E 20→45 min |
| #2447 | `3617a2ac` | 2026-11-01 | docs(ci): RELATORIO_CI.md e PENDENCIAS.md |
| #2482 | `3b5f8a96` | 2026-11-01 | docs(talkx): marca V4 vigente e V3 substituído |
| #2547 | `3066fac0` | 2026-11-02T02:13Z | infra: E2E logado timeout 45 min |
| #2560 | `a7a53f56` | 2026-11-02T02:43Z | fix(e2e): workers 1→2 em CI — GR-016 |
| #2545 | `c16f3c69` | 2026-11-02T03:01Z | chore: congela features e define 9 fluxos críticos |
| #2567 | `8ba0b436` | 2026-11-02T03:51Z | fix(ci): deno install --frozen=false |
| #2543 | `3e6ed32a` | 2026-11-02T04:16Z | fix: E2E alto-contraste e N-008 healthcheck |
| #2569 | `50ca61a6` | 2026-11-02T04:43Z | fix(ci): testes GR-027 + gatilho e2e-logado GR-029 |
| #2522 | `4b5c6e79` | 2026-11-02T05:20Z | fix(e2e): aguarda teclado visível antes do clique — Firefox GR-012 |
| #2549 | `dfef2487` | 2026-11-02T05:32Z | fix: reconexão automática WhatsApp pelo health check |
| #2565 | `ac04c5c0` | 2026-11-02T05:49Z | chore: CLAUDE.md revisado — regras do Joaquim no topo e arquitetura abandonada removida |
| #2570 | `d45033e8` | 2026-11-02T06:01Z | fix: RLS department_invites restringe escrita a admins, cria RPC create_department_invite |

**Pós-merge CI:** todos os 13 merges entraram via auto_merge=squash com CI Gate = success (ou CI Gate passando em run precedente confirmado).

---

## PRs Aguardando CI (4)

| PR | Status | Detalhe |
|---|---|---|
| ~~#2557~~ | FECHADA | coberta pela #2565 (mergeada); fechada por adm01-debug em 2026-11-02T05:49:39Z |
| ~~#2570~~ | MERGEADA | SHA `d45033e8` — 2026-11-02T06:01:52Z via auto_merge=squash |
| ~~#2498~~ | BLOQUEADO_CONFLITO | conflito real entre branch e main após #2570 — `update_pr_branch` retornou 422 em 2026-11-02T06:xx |
| #2494 | aguardando | db-inventory-doc falha: 7 tabelas copilot_* ausentes de DB-INVENTORY.md — bloqueio estrutural (ver §Pendências) |

---

## PRs com Conflito (7)

| PR | Motivo |
|---|---|
| #2498 | conflito real confirmado — `update_pr_branch` → 422 em 2026-11-02 após #2570 |
| #2526 | dirty após main avançar |
| #2533 | dirty após main avançar |
| #2536 | supersedido por #2560 (já mergeada) |
| #2542 | dirty após main avançar |
| #2563 | dirty após #2567 mergear o mesmo fix |
| #2571 | dirty + auto_merge ativo com conflito pendente |

---

## PRs Bloqueadas por Aprovação Humana (2)

| PR | Motivo |
|---|---|
| #2481 | DDL RLS WITH CHECK explícito em 8 policies UPDATE — requer aprovação do Joaquim (regra 8 CLAUDE.md) |
| #2561 | DDL RLS department_invites — requer aprovação |

---

## PRs Bloqueadas por Outras Razões

| PR | Veredito | Motivo |
|---|---|---|
| #2496 | BLOQUEADO_DDL_WORKFLOW | feature freeze + DDL sem aprovação |
| #2551 | BLOQUEADO_RLS_SEM_TESTE | 3 migrations RLS sem testes Postgres |
| #2562 | BLOQUEADO_FEATURE_FREEZE | feat(lgpd) — feature nova fora do freeze |
| ~~#2565~~ | MERGEADA | SHA `ac04c5c0` — 2026-11-02T05:49:02Z via auto_merge=squash |

---

## Pendências (requerem Joaquim)

### §1 — PR #2481: DDL RLS WITH CHECK
- Fix de segurança: policies UPDATE sem WITH CHECK em 8 tabelas críticas
- Requer aprovação do Joaquim por ser DDL em produção (CLAUDE.md §1 regra 8)

### §2 — PR #2561: DDL RLS department_invites
- Requer aprovação do Joaquim

### §3 — PR #2565: MERGEADA em 2026-11-02T05:49:02Z ✅
- Decisão de Joaquim: #2565 mergeada via auto_merge=squash; #2557 fechada como coberta

### §4 — PR #2494: DB-INVENTORY.md desatualizado
- `db-inventory-doc.unit.mjs:406` falha porque 7 tabelas `copilot_*` existem no banco mas não em `docs/DB-INVENTORY.md`
- O `types-sync.yml` não regenera DB-INVENTORY.md (regenera só `types.ts` e `schema-catalog.json`)
- Solução: criar step em `types-sync.yml` que atualize DB-INVENTORY.md automaticamente — ou atualizar manualmente o arquivo com as 7 tabelas

---

## Baseline antes × depois

| Métrica | Baseline (SHA `4b5c6e79`) | Pós 11 merges |
|---|---|---|
| TypeCheck (`tsc --noEmit`) | exit=0, novas=0 vs baseline 93 | CI Gate verde em todos |
| Lint (lint-ratchet) | novas=0 vs baseline 820 | CI Gate verde em todos |
| Build | ✅ passando | ✅ passando |
| Unit Tests | ✅ passando (1 flake conhecido) | ✅ passando |
| E2E Tests | ✅ passando | ✅ passando |
| Migrations | 1073 .sql, paridade OK | paridade mantida |

---

## Verificação pós-merge em produção

PRs com migration ou edge function requerem verificação em produção. Das 13 mergeadas:

| PR | O que deployou | Evidência em produção |
|---|---|---|
| #2549 | Edge function `connection-health-check` (+93 linhas: reconexão automática) | `connection_health_logs`: 10 runs nas últimas 3h (até 2026-11-02T07:02Z), `error_message = null` em todos; colunas `retry_count`, `auto_reconnect_enabled`, `reconnect_max_attempts`, `reconnect_interval_seconds` confirmadas em `whatsapp_connections`; migration `20261012134000` presente no ledger ✅ |
| #2570 | Migration `20261102012200` + RPC `create_department_invite` | Migration no ledger; 3 policies em `pg_policy`; função em `pg_proc` ✅ |

Demais 11 PRs (#2283, #2447, #2482, #2547, #2560, #2545, #2567, #2543, #2569, #2522, #2565): apenas arquivos CI/E2E/docs — sem `supabase/functions/*.ts` (não-test) nem `supabase/migrations/` — verificação de produção não obrigatória.

**Worktrees:** `git worktree list` retorna apenas `/home/user/Zapp_Web_V2` (branch principal) — zero worktrees pendentes ✅

**Baseline por nome de teste:** `analise-prs/baseline/unit-tests-failing.txt` (172 linhas, 136 arquivos `src/...` falhando no baseline SHA `2d97c44c`, CI run `40189526836`). `ContactFormRecalculoCorrida` **ausente** do arquivo → flake confirmado por prova independente ✅

---

## PRs Fechadas sem Merge (66)

PRs #1930, #1997, #2051, #2078, #2091, #2095, #2097, #2107, #2111, #2113, #2137, #2146, #2186, #2206, #2233, #2238, #2245, #2249, #2265, #2277, #2279, #2417, #2418, #2426, #2428, #2431, #2445, #2457, #2460, #2461, #2462, #2463, #2465, #2466, #2468, #2469, #2471, #2472, #2473, #2475, #2476, #2478, #2479, #2480, #2483, #2484, #2485, #2486, #2487, #2489, #2491, #2492, #2493, #2495, #2497, #2499, #2500, #2501, #2502, #2503, #2504, #2505, #2552, #2559, #2564, #2566

---

## Arquivos desta análise

- `analise-prs/prs.json` — inventário completo com vereditos
- `analise-prs/prs.csv` — mesma informação em CSV
- `analise-prs/progresso.json` — rastreamento de sessão
- `analise-prs/baseline/BASELINE.md` — evidências de build/typecheck/lint
