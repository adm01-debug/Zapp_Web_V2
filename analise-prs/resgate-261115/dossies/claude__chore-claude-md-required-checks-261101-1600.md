# Dossiê — `claude/chore-claude-md-required-checks-261101-1600` (PR #2493)

- Ref: `origin/claude/chore-claude-md-required-checks-261101-1600` · tip `a38e2ad40` · merge_base `1252bb5a4` (2026-11-01)
- 5 commits, dos quais 3 são merges da `main`. Conteúdo real:
  - `71bea5a96 chore: atualizar required checks de 6 para 3 no CLAUDE.md`
  - `8f9060258 docs: adicionar plano de 190 etapas de correções 2026-10-19`
- Só documentação: 0 migration, 0 workflow, 0 `src/`, 0 edge (`git diff --stat 1252bb5a4 a38e2ad40` → `CLAUDE.md` +4/-6, `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` +979).

## Propósito
Corrigir, no CLAUDE.md antigo (380 linhas), o número de required checks da `main` de 6 para 3
(`🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate (required check)`) e arquivar um plano de 190 etapas de
correções datado de 2026-10-19.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `CLAUDE.md` | BOTH_CHANGED / CONFLICT, 4 linhas ausentes na main | **Alvo deletado de propósito + fato já incorporado** | `git show origin/main:CLAUDE.md` = 1 linha (`@AGENTS.md`); o CLAUDE.md de 380 linhas foi removido em `effd6b0bb 2026-11-07 chore: instruções enxutas para agentes (#2762)` (`CLAUDE.md | 379 ------`). O fato que a branch queria corrigir está na main, com o mesmo conteúdo: `docs/agentes/github-ci.md:31` → `\| Branch protection — required checks \| **3**: \`✅ CI Gate (required check)\` · \`🏗️ Build\` · \`🔎 TypeCheck\` \| settings-guard ⚠ \|`, e `scripts/ci/github-settings-baseline.json` (`"required_status_checks":["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`, `medido_em: 2026-11-02`). |
| `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` | NEW_FILE_ABSENT_IN_MAIN / ABSENT_APPLIES_CLEAN, 741 linhas | **Nunca entrou na main e as premissas do plano já não existem** | `git ls-tree -r origin/main \| grep 190_ETAPAS` → só `docs/plans/PLANO_VERCEL_190_ETAPAS_2026-10-18{,.execucao}.md`; `git log --all --diff-filter=A -- '*PLANO_CORRECOES_190_ETAPAS*'` → só branches (`8f9060258`, `fbfc51c4c` da PR #2107, `a17c111ff`), nenhum commit de `main`. A PR #2107, que tentava absorvê-lo em `docs/audits/`, morreu BLOQUEADO_CI_E_BEHIND (`docs/_arquivo/analise-prs/dossies/PR-2107.md`). |

### Por que o plano está obsoleto (seção "CONTEXTO DE ANÁLISE" do próprio arquivo, linhas 963-979)
O plano declara as bases em que foi gerado; todas mudaram:
- "CLAUDE.md (71KB): regras de trabalho…" → CLAUDE.md hoje tem 1 linha (`@AGENTS.md`), removido em `effd6b0bb` (07/11). Etapas como **A25** citam explicitamente "CLAUDE.md menciona `scripts/db-audit/register-migration.mjs`".
- ".github/workflows/: 14 workflows (lista nominal)" → a main tem **21** (`git ls-tree --name-only origin/main -- .github/workflows/ \| wc -l`), incluindo `settings-guard.yml`, `contexto.yml`, `front-release-targets.yml`, `e2e-logado-isolado.yml`, `inventario-estado-semanal.yml`, `vercel-env-cleanup.yml`, `check-talkx-pr-body.yml`, que não existiam no retrato.
- "PRs abertos: #2081–#2095 (Z-series + lote F1a)" → as etapas **A1** ("fechar PRs Z-series em aberto") e **A5** ("mergear PRs do lote F1a") são ações sobre PRs de 10/2026, fora de escopo hoje.
- Etapa **A12** ("criar `.github/dependabot.yml`") já está feita: `git ls-tree --name-only origin/main -- .github/` lista `.github/dependabot.yml`.
- A fonte canônica de pendência na main é outra e é mais nova: `docs/PRONTO_PRODUCAO.md` ("Estado em 2026-11-01"), apontada pelo `AGENTS.md:95` como "o que está quebrado e onde fica cada fluxo"; e o `AGENTS.md` abre dizendo que as regras do dono "vencem `docs/` (histórico)".
- Observação de qualidade: o plano ainda erra o id do CRM externo (`pgxfvjmuuxtbowutlide`, linha 66) contra `pgxfvjmuubtbowutlide` do `AGENTS.md`.

Nem toda etapa individual foi conferida uma a uma (são 190); o que está provado é que o artefato é um
retrato de 19/10 cujos âncoras (CLAUDE.md grande, 14 workflows, PRs #2081–#2095) não existem mais e cuja
função foi assumida por `docs/PRONTO_PRODUCAO.md`.

## Veredito: OBSOLETA
- A única mudança de comportamento/regra da branch (6→3 required checks) **está na main**, em outro arquivo.
- O plano de 190 etapas é artefato de planejamento vencido, valor baixo, sem nada a portar para código.
- `apagar_branch_seguro = true`. Se o dono quiser preservar o backlog histórico, o arquivo íntegro está em
  `git show origin/claude/chore-claude-md-required-checks-261101-1600:docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md`
  (cópia de leitura em `/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/plano190.md`) — mas isso é decisão de arquivo morto, não de recuperação de trabalho.

## Nada a recuperar
Nenhuma lacuna de código, banco, edge, workflow ou teste. Zero risco de regressão ao apagar a branch.

## Verificação adversarial

Refutação tentada em 2026-11-15, só leitura. **Triagem confirmada: OBSOLETA, apagar seguro.**

Conferências independentes:
1. `git diff --stat 1252bb5a4 a38e2ad40` → exatamente 2 arquivos (`CLAUDE.md` +4/-6, `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` +979). Zero `src/`, `supabase/`, `.github/`, teste.
2. Os 4 hunks do `CLAUDE.md` (diff lido inteiro) só trocam "6"→"3" e a lista de checks em 3 pontos. Alvo inexistente: `git show origin/main:CLAUDE.md` = `@AGENTS.md` (1 linha), removido em `effd6b0bb` (07/11, "chore: instruções enxutas para agentes (#2762)") — deleção deliberada, não acidente.
3. Substituição alegada confirmada abrindo a main: `docs/agentes/github-ci.md:31` traz a mesma lista de 3 checks, e `scripts/ci/github-settings-baseline.json` (`medido_em: 2026-11-02`) traz `"required_status_checks":["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`, com o guard conferindo contra a realidade. Cobertura ≥ o que a branch escrevia.
4. Histórico das PRs: #2493 (tip `a38e2ad40`) foi **fechada sem merge** em 01/11 como duplicata conflitante de #2507 ("983 additions não documentadas"); #2507, a versão mínima do mesmo fix, também foi **fechada sem merge** (`merged_at: null`, 6 additions/8 deletions). Nenhuma das duas precisa ser revivida: o arquivo que ambas editavam não existe mais.
5. Plano de 190 etapas: ausente da main (`git ls-tree -r --name-only origin/main | grep 190_ETAPAS` → só `PLANO_VERCEL_190_ETAPAS_2026-10-18{,.execucao}.md`). Li a seção "CONTEXTO DE ANÁLISE" (linhas 963-979 do blob) e as fases A/B: é lista de **hipóteses a investigar** ("Ler código. Verificar se…"), não achados verificados com arquivo:linha. Premissas mortas confirmadas uma a uma: "CLAUDE.md (71KB)" → 1 linha; ".github/workflows/: 14 workflows" → 21 na main; "PRs abertos #2081–#2095" → etapas A1/A5 agem sobre PRs de 10/2026; A12 (`.github/dependabot.yml`) já feita na main. A função de backlog está em `docs/PRONTO_PRODUCAO.md` ("Estado em 2026-11-01"), mais nova e com provas por fluxo. Valor de resgate: baixo, e nada que vire código.

Nenhum hunk de valor ≥ médio fora da main. Zero risco de regressão ao apagar a branch.

### Achados colaterais na main (não são lacunas desta branch)
Ao grepar a main por "6 required checks" apareceram inconsistências **em arquivos que a branch não tocava** — portanto não alteram o veredito, mas são dívida real de documentação operacional:
- `CONTRIBUTING.md:51-63` ainda diz "CI — 6 checks obrigatórios" e lista `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)` — nomes que não são mais required (e alguns nem existem).
- `analise-prs/regras-de-negocio.md:10-16` (regra viva do próprio resgate) exige "todos os 6 required checks verdes" com a mesma lista velha; a realidade são 3.
- Contradição de fundo: `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-11-07.md:152` classifica como 🔴 CRÍTICO (N01) "4 de 6 required checks ausentes da `main` desde ~24/10" e manda **restaurar os 6**, enquanto `docs/agentes/github-ci.md:31` apresenta 3 como canônico. Decisão de perímetro do dono, não recuperação de branch.
