# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-31 por sessão de correção de CI (PR #2408)._

---

## 1. DB Live Guard — deriva transitória (todos os 7 passos falharam)

**Run:** [41066127274](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41066127274) — 2026-10-30T13:47:10Z  
**Head SHA:** `fb57b4a5cd071bf86a384d10f143360bd18feb61`

**O que falhou:** Todos os 7 passos do "Contrato DB vivo" falharam.

**Por que não foi corrigido:** O DB Live Guard compara o estado do banco de produção com artefatos do repositório (types.ts, schema-catalog.json, deployment-manifest.json). A falha em todos os passos sugere deriva transitória causada pelo deploy-functions estar parado. Os artefatos podem estar desatualizados.

**O que o Joaquim precisa fazer:**
1. Aguardar o merge do PR que corrige `@types/node` no deploy-functions
2. Após o merge, aguardar o run automático do `deploy-functions.yml` com `conclusion: success`
3. Disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
4. Se ainda falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo tem diferença real

---

## 2. Running Copilot Code Review — falha de firewall interno do Copilot (não corrigível via código)

**Runs confirmados com falha:**
- [41125593441](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41125593441) — múltiplos no dia 2026-10-30
- [41140197413](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41140197413) — conclusão: failure

**Workflow:** workflow dinâmico do GitHub Copilot (não tem arquivo próprio no repo)

**Por que não foi corrigido:** Este é um workflow dinâmico do GitHub Copilot. A falha está no ambiente de execução do Copilot. Não é corrigível via código do projeto.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Copilot → Code Review quais URLs estão sendo bloqueadas
2. Ou aguardar correção do próprio GitHub (pode ser instabilidade temporária do serviço Copilot)

---

## 3. `deploy-functions` — fix em andamento (PR que adiciona @types/node)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Erro exato | `error: Error: Could not find "@types/node" in a node_modules folder.` |
| Run com falha | [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645) (SHA `e4e8c265`) |
| Causa | `@types/ws@8.18.1` possui `/// <reference types="node" />`. O Deno 2.9.5 tenta resolver `@types/node` em `node_modules/` durante o `deno check`. Como `deno.json` não declarava `@types/node` como import `npm:`, o `deno install` não o instalava. |
| Fix | Adicionado `"imports": {"@types/node": "npm:@types/node@^22"}` em `supabase/functions/deno.json` + `--frozen=false` no passo `deno install` do workflow. |
| Status | **PR com auto-merge habilitado — aguardando CI verde.** |

---

## 4. `e2e-logado` — 1 teste quebrado + timeout (na main)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Run com falha | [41141781442](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41141781442) (SHA `526ce528`, 2026-10-30) |
| Erro exato | Job 2: 1 spec falhou (falha real de teste, não infra); Job 1: cancelado por timeout |
| Causa | Falha real de spec na main |
| Por que está bloqueado | Requer diagnóstico e correção do spec quebrado |
| Ação necessária | Investigar qual spec falhou e corrigir a causa raiz. |

---

_Nota: Este arquivo deve ser removido ou atualizado quando os itens acima forem resolvidos._
