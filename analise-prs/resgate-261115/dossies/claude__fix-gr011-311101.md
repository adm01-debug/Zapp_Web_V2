# Dossiê — claude__fix-gr011-311101 (branch `origin/claude/fix-gr011-311101`)

- tip `7589315b0` · merge-base `1252bb5a4` · 8 commits (3 úteis de docs + 2 merges de main + 2 "re-trigger CI" + 1 fix de linha duplicada já absorvido pelos merges).
- Propósito (GR-011): corrigir no `CLAUDE.md` todas as referências a "6 required checks" para os **3** vigentes (`🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate (required check)`), alinhando com a medição de 2026-10-29 e com `scripts/ci/github-settings-baseline.json`.
- Diff total: `CLAUDE.md` (+7/−8, 5 hunks, só texto) + `.github/ci-refresh` (arquivo vazio, só para disparar CI).

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `CLAUDE.md` | BOTH_CHANGED / CONFLICT, 6 linhas "faltando" | **OBSOLETA**: o alvo (CLAUDE.md longo, 379 linhas) foi removido de propósito na main; hoje `CLAUDE.md` contém só `@AGENTS.md`. O conteúdo que a branch corrigia (tabela "Perímetro do GitHub") migrou para `docs/agentes/github-ci.md` **já com o número certo (3 checks)**. | `git show origin/main:CLAUDE.md` → `@AGENTS.md`; commit `effd6b0bb` (2026-11-07, #2762 "chore: instruções enxutas para agentes": CLAUDE.md −379, AGENTS.md reescrito, docs/agentes/github-ci.md +117); `docs/agentes/github-ci.md:31` = `| Branch protection — required checks | **3**: \`✅ CI Gate (required check)\` · \`🏗️ Build\` · \`🔎 TypeCheck\` |`; `scripts/ci/github-settings-baseline.json` → `"required_status_checks":["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`, `medido_em: 2026-11-02`. `git grep -E '6 checks|seis checks|\(6;' origin/main -- CLAUDE.md AGENTS.md docs/agentes/` → nenhum hit. |
| `.github/ci-refresh` | NEW_FILE_ABSENT_IN_MAIN | **nenhum valor**: arquivo vazio criado só para forçar `synchronize` do CI (commit `7589315b0 ci: fresh synchronize trigger`). Main já teve e removeu esse arquivo (`41853318c`, `4b5c6e797`); hoje ausente (`git ls-tree origin/main -- .github/ci-refresh` vazio). Não deve ser portado. | `git show origin/claude/fix-gr011-311101:.github/ci-refresh` → vazio. |

## Veredito

**OBSOLETA** (confiança alta). A necessidade de negócio da branch (documentação dizer "3 checks") está satisfeita na main por outro arquivo (`docs/agentes/github-ci.md:31` + baseline JSON); o arquivo-alvo foi esvaziado de propósito em #2762. Nada a portar. `apagar_branch_seguro = true`.

## Lacunas a recuperar

Nenhuma do escopo da branch.

Observação fora do escopo (não é lacuna desta branch — são comentários em código que a branch não tocava): ainda há 3 comentários na main dizendo "6 checks":
- `scripts/ci/github-settings-guard.mjs:161`
- `scripts/ci/github-settings-guard.unit.mjs:35`
- `scripts/ci/talkx-status-warn.unit.mjs:53`
Valor baixo (texto de comentário; o guard confere contra o JSON, que está correto). Candidato a um `chore(ci)` de 3 linhas.

## Verificação adversarial

Parecer: **triagem CONFIRMADA — OBSOLETA**, `apagar_branch_seguro = true`. Tentei refutar e não achei um único hunk portável.

Refutação tentada, item por item:

1. **Diff completo conferido** (`git diff 1252bb5a4 origin/claude/fix-gr011-311101`): 2 arquivos, +7/−8. `CLAUDE.md` tem exatamente 5 hunks, todos substituição de "6/seis checks" por "3/três checks" (linhas antigas 23-26, 198-201, 231-234, 244-247, 278-285). Nenhum outro conteúdo. `.github/ci-refresh` = 1 linha vazia.
2. **União de todos os 8 commits** (`git log --name-only --format="" 1252bb5a4..origin/claude/fix-gr011-311101 | sort -u`) = apenas `.github/ci-refresh` e `CLAUDE.md`. O commit `d8b7f54eb` ("corrige linha duplicada em Talk X") também era no `CLAUDE.md` e **não aparece no diff final** contra a merge-base — foi neutralizado pelos merges de main; não há conteúdo escondido fora do diff.
3. **O alvo não existe mais**: `git show origin/main:CLAUDE.md` = `@AGENTS.md` (uma linha). Remoção deliberada em `effd6b0bb` (2026-11-07, PR #2762 "chore: instruções enxutas para agentes"), cujo corpo declara a intenção: "`CLAUDE.md` | 29.001 B | **11 B** — exatamente `@AGENTS.md`", referência longa migrada para `docs/agentes/<tema>.md`. Portar os 5 hunks exigiria ressuscitar 379 linhas removidas de propósito.
4. **A substituição cobre a necessidade** (abri o arquivo da main): `origin/main:docs/agentes/github-ci.md:31` → `| Branch protection — required checks | **3**: \`✅ CI Gate (required check)\` · \`🏗️ Build\` · \`🔎 TypeCheck\` | settings-guard ⚠ |`, dentro da seção "Perímetro do GitHub — estado canônico" (linha 23) com a mesma regra de atualização conjunta com o baseline. Linha 32 cobre o `strict=true`/"revogado" do segundo hunk.
5. **O baseline confirma e é mais recente que a branch**: `origin/main:scripts/ci/github-settings-baseline.json` → `"required_status_checks":["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`, `"medido_em":"2026-11-02"` — posterior à medição de 2026-10-29 que a branch citava, logo a procedência que o hunk 5 agregava já está superada por medição mais nova.
6. **`.github/ci-refresh`**: ausente na main (`git ls-tree origin/main -- .github/ci-refresh` vazio), arquivo vazio, só gatilho de `synchronize`. Valor zero; portar seria churn.
7. **Merge-base é ancestral da main** (`git merge-base --is-ancestor 1252bb5a4 origin/main` = 0), então a comparação é válida e a branch não carrega base divergente.

Divergência de escopo com a triagem (não muda o veredito): o dossiê listou 3 comentários em `scripts/ci/*` ainda dizendo "6 checks", mas há mais arquivos vivos na main com o número errado, e são mais visíveis que comentários — `CONTRIBUTING.md:51` ("## CI — 6 checks obrigatórios"), `docs/DEPLOYMENT.md:261` ("mergeie pelo fluxo normal (6 checks)"), `analise-prs/regras-de-negocio.md:10` ("Todos os 6 required checks verdes"), `.github/workflows/deploy-functions.yml:30` e `docs/audits/ARQUITETURA_V2_DESCOBERTAS.md:379,624`. Nenhum deles é tocado pelo diff da branch, portanto **não é lacuna desta branch** — é um `chore(docs)` próprio. Os arquivos sob `docs/_arquivo/` e `docs/audits/` são histórico datado e devem ficar como estão.
