# PENDENCIAS.md — Bloqueios que requerem acao humana ou dependem de merge

**Atualizado em:** 2026-10-31 02:33Z

---

## Inventario reconsultado (02:33Z)

Workflows com falha na `main` (status `failure`, consultado via `list_workflow_runs?branch=main&status=failure`):

| Workflow | Run ID | Conclusao | Causa |
|---|---|---|---|
| `deploy-functions.yml` | [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645) | `failure` | `@types/node` ausente — **CORRIGIDO via PR #2407** (pendente merge) |
| `db-live-guard.yml` | [41144147872](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41144147872) | `failure` | Falha em 23:26Z (10/30); a ser **redisparado pos-merge** — ver item 2 |
| `copilot-pull-request-reviewer` | [41159838719](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41159838719) | `failure` | Firewall — **NAO e required check** — ver item 1 |

---

## 1. `copilot-pull-request-reviewer` — falha permanente por bloqueio de firewall

**NAO E REQUIRED CHECK — NAO BLOQUEIA MERGE NEM A CONCLUSAO DESTA TAREFA**

**Workflow:** `copilot-pull-request-reviewer`  
**Status:** `failure` em todos os runs — nao consta nos 6 required checks obrigatorios da branch `main`.

**Causa raiz:** o runner de CI bloqueia chamadas para `api.business.githubcopilot.com` por firewall. Nao e corrigivel via codigo.

**Evidencia:**

| SHA | Run ID | Conclusao |
|---|---|---|
| `c6cc8cf8` | [41153329470](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41153329470) | `failure` |
| `d8426a2d` | [41156559736](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41156559736) | `failure` |

**Referencia para configurar o firewall:** `https://gh.io/copilot/firewall-config`  
**Acao necessaria:** nenhuma. Documentado formalmente — nao e required check e nao pode ser corrigido via codigo.

---

## 2. PR #2407 — CI rodando no SHA c3560fad; pos-merge: verificar deploy-functions.yml e db-live-guard.yml

**PR:** [#2407](https://github.com/adm01-debug/Zapp_Web_V2/pull/2407)  
**SHA atual:** `c3560fad` (4o merge commit com main; branch atualizada via `update_pr_branch` em 02:31Z)  
**Run CI atual:** [41160372310](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41160372310) (queued desde 02:31:13Z)  
**auto_merge:** squash ativo — mergeara automaticamente quando os 6 required checks passarem

**Prova do codigo correto (runs anteriores com o mesmo codigo):**

| SHA | CI Gate | Conclusao | Hora |
|---|---|---|---|
| `d0e624ba` | job 124393241622 | ✅ success | 00:58:49Z |
| `c6cc8cf8` | job 124402413957 | ✅ success | 01:39:42Z |
| `d8426a2d` | run [41156550407](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41156550407) attempt 2 | ✅ success | 02:30:27Z |

Cada vez a branch ficou `behind` por outro PR mergeando na main imediatamente apos o CI Gate passar. O codigo do fix e identico em todos os SHAs.

**Apos o merge automatico, o agente deve:**
1. Verificar o run de `deploy-functions.yml` disparado pelo push na main — confirmar `conclusion=success`
2. Disparar `db-live-guard.yml` via `workflow_dispatch` na main e confirmar `conclusion=success` (ultimo run [41144147872](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41144147872) falhou em 23:26Z/10-30)
3. Atualizar `docs/ci/RELATORIO_CI.md` com os run IDs reais de ambos os workflows
4. Remover os itens 2 e 3 deste arquivo

**O que o Joaquim precisa fazer:** nenhuma acao — o merge sera automatico quando o CI Gate fechar (~03:06Z estimado).

---

## 3. Unit tests e E2E — baseline local nao executado completamente

**Motivo:** unit tests levam 40+ minutos localmente; E2E requerem instancia Supabase ao vivo. Ambos foram validados via CI em tres SHAs distintos com o mesmo codigo (ver item 2).

A correcao afeta somente `.github/workflows/deploy-functions.yml` — nenhum codigo testado pelo vitest ou pelo Playwright foi modificado.

**Acao necessaria:** nenhuma. O CI e a prova definitiva.

---

*Itens resolvidos sao removidos deste arquivo.*
