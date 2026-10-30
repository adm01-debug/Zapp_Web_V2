# PENDÊNCIAS CI — Zapp Web V2

> Itens que não podem ser resolvidos automaticamente: dependem de aprovação humana, acesso administrativo ou envolvem infra transiente.
> Atualizado em 2026-10-30.

---

## 1. `db-guard` — ECR rate limit no PostgREST (Regra 8)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Erro exato | `toomanyerequests: Data limit exceeded` (pull do `public.ecr.aws/supabase/postgrest:v14.5`) |
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
| Conclusão | `failure` (observado em SHA `4c4eda7c`, run [41017783433](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41017783433)) |
| É required check? | **Não** — não consta nos 6 required checks da `main` (`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`) |
| Causa | Bot de review do Copilot reporta findings via anotações; `conclusion=failure` é o comportamento quando o bot identifica sugestões — não impede merge |
| Por que está bloqueado | Não está bloqueado — é cosmético. A failure deste check não bloqueia PR |
| Ação necessária | Nenhuma. Behavior by design do `copilot-pull-request-reviewer` workflow |

---

## 7. `deploy-functions` — `deno install` ausente antes do typecheck (Regra 8)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Erro exato | `error: Error: Could not find "@types/node" in a node_modules folder. Deno expects the node_modules/ directory to be up to date. Did you forget to run \`deno install\`?` (step 17 "Typecheck das edge functions", run [41021181372](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41021181372) job 123948621262, SHA `3f4e16d2`) |
| Causa raiz | `nodeModulesDir: "auto"` em Deno 2.9.5 **não cria** `node_modules` automaticamente durante `deno check` — exige `deno install` explícito. `@types/ws@8.18.1` tem `/// <reference types="node" />` que força resolução de `@types/node` na fase de descoberta de módulos (`resolveTypeReferenceDirectiveReferences` em `findSourceFile`), antes de qualquer type check. PRs #2367 (`skipLibCheck`) e #2368 (`nodeModulesDir: "auto"`) eram necessários mas insuficientes sem o step de install. |
| PR de correção | Aberta — aguardando aprovação de Joaquim (**Regra 8**: altera `.github/workflows/deploy-functions.yml`) |
| Fix exato | Adicionar step `deno install --config supabase/functions/deno.json` após "Setup Deno" e antes de "Typecheck das edge functions" em `deploy-functions.yml` |
| Ação necessária | Joaquim revisar e mergear a PR de fix do `deploy-functions.yml` |

---

## 8. `db-live-guard` — drift das migrations do PR #2361 não aplicadas (Regra 8)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-live-guard.yml` |
| Erro exato | 7 checks falhando no step 23 "Consolidar veredito do contrato vivo": `Comparar migrations com schema_migrations`, `Verificar ACL e contrato de mcp_exec`, `Regenerar catálogo e comparar com o commitado`, `Regenerar manifesto e comparar com o commitado`, `Verificar frescor do types.ts`, `Paridade tripla`, `Auditar configuração runtime`. Run [41021208458](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41021208458) job 123948710854. |
| Causa raiz | PR #2361 (outro agente, mergeado antes desta sessão) adicionou `supabase/functions/copilot-live/index.ts` + 2 migrations (`20261030100000_copilot_sessions.sql`, `20261030110000_copilot_insights.sql`) sem aplicar em produção via `db-migrate`. Forward drift: arquivos no repo ≠ ledger de produção. Catálogo/manifesto/types.ts também desatualizados pelo mesmo PR. |
| Por que está bloqueado | Aplicar as migrations `20261030100000` e `20261030110000` em produção exige aprovação no environment `producao-ddl` — **Regra 8 (DDL em produção)** |
| Ação necessária | Joaquim acionar `db-migrate.yml` via `workflow_dispatch` na `main` com `apply=false` (dry-run) e depois `apply=true` com confirmação do hash SHA-256, para aplicar as 2 migrations pendentes |
