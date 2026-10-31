# PENDENCIAS.md — Bloqueios que requerem acao humana

**Atualizado em:** 2026-10-31 01:09Z

---

## 1. `copilot-pull-request-reviewer` — falha permanente por bloqueio de firewall

**Workflow:** `copilot-pull-request-reviewer` (job no `ci.yml`)  
**Status:** `failure` em todos os runs  
**E required check?** NAO — nao bloqueia merge  
**Run de referencia:** [41149760699](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41149760699)

**Causa raiz:**  
O GitHub Copilot Code Review precisa acessar URLs externas para funcionar (endpoints de IA do GitHub). O ambiente de execucao do runner bloqueia essas URLs por firewall. Nao e possivel corrigir via codigo.

**O que o Joaquim precisa fazer:**  
Nao ha acao necessaria — o check nao e required e nao bloqueia nenhum merge. Documentado apenas por transparencia. Se quiser eliminar o job do CI completamente, pode remover o step `copilot-pull-request-reviewer` do `ci.yml`, mas isso requer decisao deliberada.

---

## 2. `db-live-guard.yml` — manifesto remoto potencialmente divergente

**Workflow:** `db-live-guard.yml`  
**Status:** pendente — sera redisparado apos merge da PR #2407  
**Acao:** apos merge e deploy das edge functions (automatico), redesparar `db-live-guard.yml` via `workflow_dispatch` para confirmar que o manifesto esta sincronizado com a producao.

**O que o Joaquim precisa fazer:**  
Nenhuma acao imediata — o agente vai redesparar o workflow apos o merge. Se o run falhar por "manifesto divergente", sera necessario rodar `node scripts/db-audit/check-migration-drift.mjs` localmente ou aguardar o `types-sync` regenerar o catalogo.

---

## 3. PR #2407 — CI em andamento no SHA c6cc8cf8

**PR:** [#2407](https://github.com/adm01-debug/Zapp_Web_V2/pull/2407)  
**Status atual:** CI em andamento no SHA `c6cc8cf8` (merge commit com main `4dc8adbf`), iniciado 01:02:13Z  
**Checks concluidos:** Replay local das migrations (success, 01:08Z), Security Audit (success, 01:06Z)  
**Checks em andamento:** TypeCheck, Node CI Scripts, Unit Tests (1/3, 2/3, 3/3), E2E, Contrato DB offline  
**auto_merge:** squash habilitado — mergeara automaticamente quando todos os 6 required checks passarem  

**Historico:**
- SHA original `d0e624ba`: todos os 6 required checks passaram (CI Gate success 00:58:49Z)
- Branch ficou BEHIND da main (PR #2385 mergeou em 00:55:39Z com strict=true)
- Branch atualizada com `update-pr-branch` em 01:02Z

**O que o Joaquim precisa fazer:**  
Nenhuma acao — o agente vai verificar o resultado e completar os passos pos-merge automaticamente.

---

*Itens resolvidos sao removidos deste arquivo.*
