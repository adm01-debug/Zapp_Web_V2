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

## 4. `e2e-logado` — 504 Gateway Timeout no cold start (infra)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Erro exato | `504 Gateway Timeout` na edge function `auth-login` em `tnnnlkbymytvtqngbbqh` |
| Causa | Cold start do Supabase Edge Runtime — falha transiente de infraestrutura, não é código |
| Por que está bloqueado | Não é bug de código; depende de warmup da infra Supabase |
| Ação necessária | Nenhuma imediata. Se recorrente: implementar retry no E2E test ou endpoint de warmup |

---

## 5. PR #2354 — `db-guard` (aguardando revisão)

PR [#2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) contém o fix do ECR (item 1 acima).
Está em draft. Joaquim deve revisar, aprovar e mergear.

---

## 6. `copilot-pull-request-reviewer` — failure (não é required check)

| Campo | Valor |
|---|---|
| Check | `copilot-pull-request-reviewer` |
| Conclusão | `failure` (observado em SHA `4c4eda7c`, run [41017783433](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41017783433), job [123937933351](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41017783433/job/123937933351)) |
| É required check? | **Não** — não consta nos 6 required checks da `main` (`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`) |
| Causa | Bot de review do Copilot reporta findings via annotations; `conclusion=failure` é o comportamento quando o bot identifica sugestões — não impede merge |
| Por que está bloqueado | Não está bloqueado — é cosmético. A failure deste check não bloqueia PR |
| Ação necessária | Nenhuma. Behavior by design do `copilot-pull-request-reviewer` workflow |
