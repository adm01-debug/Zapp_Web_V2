# PENDENCIAS.md — Bloqueios que requerem acao humana ou dependem de merge

**Atualizado em:** 2026-10-31 02:10Z

---

## 1. `copilot-pull-request-reviewer` — falha permanente por bloqueio de firewall

**NAO E REQUIRED CHECK — NAO BLOQUEIA MERGE NEM A CONCLUSAO DESTA TAREFA**

**Workflow:** `copilot-pull-request-reviewer`  
**Status:** `failure` em todos os runs — este check nao consta nos 6 required checks obrigatorios da branch `main`.

**Evidencia nos dois ultimos SHAs da PR #2407:**

| SHA | Run ID | Job ID | Conclusao | Hora |
|---|---|---|---|---|
| `c6cc8cf8` | [41153329470](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41153329470) | 124394565891 | `failure` | 01:06:10Z |
| `d8426a2d` | [41156559736](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41156559736) | 124404528834 | `failure` | 01:46:13Z |

**Erro exato (ambos os runs):**
```
##[error]Process completed with exit code 1
```
O job tentou chamar `https://api.business.githubcopilot.com/agents/swe/agent/cleanup`
(e endpoints similares em `api.business.githubcopilot.com`), todos bloqueados pelo firewall do runner.

**Por que nao bloqueia a conclusao:**
- O GitHub exibe os 6 required checks que bloqueiam merge: `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`. O `copilot-pull-request-reviewer` nao esta nessa lista.
- A PR #2407 tem `auto_merge=squash` ativo e vai mergear automaticamente quando os 6 required checks passarem — o `copilot` failure nao impede o merge.
- O erro e de firewall do runner do CI (nao alcanca `api.business.githubcopilot.com`), nao de codigo. Nao e corrigivel via codigo neste repositorio.

**Referencia para configurar o firewall:** `https://gh.io/copilot/firewall-config`  
**Acao necessaria:** nenhuma. Este bloqueio de PENDENCIAS existe apenas para documentar formalmente que o check e conhecido, nao e required e nao pode ser corrigido via codigo.

---

## 2. PR #2407 — CI rodando no SHA d8426a2d; pos-merge: verificar deploy-functions.yml e db-live-guard.yml

**PR:** [#2407](https://github.com/adm01-debug/Zapp_Web_V2/pull/2407)  
**SHA atual:** `d8426a2d` (3o merge commit com main: PR #2343 mergeou em 01:37:35Z)  
**Run CI:** [41156550407](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41156550407) (rerun apos cancelamento em 01:58:47Z; jobs recolocados em fila em 02:01:19Z)

**Por que os passos pos-merge nao podem ser executados agora:**  
O CI Gate (required check que agrega os 6 obrigatorios) ainda nao fechou — os seguintes jobs estao `queued` desde 02:01:19Z:

| Job | Job ID | Status desde |
|---|---|---|
| Unit Tests (2/3) | 124409115206 | queued 02:01:19Z |
| Unit Tests (3/3) | 124409115400 | queued 02:01:19Z |
| E2E Tests (Playwright) | 124409115007 | queued 02:01:19Z |

**Jobs ja concluidos neste run:**

| Check | Job ID | Conclusao | Hora |
|---|---|---|---|
| Security Audit | 124409141378 | ✅ success | 01:49:21Z |
| TypeCheck | 124409116638 | ✅ success | 01:51:27Z |
| Node CI Scripts | 124409116493 | ✅ success | 01:54:34Z |
| Unit Tests (1/3) | 124409115980 | ✅ success | 01:58:42Z |
| Contrato DB offline | 124404498540 | ✅ success | 01:58:04Z |
| Replay local das migrations | 124404498612 | ✅ success | 01:55:13Z |

**Motivo do cancelamento anterior:**  
Os jobs Unit Tests (2/3, 3/3) e E2E foram cancelados em 01:58:47Z quando o worker perdeu a conexao — nao houve falha de codigo. Os mesmos jobs foram recolocados em fila via `rerun_failed_jobs` em 02:01:19Z com o codigo identico.

**Prova do codigo correto:**  
SHAs anteriores `d0e624ba` (CI Gate 124393241622 ✅ 00:58:49Z) e `c6cc8cf8` (CI Gate 124402413957 ✅ 01:39:42Z) — ambos com o mesmo codigo de fix — passaram todos os 6 required checks.

**Apos o merge automatico, o agente deve:**
1. Verificar o run de `deploy-functions.yml` disparado pelo push na main — confirmar `conclusion=success`
2. Disparar `db-live-guard.yml` via `workflow_dispatch` na main e confirmar `conclusion=success`
3. Atualizar `docs/ci/RELATORIO_CI.md` com os run IDs reais de ambos os workflows

**O que o Joaquim precisa fazer:** nenhuma acao — o merge sera automatico quando o CI Gate fechar.

---

## 3. Unit tests e E2E — baseline local nao executado completamente

**Motivo:** unit tests levam 40+ minutos localmente; E2E requerem instancia Supabase ao vivo. Ambos foram validados via CI runs:
- Run [41150191456](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41150191456) — SHA `d0e624ba`: 3/3 shards unit tests ✅ e E2E ✅
- Run [41153322581](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41153322581) — SHA `c6cc8cf8`: todos os required checks ✅

A correcao afeta somente `.github/workflows/deploy-functions.yml` — nenhum codigo testado pelo vitest ou pelo Playwright foi modificado.

**Acao necessaria:** nenhuma. O CI e a prova definitiva.

---

*Itens resolvidos sao removidos deste arquivo.*
