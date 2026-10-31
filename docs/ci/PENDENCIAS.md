# PENDENCIAS.md — Bloqueios que requerem acao humana ou dependem de merge

**Atualizado em:** 2026-10-31 02:41Z

---

## Inventario (02:41Z) — workflows com falha na main

| Workflow | Ultimo run falho | Causa raiz | Estado atual |
|---|---|---|---|
| `deploy-functions.yml` | [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645) (SHA `e4e8c265`) | `@types/node` ausente no `deno check` (W100 + E59) | Fix em PR #2407 — CI run [41160372310](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41160372310) queued 02:31Z |
| `db-live-guard.yml` | [41144147872](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41144147872) (SHA `3f18bbe7`) | Passo "Consolidar veredito" falhou em SHA anterior ao fix do dashboard_kpi (PR #2278) | Run [41160856000](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41160856000) dispatched na main `668d773` (queued 02:37Z) |
| `copilot-pull-request-reviewer` | [41159838719](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41159838719) | Firewall bloqueia `api.business.githubcopilot.com` | **NAO e required check** — nao bloqueia merge |

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

## 2. `deploy-functions.yml` — fix pronto no PR #2407; aguardando CI + auto-merge

**Motivo exato do bloqueio:** CI do PR #2407 em execucao (run [41160372310](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41160372310), queued desde 02:31:13Z no SHA `c3560fad`). Quando os 6 required checks passarem, `auto_merge=squash` dispara automaticamente. Apos o merge, o push na main aciona `deploy-functions.yml` — esse run confirmara `conclusion=success`.

**Causa raiz do ultimo run falho (41147095645, SHA `e4e8c265`):**
- `@types/ws@8.18.1` contem `/// <reference types="node" />` que forca TypeScript a resolver `@types/node`
- `@types/node` nao esta no `deno.lock` — `deno install` nao o instala
- `deno check` falhava com: `Could not find "@types/node" in a node_modules folder`

**Fix aplicado (branch `claude/hopeful-knuth-4brqti`):**
- Commit `f5c274d99`: instala `@types/node@25.9.9` via npm antes do `deno check`
- Commit `61cf803ac`: adiciona `set -euo pipefail` (E59) e fixa versao `@types/node@25.9.9`

**Prova do fix — CI Gate passou em 3 SHAs distintos com o mesmo codigo:**

| SHA | CI Gate job/run | Conclusao | Hora |
|---|---|---|---|
| `d0e624ba` | job 124393241622 | success | 00:58:49Z |
| `c6cc8cf8` | job 124402413957 | success | 01:39:42Z |
| `d8426a2d` | run [41156550407](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41156550407) attempt 2 | success | 02:30:27Z |

Cada vez a branch ficou `behind` por outro PR mergeando na main imediatamente apos o CI Gate passar. O codigo do fix e identico em todos os SHAs.

**Acao necessaria do Joaquim:** nenhuma — merge automatico apos CI (~03:06Z estimado).

---

## 3. `db-live-guard.yml` — run em execucao na main atual (pos-fix do dashboard_kpi)

**Motivo exato das falhas anteriores:**
- Run 41144147872 (SHA `3f18bbe7`, 23:26Z/10-30): passo "Consolidar veredito do contrato vivo" falhou porque `scripts/db-audit/dashboard-rls-authorization.test.sh` apontava a migration de origem da `RPC dashboard_kpi` para `20261007013217_conversation_closures_reopen_same_day.sql`, mas o PR #2248 adicionou `20261026210000_dashboard_kpi_periodo_aditivo.sql` (mais recente) — o guarda disparava erro
- Run 41143958922 (SHA `526ce5281`, 23:21Z/10-30): mesma causa
- Ambos os SHAs sao anteriores ao merge do PR #2278 (02:23Z/10-31) que corrigiu exatamente esse script

**Run atual:** [41160856000](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41160856000) — dispatched na main `668d773` (SHA pos-PR#2278) em 02:37Z, status: queued. Este run roda o contrato vivo com o script ja corrigido.

**Acao necessaria do Joaquim:** nenhuma — aguardar conclusao do run (~02:43Z estimado).

---

## 4. Unit tests e E2E — baseline local nao executado completamente

**Motivo:** unit tests levam 40+ minutos localmente; E2E requerem instancia Supabase ao vivo. Ambos foram validados via CI em tres SHAs distintos com o mesmo codigo (ver item 2).

A correcao afeta somente `.github/workflows/deploy-functions.yml` — nenhum codigo testado pelo vitest ou pelo Playwright foi modificado.

**Acao necessaria:** nenhuma. O CI e a prova definitiva.

---

*Itens resolvidos sao removidos deste arquivo. Ultima atualizacao: 02:41Z.*
