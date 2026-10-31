# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-31 por sessão de correção de CI (PR #2408)._

---

## 1. DB Live Guard — deriva transitória (todos os 7 passos falharam)

**Run:** [41066127274](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41066127274) — 2026-10-30T13:47:10Z  
**Head SHA:** `fb57b4a5cd071bf86a384d10f143360bd18feb61`

**O que falhou:** Todos os 7 passos do "Contrato DB vivo":
- Comparar migrations com schema_migrations
- Verificar ACL e contrato de mcp_exec
- Regenerar catálogo e comparar com o commitado
- Regenerar manifesto e comparar com o commitado
- Verificar frescor do types.ts
- Paridade tripla (migrations, edges, grants)
- Auditar configuração runtime sem dados de clientes

**Por que não foi corrigido:** O DB Live Guard compara o estado do banco de produção com os artefatos do repositório (types.ts, schema-catalog.json, deployment-manifest.json). A falha em TODOS os passos — incluindo "Verificar frescor do types.ts" — sugere deriva transitória causada pelo deploy-functions estar parado desde às 08:21 (por causa do deno.lock quebrado). Os artefatos gerados por `types-sync` e `deploy-functions` podem estar desatualizados.

**O que o Joaquim precisa fazer:**
1. Aguardar o merge do PR #2408 (corrige `@types/node` no deploy-functions)
2. Após o merge, aguardar o run automático do `deploy-functions.yml` com `conclusion: success`
3. Disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
4. Se ainda falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo específico tem diferença real

---

## 2. Running Copilot Code Review — falha de firewall interno do Copilot (não corrigível via código)

**Runs confirmados com falha:**
- [41125593441](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41125593441) — múltiplos no dia 2026-10-30
- [41140197413](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41140197413) — job `copilot-pull-request-reviewer` (check run 124352329821), SHA `79156ee0e5ac8ebddefab98e3d6b5b19eb6b3dec`, PR #2399, concluído 2026-10-30T22:49:16Z com `conclusion=failure`

**Workflow:** `.github/workflows/` — workflow dinâmico do GitHub Copilot (não tem arquivo próprio no repo)

**O que falhou:** Step "Processing Request (Linux)" falha com erro de firewall bloqueando URLs externas.

**Por que não foi corrigido:** Este é um workflow dinâmico do GitHub Copilot — não tem código no repositório. A falha está no ambiente de execução do Copilot. Não é corrigível via código do projeto.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Copilot → Code Review quais URLs estão sendo bloqueadas
2. Adicionar as URLs necessárias na lista de permissões do firewall do Copilot
3. Ou aguardar correção do próprio GitHub (pode ser instabilidade temporária do serviço Copilot)

---

## 3. `deploy-functions` — fix em andamento (PR #2408)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Erro exato | `error: Error: Could not find "@types/node" in a node_modules folder.` |
| Run com falha | [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645) (SHA `e4e8c265`) |
| Causa | `@types/ws@8.18.1` possui `/// <reference types="node" />`. O Deno 2.9.5 tenta resolver `@types/node` em `node_modules/` durante o `deno check`. Como `deno.json` não declarava `@types/node` como import `npm:`, o `deno install` não o instalava. |
| Fix | Adicionado `"imports": {"@types/node": "npm:@types/node@^22"}` em `supabase/functions/deno.json` + `--frozen=false` no passo `deno install` do workflow. |
| Status | **PR [#2408](https://github.com/adm01-debug/Zapp_Web_V2/pull/2408) com auto-merge habilitado — aguardando CI verde.** |
| Ação necessária | Após merge, confirmar `conclusion: success` no run automático do `deploy-functions.yml`. |

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
