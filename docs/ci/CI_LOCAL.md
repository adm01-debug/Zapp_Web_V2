# CI local — os mesmos testes do GitHub, na sua máquina

`npm run ci:local` roda **os mesmos passos** que o GitHub roda nas PRs, antes de você
enviar. Ele **não tem uma cópia** dos comandos: lê os próprios arquivos
`.github/workflows/*.yml`. Se alguém mudar o CI do GitHub, o local muda junto.

## Comandos

| Comando                                     | O que faz                                                                          | Tempo aproximado |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| `npm run ci:local`                          | `ci.yml` + `db-guard.yml` completos (igual a uma PR)                               | 40–60 min        |
| `npm run ci:local:rapido`                   | Igual, mas os testes unitários rodam só os ligados aos arquivos que a branch mudou | 15–25 min        |
| `npm run ci:local -- --job typecheck,build` | Só os jobs escolhidos                                                              | varia            |
| `npm run ci:local -- --workflow e2e-logado` | Outro workflow (ex.: E2E logado, que sobe ambiente isolado em Docker)              | varia            |
| `npm run ci:local -- --listar`              | Mostra o plano (jobs e passos) sem rodar                                           | segundos         |
| `npm run ci:local -- --base origin/main`    | Base de comparação (padrão: `origin/main`)                                         | —                |

No fim aparece um **resumo** com ✅/❌ por job, os avisos e o caminho do log de
cada passo que falhou (`.ci-local/<data>/`). O código de saída é `1` se algum job
falharia no GitHub.

## Como cada coisa do GitHub vira local

| No GitHub                                                               | Aqui                                                                                                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Passos `run:`                                                           | Rodam igual, com o mesmo shell do runner (`bash -e`, ou o `shell:` do passo)                                                              |
| `strategy.matrix` (ex.: Unit Tests 1/3, 2/3, 3/3)                       | Expande igual                                                                                                                             |
| `services:` (ex.: Postgres do `db-guard`)                               | Sobe o mesmo container no Docker e derruba no fim                                                                                         |
| `${{ env/matrix/github/steps/needs }}`, `if:`                           | Avaliados localmente; `github.event_name` é `pull_request` e a base é o `merge-base` com `origin/main`                                    |
| `$GITHUB_ENV`, `$GITHUB_PATH`, `$GITHUB_OUTPUT`, `$GITHUB_STEP_SUMMARY` | Funcionam entre os passos                                                                                                                 |
| `gitleaks/gitleaks-action`                                              | `gitleaks git` nos commits novos (equivalente local)                                                                                      |
| "Rejeitar edição de migration já existente" (`github-script`)           | `git diff --diff-filter=M` em `supabase/migrations/*.sql` (mesmo critério)                                                                |
| `actions/checkout`, `setup-*`, `cache`, `upload-artifact`               | Não se aplicam (a máquina já tem o código e as ferramentas)                                                                               |
| `${{ secrets.* }}`                                                      | Vêm do ambiente ou de `.env.ci.local` (copie de `.env.ci.local.example`; fora do git). Sem valor, o passo roda com vazio e o resumo avisa |

**Só existe no GitHub:** a prévia da Vercel (deploy na nuvem deles).

## Pré-requisitos

`bun`, `node`, `deno`, `docker`, `python3`, `jq`, `gitleaks` — os mesmos do CI.
Os jobs de lint de workflow baixam `actionlint`/`shellcheck`/`zizmor` pinados,
como no GitHub.

## Limites conhecidos

- Funções de expressão além de `always()/success()/failure()/cancelled()` não são
  avaliadas: o teste `scripts/ci/ci-local.unit.mjs` falha se um `if:` dos
  workflows padrão usar algo não suportado — assim nada roda "no escuro".
- O modo `--rapido` é para iterar; antes do merge o GitHub roda a suíte inteira.
