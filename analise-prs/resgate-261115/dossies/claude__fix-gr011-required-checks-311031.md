# Dossiê — claude__fix-gr011-required-checks-311031 (PR #2421)

**Branch:** `origin/claude/fix-gr011-required-checks-311031` · tip `ebc6956f` · merge-base `b94be0a2` (2026-11-01)
**Commit útil:** `19821da9` fix(docs): corrige required checks de 6 para 3 no CLAUDE.md (GR-011) — os outros 4 commits são merges de `main` e um `ci:` vazio de re-trigger.
**Escopo:** só `CLAUDE.md` (+4/-6), docs. Sem src, edge, migration ou workflow.

## Propósito
Corrigir no `CLAUDE.md` a documentação dos required checks da `main`: de **6** (`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`) para **3** (`🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate (required check)`), em 3 trechos: nota da re-auditoria (l.201), tabela "Perímetro do GitHub" (l.247) e parágrafo "Required checks da `main`" (l.281-284).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `CLAUDE.md` (3 hunks, 4 linhas "faltando" segundo line_check) | **Intenção já na main, em outro lugar.** O mesmo fix 6→3 entrou na `main` em `ac04c5c03` (#2565, 2026-11-02): `git show ac04c5c03 -- CLAUDE.md` mostra `-| ... **6**: 🔍 Lint & TypeCheck ...` → `+| ... **3**: ✅ CI Gate (required check) · 🏗️ Build · 🔎 TypeCheck` e remove o parágrafo "Required checks da main (6; ...)". Depois, `effd6b0bb` (#2762, 2026-11-07) reduziu `CLAUDE.md` a uma linha (`@AGENTS.md` — `git show origin/main:CLAUDE.md` = 1 linha), e a tabela canônica passou para `docs/agentes/github-ci.md:31`: `\| Branch protection — required checks \| **3**: ✅ CI Gate (required check) · 🏗️ Build · 🔎 TypeCheck \|`. Baseline `scripts/ci/github-settings-baseline.json` (`medido_em: 2026-11-02`) tem `required_status_checks: ["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`. `git grep -E '6 required|Lint & TypeCheck|Security Audit|E2E Tests \(Playwright\)' origin/main -- AGENTS.md docs/agentes/` → vazio (nenhum remanescente do texto antigo). |

As 4 linhas `missing_in_main` são o texto literal da branch no `CLAUDE.md` antigo; o arquivo-alvo não existe mais nesse formato (é só `@AGENTS.md`), e o conteúdo correto (3 checks) está em `docs/agentes/github-ci.md:31` e no baseline JSON. Nenhuma frase da branch tem informação que a main não tenha: a data "medidos em 2026-10-29 via API" foi superada por `medido_em: 2026-11-02` no baseline.

## Veredito
**INCORPORADA** (confiança alta). A correção documental (6→3 required checks) está na `main` desde #2565 e hoje vive na tabela canônica de `docs/agentes/github-ci.md:31` + `scripts/ci/github-settings-baseline.json`. O `CLAUDE.md` em que a branch escrevia foi substituído por `@AGENTS.md` (#2762), então o patch da branch nem tem onde aplicar.

## Lacunas a recuperar
Nenhuma.

## Branch
Segura para apagar: sim (docs-only, intenção 100% presente na main com prova por linha).

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar e não achei nenhum hunk de valor não coberto.

Conferido por mim (leitura direta, não só o JSON da triagem):

1. **Superfície total da branch = 3 hunks em 1 arquivo.** `git diff --name-only b94be0a2 origin/claude/fix-gr011-required-checks-311031` → só `CLAUDE.md`; `--stat` = +4/-6. Os 4 commits além de `19821da9` são 3 merges de `main` e `6497f0a44` (`ci: re-trigger`, sem conteúdo). Não há hunk oculto fora do `line_check`.
2. **Conteúdo dos 3 hunks:** (a) l.201 "os 6 → os 3 required checks da seção abaixo"; (b) l.247 tabela "Perímetro do GitHub" 6 → 3 (`🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate (required check)`); (c) l.281-284 parágrafo "Required checks da `main`" 6 → 3 + "medidos em 2026-10-29 via API". Nenhuma outra informação nova (nem regra, nem comando, nem caminho de arquivo) é introduzida.
3. **A mesma correção está na main.** `git show ac04c5c03 -- CLAUDE.md` (#2565, 2026-11-02) contém literalmente `-| Branch protection — required checks | **6**: 🔍 Lint & TypeCheck · 🧪 Unit Tests · 🏗️ Build · 🔒 Security Audit · Contrato DB offline · 🎭 E2E Tests (Playwright) |` → `+| Branch protection — required checks | **3**: ✅ CI Gate (required check) · 🏗️ Build · 🔎 TypeCheck |`, e remove as frases `os 6 required checks da seção abaixo` e o parágrafo com os 6 nomes. Mesmos 3 nomes de check da branch.
4. **Arquivo-alvo não existe mais nesse formato:** `git show origin/main:CLAUDE.md` = 1 linha (`@AGENTS.md`). Tabela canônica hoje: `origin/main:docs/agentes/github-ci.md:31` = `| Branch protection — required checks | **3**: ✅ CI Gate (required check) · 🏗️ Build · 🔎 TypeCheck | settings-guard ⚠ |`.
5. **A data da branch foi superada, não perdida:** `origin/main:scripts/ci/github-settings-baseline.json` tem `"medido_em":"2026-11-02"` e `required_status_checks:["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]` — a medição de 2026-10-29 que a branch citava é mais antiga e aponta para o mesmo arquivo de prova.
6. **Nenhum resto do texto antigo nos docs vigentes:** `git grep -nE 'required checks \| \*\*6\*\*|Required checks da .main.. \(6|os 6 required checks' origin/main` não retorna nada em `AGENTS.md`, `docs/agentes/` nem `scripts/ci/`.

**Observação fora do escopo da branch (não é lacuna dela):** o mesmo grep retorna ~20 menções a "6 required checks" em documentos históricos da main (`analise-prs/regras-de-negocio.md:10`, `docs/ci/RELATORIO_CI.md`, `docs/ia/IA-005`/`IA-008`, `docs/audits/...`), e `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-11-07.md:187` lista "Restaurar os 6 required checks (N01)" como ação de alta prioridade. A branch nunca tocou nesses arquivos — isso é dívida de documentação/decisão de perímetro da main, não trabalho perdido aqui.

**Branch segura para apagar: sim.**
