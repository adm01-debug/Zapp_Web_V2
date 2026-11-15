# Dossiê — claude__fix-claude-md-gr011-261102-0100 (PR #2557)

**Branch:** `origin/claude/fix-claude-md-gr011-261102-0100` · tip `631d210e3` · merge-base `dfef2487a` (2026-11-02)
**Commit útil:** `93cfc9d09 fix(docs): atualiza CLAUDE.md — required checks reais são 3, não 6 (GR-011)` (os outros 5 são merges de `main`).
**Diffstat:** `CLAUDE.md | 7 ++-----` (2 inserções, 5 remoções). Só docs; sem src/edge/migration/workflow.

## Propósito
Corrigir no `CLAUDE.md` a lista de required checks da `main`: de **6** (`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`) para **3** (`✅ CI Gate (required check)`, `🏗️ Build`, `🔎 TypeCheck`), em dois trechos (tabela "Perímetro do GitHub" e parágrafo "Required checks da `main`").

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência na `main` |
|---|---|---|---|
| `CLAUDE.md` @244 (tabela perímetro → 3 checks) | INCORPORADA (movido) | Tabela migrou para `docs/agentes/github-ci.md` e já diz **3** checks com os mesmos nomes | `git show origin/main:docs/agentes/github-ci.md` linha 31: `\| Branch protection — required checks \| **3**: \`✅ CI Gate (required check)\` · \`🏗️ Build\` · \`🔎 TypeCheck\` \| \`settings-guard\` ⚠ \|` |
| `CLAUDE.md` @278 (parágrafo "Required checks da main (3...)" + CodeQL não é required) | INCORPORADA (movido) | Mesma informação em `github-ci.md`: linha 31 (os 3 checks) + linhas 94-95 (`CodeQL ... não é required check`) e `strict=true` na linha 32 | `git grep -n 'required check' origin/main -- docs/agentes/github-ci.md` |
| `CLAUDE.md` (arquivo em si) | Alvo substituído de propósito | `origin/main:CLAUDE.md` contém apenas `@AGENTS.md` (1 linha); conteúdo longo removido no commit `effd6b0bb chore: instruções enxutas para agentes (#2762)` | `git show origin/main:CLAUDE.md`; `git log --oneline -1 origin/main -- CLAUDE.md` |
| Baseline mecânico | Consistente | `scripts/ci/github-settings-baseline.json` na main: `"required_status_checks":["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`, `medido_em: 2026-11-02` | `git show origin/main:scripts/ci/github-settings-baseline.json` |

O `line_check.missing_in_main=2` é falso-positivo: as 2 linhas adicionadas não estão em `CLAUDE.md` (hoje só `@AGENTS.md`), mas o fato que elas registram está em `docs/agentes/github-ci.md:31` e `:94-95`, que é o destino canônico dessa seção após #2762.

## Veredito
**INCORPORADA** (confiança alta). O fato corrigido (3 required checks, CodeQL não bloqueia, `strict=true`) vive na `main` em `docs/agentes/github-ci.md`, que substituiu a seção do `CLAUDE.md`. A triagem anterior (2804) marcou OBSOLETA — tecnicamente o alvo (`CLAUDE.md` longo) foi removido, mas a intenção foi incorporada no arquivo sucessor, então INCORPORADA é mais preciso. Em ambos os casos: nada a recuperar.

## Lacunas a recuperar
Nenhuma.

**apagar_branch_seguro: true.**

## Verificação adversarial

Tentei refutar o veredito INCORPORADA buscando qualquer hunk útil fora da main. Não achei nenhum.

**1. Superfície real da branch.** `git diff dfef2487 origin/claude/fix-claude-md-gr011-261102-0100 --stat` →
`CLAUDE.md | 7 ++-----` (2 inserções, 5 remoções), arquivo único, nos 6 commits somados. Zero migration,
workflow, `src/` ou edge. Não há commit adicional com conteúdo que o diff líquido esconda.

**2. Conteúdo dos 2 hunks.** Único fato trazido: required checks da `main` passam de 6
(`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`,
`🎭 E2E Tests (Playwright)`) para 3 (`✅ CI Gate (required check)`, `🏗️ Build`, `🔎 TypeCheck`), mais a
nota de que `🔬 CodeQL (javascript-typescript)` roda em CI e não é required check.

**3. A main já diz exatamente isso.**
- `origin/main:docs/agentes/github-ci.md:31` — `| Branch protection — required checks | **3**: `✅ CI Gate (required check)` · `🏗️ Build` · `🔎 TypeCheck` | `settings-guard` ⚠ |` (string idêntica ao `missing_sample[0]` do JSON).
- `origin/main:docs/agentes/github-ci.md:32` — `strict` **`true`**, com `false` marcado como revogado.
- `origin/main:docs/agentes/github-ci.md:94-95` — CodeQL (inclusive o job `analyze-actions`) "não é required check".
- `origin/main:docs/agentes/github-ci.md:50-52` — explica por que o `✅ CI Gate` existe (build `skipped` com teste vermelho deixava o merge passar), detalhe que a branch nem trazia.
- `origin/main:scripts/ci/github-settings-baseline.json` — `"required_status_checks":["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`, `"strict":true`, `"medido_em":"2026-11-02"`. O baseline que o `settings-guard` confere contra a realidade bate com a branch.

**4. O destino da edição não existe mais, e isso foi deliberado.** `origin/main:CLAUDE.md` tem uma linha:
`@AGENTS.md`. `git log --oneline origin/main -- CLAUDE.md` → `effd6b0bb chore: instruções enxutas para
agentes (#2762)`; `git show --stat effd6b0bb` mostra `CLAUDE.md | 379 ------` com criação simultânea de
`docs/agentes/{banco,evolution-go,github-ci,mapa-repo,regras-dominio,vercel-deploy}.md`. Ou seja: remoção
intencional por migração, não perda. Os 635 "lines_branch_has_main_lacks" do JSON são o CLAUDE.md antigo
inteiro, artefato dessa migração — não trabalho da branch.

**5. Rebase é impossível e desnecessário.** Mesmo quem quisesse reaplicar a branch não teria onde: as
linhas-alvo (244 e 278 do CLAUDE.md antigo) não existem na main, e o texto corrigido já está no arquivo
sucessor com mais contexto.

Nada a rebaixar para PERDIDA_PARCIAL. Concordo com a triagem: **INCORPORADA**, branch segura para apagar.
