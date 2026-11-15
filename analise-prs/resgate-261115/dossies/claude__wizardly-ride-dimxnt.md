# Dossiê — `claude/wizardly-ride-dimxnt` (PR #3111)

- Tip `35bb4cba5`, merge-base `6423dc237`, 1 commit: `ci(workflows): remove auto-update e vercel-env-cleanup e pula check Talk X fora de etapa`.
- 16 arquivos, +40/−1051. Propósito: (a) remover `auto-update-pr-branch.yml` + `fila-merge.mjs`/`.unit.mjs` + `.ci-noop`/`ci-refresh`; (b) remover `vercel-env-cleanup.yml` + script + teste; (c) `check-talkx-pr-body.yml` só roda com `(X` no título; (d) docs/testes de contagem 22→20; (e) seção nova em `PENDENCIAS.md`.

## Veredito: **INCORPORADA** (parte) + **OBSOLETA** (parte, revertida de propósito) → `apagar_branch_seguro = true`

Entrou na `main` pelo pacote 6 (`41853318c`, PR #3113). Em seguida o pacote 7 (`b24e31500`, PR #3123; commit interno `03ad0a8fc` "restaura o vercel-env-cleanup e retifica a contagem de variaveis") **desfez de propósito** a remoção do Vercel Env Cleanup: medição na API da Vercel achou 20 variáveis, 12 na lista de remoção, 7 segredos de servidor em preview. Contagem de workflows ficou em **21**.

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/.ci-noop`, `.github/ci-refresh`, `auto-update-pr-branch.yml`, `scripts/ci/fila-merge.mjs`, `fila-merge.unit.mjs` | INCORPORADA (removidos) | `hunk=PRESENT_BYTE`; `git ls-tree origin/main .github/workflows/` não lista `auto-update-pr-branch.yml` |
| `.github/workflows/check-talkx-pr-body.yml` | INCORPORADA | `origin/main:...check-talkx-pr-body.yml:32` `if: contains(github.event.pull_request.title, '(X')` |
| `docs/agentes/mapa-repo.md`, `docs/ci/ARQUITETURA_SEM_DESPERDICIO.md` | INCORPORADA | `PRESENT_BYTE` |
| `.github/workflows/vercel-env-cleanup.yml` (deleção) | OBSOLETA — restaurado de propósito | `03ad0a8fc` / `b24e31500`; header do YAML na main linhas 8-16 explica o erro e a restauração |
| `scripts/ci/vercel-env-cleanup.mjs`, `.unit.mjs` (deleção) | OBSOLETA — restaurados de propósito (teste reforçado: confere PATH do DELETE) | `b24e31500` stat: `+195`, `+203` |
| `docs/agentes/github-ci.md` | INCORPORADA (texto do auto-update-pr-branch "era… removido em 14/11/2026" está em `:60`) + OBSOLETA (contagem 20 → main tem **21** em `:75`, `vercel-env-cleanup` volta à lista em `:79`) | `git grep` em `origin/main` |
| `docs/ci/README.md` (gerado) | idem: `X<NNN>` em `:12`/`:44`; `**21 workflows.**` em `:7`; seção Vercel Env Cleanup em `:31`/`:175` | gerado por `render-workflow-docs.mjs --check` |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | OBSOLETA (20 → 21, mesma data 2026-11-14) | `:78` |
| `scripts/ci/ci-docs-baseline.unit.mjs` | OBSOLETA (asserções 20 → 21) | `:296,:298,:300,:305,:340` |
| `PENDENCIAS.md` | INCORPORADA (seção inteira em `:131-141`); a única linha "faltante" é o item 1, que a main riscou como RESOLVIDO (`:138`) | `git show origin/main:PENDENCIAS.md` |

## Lacunas a recuperar
Nenhuma. As 18 linhas "em lacuna" são exclusivamente a contagem 20 (superada por 21) e as deleções do Vercel Env Cleanup (revertidas com justificativa medida). Observação: `PENDENCIAS.md:139` da main ainda diz que `VERCEL_READONLY_TOKEN` "só o workflow removido usava" — texto herdado desta branch que ficou desatualizado após a restauração (item 2 da tabela), mas é inconsistência da main, não trabalho perdido da branch.

## Verificação adversarial

Parecer: **concordo** com `OBSOLETA` e com `apagar_branch_seguro = true`. Tentei refutar hunk por hunk no
`git diff 6423dc237 origin/claude/wizardly-ride-dimxnt` (16 arquivos) e não achei nenhum resíduo de valor ≥ médio
fora da `main`.

Provas que eu mesmo rodei:

1. **Deleções do `auto-update-pr-branch` / fila de merge: incorporadas.**
   `git diff --name-status 41853318c^ 41853318c` → `D .github/workflows/auto-update-pr-branch.yml`,
   `D scripts/ci/fila-merge.mjs`, `M .github/workflows/check-talkx-pr-body.yml`.
   `git ls-tree --name-only origin/main .github/workflows/` = **21** arquivos, sem `auto-update-pr-branch.yml`.
   Texto da branch sobre a fila está em `origin/main:docs/agentes/github-ci.md:60-62`
   ("O substituto **era** o `auto-update-pr-branch.yml` … removido em 14/11/2026") e o cron desapareceu da
   linha de Agendamentos (`:86-88` lista só até `front-release-targets 17 * * * *`).

2. **Deleção do Vercel Env Cleanup: entrou e foi revertida de propósito — substituição confirmada no arquivo.**
   `git diff --name-status 41853318c^ 41853318c` → `D vercel-env-cleanup.yml`, `D scripts/ci/vercel-env-cleanup.mjs`,
   `D .unit.mjs`; depois `git diff --name-status b24e31500^ b24e31500` → `A` nos três.
   Abri `origin/main:.github/workflows/vercel-env-cleanup.yml:8-16`: o header registra "removido por engano e
   restaurado no mesmo dia", a medição direta na API (`GET /v9/projects/<id>/env`, 14/11: 20 variáveis, 12 na lista,
   7 segredos de servidor em preview — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`,
   `POSTGRES_PASSWORD`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`) e a função atual do
   workflow (auditar enquanto o secret for de leitura). A reversão cobre a necessidade com dado mais novo e melhor
   que o da branch (que se apoiava em `docs/prod-readiness.md` item X24, 8 variáveis, nenhuma da lista).
   Ressuscitar a deleção seria regressão.

3. **Contagem 22→20: superada por 21 em todos os quatro pontos.**
   `docs/agentes/github-ci.md:75` = "**21**" e `:79` inclui `vercel-env-cleanup`;
   `docs/ci/README.md:7` = "**21 workflows.**", seção Vercel Env Cleanup em `:31`/`:175`;
   `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md:78` = "medido em **2026-11-14** … **21**" (mesma data
   da branch, número maior porque conta o workflow restaurado);
   `scripts/ci/ci-docs-baseline.unit.mjs:296,298,300,305,337,340` assertam 21. Confere com o `ls-tree` do item 1:
   o número da `main` é o real, o 20 da branch só valeria se a deleção tivesse ficado.

4. **Talk X por título: incorporado.** `origin/main:docs/ci/README.md:12` e `:44` já dizem "o job só roda quando o
   título traz `(X<NNN>)`".

5. **A única linha "faltante" do `PENDENCIAS.md` é o item 1 e ele foi cumprido.**
   `origin/main:PENDENCIAS.md:138`: `| 1 | ~~Mergear a PR da auditoria dos workflows~~ **RESOLVIDO em 14/11** | — |
   Entrou no pacote 6 (PR #3113, commit 41853318cd), autorizado pelo dono na sessão |`. Os itens 2-4 estão
   byte a byte na `main` (`:139-141`).

Resultado: as 18 linhas de lacuna do JSON são (a) contagem 20, (b) deleções do Vercel Env Cleanup, (c) o item 1 do
PENDENCIAS. Nenhuma é trabalho perdido. Nada a recuperar, branch pode ser apagada.

Observação fora de escopo (inconsistência da `main`, não trabalho da branch): `origin/main:PENDENCIAS.md:139` ainda
descreve `VERCEL_READONLY_TOKEN` como usado "só pelo workflow removido" — texto herdado desta branch que ficou
desatualizado após a restauração do `vercel-env-cleanup.yml`. Pedir ao dono para apagar esse secret hoje quebraria o
workflow restaurado.
