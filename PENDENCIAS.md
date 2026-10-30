# PENDÊNCIAS CI — Zapp Web V2

> Itens que não podem ser resolvidos automaticamente: dependem de aprovação humana, acesso administrativo ou envolvem infra transiente.
> Atualizado em 2026-10-30.

---

## 1. `db-guard` — ECR rate limit no PostgREST (Regra 8)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Erro exato | `toomanyrequests: Data limit exceeded` (pull do `public.ecr.aws/supabase/postgrest:v14.5`) |
| Causa | ECR público limita pulls anônimos por IP nos runners do GitHub |
| PR de correção | [#2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) — troca `public.ecr.aws/supabase/` → `ghcr.io/supabase/` (W57) |
| Por que está bloqueado | Altera `.github/workflows/db-guard.yml` — **Regra 8** |
| Ação necessária | Joaquim revisar e aprovar a [PR #2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) |

---

## 2. `branch-hygiene-audit` — timeout (Regra 8)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/branch-hygiene-audit.yml` |
| Erro exato | Job encerra por timeout sem `timeout-minutes:` configurado; script percorre todos os branches sem paginação |
| Causa | Sem `timeout-minutes:` no job + sem paginação no script de auditoria |
| Por que está bloqueado | Fix envolve alterar `.github/workflows/branch-hygiene-audit.yml` — **Regra 8** |
| Ação necessária | Joaquim autorizar PR com: (a) `timeout-minutes: 20` no job; (b) paginação no script |

---

## 3. `db-migrate` — environment gate `producao-ddl` (by design)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-migrate.yml` |
| Comportamento | Para em `Waiting` no environment `producao-ddl` aguardando aprovação humana |
| Causa | By design — aprovação obrigatória antes de aplicar DDL em produção |
| Por que está bloqueado | Exige intervenção humana de Joaquim na aba Actions |
| Ação necessária | Joaquim aprovar o environment gate `producao-ddl` quando uma migration estiver pendente |

---

## 4. `e2e-logado` — 1 teste quebrado + timeout (na main)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Run com falha | [41141781442](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41141781442) (SHA `526ce528`, 2026-10-30) |
| Erro exato | Job 2: 1 spec falhou (teste real, não infra); Job 1: cancelado por timeout do job |
| Causa | Falha real de teste na main |
| Por que está bloqueado | Requer diagnóstico e correção do spec quebrado |
| Ação necessária | Run de reconfirmação disparado via `workflow_dispatch` em 2026-10-30. Se ainda falhar: investigar qual spec quebrou e corrigir a causa raiz. A issue "[e2e-logado] Suíte logada quebrada na main" foi aberta para rastrear. |

---

## 5. PR #2354 — `db-guard` (aguardando revisão)

PR [#2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) contém o fix do ECR (item 1 acima).
Está em draft. Joaquim deve revisar, aprovar e mergear.

---

## 6. `db-live-guard` — drift no banco de produção (transitória ou real)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-live-guard.yml` |
| Erro observado | Todos os 7 passos falharam no run pós-merge de 2026-10-30 |
| Causa provável | Deriva transitória de `types.ts`/catálogo/manifesto causada por edge functions sem deploy durante a janela com Deno lock desatualizado |
| Por que está bloqueado | Não é fixável via código de repositório — exige confirmação manual ao vivo |
| Ação necessária | Após o merge do PR desta sessão (fix `"types": []` no deno.json das edge functions), aguardar o próximo run agendado do `db-live-guard` (diário às 06:13 UTC). Se ainda falhar: Joaquim executar `workflow_dispatch` e examinar o Job Summary para identificar qual passo específico acusa drift real |

---

## 7. `Copilot Code Review` — falha interna do serviço (externo)

| Campo | Valor |
|---|---|
| Workflow | Dynamic workflow `copilot-pull-request-reviewer` |
| Erro observado | Job "Processing Request (Linux)" falha com `conclusion: failure` |
| Causa | Falha interna do GitHub Copilot SWE agent — firewall bloqueando URLs externas ou instabilidade do serviço |
| Por que está bloqueado | Serviço externo do GitHub; não há código do repositório para corrigir |
| Ação necessária | Nenhuma imediata — é um reviewer adicional, não é required check. Se persistir por >7 dias, Joaquim pode verificar nas configurações de Copilot do repositório (Settings → Copilot) se há alguma configuração de rede bloqueando |

---

## 8. `deploy-functions` — `@types/node` não encontrado no `deno check`

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Erro exato | `error: Error: Could not find "@types/node" in a node_modules folder. Deno expects the node_modules/ directory to be up to date.` |
| Run com falha | [41144029184](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41144029184) (SHA `3f18bbe7`, main pós-merge PR #2399, 2026-10-30T23:25Z) |
| Causa | `/// <reference types="node" />` em `.d.ts` de `@types/ws@8.18.1` faz o Deno tentar resolver `@types/node` mesmo com `skipLibCheck: true`. O `skipLibCheck` pula a verificação de tipos das `.d.ts`, mas não impede a *resolução de módulo* — o Deno ainda tenta encontrar `@types/node` em `node_modules/` e falha pois `nodeModulesDir: "none"` não o instala. O fix anterior `nodeModulesDir: "auto" → "none"` (PR #2399) foi insuficiente. |
| Fix | `supabase/functions/deno.json`: adicionar `"types": []` em `compilerOptions`. Isso suprime a resolução de tipos globais ambientes (referências transitivas em `.d.ts` não acionam busca de `@types/node`). Padrão já usado em `supabase/functions/copilot-live/deno.json`. |
| Status | **Fix em PR desta sessão — aguardando merge e run de prova.** |
| Ação necessária | Após o merge do PR desta sessão, o push em `supabase/functions/deno.json` dispara `deploy-functions.yml` automaticamente. Confirmar `conclusion: success` no run gerado. |
