# Dossiê — `claude/fix-ci-workflows-261030-0830` (PR #2372)

**Veredito:** OBSOLETA · **Confiança:** alta · **Apagar branch:** seguro (true)

## Propósito
Sessão de correção de CI de 2026-10-30. A branch só traz 3 docs em `docs/ci/` (495 linhas, 0 deleções; `git diff --stat 004e74a8..1a8c8096`): `PENDENCIAS.md` (lista de workflows "bloqueados por Regra 8" para o dono mergear/aprovar), `RELATORIO_CI.md` (relatório da sessão de 30/10) e `RELATORIO_CI_FINAL.md`. Sem src, edge, migration ou workflow (`counts`: tudo 0, docs_only).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `docs/ci/RELATORIO_CI_FINAL.md` | **INCORPORADA** byte a byte | `git diff --stat origin/claude/fix-ci-workflows-261030-0830 origin/main -- docs/ci/RELATORIO_CI_FINAL.md` → vazio. Entrou pelo commit `df4d597dc` (2026-11-01, PR #2458: "substitui … #2372 …") |
| `docs/ci/PENDENCIAS.md` | **OBSOLETA** — na main existe versão posterior (31/10, PR #2411, commit `1a9858b23`) que já descreve o estado seguinte; todos os 5 itens da versão da branch foram resolvidos ou superados | ver seção abaixo |
| `docs/ci/RELATORIO_CI.md` | **OBSOLETA** — relatório pontual da sessão de 30/10; a main tem o relatório da sessão de 31/10 (PR #2411, `1a9858b23`), que inclui o fix definitivo do deploy-functions (W100/E59) e o inventário atualizado | `git show origin/main:docs/ci/RELATORIO_CI.md` |

### Por que os itens da `PENDENCIAS.md` da branch não fazem mais sentido
1. **deploy-functions — `deno install` ausente** (item 1, aguardava PR #2371): PR #2371 MERGED em 2026-10-30T15:25Z; depois superado pelo PR #2407 (MERGED 2026-10-31T02:53Z). Na main hoje: `.github/workflows/deploy-functions.yml:473` step "Instalar dependencias node_modules (deno install + @types/node)" e `:488 cd supabase/functions && deno install --frozen=false`.
2. **db-live-guard — migrations `20261030100000`/`20261030110000` sem apply** (item 2): aplicadas em produção. `db_query` em `tnnnlkbymytvtqngbbqh`: `select version,name from supabase_migrations.schema_migrations where version in ('20261030100000','20261030110000')` → 2 linhas (`copilot_sessions`, `copilot_insights`). Arquivos presentes em `origin/main:supabase/migrations/`.
3. **db-guard Replay ECR rate limit** (item 3, aguardava PR #2354): PR #2354 CLOSED sem merge (2026-11-01); a main já não usa `public.ecr.aws` — `.github/workflows/db-guard.yml:56,68` usam `postgres:17-alpine@sha256:b0f9560a…` (Docker Hub pinado) e `:69 ghcr.io/supabase/postgrest`. O problema descrito não existe mais.
4. **db-migrate gate `producao-ddl`** (item 4): "não é bug", by design — nada a recuperar.
5. **branch-hygiene-audit timeout** (item 5): corrigido na main por `587ec25f8` (2026-11-02, #2551 "branch-hygiene-audit timeout no step KPI"), `b46f5d291` (#2710) e `7991a1f47` (#2773); hoje `.github/workflows/branch-hygiene-audit.yml:50 timeout-minutes: 25`.

A `PENDENCIAS.md` da main (31/10) já tinha removido esses itens e listado os seguintes (copilot-reviewer firewall, db-live-guard 3 causas, confirmação do run pós-#2407) — a versão da branch é um estado anterior do mesmo documento vivo ("Itens resolvidos sao removidos deste arquivo").

## Lacunas a recuperar
Nenhuma. Conteúdo = histórico de sessão de 30/10, superado por histórico mais recente (31/10) e pelas correções já mergeadas. Valor residual: nenhum (reportar PRs que já foram mergeadas/fechadas e migrations já aplicadas induziria o dono ao erro).

## Observação
Comentários de fechamento (01/11) alegavam "arquivos já existem na main em versão mais recente" — confirmado: `git log origin/main -- docs/ci/PENDENCIAS.md docs/ci/RELATORIO_CI.md` → `1a9858b23 2026-10-31 (#2411)`, posterior ao conteúdo da branch (30/10). `triagem_2804` = OBSOLETA — coerente.

---

## Verificação adversarial

**Parecer:** concordo com `OBSOLETA`. Apagar a branch é seguro. Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

### O que foi checado, arquivo por arquivo

| Arquivo da branch | Tentativa de refutação | Resultado |
|---|---|---|
| `docs/ci/RELATORIO_CI_FINAL.md` | `git diff origin/claude/fix-ci-workflows-261030-0830 origin/main -- docs/ci/` | arquivo **não aparece** no diff → idêntico na main. Entrou por `df4d597dc` (#2458), cuja mensagem diz literalmente "substitui #2429 #2415 #2413 #2396 **#2372** #2200" |
| `docs/ci/RELATORIO_CI.md` | `diff <(git show …branch:docs/ci/RELATORIO_CI.md) <(git show origin/main:docs/ci/RELATORIO_CI_FINAL.md)` | 169 vs 172 linhas; **é o rascunho anterior do mesmo documento** que já está na main como `RELATORIO_CI_FINAL.md`. Único parágrafo exclusivo da branch é a "Nota pós-merge PR #2368" (causa do `deno install`), que a main preserva em dois lugares: `.github/workflows/deploy-functions.yml:474-486` (comentários W99/W100/W101/GR-001) e `origin/main:docs/ci/RELATORIO_CI.md:16` (inventário de 31/10). Resto são variações de redação de célula de tabela |
| `docs/ci/PENDENCIAS.md` | documento vivo ("Itens resolvidos sao removidos deste arquivo"); verifiquei os 5 itens um por um contra a main e contra o banco, sem confiar na triagem | todos resolvidos — abaixo |

### Os 5 itens "bloqueados" da branch, reverificados na fonte

1. **`deno install` ausente** → `origin/main:.github/workflows/deploy-functions.yml:473` step "Instalar dependencias node_modules (deno install + @types/node)", `:488 cd supabase/functions && deno install --frozen=false` e `:489 npm --prefix supabase/functions install --no-save @types/node@25.9.9`. A causa raiz que a branch documentava está nos comentários W99/W100 do próprio workflow.
2. **Migrations `20261030100000`/`20261030110000` sem apply** → consulta de leitura em `tnnnlkbymytvtqngbbqh`: `select version,name from supabase_migrations.schema_migrations where version in ('20261030100000','20261030110000')` → **2 linhas** (`copilot_sessions`, `copilot_insights`). A branch registrava `0 rows`. Arquivos presentes em `origin/main:supabase/migrations/`.
3. **`db-guard` Replay — ECR rate limit** → `origin/main:.github/workflows/db-guard.yml:56,68` usam `postgres:17-alpine@sha256:b0f9560a…` (Docker Hub pinado) e `:69 ghcr.io/supabase/postgrest`; `git grep ecr.aws origin/main -- .github/` não retorna nada em `db-guard.yml`. O conhecimento sobre o rate-limit do ECR não se perdeu: `origin/main:.github/workflows/db-live-guard.yml:284-294` tem o step "Pre-pull postgres-meta via ghcr.io (evita rate-limit do ECR public)" com o workaround de retag.
4. **Gate `producao-ddl`** → "não é bug" por design; o procedimento `apply=false` → anotar SHA → `apply=true` que a branch descrevia está em `origin/main:docs/agentes/banco.md:60` e em `docs/MIGRATIONS.md`. Nada exclusivo.
5. **`branch-hygiene-audit` timeout** → `origin/main:.github/workflows/branch-hygiene-audit.yml:50 timeout-minutes: 25` (era 10).

### Checagens negativas
- `git ls-tree 004e74a8 -- docs/ci/` não lista `PENDENCIAS.md` nem `RELATORIO_CI.md`: no merge-base não existiam, logo o `CONFLICT`/`BOTH_CHANGED` do JSON é criação paralela dos mesmos nomes na main (`1a9858b23`, #2411, 31/10) — não sobrescrita de trabalho da branch.
- `git log origin/main --grep=remove|revert|desativa -i -- docs/ci/` não mostra nenhum commit que tenha removido de propósito conteúdo desta branch; o único commit relevante (`df4d597dc`) *acrescentou* o relatório final.
- `counts` do JSON (migrations=0, workflows=0, src=0, edges=0, `docs_only=yes`) conferem com `git diff --stat 004e74a8..1a8c8096` → 3 arquivos, 495 inserções, 0 deleções, todos em `docs/ci/`.

**Risco de recuperar:** maior que o de apagar. Reintroduzir a `PENDENCIAS.md` de 30/10 mandaria o dono abrir PR #2371 (já mergeada), PR #2354 (fechada sem merge) e rodar `db-migrate` para migrations já aplicadas em produção.
