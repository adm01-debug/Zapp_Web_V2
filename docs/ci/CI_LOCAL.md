# CI local — os mesmos testes do GitHub, na sua máquina

`npm run ci:local` roda **os mesmos passos** que o GitHub roda nas PRs, antes de você
enviar. Ele **não tem uma cópia** dos comandos: lê os próprios arquivos
`.github/workflows/*.yml`. Se alguém mudar o CI do GitHub, o local muda junto.

## Comandos

| Comando                                          | O que faz                                                                                                   | Tempo aproximado |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------- |
| `npm run ci:local`                               | `ci.yml` + `db-guard.yml` completos (igual a uma PR)                                                        | 40–60 min        |
| `npm run ci:local:rapido`                        | Igual, mas os testes unitários rodam só os ligados aos arquivos que os **commits** da branch mudaram        | 15–25 min        |
| `npm run ci:local -- --job typecheck,build`      | Só os jobs escolhidos                                                                                       | varia            |
| `npm run ci:local -- --workflow ci`              | Só um workflow (aceita qualquer arquivo de `.github/workflows/`)                                            | varia            |
| `npm run ci:local -- --listar`                   | Mostra o plano (jobs, matriz e passos) sem rodar                                                            | segundos         |
| `npm run ci:local -- --incluir-nao-commitado`    | Testa também o que ainda não foi commitado (diff e arquivos novos)                                          | —                |
| `npm run ci:local -- --evento workflow_dispatch` | Simula outro evento (`pull_request` é o padrão; aceita `push`, `workflow_dispatch`) e `--input chave=valor` | —                |
| `npm run ci:local -- --base origin/main`         | Base de comparação (padrão: `origin/main`)                                                                  | —                |

No fim aparece um **resumo** com ✅/❌ por job, os avisos e o caminho do log de
cada passo (`.ci-local/<data>/`, fora do git). Códigos de saída:

| Código | Significado                                                                         |
| ------ | ----------------------------------------------------------------------------------- |
| `0`    | tudo o que rodou passou                                                             |
| `1`    | algum job falharia no GitHub                                                        |
| `2`    | uso inválido (`--job`/`--workflow` inexistente ou sem valor) ou base sem merge-base |
| `3`    | **nenhum** job rodou (todos pulados pelo `if:`/`needs`) — nada foi verificado       |

## O que ele testa: o HEAD commitado, num clone descartável

Cada execução faz um `git clone --shared` do repositório num diretório temporário,
faz checkout do **HEAD commitado** e roda `bun install --frozen-lockfile` lá. Os
passos rodam nesse clone: um `git fetch --depth=1` (o passo GA02 do `ci.yml` faz
isso), `git config --global` ou qualquer outro comando que mexa no git **não
toca** o `.git` real nem as outras worktrees. O `origin` do clone aponta para o
GitHub, então os `git fetch` dos passos funcionam igual.

Mudanças não commitadas **não entram** — o resumo avisa quantos arquivos ficaram
de fora. Para incluí-las use `--incluir-nao-commitado`.

## Como cada coisa do GitHub vira local

| No GitHub                                                               | Aqui                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passos `run:`                                                           | Rodam igual, com o mesmo shell do runner (`bash -e`, ou o `shell:` do passo/`defaults.run`), no `working-directory` do passo/job/workflow                                                                                                                  |
| `strategy.matrix`                                                       | Algoritmo oficial (produto cartesiano, `exclude`, `include` anexado a todas as combinações compatíveis ou como combinação nova)                                                                                                                            |
| `services:` (ex.: Postgres do `db-guard`)                               | Sobe o mesmo container no Docker (portas só em `127.0.0.1`) e derruba no fim, no erro e no Ctrl-C                                                                                                                                                          |
| `${{ }}` e `if:`                                                        | Semântica do Actions: coerção numérica de `==`/`<`/`>`, status implícito `success()`, `!cancelled()` roda depois de falha, `needs` com falha pula o job (salvo `always()`/`failure()`), funções `contains/startsWith/endsWith/format/join/toJSON/fromJSON` |
| Expressão que o CI local não sabe avaliar (ex.: `hashFiles`)            | **Não roda**: o passo/job falha com aviso claro (nada roda "no escuro")                                                                                                                                                                                    |
| `continue-on-error`, `timeout-minutes` (passo e job)                    | Avaliados como expressão. Timeout mata o grupo de processos inteiro; o `timeout-minutes` do job é um orçamento para todos os passos                                                                                                                        |
| `$GITHUB_ENV`, `$GITHUB_PATH`, `$GITHUB_OUTPUT`, `$GITHUB_STEP_SUMMARY` | Funcionam entre os passos (heredoc incluído)                                                                                                                                                                                                               |
| `gitleaks/gitleaks-action`                                              | `gitleaks git` nos commits novos (equivalente local)                                                                                                                                                                                                       |
| "Rejeitar edição de migration já existente" (`github-script`)           | `git diff --diff-filter=M` em `supabase/migrations/*.sql` (mesmo critério)                                                                                                                                                                                 |
| `actions/checkout`, `setup-*`, `cache`, `upload-artifact`               | Não se aplicam (a máquina já tem o código e as ferramentas)                                                                                                                                                                                                |
| Passos com `sudo`/`apt-get`/`apt`                                       | **Não rodam** na sua máquina: "requer sudo — pulado (só no GitHub)" aparece no resumo com o comando                                                                                                                                                        |
| `${{ secrets.* }}`                                                      | Vêm do ambiente ou de `.env.ci.local` (copie de `.env.ci.local.example`; fora do git). Os valores são **mascarados** (`***`) nos logs                                                                                                                      |

**Só existe no GitHub:** a prévia da Vercel (deploy na nuvem deles).

## Isolamento da máquina

- Cada job tem `HOME`, `TMPDIR` e `RUNNER_TEMP` descartáveis (apagados no fim,
  no erro e no Ctrl-C). `~/.gitconfig`, `~/.config/gh` e `~/.docker` são
  **copiados** para o HOME do job: `git config --global`, `gh auth` ou
  `docker login` de um passo não mudam os seus.
- Caches (bun, Playwright, Deno, npm) continuam os reais. O `site-packages` do
  usuário entra só para leitura (`PYTHONPATH`): o `python3 -m pip` instalado em
  `~/.local` funciona, e o que um passo instala vai para o HOME do job.
- `DOCKER_SHIM_STATE_DIR` (docker-shim do `db-guard`) vai para o temporário da execução.
- O resumo avisa o que ainda escapa do isolamento: `docker tag` (reetiqueta uma
  imagem no docker da máquina), portas publicadas por `services:` e caminhos fixos
  em `/tmp` escritos pelos próprios workflows.

## E2E logado (`e2e-logado.yml`)

O job tem `if:` que só aceita `workflow_run` (depois do CI verde na `main`) ou
`workflow_dispatch`. Com o evento padrão (`pull_request`) ele é **pulado** e o CI
local sai com código `3` ("nenhum job rodou"). Para rodar a suíte isolada de
verdade, use o próprio controlador (Docker, sem credencial real):

    bash scripts/e2e-isolated/run.sh suite authenticated-1-of-3 /tmp/e2e-isolated-authenticated-1

(veja `scripts/e2e-isolated/README.md` para os cinco grupos e o login). Para só
conferir o caminho do workflow: `npm run ci:local -- --workflow e2e-logado --evento workflow_dispatch`.

## Pré-requisitos

`bun`, `node`, `deno`, `docker`, `python3`, `jq`, `gitleaks` — os mesmos do CI.
Os jobs de lint de workflow baixam `actionlint`/`shellcheck`/`zizmor` pinados,
como no GitHub.

## Limites conhecidos

- `--rapido` usa os **commits** da branch (`git diff -z` entre o merge-base e o
  HEAD; com `--incluir-nao-commitado`, também o working tree). Sem merge-base com
  a base (ex.: repositório raso) ele **para com código 2** em vez de "não mudou nada".
  É para iterar: antes do merge o GitHub roda a suíte inteira.
- `hashFiles()` e contextos que só existem no runner não são avaliados: o passo que
  depender deles falha com aviso (os `uses:` de cache que usam `hashFiles` são
  infraestrutura e não rodam).
- O teste `scripts/ci/ci-local.unit.mjs` falha se um `if:`, `env:` ou `run:` dos
  workflows padrão usar algo não suportado; `scripts/ci/ci-local-integracao.unit.mjs`
  roda o CI local de ponta a ponta em repositórios temporários.
