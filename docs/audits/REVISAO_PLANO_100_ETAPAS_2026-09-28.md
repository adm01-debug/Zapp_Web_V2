# Revisão exaustiva do plano de 100 etapas — status ao vivo

**Data:** 2026-09-28 · **Plano auditado:** `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-09-27.md`
**Método:** git log de `.github/` desde 2026-09-27 20:00Z, leitura de workflow files, GitHub API (secrets, branch protection, `allowed_actions`, runs em `waiting`), leitura de `supabase/functions/_shared/validation.ts`, PRs abertas com arquivos afetados.

**Legenda:** ✅ concluído · ⚠️ parcial · ❌ não feito

---

## Resumo executivo

| Status | Quantidade | Etapas |
|---|---|---|
| ✅ Concluído | 4 | E01, E06, E09, E12 |
| ⚠️ Parcial | 5 | E02, E03, E07, E08, E46 |
| ❌ Não feito | 91 | todo o resto |

Das 12 etapas da Fase 0 (incêndio imediato), **4 concluídas, 4 parciais, 4 intocadas.**
Das Fases 1–9 (88 etapas), **0 concluídas, 1 parcial (E46), 87 intocadas.**

---

## Fase 0 — Apagar o incêndio (E01–E12)

### ✅ E01 — Aprovar/cancelar run zumbi do deploy-functions
**Evidência:** `GET /actions/workflows/deploy-functions.yml/runs?status=waiting` retornou 0 runs.
O run 36337021716 foi resolvido. Fila desbloqueada.

### ⚠️ E02 — Resolver conflito #1045 × #1052 × #1017
**Parcial.** PRs abertas `#1092` e `#1094` tentam reconciliar as mesmas migrations `5x0000`.
A colisão não está inteiramente resolvida — 2 PRs ativas ainda tocam `supabase/migrations/` com versões concorrentes.
**O que falta:** merge sequencial confirmado; `db-live-guard` verde após o último merge.

### ⚠️ E03 — Reconciliar os 5 sub-checks do drift
**Parcial.** PRs de reconciliação abertas (`#1092`, `#1094`). `grants-baseline.json` foi regenerado (commit `26c10d6`).
**O que falta:** run `workflow_dispatch` do `db-live-guard` verde; issue #1013 fechada automaticamente.

### ❌ E04 — Documentar cadeia do drift de 27/09 no CLAUDE.md
Nenhum parágrafo de timeline adicionado ao CLAUDE.md cobrindo PRs `#885`, `#897`, `#930`, `#1017`, `#1045`, `#1052` e a origem das colisões de sessões paralelas.

### ❌ E05 — Docker Hub auth no types-sync e db-live-guard
`DOCKERHUB_TOKEN` e `DOCKERHUB_USER` não existem como secrets. Nenhum `docker login` adicionado a nenhum workflow.
`supabase gen types` continua puxando `postgres-meta` anonimamente — cota por IP do runner compartilhado.

### ✅ E06 — `set -o pipefail` nos Gates 1 e 2 do types-sync
**Evidência:** commit `dec80af` — `set -o pipefail` adicionado em `types-sync.yml:262` e `types-sync.yml:276`.
Gates 1 e 2 agora falham quando o typecheck ou o usage-guard retornam exit ≠ 0.

### ⚠️ E07 — Corrigir PR #1053 e deletar SUPABASE_SERVICE_ROLE_KEY
**Parcial.** PR #1053 **foi mergeada** (commits `ace85d0`, `cfec868`, `3eff605`). Os 2 SHA pins foram corrigidos (setup-bun 39→40 chars, checkout SHA corrigido).
**O que falta — gap de segurança aberto:** `SUPABASE_SERVICE_ROLE_KEY` criado em 2026-09-27T19:25:13Z **ainda existe no nível repo** (confirmado via `github_list_actions_secrets`). Em repo público, qualquer workflow de PR pode ler secrets de repo pelo runner. O teardown de `conversation_closures` por RPC com `SECURITY DEFINER` (sem service_role) nunca foi implementado.

### ⚠️ E08 — Corrigir e2e/conversation.spec.ts:49 e talkx.spec.ts:160
**Parcial.** Commit `402d8d5` (branch `claude/happy-ritchie-20c8b5`, PR #1093): 3 root causes corrigidas — cleanup de reactions, skip de FF/WebKit para `conversation.spec.ts`, conexão E2E seedada para talkx.
**O que falta:** verificar 3 runs consecutivos do `e2e-logado` verdes e `flaky: 0`; os 3 flaky (`talkx:101`, `conversation:76`, `messaging:38`) sem `expect.poll`/`toBeVisible({timeout})` implementados.

### ✅ E09 — Não desligar dedupe quando migrations falha
**Evidência:** commit `8bd9735` — exceção `migrationsFalhou` removida do bloco de dedupe em `db-live-guard.yml`.
Drift do mesmo tipo gera no máximo 1 comentário por ciclo, independente de migrations divergir.

### ❌ E10 — Remover/corrigir webhook n8n morto (671865950)
Webhook `671865950` (`n8n.atomicabr.com.br/webhook/gh-push-graph-sync-v1b2c3d4`) ainda ativo, todas as entregas 404. Nenhuma ação: nem `github_delete_webhook` nem correção de URL no N8N com ping validado.

### ❌ E11 — Deletar 46 caches codeql-overlay de hoje
Os 46 caches `codeql-overlay-base-database-*` (~10 GB, um por push) não foram deletados. `active_caches_size_in_bytes` continua próximo do limite de 10 GB — caches úteis (`bun-*`, `setup-go`) continuam em risco de evicção LRU.

### ✅ E12 — `set -o pipefail` no step de deploy do deploy-functions
**Evidência:** commit `58d14db` — `set -o pipefail` adicionado em `deploy-functions.yml:253-256`.
Falha do CLI (`supabase functions deploy`) agora aparece imediatamente em vez de 12 min depois.

---

## Fase 1 — Corretude do shell e lint de workflow (E13–E22)

### ❌ E13 — `defaults: run: shell: bash` nos 13 workflows
Nenhum dos 13 arquivos foi alterado. `grep "defaults:" .github/workflows/*.yml` retorna vazio.
Consequência: além dos Gates corrigidos em E06 e E12, todos os demais `| tee`, `| wc`, `| grep -c`, `| tar` nos outros workflows ainda mascaram exit codes via `tee`.

### ❌ E14 — Unit test `workflow-shell.unit.mjs`
Arquivo `scripts/ci/workflow-shell.unit.mjs` não existe. Nenhuma proteção automatizada em CI contra regressão do `defaults`.

### ❌ E15 — `actionlint` no job Lint
`actionlint` não instalado, não adicionado ao `ci.yml`. SHA de 39 chars em um futuro workflow não seria pego antes do `check-workflow-pins`.

### ❌ E16 — `zizmor` com baseline
`zizmor` não instalado; `scripts/ci/zizmor-baseline.json` não existe.

### ❌ E17 — Glob em vez de lista manual de testes Deno
`ci.yml:78-97` ainda contém a lista manual de arquivos Deno. `postgrest-filters.test.ts` continua fora do CI.

### ❌ E18 — Glob de `*.test.sh` no db-guard
`db-guard.yml` ainda tem os 25 passos listados manualmente. Novo `*.test.sh` sem adição manual à lista passa sem rodar.

### ❌ E19 — `if: github.ref` → step de falha explícita
`db-migrate.yml:62`, `db-live-guard.yml:44`, `e2e-logado.yml:43` e `targeted-ledger-evidence.yml:27` ainda usam `if: github.ref == 'refs/heads/main'`. Dispatch em branch ≠ main termina `skipped` verde, não `failure`.

### ❌ E20 — `set -euo pipefail` em crm-sync-worker e supabase-sync
Ambos os arquivos sem mudança. Dependem do `-e` implícito do runner.

### ❌ E21 — Cabeçalhos de comentário atualizados
`ci.yml:1-7` ainda diz "4 jobs"; `types-sync.yml:77-82` ainda diz "3 workflows" (são 5 com `DESTINO_URL`).

### ❌ E22 — `cancel-in-progress: false` no db-live-guard
`db-live-guard.yml:37` ainda tem `cancel-in-progress: ${{ github.event_name == 'push' }}`. Push na `main` continua podendo cancelar o run agendado do dia.

---

## Fase 2 — Filas, zumbis e cadência (E23–E34)

### ❌ E23 — Job `preflight-fila` no db-migrate e deploy-functions
Sem esse job, o 3° dispatch ainda pode cancelar o pendente silenciosamente.

### ❌ E24 — Workflow `ops-zumbis.yml`
Workflow não criado. Runs em `waiting` há horas continuam sem cancel automático.

### ❌ E25 — Notificar aprovação pendente fora da aba Actions
Nenhuma notificação em PR de origem ou issue de ops ao entrar em `waiting`.

### ❌ E26 — Concurrency por SHA em ci.yml, db-guard, codeql
`ci.yml:33`: `group: ci-${{ github.event.pull_request.number || github.ref }}` — ainda por ref.
Metade dos runs na `main` ainda é cancelada; commits da `main` sem CI verde.

### ❌ E27 — e2e-logado por SHA ou com paths
Sem mudança de concurrency nem `paths`. Merge de docs ainda dispara 13 min de E2E.

### ❌ E28 — `paths-ignore` no codeql para docs/migrations
Merge de migration continua gerando run do CodeQL e cache overlay.

### ❌ E29 — Eliminar cache overlay por commit no CodeQL
Nenhuma opção adicionada ao `codeql-action`; sem step de cleanup de cache.

### ❌ E30 — Cache do `bun install`
Sem `actions/cache` em `~/.bun/install/cache` em nenhum job.

### ❌ E31 — Cache do Playwright
`bunx playwright install --with-deps chromium firefox webkit` continua rodando em todo PR/push sem cache.

### ❌ E32 — Skip de drafts no ci.yml
Nenhum job tem `if: github.event.pull_request.draft == false || ...`. Drafts consomem pipeline inteira.
(Nota: `ready_for_review` foi adicionado ao trigger por commit anterior `f0633ac`, mas o condicional nos jobs não foi.)

### ❌ E33 — Skip de PR só de docs
Sem job `changes`; sem `docs-only-ok` que reporte os 6 contexts required como sucesso.

### ❌ E34 — Reduzir artifacts
`dist` (11 MB/PR), `coverage-report`, `playwright-report` ainda gerados a cada run. Retention padrão não alterado.

---

## Fase 3 — Perímetro de segurança (E35–E50)

### ❌ E35 — Role `ci_reader` read-only + secret `DESTINO_URL_RO`
Role não criada. Sem migration de `CREATE ROLE ci_reader`. `DESTINO_URL_RO` não existe como secret.

### ❌ E36 — db-live-guard e types-sync usando DESTINO_URL_RO
Ambos ainda usam `DESTINO_URL` (escrita) para operações read-only.

### ❌ E37 — `DESTINO_URL` movida para environment secret de producao-ddl
`DESTINO_URL` ainda no nível repo. Qualquer job na `main` (inclusive `types-sync` que faz `bun install` de terceiros com `actions:write`) alcança a credencial de escrita.

### ❌ E38 — `SUPABASE_ACCESS_TOKEN` e outros → producao-edge-functions
`SUPABASE_ACCESS_TOKEN`, `EXTERNAL_SUPABASE_*`, `PROMOGIFTS_SUPABASE_*`, `PREVIEW_EGRESS_*`, `CRON_SECRET` ainda no nível repo.
Estado confirmado: 17 secrets no nível repo, 0 nos environments.

### ❌ E39 — db-migrate com TLS pinado e URL fora do argv
`db-migrate.yml:1145,1153` ainda passa `--db-url "$DESTINO_URL"` no argv do CLI. Senha visível em `/proc`. Sem bloco `endurecerDestinoTls`/`validarSupabaseCa`.

### ❌ E40 — deploy-functions: secrets por `--env-file` em vez de argv
`deploy-functions.yml:153,183-186,204-207,230-233` ainda usa `CHAVE="$VALOR"` no argv do `supabase secrets set`.

### ❌ E41 — `allowed_actions: selected`
Confirmado via API: `allowed_actions: all`. As 12 actions reais do repo poderiam ser restritas, mas a allowlist não foi criada.

### ❌ E42 — Unit test `allowed-actions.unit.mjs`
Arquivo não existe. `scripts/ci/allowed-actions.json` não existe.

### ❌ E43 — types-sync dividido em jobs `gerar` e `propor`
`types-sync.yml` ainda em job único. `bun install` de terceiros roda com token de escrita (`contents+PR+actions:write`).

### ❌ E44 — types-sync filtra branch/evento antes de aprovar runs
`types-sync.yml:446-451` ainda aprova por SHA sem checar `head_branch === 'automation/types-sync'` e `event === 'pull_request'`.

### ❌ E45 — Remover `continue-on-error` do pgbouncer
`db-live-guard.yml:89` e `types-sync.yml:74` ainda têm `continue-on-error: true`. Falha do pgbouncer cai silenciosamente para `--db-url` cru no argv.

### ⚠️ E46 — Fechar Code Scanning #13 (validation.ts:143)
**Parcial.** O código em `supabase/functions/_shared/validation.ts:133-148` já foi corrigido: respostas 5xx devolvem `'Internal server error'` genérico e logam o stack server-side. PR #1064 ("fix(edges): fechar CodeQL js/stack-trace-exposure (alert #13)") está **aberta e não mergeada**. O alerta #13 permanece aberto até o PR mergear e o CodeQL rodar na `main`.

### ❌ E47 — Desinstalar app "Supabase for GitHub"
Check run `Supabase Preview` (app 330661) ainda reporta em push na `main`. App não removido.

### ❌ E48 — `SUPABASE_PROJECT_REF` → `vars.SUPABASE_PROJECT_REF`
Ainda como secret (mascara `tnnnlkbymytvtqngbbqh` como `***` nos logs). Inconsistência com 4 literais no código permanece.

### ❌ E49 — `secret_scanning_validity_checks` ligado
`security_and_analysis.secret_scanning_validity_checks` ainda `disabled`.

### ❌ E50 — Limpar environments órfãos
`copilot`, `Preview`, `Production` sem regras nem uso. Nos 4 protegidos: `can_admins_bypass: true` e `prevent_self_review: false` sem alteração.

---

## Fase 4 — db-migrate confiável (E51–E60)

### ❌ E51–E60 — Todas não implementadas

Nenhuma das 10 etapas desta fase foi executada:
- E51: SHA do arquivo alvo não incluído no `confirm_runtime_sha256`
- E52: `generic-migration-runtime.sql` sem ACL/grants/publicações/extensões nas assinaturas
- E53: dry-run sem parse para verificar `TARGET_VERSION` único
- E54: pós-apply sem comparação `statements` ledger × arquivo
- E55: 1.748 linhas do db-migrate não modularizadas (contratos históricos nos arquivos)
- E56: `timeout-minutes` do db-migrate ainda 25 min; sem `PSQL_CONNECT_RETRIES` no job
- E57: validação pós-apply ainda por `version` + `name` sem tratar reconciliadas
- E58: CLAUDE.md ainda sem rota canônica única de DDL (conflito entre seção 1 e "Decisões de 26/09")
- E59: Job Summary do dry-run sem os 5 campos (arquivo alvo, hash do arquivo, hash do schema, versions ausentes, contrato usado)
- E60: db-guard sem dry-run offline do db-migrate contra postgres:17 descartável

---

## Fase 5 — deploy-functions operável (E61–E68)

### ❌ E61–E68 — Todas não implementadas

- E61: Sem input `sync_secrets` (default `false`)
- E62: Sem input `dry_run` com snapshot remoto + diff no summary
- E63: Sem step de rollback automático `if: failure()`
- E64: `smoke-functions.mjs` ainda executado do checkout, não do tooling fixado
- E65: curl do catálogo sem `--connect-timeout` e `--max-time`
- E66: `stable-inventory.mjs` sem `lastReason` na exceção final
- E67: Artifact `edge-deploy-evidence` sem filtragem de URLs/tokens
- E68: Sem decisão/implementação de dispatch automático de deploy após merge em `main`

---

## Fase 6 — Guarda vivo e types-sync (E69–E80)

### ❌ E69–E80 — Todas não implementadas

- E69: `db-live-guard.yml:19-24` paths ainda não precisos (mudança em `supabase/functions/**` ainda abre conexão ao banco)
- E70: Sem tee + artifact da saída dos passos de migrations e paridade
- E71: Sem distinção `ci-infra` × drift nas issues do guarda
- E72: Fechar issues sem respeitar label `keep-open` — ainda fecha tudo verde
- E73: Retry de transporte para o passo de types no guarda vivo não implementado
- E74: Gate 3 ainda por `diff` de `types.ts` só, sem limiar por artefato nem guard de `grants-baseline.json`
- E75: `types-sync` sem `paths-ignore` dos 4 artefatos gerados (PR `[auto]` redispara sync)
- E76: `types-sync.yml` sem `actions/setup-node` (único dos 4 sem Node explícito)
- E77: `pull-request-operation` sem log no summary; sem falha quando `none` com drift
- E78: Interpolações `${{ steps.* }}` sem mover para `env:` (potencial `template-injection` no zizmor)
- E79: `docs/MIGRATIONS.md` sem seção "Quando o db-live-guard falha"
- E80: `types-sync` ainda semanal (`49 5 * * 1`); guarda diário (`13 6 * * *`); 6 dias por semana sem sync

---

## Fase 7 — Pipeline de PR mais rápido e barato (E81–E90)

### ❌ E81–E90 — Todas não implementadas

- E81: `test` e `security` ainda dependem de `lint` (`needs: lint-and-typecheck`); pipeline serial
- E82: Job `edge-contracts` (Deno check/test) não separado do Lint
- E83: db-guard ainda com 25 containers postgres em série (1 pull por passo)
- E84: `postgres:17-alpine` sem digest SHA nos 25 `env` do db-guard
- E85: `playwright.config.ts` ainda com `retries: 2`; falha real custa 3× o tempo
- E86: `ci.yml:315` ainda roda os 3 engines em PR (não só `chromium`)
- E87: Sem tabela de cobertura no Job Summary nem comentário atualizável na PR
- E88: `thresholds` do vitest ainda no piso de 05/09 (lines 36/stmts 35/funcs 43/branches 31)
- E89: `fetch-depth: 0` ainda no job `security` em PR (lento)
- E90: `timeout-minutes` heterogêneos; sem `scripts/ci/timeouts.json` nem README

---

## Fase 8 — E2E sem depender de produção (E91–E95)

### ❌ E91–E95 — Todas não implementadas

- E91: Sem projeto Supabase de staging; `e2e-logado` ainda muta produção
- E92: `afterAll` sem service_role por sessão do usuário de teste não implementado (o #1053 que mergeou mantém o teardown com service_role)
- E93: `echo "::add-mask::$E2E_TEST_EMAIL"` não adicionado; upload de relatório ainda `if: always()`
- E94: Sem step "Verificar fixture" antes do Playwright
- E95: `e2e/README.md` sem tabela de projetos × specs × workflows × engines

---

## Fase 9 — Governança, observabilidade e documentação (E96–E100)

### ❌ E96–E100 — Todas não implementadas

- E96: Workflow `ops-daily-report.yml` não criado
- E97: Sem notificação WhatsApp/e-mail do guarda vivo e relatório diário
- E98: `allow_merge_commit` e `allow_rebase_merge` ainda ligados; histórico da `main` ainda misto
- E99: CLAUDE.md com cron do guarda como `* * 1` (semanal) em vez de `* * *` (diário); CodeQL descrito como required (não é); 5 workflows com `DESTINO_URL` não documentados; `talkx.spec.ts` descrito como fora do CI (está dentro)
- E100: Checkboxes deste plano de 27/09 com 0 marcados

---

## Gaps novos identificados nesta revisão (não cobertos pelas 100 etapas)

1. **`SUPABASE_SERVICE_ROLE_KEY` no nível repo** — E07 só pediu deletar; o dado foi criado *após* a auditoria de 27/09. Prioridade P0: deletar agora (repo público + CI pode acessar em qualquer job de PR via runner).
2. **PR #1095 de reserva atômica de version** — aberta na branch desta sessão; não conflita com o plano, mas precisa mergear para que colisões de sessões paralelas parem.
3. **`strict` da branch protection pode regredir** — registrado no CLAUDE.md mas sem automação que impeça. E99 menciona documentar o estado desejado; não há test que verifique.

---

## Próximas execuções recomendadas (por impacto imediato)

| Prioridade | Etapa | Ação direta |
|---|---|---|
| P0 urgente | E07 (restante) | Deletar `SUPABASE_SERVICE_ROLE_KEY` do repo via `github_delete_actions_secret` |
| P0 | E10 | `github_delete_webhook 671865950` ou corrigir URL N8N + ping |
| P0 | E05 | Criar secrets `DOCKERHUB_TOKEN`/`DOCKERHUB_USER` + `docker login` em types-sync e db-live-guard |
| P0 | E11 | `github_delete_actions_cache` nos 46 caches `codeql-overlay-*` |
| P1 | E13 | `defaults: run: shell: bash` nos 13 workflows (E06/E12 fixam 2 steps; E13 fecha os demais) |
| P1 | E22 | `cancel-in-progress: false` no db-live-guard (run agendado não cancelado por push) |
| P1 | E26 | Concurrency por SHA em ci.yml/db-guard/codeql (metade dos vereditos da main perdidos) |
| P1 | E37 | Mover `DESTINO_URL` para environment `producao-ddl` |
| P1 | E46 | Mergear PR #1064 (CodeQL alert #13 fechado) |
