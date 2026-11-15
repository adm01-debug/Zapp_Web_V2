# Dossiê — claude__fix-inventario-vault-cron-edges-261111-0315 (PR #2943)

**Propósito**: `scripts/inventario/gerar-repo.mjs` marcava como `sem_chamador` edges chamadas só por pg_cron com URL no Vault (talkx-scheduler, talkx-storage-purge), porque buscava apenas a URL literal `functions/v1/<nome>` em `supabase/migrations`. A branch adiciona fallback por nome solto, um teste `node:test`, instala ripgrep no job de CI e regenera `inventario/estado/edges.json`.

Commits: `0e8151bf8` (fix), `adb24c8cd`/`519ace946` (ci ripgrep) + 5 merges de main. Tip `79fa2ea51`, merge-base `51bd8cb87`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência na main |
|---|---|---|
| `scripts/inventario/gerar-repo.mjs` | INCORPORADA (versão melhorada) | `origin/main:scripts/inventario/gerar-repo.mjs:63-74` — mesmo comentário, `migrationsUrl`, `migrationsNomeSolto` (regex `^([^-]|-[^-])*${q}`, que além do fallback ignora citação em comentário SQL `--`), `migrations = [...new Set(...)]`. Commits `4de916012` e `ab657aa34` (#3064, pacote 5 que inclui #2943). |
| `scripts/inventario/gerar-repo.unit.mjs` (novo) | INCORPORADA (movido/ampliado) | `origin/main:scripts/ci/inventario-repo.unit.mjs:122-152` — teste "migrations: edge chamada só por cron+Vault conta; citada só em comentário SQL não conta", mesma fixture (`0001_vault_cron.sql`, `vault-edge`, `cron.schedule('vault-edge-1min'...)`), asserts `sem_chamador === false`, `chamada_em.migrations === 1`, ausência em `sem_chamador_no_repo`. O caso "orphan" da branch é coberto pelo caso `comment-edge` + teste de `exemplo` sem chamador (linhas 37-55). Roda via glob `scripts/ci/*.unit.mjs` do passo de CI. |
| `.github/workflows/ci.yml` | INCORPORADA | `origin/main:.github/workflows/ci.yml:159-162` — passo "Instalar ripgrep (usado pelo gerar-repo.mjs)" com `command -v rg \|\| sudo apt-get install -y --no-install-recommends ripgrep`. A linha `scripts/inventario/gerar-repo.unit.mjs` do passo de testes não é necessária: o teste vive em `scripts/ci/` e entra pelo glob (linha 165). |
| `TESTING_CONVENTION.md` | INCORPORADA por equivalência | A linha do comando na main (linha 53) reflete o comando real da CI; o teste entra pelo glob `scripts/ci/*.unit.mjs`, então não há entrada a adicionar. |
| `inventario/estado/edges.json` | INCORPORADA (artefato gerado) | `origin/main:inventario/estado/edges.json` gerado em `2026-11-14T02:24:51Z` pela automação; `talkx-scheduler` (`migrations: 7, sem_chamador: false`) e `talkx-storage-purge` (`migrations: 3, sem_chamador: false`) fora de `sem_chamador_no_repo`. `auto-close-conversations` e `recover-corrupted-audios` voltaram à lista na main de propósito (regex da main ignora menções só em comentário SQL). |

## Veredito
**INCORPORADA** — toda a intenção da branch está na main em forma igual ou superior (fix + teste + ripgrep na CI + inventário regenerado). O comentário de fechamento (#3064 / `ab657aa34`) confere com o código.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **concordo com INCORPORADA** (`concorda=true`, `apagar_branch_seguro=true`). Tentei refutar hunk por hunk e não achei nada de valor ≥ médio fora da main.

Escopo real da branch (nada além disto): `git diff --stat 51bd8cb87 origin/claude/fix-inventario-vault-cron-edges-261111-0315` → 5 arquivos, 83 inserções, 3 remoções (`ci.yml` +6, `TESTING_CONVENTION.md` 1 linha, `edges.json` 1 linha, `gerar-repo.mjs` +10/-1, `gerar-repo.unit.mjs` +66). Os 8 commits à frente são 4 merges da main + 3 commits próprios (`0e8151bf8`, `adb24c8cd`, `519ace946`).

Checagens independentes:
1. **Fix na main, superior.** `origin/main:scripts/inventario/gerar-repo.mjs` linhas 63-74 (contagem no blob da main): `migrationsUrl` + `migrationsNomeSolto` + `[...new Set(...)]`. A branch usa `rgFiles(q, ['supabase/migrations'])` (casa menção em comentário SQL); a main usa `rgFiles('^([^-]|-[^-])*' + q, ...)`, que mantém o fallback e exclui comentário `--`. Verifiquei que o fixture da própria branch continua passando nessa regex: a linha `SELECT cron.schedule('vault-edge-1min', ...)` casa sem `--` antes. Procedência: `git log -S'migrationsNomeSolto' --oneline origin/main -- scripts/inventario/gerar-repo.mjs` → só `ab657aa34`.
2. **`ab657aa34` é ancestral de `origin/main`** (`git merge-base --is-ancestor ab657aa34 origin/main` = 0) e seu `--stat` contém exatamente os arquivos desta branch: `scripts/inventario/gerar-repo.mjs` (23 linhas), `scripts/ci/inventario-repo.unit.mjs` (+50), `.github/workflows/ci.yml` (7), `TESTING_CONVENTION.md` (2), `inventario/estado/edges.json` (2). O assunto do commit lista `#2943` nominalmente.
3. **Teste: main é superestimativa, não perda.** `origin/main:scripts/ci/inventario-repo.unit.mjs` tem 5 testes (stdin vazio, rg ausente falha fechado, rg exit 2, detecção com rg real, **migrations cron+Vault vs. comentário SQL**, stdin grande). O teste da branch tem 2 (vault-edge não-órfã, orphan-edge órfã) — ambos cobertos pelos asserts das linhas 139-152 e 119 do arquivo da main. Nenhum caso da branch fica descoberto.
4. **Teste roda na CI da main.** `origin/main:.github/workflows/ci.yml` linha 166 usa o glob `node --test scripts/ci/*.unit.mjs`, que inclui `inventario-repo.unit.mjs`, e as linhas 159-162 instalam o ripgrep antes (comentário adaptado ao novo caminho). O caminho `scripts/inventario/gerar-repo.unit.mjs` da branch não existe na main — não é lacuna, é consequência do arquivo ter sido reposicionado em `scripts/ci/`.
5. **`TESTING_CONVENTION.md`: hunk obsoleto, não perdido.** A única linha da branch acrescentava `scripts/inventario/gerar-repo.unit.mjs` à lista do comando. Na main (linha 53) essa entrada seria incorreta (arquivo não existe lá) e redundante (glob `scripts/ci/*.unit.mjs`); a linha da main inclusive corrigiu `scripts/team-chat/team-chat-db-validate.unit.mjs`, que na branch ainda está no caminho antigo. Aplicar o hunk da branch seria regressão.
6. **`edges.json`: artefato gerado, main mais recente.** Branch: `gerado_em 2026-11-11T13:10:30Z`. Main: `2026-11-14T02:24:51Z`, `total 92`, `talkx-scheduler.chamada_em.migrations = 7` e `talkx-storage-purge.chamada_em.migrations = 3`, ambos fora de `sem_chamador_no_repo` — o efeito do fix está materializado em produção. A diferença de lista (main tem `auto-close-conversations` e `recover-corrupted-audios` a mais) é o ganho da regex de comentário, não perda.
7. **Nada removido de propósito contra a branch.** `git log --grep=revert --grep=remove -i origin/main -- scripts/inventario/gerar-repo.mjs` → apenas `ab657aa34` e `7991a1f47` (anterior ao fix), nenhum revert.

Conclusão: zero hunk recuperável. A branch é seguramente descartável.
