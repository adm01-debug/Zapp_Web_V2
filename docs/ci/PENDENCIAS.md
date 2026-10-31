# PENDENCIAS.md — Bloqueios que requerem acao humana ou dependem de merge

**Atualizado em:** 2026-10-31 01:42Z

---

## 1. `copilot-pull-request-reviewer` — falha permanente por bloqueio de firewall

**Workflow:** `copilot-pull-request-reviewer`  
**Status:** `failure` em todos os runs (ultimo: [41153329470](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41153329470))  
**E required check?** NAO — nao bloqueia merge  

**Causa raiz:** o GitHub Copilot Code Review precisa acessar endpoints externos de IA do GitHub. O runner de CI bloqueia essas URLs por firewall. Nao e corrigivel via codigo.

**Erro exato (job 124394565891, run 41153329470):**
```
##[error]Process completed with exit code 1
```
O job tentou chamar `https://api.business.githubcopilot.com/agents/swe/agent/cleanup`
(e endpoints similares em `api.business.githubcopilot.com`), todos bloqueados pelo firewall do runner.
Referencia para liberar: `https://gh.io/copilot/firewall-config`

**Acao necessaria:** nenhuma. O check nao e required e nao bloqueia nenhum merge.

---

## 2. PR #2407 — CI reiniciado apos branch atualizada com main

**PR:** [#2407](https://github.com/adm01-debug/Zapp_Web_V2/pull/2407)  
**SHA anterior:** `c6cc8cf8` — **todos os 6 required checks passaram** (CI Gate 124402413957, 01:39:42Z)  
**Motivo da atualizacao:** PR #2343 mergeou na main em 01:37:35Z (2 segundos antes do E2E concluir), PR voltou a ficar `behind` — `github_update_pr_branch` acionado em 01:42Z  
**auto_merge:** squash ativo — mergeara automaticamente quando os 6 required checks passarem no novo SHA  

**Prova do codigo correto:** SHA `d0e624ba` e SHA `c6cc8cf8` — ambos com todos os 6 required checks ✅.

**Apos o merge automatico, o agente deve:**
1. Verificar o run de `deploy-functions.yml` disparado pelo push na main — confirmar `conclusion=success`
2. Disparar `db-live-guard.yml` via `workflow_dispatch` na main e confirmar `conclusion=success`
3. Atualizar este arquivo e o `RELATORIO_CI.md` com os run IDs reais de ambos os workflows

**O que o Joaquim precisa fazer:** nenhuma acao — o merge sera automatico quando o CI terminar.

---

## 3. Unit tests e E2E — baseline local nao executado completamente

**Motivo:** unit tests levam 40+ minutos localmente; E2E requerem instancia Supabase ao vivo. Ambos foram validados via CI run 41153322581 (SHA `c6cc8cf8`, todos os 3 shards de unit tests ✅ e E2E ✅). A correcao afeta somente `.github/workflows/deploy-functions.yml`.

**Acao necessaria:** nenhuma. O CI e a prova definitiva.

---

*Itens resolvidos sao removidos deste arquivo.*
