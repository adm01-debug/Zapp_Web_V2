# GitHub (perímetro, CI, workflows) — referência para agentes

Ler quando mexer em branch protection, settings do repo, `.github/workflows/`, ou quando um merge
ou um workflow falhar de forma estranha.

## Escrita no GitHub

- Repo `adm01-debug/Zapp_Web_V2` (grafia canônica; a API aceita `zapp-web-v2`), branch `main`, público.
- **Escrita: somente MCP `GITHUB - MCP - FOREVER`** (`github_push_files`). O MCP padrão do GitHub
  retorna 403 em write. `github_push_files` sobrescreve o arquivo — mande o conteúdo integral com
  apenas a mudança semântica, e confira depois que o arquivo remoto bate com o que você testou. Ele aceita
  `files` e `delete` no mesmo commit (1 commit atômico).
- Commits: `<tipo>(<escopo>): <assunto>` com assunto ≥ 10 caracteres e sem ponto final; tipos aceitos pelo
  hook `commit-msg` (`scripts/ci/commit-msg-lint.mjs`): `feat fix docs style refactor perf test build ci
  chore security revert`. `infra` existe só como tipo de **branch** (`claude/infra-...`); para o commit use
  `ci:` ou `chore:`. Via MCP o hook não roda — siga o padrão mesmo assim.
- Sessão na nuvem: `git clone` e leitura por `raw.githubusercontent.com` funcionam (repo público), mas
  `git push` volta 403 do proxy quando o repo não está entre as fontes autorizadas da sessão — escreva
  só pelo MCP. Para listar PRs abertas com os arquivos que tocam numa chamada só, use `github_graphql`
  (`pullRequests(states:OPEN){ nodes { number files { nodes { path } } } }`): `github_list_pull_requests`
  devolve o repositório inteiro em cada nó e estoura o contexto.

## Perímetro do GitHub — estado canônico

**Regra:** qualquer mudança nos campos abaixo atualiza **esta tabela** e
`scripts/ci/github-settings-baseline.json` **no mesmo PR** — o `settings-guard` compara a realidade com
o baseline e divergência é regressão.

| Campo | Estado canônico | Verificado por |
|---|---|---|
| Branch protection — required checks | **3**: `✅ CI Gate (required check)` · `🏗️ Build` · `🔎 TypeCheck` | `settings-guard` ⚠ |
| Branch protection — `strict` | **`true`** (política vigente; `false` foi **revogado**) | `settings-guard` ⚠ |
| Branch protection — `enforce_admins` | `true` | `settings-guard` ⚠ |
| Branch protection — histórico linear | `true` | `settings-guard` ⚠ |
| Branch protection — review obrigatório | nenhum (deliberado: vários agentes com auto-merge) | — |
| Merge | `allow_squash_merge=true` · `allow_merge_commit=false` · `allow_rebase_merge=false` · `allow_auto_merge=true` · `delete_branch_on_merge=true` | `settings-guard` |
| Squash | `squash_merge_commit_message=PR_BODY` · `squash_merge_commit_title=PR_TITLE` | `settings-guard` |
| Environments | **9**: `banco-leitura` · `copilot` · `db-ledger-evidence` · `legacy-import-destrutivo` · `perimetro-leitura` · `Preview` · `producao-ddl` · `producao-edge-functions` · `Production` | `settings-guard` |
| Environments com revisor obrigatório | `producao-ddl` · `db-ledger-evidence` · `legacy-import-destrutivo` (revisor: `adm01-debug`); `producao-edge-functions` só restringe a branch | API |
| Actions — `allowed_actions` | `selected` | `settings-guard` |
| Actions — `sha_pinning_required` | `true` | `check-workflow-pins` |
| GitHub Apps | **não auditado** — o token da sessão não lista instalações | — |

⚠ Os campos de branch protection são lidos com o `GITHUB_TOKEN` de workflow, que **não** tem o escopo
`administration`: a API responde **403** e o guard marca o campo como **"NÃO VERIFICÁVEL"** — não como
regressão. **403 administrativo é limite de evidência**, nunca confirmação de configuração errada.

Fatos do perímetro que já custaram retrabalho:

- **`✅ CI Gate`** existe porque, com `build` dependendo de `typecheck` e `unit-tests`, um teste
  vermelho fazia o `Build` ficar `skipped` e o merge passava. O gate (`ci.yml`, job `ci-gate`,
  `if: always()`) falha se qualquer job crítico falhar. E2E e mutação do mapa **não** estão no gate.
- **Sintoma de `strict=true`:** merge retorna 405 "N of N required status checks are expected" com CI
  verde — a PR ficou `BEHIND`. Atualize a branch; não mexa no `strict`. Antes de qualquer
  `github_update_branch_protection`, leia o estado com `github_get_branch_protection` (PUT completo sem
  mandar todos os campos já regrediu o `strict` três vezes; para um campo só, use
  `github_update_required_status_checks`).
- **Fila de merge nativa é impossível aqui** — `adm01-debug` é conta `User`; `merge_queue` responde
  `422 Invalid rule`. O gatilho `merge_group` só resta em `db-guard.yml`, inerte (`ci.yml` e `codeql.yml`
  já não o declaram). O substituto é o `auto-update-pr-branch.yml` (fila serial: atualiza uma PR com
  auto-merge por vez, via `scripts/ci/fila-merge.mjs`).
- **NÃO desligue `can_approve_pull_request_reviews`.** O toggle é "Allow GitHub Actions to create
  **and** approve pull requests": desligado, o `types-sync` não consegue abrir PR.
- **`TYPES_SYNC_PR_TOKEN` não é necessário — não crie.** O PR do `types-sync` nasce com `GITHUB_TOKEN`
  e o próprio workflow aprova os runs em `action_required`.
- **App "Supabase for GitHub": desligado** (branching automático e deploy). Ele apontava para o banco
  oficial e gerava custo por PR. Se um dia reativar preview, use um projeto Supabase separado.
- `secret_scanning_non_provider_patterns` não liga (exige plano pago): vazamento de `DESTINO_URL` não
  dispara alerta neste repo público.

## Workflows

A fonte canônica do inventário é o **gerado** `docs/ci/README.md` (`scripts/ci/render-workflow-docs.mjs
--check` roda no CI; não editar à mão). Hoje são **22** arquivos em `.github/workflows/`:
`auto-update-pr-branch`, `branch-hygiene-audit`, `check-talkx-pr-body`, `ci`, `codeql`, `crm-sync-worker`, `db-guard`,
`db-live-guard`, `db-migrate`, `contexto`, `deploy-functions`, `e2e-logado`, `e2e-logado-isolado`,
`e2e-talkx`, `front-release-targets`, `inventario-estado-semanal`, `notifica-falha-main`,
`settings-guard`, `talkx-status-regen`, `targeted-ledger-evidence`, `types-sync`, `vercel-env-cleanup` —
mais os dinâmicos do GitHub (Dependabot, Dependency Graph, Copilot).

- **Lint dos próprios workflows mora no `ci.yml`** (job `workflow-lint`, no gate): actionlint 1.7.7 +
  shellcheck 0.10.0 + zizmor 1.30.1, pins em `.github/toolchain.json`. Reproduz local com
  `uvx zizmor==1.30.1 --no-online-audits --min-severity medium .github/workflows`; `workflow_run`
  legítimo leva `# zizmor: ignore[dangerous-triggers]` na linha do gatilho.
- **Agendamentos (UTC):** types-sync `49 5 * * 1` · db-live-guard `13 6 * * 1` · settings-guard
  `15 7 * * *` · talkx-status-regen `45 7 * * 1` · branch-hygiene `56 7 * * 1` · codeql `30 9 * * *` ·
  inventario-estado-semanal `23 10 * * 1` · auto-update-pr-branch `7,37 * * * *` ·
  front-release-targets `17 * * * *`.
- **`db-live-guard` não roda em PR, por design** (não expõe `DESTINO_URL` a código de PR): roda no
  push da `main`, agendado e por dispatch, e abre/comenta uma issue única com label `db-live-guard`.
  Por isso o "Contrato DB vivo" nunca é required check. O retry de conexão mora **só** no transporte
  (`withPsqlEnvironment`, `PSQL_CONNECT_RETRIES`); o job passa `LEDGER_RETRY_DELAYS_MS: ""` para não
  empilhar um segundo retry dentro de `queryLedger()`.
- **CodeQL** analisa também os próprios workflows (job `analyze-actions`, check
  `🔬 CodeQL (actions)`); não é required check.
- **`crm-sync-worker`**: schedule comentado e condição `vars.CRM_SYNC_WORKER_ENABLED` são preparação
  deliberada para reativação, não código morto.
- **`db-guard.yml` usa um Postgres compartilhado** (`services:` + `scripts/db-audit/docker-shim`
  instalado como `docker`). Passo que usa `docker logs` para readiness ou depende de PostgREST precisa
  de `SKIP_DOCKER_SHIM: "1"` no `env:` do step — confira os passos vizinhos no próprio arquivo, a
  lista muda com frequência.
- **Issues de alerta com mais de 20 comentários de bot** (`types-sync`, `db-live-guard`): feche com
  comentário-resumo e abra uma nova com o mesmo título e link para a anterior.

## Guards do CI que você pode rodar antes do PR

- `node --test scripts/ci/*.unit.mjs` (docs e baselines do CI);
- `node scripts/db-audit/supabase-usage-guard.mjs` (se mexer em `.from()`/`.rpc()` ou migration);
- `node scripts/ci/check-claude-md-integrity.mjs` (GA02; se mexer em `AGENTS.md` ou `docs/agentes/`: exige os
  cabeçalhos do `AGENTS.md` e barra o conjunto `AGENTS.md` + `CLAUDE.md` + `docs/agentes/*.md` encolher >30%).

Arquivos com contrato verificado por teste — ao mexer, rode o teste junto:
`src/hooks/team-chat/README.md` (`__tests__/contratosModulo.test.ts`); `docs/agentes/github-ci.md`
(`ci-docs-baseline.unit.mjs`: contagem de workflows, política de `strict`, "403 administrativo");
`docs/agentes/vercel-deploy.md` (`docs-deploy-coerencia.unit.mjs`: seção `### Deploy e edge functions` e
retificação; `front-release-targets.unit.mjs`: `zappweb.app.br` serve a V3); `docs/ci/README.md` (gerado —
não edite à mão).
