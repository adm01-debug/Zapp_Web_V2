# Regras de Negócio — Análise de PRs

**Data:** 2026-10-26  
**Repositório:** adm01-debug/Zapp_Web_V2  
**Main SHA auditado:** `2d97c44cfe7f2fa8a3ca572f8f5689118328e858`

**Fontes primárias desta análise:**
- `CLAUDE.md` (seções 0–4, project instructions checked into codebase)
- `.github/workflows/ci.yml` (definição dos jobs e CI Gate)
- `scripts/ci/github-settings-baseline.json` (branch protection canônica)

---

## 1. Critério de merge (todos obrigatórios)

Um PR só pode ser mergeado quando TODAS as condições abaixo forem verdadeiras:

| # | Critério | Fonte | Evidência mínima |
|---|---|---|---|
| 1 | PR ainda válido (feature não implementada em main) | `CLAUDE.md` seção 3 ("Diff mínimo, causa raiz") | Grep/busca no main atual |
| 2 | Sem regressão (não reverte código mais recente) | Task `/goal` — regra explícita | Diff comparado com main |
| 3 | Não implementado em main | Task `/goal` — regra explícita | Comparação SHA do arquivo em main vs PR |
| 4 | Regra de negócio correta | Task `/goal` — regra explícita | Revisão semântica do diff |
| 5 | Completo (sem TODO crítico, sem stub) | Task `/goal` — regra explícita | Leitura do diff completo |
| 6 | Todos os 6 required checks passando | `CLAUDE.md` "Perímetro do GitHub" | `github_list_check_runs` para o head SHA |
| 7 | PR atualizado com main (`strict=true`) | `scripts/ci/github-settings-baseline.json:9` (`"strict": true`) | `mergeable_state != "behind"` |
| 8 | `mergeable_state = "clean"` | `CLAUDE.md` seção 3 ("Regras de migration" regra 6) | API do GitHub |
| 9 | Confiança alta (sem ambiguidade de impacto) | Task `/goal` — regra explícita | — |

---

## 2. Checks obrigatórios na `main`

Fonte: `CLAUDE.md` seção "Perímetro do GitHub — estado canônico (2026-10-03)" e
`.github/workflows/ci.yml` (jobs: `typecheck:69`, `unit-tests:70`, `build:156`, `ci-gate:275`).

São 6 required checks mais o CI Gate:

- `🔍 Lint & TypeCheck` — job `typecheck` em `ci.yml`
- `🧪 Unit Tests` (3 partições paralelas) — job `unit-tests` em `ci.yml:69`, matrix `shard: [1,2,3]`
- `🏗️ Build` — job `build` em `ci.yml`
- `🔒 Security Audit` — job `security` em `ci.yml`
- `Contrato DB offline` — job separado em `ci.yml`
- `🎭 E2E Tests (Playwright)` — job `e2e` em `ci.yml`
- `✅ CI Gate (required check)` — job `ci-gate` em `ci.yml:275`, `needs: [typecheck, unit-tests, node-scripts, build, security]`; bloqueia merge quando `unit-tests.result == "failure"` (`ci.yml:289`)

---

## 3. Restrições de conteúdo

Fontes: `CLAUDE.md` seção 1 regras de migration, seção 0 regras 0–7, task `/goal` regras explícitas.

| Tipo de mudança | Regra | Fonte |
|---|---|---|
| Migration (DDL) | Só aditiva e não destrutiva. Sem DROP, RENAME, ALTER TYPE, DELETE/UPDATE em massa. Idempotente. | `CLAUDE.md` seção 1 "Restrições de conteúdo" ("Sem DROP, RENAME, ALTER TYPE") |
| Edge function | Só com todos os testes passando e sem afrouxar autenticação | Task `/goal` regra explícita |
| RLS/permissões | Só se testes no Postgres temporário provarem que nenhum acesso foi ampliado | Task `/goal` regra explícita |
| `.github/workflows` | NÃO TOCAR — fora do escopo desta análise | Task `/goal`: "não tocar .github/workflows" |
| SINGU (`src/services/crm/singu-adapter.ts`) | READ-ONLY — PR que escreva nele não é mergeado | Task `/goal`: "SINGU é READ-ONLY" |

---

## 4. Método de merge

Fonte: `scripts/ci/github-settings-baseline.json:24-25` e `CLAUDE.md` "Perímetro do GitHub".

- Método: **squash** (`allow_squash_merge=true:24`, `allow_merge_commit=false:25`, `allow_rebase_merge=false`)
- Branch protection: `strict=true` (`github-settings-baseline.json:9`), `enforce_admins=true`
- Escrita no GitHub: APENAS via MCP `GITHUB - MCP - FOREVER` (`CLAUDE.md` seção 3: "Escrita no GitHub: somente MCP GITHUB - MCP - FOREVER")
- Proibido: push direto em main, force-push, fechar/editar/comentar PR, labels, deletar branch (task `/goal`)

---

## 5. Classificação de vereditos

| Veredito | Significado |
|---|---|
| `MERGEAR` | Todos os critérios atendidos — merge imediato |
| `MERGEAR_APOS_AJUSTES` | Pequeno ajuste técnico corrige o bloqueio |
| `COMPLETAR` | PR incompleta — funcionalidade em desenvolvimento |
| `RESGATAR_PARCIAL` | Parte do conteúdo é válida, parte não |
| `FECHAR` | Duplicata, reverte código mais recente, ou inválida |
| `DECISAO_HUMANA` | Requer aprovação do Joaquim (DDL destrutivo, secret, arquitetura) |
| `DRAFT_SKIP` | PR em rascunho — não analisar para merge |
| `BLOQUEADO_CI` | Bloqueado pelo CI sistêmico em main (ver seção 6) |
| `BLOQUEADO_CI_E_BEHIND` | Bloqueado por CI + desatualizado em relação a main |

---

## 6. Bloqueio sistêmico identificado (2026-10-26)

**Causa raiz:** `main@2d97c44` (commit de 2026-10-24T18:43:20Z — "fix(ci): ci-gate bloqueia merge quando unit tests falham") introduziu um comportamento em que o `CI Gate` bloqueia merge quando unit tests falham. E unit tests estão falhando em **136 arquivos** naquele commit.

**Evidência:**
- PR #2247 (docs-only, 1 arquivo): `Unit Tests (1/3)` = failure, `Unit Tests (2/3)` = failure, `Unit Tests (3/3)` = failure, `CI Gate` = failure, `Contrato DB offline` = failure
- PR #2248 (fix CI Gate): documenta 136 arquivos vermelhos, reduz para 1 arquivo (`rlsSchemaGuard.test.ts`) que precisa de 2 migrations aplicadas em produção

**Impacto:**
- **164 PRs abertas** — nenhuma mergeável
- 32 são drafts (fora do escopo de merge de qualquer forma)
- 132 são não-draft — todas bloqueadas pelo CI sistêmico

**Caminho de desbloqueio:**
1. PR #2248 contém a correção para 135 dos 136 arquivos vermelhos
2. O arquivo restante (`rlsSchemaGuard.test.ts`) precisa de 2 migrations em produção
3. Joaquim deve: revisar PR #2248 → aprovar as 2 migrations via `producao-ddl` → CI fica verde → PRs podem ser mergeadas

**Prioridade:** PR #2248 é o desbloqueador de todos os outros trabalhos.
