# PENDENCIAS.md — Bloqueios que requerem acao humana ou dependem de merge

**Atualizado em:** 2026-10-31 01:18Z

---

## 1. `copilot-pull-request-reviewer` — falha permanente por bloqueio de firewall

**Workflow:** `copilot-pull-request-reviewer`  
**Status:** `failure` em todos os runs (ultimo: [41153329470](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41153329470))  
**E required check?** NAO — nao bloqueia merge  

**Causa raiz:** o GitHub Copilot Code Review precisa acessar endpoints externos de IA do GitHub. O runner de CI bloqueia essas URLs por firewall. Nao e corrigivel via codigo.

**Acao necessaria:** nenhuma. O check nao e required e nao bloqueia nenhum merge. Se desejar remover o job do CI, remova o step `copilot-pull-request-reviewer` do `ci.yml` — mas isso requer decisao deliberada.

---

## 2. PR #2407 — CI em andamento; pos-merge: verificar `deploy-functions.yml` e `db-live-guard.yml`

**PR:** [#2407](https://github.com/adm01-debug/Zapp_Web_V2/pull/2407)  
**SHA:** `c6cc8cf8` (merge commit com main `4dc8adbf`)  
**CI:** Contrato DB offline em andamento desde 01:13:28Z; TypeCheck/Node CI/Unit Tests/E2E na fila desde 01:02:13Z  
**auto_merge:** squash ativo — mergeara automaticamente quando os 6 required checks passarem  

**Por que nao foi mergeada ainda:** o CI reiniciou apos `auto-update-pr-branch` (main avancou com PR #2385 enquanto o SHA anterior `d0e624ba` tinha todos os 6 checks verdes). O SHA `d0e624ba` provou o fix: CI Gate job 124393241622 success em 00:58:49Z.

**Apos o merge automatico, o agente deve:**
1. Verificar o run de `deploy-functions.yml` disparado pelo push na main — confirmar `conclusion=success`
2. Disparar `db-live-guard.yml` via `workflow_dispatch` na main e confirmar `conclusion=success`
3. Atualizar este arquivo e o `RELATORIO_CI.md` com os run IDs reais de ambos os workflows

**O que o Joaquim precisa fazer:** nenhuma acao — o merge sera automatico quando o CI terminar (~02:00Z estimado).

---

## 3. Unit tests e E2E — baseline local nao executado completamente

**Motivo:** unit tests levam 40+ minutos localmente; E2E requerem instancia Supabase ao vivo. Ambos foram validados via CI run 41150191456 (SHA `d0e624ba`, todos os 3 shards de unit tests ✅ e E2E ✅). A correcao afeta somente `.github/workflows/deploy-functions.yml` — nenhum codigo testado pelo vitest ou pelo Playwright foi modificado.

**Acao necessaria:** nenhuma. O CI e a prova definitiva.

---

*Itens resolvidos sao removidos deste arquivo.*
