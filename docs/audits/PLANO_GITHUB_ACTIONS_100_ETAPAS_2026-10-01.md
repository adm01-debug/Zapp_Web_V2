# Auditoria exaustiva do GitHub Actions — plano de correção e melhorias em 100 etapas (v3)

**Data:** 2026-10-01 (13:10 UTC) · **Repo:** `adm01-debug/Zapp_Web_V2` · **HEAD da `main` auditado:** `7d3117c`
**Escopo:** os 14 arquivos em `.github/workflows/`, os 3 workflows dinâmicos (Dependabot Updates, Dependency Graph,
Copilot reviewer), os GitHub Apps que publicam checks no repo, branch protection, environments, secrets, variáveis,
cache, artifacts, Dependabot, Code Scanning, scripts que os workflows chamam (`scripts/ci/`, `scripts/db-audit/`,
`scripts/edge-deploy/`) e as duas auditorias anteriores (26/09 e 27/09).
**Método:** leitura integral dos 14 YAML (4.648 linhas), dos scripts auxiliares que eles invocam, e estado **ao vivo**
via API do GitHub (runs das últimas 37 h, falhas por workflow, branch protection, environments, secrets, cache,
artifacts, PRs abertas, issues de alerta, check-runs do HEAD). Toda afirmação abaixo tem a evidência ao lado.
**Status:** PLANO. Nada foi executado nesta sessão. Nenhum arquivo além deste foi alterado.

> Este plano **substitui** `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-09-27.md` como plano vigente de Actions. O que
> daquele plano já entrou na `main` está na seção 1; o que continua válido reaparece aqui com evidência de hoje e
> número novo; o que perdeu sentido foi descartado com o motivo.

---

## 0. Sumário executivo — o que está quebrado agora

| Sinal | Medido em 01/10 13:00 UTC | Leitura |
|---|---|---|
| Runs criados desde 30/09 00:00 (37 h) | **1.694** | ci 491 · db-guard 491 · codeql 354 · e2e-logado 135 · db-live-guard 90 · types-sync 85 · deploy-functions 52 |
| Branch protection `main` | **`strict: true`** (3ª regressão: 25/09 false → 27/09 true → 27/09 false → hoje true) | Com `strict=true`, `auto-update-pr-branch` só por dispatch e `allow_auto_merge=false` no repo, toda PR vira `BEHIND` a cada push na `main` (~1 a cada 10 min) e nunca fica mergeável sem update manual |
| PR de sincronização #1343 (`automation/types-sync`) | aberta há **17 h**, `mergeable_state: blocked`, **96 comentários** (todos de bots), 1 commit, 4 arquivos | Cada push na `main` redispara o `types-sync`, que faz force-push no head → CI recomeça → nunca verde **e** atualizada ao mesmo tempo com `strict=true` |
| `DB Live Guard` últimos 30 runs | **27 ❌ / 3 ✅** (90 runs em 37 h) | Issue #1342 aberta desde 30/09 20:11 com 7 comentários (5 "causas" distintas); passos quebrados alternam entre types.ts, catálogo, manifesto, paridade tripla e migrations — todos dependem do merge de #1343 + reconciliação da version duplicada `20260930390000` (citada no commit `4079cd0`) |
| `types-sync` | 26 ✅ / 3 ❌ / 1 cancelado nos 30 últimos; issue #888 com **89 comentários** | Falhas de 30/09 18:49: `error running container: exit 1` no `gen types`; 3 dispatches manuais hoje (10:29, 12:06, 12:39) — padrão de `force_gate3` por rotina |
| `Deploy Edge Functions` últimos 40 | **30 ❌ / 8 cancelados / 2 ✅** | Falha no passo "Capturar e validar manifesto remoto pos-deploy" (atestação, ~24 min por run). PR #1376 (11:56 UTC hoje) mudou a atestação; os 2 únicos sucessos são **depois** dela (12:22, 12:24). 52 dispatches em 37 h ≈ 15–20 h de runner queimadas |
| `E2E logado` últimos 40 | 13 ✅ / **16 ❌** / 10 cancelados / 1 em andamento | Falham `media-volume.spec.ts:59`, `reactions.spec.ts:51` (chromium) e `talkx.spec.ts:160` (webkit); suíte 7–13 min; 135 runs em 37 h |
| `E2E Talk X (PR)` (novo, 30/09) | 9 ✅ / 4 ❌ / 1 cancelado em 14 runs | Dispara em "Merge branch 'main'" de branches que **não tocam Talk X** (`devin/…contatos-f2-f3`, `hermes/telefonia-t15…`): o filtro `paths` casa com o diff do merge commit, não com o diff da branch |
| Environment `producao-edge-functions` | **sem `required_reviewers`** (só `branch_policy`) | CLAUDE.md ("Environments com aprovação humana") diz o contrário; o cabeçalho do `deploy-functions.yml` diz o certo |
| Repo | `allow_auto_merge: false` | `auto-update-pr-branch.yml` filtra `autoMergeRequest != null` → **nunca** encontra PR; código morto desde sempre |
| Secrets | 17 no repo, **0 em environments**; `VITE_CLIENTES_SUPABASE_URL`/`_ANON_KEY` não referenciados por nenhum workflow nem pelo `src/` | `SUPABASE_SERVICE_ROLE_KEY` (repo, 28/09) no mesmo job de um `bun install` **sem** `--ignore-scripts` (`e2e-logado.yml:58`) |
| Apps de terceiros com check/comentário em PR | SonarCloud, CodeRabbit, cubic, Copilot, Vercel (2), Mermaid Sync, ECC Tools, Supabase, Greptile | **SonarCloud Quality Gate ❌ na `main`** (5,1 % duplicação, Reliability D); ECC Tools posta 2 comentários por push com "Check publication was denied"; nenhum está inventariado no CLAUDE.md |
| Cache do Actions | 8 caches · 1,03 GB | Resolvido vs 27/09 (10 GB); restam 4 overlays CodeQL de 230 MB da `main` (27–28/09) |
| Artifacts | **2.333** | `playwright-report`/`coverage-report`/`dist` a cada PR; ninguém consome `dist` nem `coverage-report` |
| Code Scanning | 1 alerta aberto (#13, `validation.ts:143`, medium) há 26 dias | mesmo de 27/09 |
| Testes existentes fora do CI | 4 Deno (`ai-response-contracts`, `ai-vocabulary`, `chatbot-l1-output`, `postgrest-filters`) + 4 `.test.sh` (`ai-block03-vocabulary-contract`, `mapa-f1-address-contract`, `talkx-settings-rls`, `user-settings-sound-integrity-contract`) | listas manuais em `ci.yml:78-107` e `db-guard.yml` (48 passos) não acompanham o repo |
| Webhooks | 0 | o hook morto do n8n (F-14 de 27/09) foi removido |
| Rulesets | 0 · `allowed_actions: all` · `sha_pinning_required: true` · `default_workflow_permissions: read` | igual a 27/09 |

**O que já está certo e não deve ser mexido:** `cancel-in-progress` só em PR (ci, db-guard, codeql); fronteira de
secrets em PR (`check-pr-workflow-secrets.mjs`); pin por SHA duplo; `persist-credentials: false` em todos os checkouts;
`default_workflow_permissions: read` com elevação por job; guard de imutabilidade de migration em PR (`db-guard.yml:58-137`,
pegou a PR #1333 em 30/09 19:41); `db-live-guard` com `continue-on-error` por sub-check + veredito consolidado + fecha
a issue ao recuperar; `types-sync` com TLS `verify-full` + pgbouncer + aprovação dos próprios runs; `supabase-sync.yml`
desarmado; `crm-sync-worker` só por dispatch; Dependabot agrupado; concurrency por função no `deploy-functions`;
`serialize-scope.mjs` para o escopo `all`; `retry-disposable-postgres-test.sh` com espelho GHCR; CodeQL fora de PR
required e com job `actions`.

---

## 1. O que o plano de 27/09 já entregou (pelo `git log` de `.github/` e pelo estado ao vivo, não pelos checkboxes)

Os 100 checkboxes do plano de 27/09 continuam `[ ]`, mas o código mostra **17 etapas executadas** entre 27/09 e 01/10:

| Etapa (27/09) | Estado hoje | Evidência |
|---|---|---|
| F-01/F-03 `pipefail` nos Gates 1 e 2 do `types-sync` | ✅ | `types-sync.yml:295,308` |
| F-02 `pipefail` no deploy do CLI + captura do "No change found" em stderr | ✅ | `deploy-functions.yml:284,290` (01/10) |
| F-03 strip de ANSI no log do CLI | ✅ | `deploy-functions.yml:310` |
| F-04/F-13 zumbi de environment no `deploy-functions` | ✅ parcial | concurrency por função (30/09) + `serialize-scope.mjs`; `producao-edge-functions` **sem revisor** (ver G-07) |
| F-05 `E2E logado` quebrado | ⚠️ ainda 16/40 ❌ | specs mudaram (`media-volume`, `reactions`, `talkx` webkit) |
| F-06 pins corrompidos da PR #1053 | ✅ | `check-workflow-pins.mjs` passa no HEAD |
| F-08 cache CodeQL no teto | ✅ | 1,03 GB / 8 caches; CodeQL só em `pull_request` + schedule (`codeql.yml:21-24`) |
| F-14 webhook n8n morto | ✅ | `GET /hooks` → `[]` |
| F-18 rate-limit do ECR no `db-guard` | ✅ | `retry-disposable-postgres-test.sh:52-57` (espelho GHCR primeiro) |
| F-23 dedupe `migrationsFalhou` | ✅ | `db-live-guard.yml:382-391` |
| F-33 `postgrest-filters.test.ts` fora do CI | ❌ ainda fora, e agora são 4 | seção 0 |
| E09 atestação não trava em no-op | ✅ (01/10, PR #1376) | 2 sucessos pós-merge; precisa de confirmação com 10+ runs (E04) |
| Concurrency por função no deploy | ✅ | `deploy-functions.yml:50-52` |
| `ci(e2e)`: typecheck cobre `e2e/` | ✅ | PR #1321 |
| `fix(ci)`: rate limit no guardião vivo | ✅ | PR #1323 (ghcr pre-pull) |
| `strict=false` restaurado em 27/09 | ❌ **regrediu** | `GET /branches/main/protection` → `strict: true` |
| `types-sync` sem Docker Hub | ✅ | pre-pull via GHCR (`types-sync.yml:134-144`) |

Permanecem abertos e **reaparecem aqui com evidência nova:** F-09/F-10 (credenciais compartilhadas e `db-migrate` sem
TLS), F-11/F-12 (hash do dry-run não amarra arquivo/ACL), F-16 (`allowed_actions: all`), F-17 (#13), F-19/F-20/F-21
(pipeline serial, drafts, artifacts), F-22 (`cancel-in-progress` cancela o agendado), F-24 (pgbouncer silencioso),
F-25/F-26/F-27 (types-sync aprova por SHA, Gate 3, redisparo), F-28/F-29/F-30/F-34 (deploy-functions e db-migrate),
F-31 (skip-verde), F-32 (`SUPABASE_PROJECT_REF` como secret), F-35 (sem actionlint), F-36–F-42 (higiene).

---

## 2. Inventário ao vivo (01/10, 13:00 UTC)

| Workflow | Gatilhos | Secrets | Perm. do job | Concurrency | Runs 37 h | Últimos 30 |
|---|---|---|---|---|---|---|
| `ci.yml` (5 jobs, 6 required) | push main, PR, merge_group, dispatch | VITE_* (públicos) | read | por PR/ref, cancela só PR | 491 | — |
| `db-guard.yml` (1 job, required) | idem | nenhum | read + PR read | idem | 491 | 1 ❌ (guard de imutabilidade, correto) |
| `codeql.yml` (2 jobs) | PR, schedule seg 09:30 | nenhum | security-events write | idem | 354 | 27 ✅ / 2 cancel |
| `e2e-logado.yml` | push main, dispatch | E2E_TEST_*, **SUPABASE_SERVICE_ROLE_KEY** | read | por ref, não cancela | 135 | 13 ✅ / 16 ❌ / 10 cancel |
| `e2e-talkx-pr.yml` (novo 30/09) | push ≠ main + paths, dispatch | E2E_TEST_* | read | por ref | 14 total | 9 ✅ / 4 ❌ |
| `db-live-guard.yml` | push main + paths, schedule diário 06:13, dispatch | DESTINO_URL | read + issues write | por ref, cancela push | 90 | 3 ✅ / 27 ❌ |
| `types-sync.yml` | push main + paths, schedule seg 05:49, dispatch | DESTINO_URL, (TYPES_SYNC_PR_TOKEN ausente) | contents/issues/PR/actions write | por ref | 85 | 26 ✅ / 3 ❌ |
| `deploy-functions.yml` | dispatch | SUPABASE_ACCESS_TOKEN, PROJECT_REF, CRON_SECRET, 6 de integrações | contents write + actions read | por função | 52 | 2 ✅ / 30 ❌ / 8 cancel |
| `db-migrate.yml` (1.748 linhas) | dispatch | DESTINO_URL | read | único | 0 (último 26/09) | 15 ✅ / 12 ❌ / 3 cancel em 35 totais |
| `targeted-ledger-evidence.yml` | dispatch | DESTINO_URL | read | único | 0 | — |
| `supabase-sync.yml` | dispatch | DESTINO_URL, LEGACY_IMPORT_UNLOCK (ausente, de propósito) | read | único | 0 | desarmado |
| `auto-update-pr-branch.yml` | dispatch | GITHUB_TOKEN | contents/PR/actions write | único | 0 | código morto (G-06) |
| `branch-hygiene-audit.yml` | schedule seg 07:56, dispatch | GITHUB_TOKEN | read | único | 0 | — |
| `crm-sync-worker.yml` | dispatch | PROJECT_REF, CRON_SECRET | read | único | 0 | — |

Apps externos com check/comentário no HEAD da `main` e na PR #1343: **SonarCloud** (❌ Quality Gate na `main`),
**Supabase Preview** (skipped em todo push), **CodeRabbit** (status), **cubic** (neutral), **Copilot reviewer**
(dinâmico), **Vercel** (deploy + "Vercel Agent Review" + "Vercel Preview Comments"), **Mermaid Diagram Sync Assistant**
(skipped), **ECC Tools** (2 comentários por push, sem permissão de check), **Greptile** (trial expirado: posta "Your trial has ended" como review em toda PR — visto na #1389), **Vercel Agent Review** ("Skipped because of insufficient Credit" em toda PR), **CodeRabbit** avisando "não conseguimos cobrar há mais de 72 h".

---

## 3. Achados (com evidência)

### P0 — quebra hoje ou mascara quebra

- **G-01 · `strict=true` regrediu pela 3ª vez e, combinado com dois outros fatos, trava toda PR.**
  `GET /branches/main/protection` → `required_status_checks.strict: true`. `auto-update-pr-branch.yml:17` só por
  dispatch (E15 de 26/09 desligou o `push` **porque** strict era false). Repo com `allow_auto_merge: false`. Resultado:
  qualquer PR fica `BEHIND` ~10 min depois de ficar verde (ritmo de ~1 merge/10 min na `main`), ninguém a atualiza
  automaticamente, e quem tenta mergear recebe 405 "N of N expected" (sintoma documentado no CLAUDE.md). Não há
  nenhum mecanismo que detecte a regressão — foi descoberto 3 vezes por acidente.
- **G-02 · O ciclo `types-sync` → force-push → CI → `BEHIND` → `types-sync` nunca converge.** PR #1343: criada 30/09
  20:12, head `caa086f`, `mergeable_state: blocked`, `mergeStateStatus: UNKNOWN` (recalculando após o 85º run do
  `types-sync` em 37 h). Cada push na `main` que toca `supabase/migrations/**` ou `scripts/db-audit/**` (quase todos)
  roda o `types-sync`, que regenera os 4 artefatos contra o banco **atual** e força o head do PR → os 7 checks
  recomeçam (~6 min) → antes de terminarem a `main` já avançou → `BEHIND`. A única saída hoje é humana e manual.
- **G-03 · Guarda vivo vermelho há 17 h, e o alerta não aponta a causa.** 27/30 runs ❌; #1342 com 5 "causas"
  distintas em 14 h (`c21de2…`, `95d9c3…`, `c21435…`, `efacb3…`, `dfb593…`) porque o hash é do **conjunto** de passos
  que falharam, e o conjunto oscila conforme o types-sync regenera ou não um artefato entre dois pushes. O corpo do
  comentário não diz **qual** migration/tabela divergiu — o diff fica no artifact de 3 dias (`db-live-evidence-*`),
  que não inclui a saída do `check-migration-drift.mjs`. O commit `4079cd0` (PR #1381) registra a causa real de parte
  do vermelho: "db:guard segue vermelho por versao duplicada `20260930390000` pre-existente no main (#1364/#1368)".
- **G-04 · `deploy-functions` falhou em 30 dos últimos 40 dispatches, ~24 min cada.** Todos no passo "Capturar e
  validar manifesto remoto pos-deploy" (atestação esperando bump de versão que não vem: run 36852598923 às 11:00,
  36786233782 às 22:58). A PR #1376 (merge 11:56 UTC) mudou a atestação para aceitar no-op pelo digest; os dois únicos
  sucessos (`crm-integration` 12:22, `voice-copilot-action` 12:24) são posteriores. **Não está provado** que o fix cobre
  os casos de ontem (funções `ai-*` com bundle idêntico); precisa de amostra.
- **G-05 · `E2E logado` vermelho em 40 % dos pushes e ninguém é avisado.** 16/40 ❌: `media-volume.spec.ts:59`
  (controle de volume não sobrevive ao reload), `reactions.spec.ts:51` (badge de reação), `talkx.spec.ts:160` no
  webkit (wizard passo 2) — run 36786114791. `retries: 1` + `workers: 1` + 3 engines = 7–13 min por run; 10/40
  cancelados pela regra "1 pendente por grupo". Nenhuma issue, nenhum comentário, nenhum badge além do README.
- **G-06 · `auto-update-pr-branch.yml` nunca funcionou.** O filtro `.autoMergeRequest != null` (linha 43) exige
  auto-merge habilitado na PR; `allow_auto_merge` está **desligado no repo**, então nenhuma PR jamais teve
  `autoMergeRequest`. O CLAUDE.md fala de "vários agentes … usando auto-merge" — não é verdade ao vivo.
- **G-07 · Documentação de environments diz que há aprovação humana onde não há.** `producao-edge-functions` tem só
  `branch_policy` (API). O CLAUDE.md lista-o entre os "Environments com aprovação humana (`required_reviewers`)". O
  cabeçalho do `deploy-functions.yml:60-66` reconhece a ausência e a justifica. Dois documentos no mesmo repo com
  afirmações opostas sobre um gate de produção.
- **G-08 · SonarCloud reprova a `main` e ninguém trata.** Check `SonarCloud Code Analysis` ❌ no HEAD `7d3117c`:
  "5.1% Duplication on New Code (≤3%)" e "D Reliability Rating on New Code (≥A)". Não é required, não está no CLAUDE.md,
  mas aparece vermelho em todo commit da `main` e em PRs (na #1343 passou porque o diff era só JSON/types).

### P1 — risco real ou desperdício grande

- **G-09 · `SUPABASE_SERVICE_ROLE_KEY` no mesmo processo que `bun install` com scripts.** `e2e-logado.yml:58`
  `bun install --frozen-lockfile` (sem `--ignore-scripts`) e, no mesmo job, o teardown com a chave service_role
  (`:90`). Um `postinstall` de dependência comprometida lê `/proc/*/environ`. O `e2e-talkx-pr.yml:56` já faz
  `--ignore-scripts`; o `e2e-logado` não. Secret criado em 28/09 no nível **repo**, sem environment.
- **G-10 · `e2e-talkx-pr` executa código de branch arbitrária com credencial de usuário supervisor de produção.**
  Gatilho `push` em qualquer branch ≠ main (`:20-29`); branches `devin/*` são empurradas pelo bot
  `devin-ai-integration[bot]`. O `check-pr-workflow-secrets.mjs` só inspeciona `pull_request`, então este padrão passa
  pelo guard "por design" — mas o modelo de ameaça (código não revisado + secret) é o mesmo que o guard existe para
  impedir. Além disso o filtro `paths` casa com o diff do **merge commit** ("Merge branch 'main' into …"), por isso
  rodou em `devin/…contatos-f2-f3` e `hermes/telefonia-t15…` (runs 36865060914, 36865265283, ambos ❌).
- **G-11 · `DESTINO_URL` (credencial de escrita) em 5 workflows, nenhum em environment.** `db-live-guard`,
  `types-sync` (que faz `bun install` + tem `contents/actions: write`), `db-migrate`, `targeted-ledger-evidence`,
  `supabase-sync`. Um environment `banco-leitura` com a URL e outro `producao-ddl` (já existe) com a mesma URL
  separaria blast radius; melhor ainda: role Postgres **somente leitura** para os guardas (ver E25).
- **G-12 · `db-migrate.yml` continua sem TLS pinado e com credencial no argv.** `:128-138` só `validarDestino`;
  `:1145,1153` `supabase db push --db-url "$DESTINO_URL"`. F-10 de 27/09 afirmou "E37 ✅ em types-sync/db-migrate" — no
  `db-migrate` **não** entrou (grep de `endurecerDestinoTls`/`PGSSLMODE` no arquivo: zero ocorrências). Workflow sem
  nenhum run desde 26/09 (decisão de rota por MCP), 12 contratos dedicados + ~1.400 linhas que só servem a versions já
  aplicadas, `timeout-minutes: 25`.
- **G-13 · Listas manuais de testes deixaram 8 testes fora do CI.** `ci.yml:78-107` enumera 29 arquivos Deno; existem
  33. `db-guard.yml` enumera 48 `.test.sh`; existem 52. Nenhum guard compara "existe no disco" × "está no YAML".
- **G-14 · `db-live-guard` abre conexão com produção para mudança de edge function.** `paths: supabase/**` (`:20`)
  inclui `supabase/functions/**`; 90 runs em 37 h. O guarda compara migrations/catálogo/manifesto/types/grants —
  nada disso muda quando só uma edge muda. Cada run também cancela o agendado em andamento (`:37`, F-22).
- **G-15 · Pipeline de PR serial e sem cache: ~1.000 jobs/dia só em ci+db-guard.** `test`/`security`/`e2e` dependem de
  `lint-and-typecheck` (3 min, 14 passos incluindo Deno e Go); `build` de `lint`+`test`. `bun install` 6× por run sem
  `actions/cache` (grep: **zero** usos de `actions/cache` em 14 workflows). `bunx playwright install --with-deps
  chromium firefox webkit` em todo PR (`ci.yml:318`), em todo push na `main` (`e2e-logado.yml:61`) e em todo push de
  branch Talk X (`e2e-talkx-pr.yml:59`). `db-guard` sobe **48** PostgreSQL descartáveis em série (um por `.test.sh`).
- **G-16 · Issues de alerta sem dedupe viram lixo.** #888 (`[types-sync] Falha ao propor sincronizacao`) com 89
  comentários desde 26/09 — o passo "Registrar falha dos gates" (`types-sync.yml:350-399`) comenta a cada falha, sem
  marcador de causa nem janela. #1343 com 96 comentários de 5 bots.
- **G-17 · Gate 3 do `types-sync` virou rotina de bypass.** Conta linhas `<` do diff de `types.ts` (`:320`); qualquer
  troca de assinatura de função (DROP+CREATE, como a `20260930390000`) remove >10 linhas e bloqueia. Hoje houve 3
  dispatches manuais (10:29, 12:06, 12:39) — o padrão é `force_gate3=true`. Um gate que é sempre forçado não protege e
  custa um humano a cada drift.
- **G-18 · `allowed_actions: all`.** 12 actions distintas em uso (`actions/*` ×5, `github/codeql-action/*`,
  `oven-sh/setup-bun`, `denoland/setup-deno`, `supabase/setup-cli`, `peter-evans/create-pull-request`,
  `gitleaks/gitleaks-action`, `actions/setup-go`). Pin por SHA não limita **quais** actions um PR pode introduzir.
- **G-19 · Code Scanning #13 aberto há 26 dias** em `supabase/functions/_shared/validation.ts:143` (edge de produção).
- **G-20 · Versões de toolchain espalhadas e divergentes.** `bun-version: '1.4.0'` em 9 lugares (4 workflows),
  `deno-version: '2.9.5'` em 2, `SUPABASE_CLI_VERSION: '2.116.0'` em 4 workflows, `node-version: '24'` em 7. Playwright:
  `package.json` tem `@playwright/test ^1.56.1`, `ci.yml`/`e2e-logado` usam `bunx playwright install` (resolve o do
  lockfile), `e2e-talkx-pr.yml:59` usa `bunx playwright@1.63.0` — browsers de uma versão com runner de outra.
  Dependabot não cobre nenhum desses pins (só `uses:`).
- **G-21 · Secrets mortos e secrets fantasmas.** `VITE_CLIENTES_SUPABASE_URL`/`_ANON_KEY` existem no repo e não são
  referenciados por nenhum workflow nem por `src/`. `TYPES_SYNC_PR_TOKEN` é referenciado e não existe (documentado como
  opcional). `LEGACY_IMPORT_UNLOCK` idem (deliberado).
- **G-22 · `if: github.ref == 'refs/heads/main'` no job dá "skipped" verde para dispatch em branch errada** —
  `db-migrate:62`, `db-live-guard:45`, `e2e-logado:43`, `targeted-ledger-evidence:27`. `deploy-functions:87-92` e
  `supabase-sync:50-55` fazem o certo (passo que falha com mensagem).
- **G-23 · Nenhum canal de alerta fora da aba Actions, exceto a issue do guarda vivo.** `E2E logado` 16 ❌,
  `deploy-functions` 30 ❌, SonarCloud ❌: zero notificação. O projeto tem Evolution GO e N8N à mão.
- **G-24 · Nenhum lint de workflow.** Sem `actionlint` nem `zizmor`; os únicos checks são `check-workflow-pins.mjs`,
  `check-pr-workflow-secrets.mjs` e CodeQL `actions` (que não bloqueia). O SHA de 39 chars de 27/09 e os `pipefail`
  faltantes seriam pegos por `actionlint` em PR.

### P2 — confiabilidade e custo

- **G-25 · `types-sync` aprova runs por SHA sem checar branch** (`:489-513`): se o mesmo SHA aparecer em outra PR,
  aprova runs alheios com `actions: write`. Improvável, mas é escalada de privilégio por coincidência.
- **G-26 · Merge do PR de sync redispara `types-sync` e `db-live-guard`** (ambos têm `paths` que incluem os artefatos
  que o sync gera): 1 `gen types` + 4 consultas ao banco por merge `[auto]`.
- **G-27 · pgbouncer em `continue-on-error`** (`db-live-guard:89`, `types-sync:79`): sem ele o `gen-types.sh` cai no
  fallback com `DESTINO_URL` em argv, só com `Aviso:`.
- **G-28 · `deploy-functions` reescreve 7 secrets em todo deploy** (`:166-262`) com valores em argv; em rollback via
  `source_ref` re-seta secrets atuais sobre código antigo; curl do catálogo sem `--max-time` (`:222`); sem `dry_run`;
  sem rollback automático; tags `edge-deploy/*` acumulam (339 runs → centenas de refs).
- **G-29 · `db-migrate`: `--include-all` sem parse do dry-run** (`:1140-1154`): não há asserção de que o CLI listou
  exatamente `TARGET_VERSION`; pós-apply só `count(*)=1`, não `statements IS NOT NULL` nem igualdade com o arquivo.
  `confirm_runtime_sha256` não amarra o conteúdo do arquivo nem o `github.sha` do dry-run (F-11).
- **G-30 · `SUPABASE_PROJECT_REF` como secret** (7 usos) mascara `tnnnlkbymytvtqngbbqh` em todo log — valor público e
  literal em 4 workflows (`crm-sync-worker:38`, `deploy-functions:151`, `supabase-sync:45,80`, `e2e-logado:97`).
- **G-31 · Drafts rodam a pipeline inteira** (nenhum `if: !github.event.pull_request.draft`).
- **G-32 · Artifacts: 2.333 acumulados**, retenção 1/3/14/30 dias e **default 90** em `supabase-sync.yml:104`;
  `deploy-functions` guarda `deploy-output.log` bruto por 30 dias.
- **G-33 · `db-guard` usa tag mutável `postgres:17-alpine`** em 48 passos; reprodutibilidade depende do dia.
- **G-34 · Supabase Preview (app 330661) ainda reporta check em todo push na `main`** (`skipped`). O app está
  instalado; o CLAUDE.md diz que "parou de reagir a PRs" — verdade para PR, não para push.
- **G-35 · Retries do Playwright + 3 engines**: `retries: 1` em CI, `workers: 1`; falha real custa 2×; `trace` não
  configurado para `on-first-retry` no config lido (confirmar).
- **G-36 · `branch-hygiene-audit`** publica só no Job Summary; 53 branches remotas hoje; a issue #378 não é alimentada.

### P3 — higiene

- **G-37 · CLAUDE.md divergente em 5 pontos:** "13 arquivos / 16 no total" (são 14 / 17); "`strict` está `false` ao
  vivo" (é `true`); `producao-edge-functions` com aprovação (não tem); `db-live-guard` semanal numa seção e diário em
  outra (é diário, `13 6 * * *`); "vários agentes usando auto-merge" (`allow_auto_merge: false`).
- **G-38 · `.github/ISSUE_TEMPLATE/config.yml`** aponta para `adm01-debug/zapp-web/tree/main/docs` (repo errado) e
  WhatsApp `5511999999999` (placeholder). PR template pede "Testei no ambiente de staging" (não existe staging).
- **G-39 · CODEOWNERS decorativo** (sem `required_pull_request_reviews`); `secret_scanning_validity_checks` desligado
  (grátis em repo público); `allow_merge_commit` e `allow_rebase_merge` ligados com `squash_merge_commit_message:
  COMMIT_MESSAGES` — histórico da `main` mistura 3 formatos.
- **G-40 · Environments órfãos** `copilot`, `Preview`, `Production` sem regra nem uso; `can_admins_bypass: true` e
  `prevent_self_review: false` nos 4 protegidos.
- **G-41 · `set -euo pipefail` ausente** em `run:` multi-linha de `ci.yml`, `db-guard.yml`, `db-live-guard.yml`
  (`set -uo` só no veredito), `db-migrate.yml`, `e2e-logado.yml`, `crm-sync-worker.yml`, `supabase-sync.yml`,
  `targeted-ledger-evidence.yml` — dependem do `-e` implícito do shell padrão, e `pipefail` só aparece onde já
  quebrou (F-01/F-02).
- **G-42 · Comentários de cabeçalho desatualizados**: `ci.yml:5` "Jobs: lint, typecheck, test, build" (são 5 jobs);
  `types-sync.yml:82-86` "único dos 3 workflows" (são 5 com `DESTINO_URL`); `db-migrate.yml:7` "Somente alvos com
  contrato runtime explicito" (desde #695 aceita genérico).

---

## 4. Plano de correção e melhorias — 100 etapas

**Convenções.** Cada etapa tem: **Classe** (A = configuração do GitHub via API, sem PR; B = YAML em `.github/`, PR
que **fica aberta aguardando Joaquim** pela regra 8 do fluxo Git; C = script/teste/doc em PR que pode mergear sozinho;
D = decisão de negócio), **Evidência** (achado G-xx), **Ação**, **Verificação**. Ordem dentro de cada fase é a ordem
de execução recomendada. Etapas com ⚠️ exigem decisão do Joaquim antes de começar.

### Fase 0 — Destravar hoje (E01–E12)

- [ ] **E01** · A · G-01 · Restaurar `required_status_checks.strict=false` via `github_update_branch_protection`
  (PUT completo: 6 contexts, `enforce_admins: true`, sem force-push/deleção). Verificação: `GET` devolve `false`;
  PR #1343 sai de `blocked` sem novo push.
- [ ] **E02** · A · G-01 · Gravar o snapshot da branch protection **antes e depois** em `docs/audits/evidence/
  branch-protection-2026-10-01.json` (é a 3ª regressão; a próxima precisa de baseline). Verificação: arquivo commitado.
- [ ] **E03** · A · G-02/G-03 · Mergear a PR #1343 assim que os 7 checks fecharem verdes no head atual (squash).
  Verificação: `db-live-guard` do merge passa em types/catálogo/manifesto/grants.
- [ ] **E04** · C · G-03 · Reconciliar a version duplicada `20260930390000` (citada em `4079cd0`): `SELECT version,
  name FROM supabase_migrations.schema_migrations WHERE version LIKE '20260930%'` + `ls supabase/migrations/20260930*`
  → arquivo que **nunca** foi aplicado ganha versão nova via `reserve_migration_version` (regra de 28/09); o aplicado
  fica. Delete e create em commits separados (guard de rename). Verificação: `check-migration-drift.mjs` com
  `DESTINO_URL` exit 0; passo "Comparar migrations" ✅.
- [ ] **E05** · A · G-03 · Após E03+E04 verdes, confirmar fechamento automático de #1342 (passo "Fechar alerta") e
  fechar #888 manualmente com link para E51. Verificação: 0 issues abertas com labels `db-live-guard`/`types-sync`.
- [ ] **E06** · A · G-04 · Medir o fix da atestação (#1376): disparar `deploy-functions` para 3 funções `ai-*` que
  falharam ontem com bundle idêntico (`ai-proxy`, `ai-suggest-reply`, `ai-conversation-summary`) e para 1 com mudança
  real. Verificação: 4/4 ✅ em < 8 min cada; `edge-deployment-attestation.json` com `no_op_by_digest` (ou equivalente)
  nas 3 primeiras.
- [ ] **E07** · C · G-04 · Se E06 falhar em qualquer caso: adicionar ao `collect-remote.mjs` o caso de teste exato do
  log de 36852598923 (versão sem bump + digest igual) e corrigir antes de qualquer outro deploy. Verificação: `node
  --test scripts/edge-deploy/*.unit.mjs` com o novo caso.
- [ ] **E08** · A · G-04 · Cancelar runs `pending`/`waiting` órfãos de `deploy-functions` e `db-migrate` (hoje 0, mas
  conferir após E06). Verificação: `GET /actions/runs?status=waiting` e `?status=queued` → `total_count: 0`.
- [ ] **E09** · C · G-05 · Corrigir os 3 specs vermelhos do `E2E logado` (`media-volume.spec.ts:59`,
  `reactions.spec.ts:51`, `talkx.spec.ts:160` webkit) **ou** marcar com `test.fixme` **com issue aberta e prazo** — não
  `skip` silencioso. Verificação: 5 runs consecutivos de `e2e-logado` ✅ na `main`.
- [ ] **E10** · D ⚠️ · G-08 · Decidir o SonarCloud: (a) ajustar o Quality Gate para o patamar atual do repo
  (duplicação ≤ 6 %, Reliability ≥ C em New Code) e subir o ratchet mês a mês, (b) desinstalar o app, ou (c) manter
  vermelho. Recomendação: (a). Verificação: check `SonarCloud Code Analysis` ✅ no próximo push da `main`.
- [ ] **E11** · C · G-37 · Corrigir o CLAUDE.md nos 5 pontos divergentes (contagem 14/17, `strict`, revisor do
  `producao-edge-functions`, cadência do guarda vivo, auto-merge) **no mesmo PR** de E02. Verificação: `grep -n
  "13 arquivos\|16 no total\|strict está\|auto-merge" CLAUDE.md` sem afirmações falsas.
- [ ] **E12** · C · G-42 · Corrigir os 3 cabeçalhos desatualizados (`ci.yml:5`, `types-sync.yml:82-86`,
  `db-migrate.yml:7`). Verificação: revisão de texto no PR.

### Fase 1 — Quebrar o ciclo `types-sync` ↔ `BEHIND` de forma estrutural (E13–E22)

- [ ] **E13** · B · G-01 · Criar `.github/workflows/settings-guard.yml` (schedule a cada 6 h + dispatch, `permissions:
  contents: read, issues: write`): lê branch protection, environments, `allow_auto_merge`, `default_workflow_permissions`
  e `allowed_actions` via `GITHUB_TOKEN`, compara com `scripts/ci/github-settings-baseline.json` commitado e abre/
  comenta issue `[settings-guard]` com o diff. É o único jeito de a 4ª regressão de `strict` durar horas, não dias.
  Verificação: alterar `strict` de propósito num dispatch de teste → issue aberta em < 1 min; reverter → issue fechada.
- [ ] **E14** · C · E13 · `scripts/ci/github-settings-guard.mjs` + `.unit.mjs` com fixtures (strict true/false,
  reviewer ausente, auto-merge). Verificação: `node --test scripts/ci/*.unit.mjs` verde.
- [ ] **E15** · D ⚠️ · G-01/G-06 · Decidir o modelo de fila: **(a)** `strict=false` permanente + `settings-guard`
  (recomendado; é o que funcionou de 25/09 a 27/09 e hoje), **(b)** `strict=true` + `allow_auto_merge=true` +
  `auto-update-pr-branch` em `push` (volta o ciclo de 40 min de 25/09), **(c)** transferir o repo para uma Organization
  e ligar merge queue (decisão de negócio). Registrar a decisão no CLAUDE.md.
- [ ] **E16** · A · G-06 · Se E15=(a): **apagar** `auto-update-pr-branch.yml` (código morto desde sempre) e remover as
  referências no CLAUDE.md. Se E15=(b): ligar `allow_auto_merge` e reativar o gatilho `push`. Verificação: lista de
  workflows coerente com a decisão.
- [ ] **E17** · B · G-02/G-26 · `types-sync.yml`: antes de "Gerar candidatos", se existir PR aberta em
  `automation/types-sync` cujo head foi gerado há < 20 min, **encerrar o run** (`exit 0` com resumo) em vez de regenerar
  — debounce que impede o force-push a cada push da `main`. Verificação: 3 pushes seguidos na `main` em 10 min → 1 só
  atualização do PR.
- [ ] **E18** · B · G-26 · `types-sync.yml` `paths`: excluir os 4 artefatos que o próprio sync gera
  (`src/integrations/supabase/types.ts`, `supabase/schema-catalog.json`, `supabase/schema-manifest.json`,
  `scripts/db-audit/grants-baseline.json`) com `paths-ignore` combinado, para o merge do PR de sync não redisparar o
  sync. Verificação: merge de um PR `[auto]` não cria run de `types-sync`.
- [ ] **E19** · B · G-17 · Redesenhar o Gate 3: em vez de contar linhas de `types.ts`, comparar **objetos**
  (tabelas/views/funções/enums removidos) usando `supabase/schema-catalog.json` antigo × novo; bloquear só remoção de
  tabela/view com call-site no `src/` (reaproveitar `supabase-usage-guard.mjs` em modo projeção). Troca de assinatura
  (DROP+CREATE mesmo nome) passa. Verificação: fixture com a `20260930390000` passa; fixture com `DROP TABLE
  public.playbooks` bloqueia.
- [ ] **E20** · B · G-16 · "Registrar falha dos gates" do `types-sync`: mesmo dedupe do guarda vivo (marcador
  `<!-- causa:… -->` com hash do gate + 6 h). Verificação: 3 falhas iguais seguidas → 1 comentário.
- [ ] **E21** · B · G-25 · "Destravar os checks": filtrar `workflow_runs` por `head_branch ==
  'automation/types-sync'` além de `head_sha`. Verificação: unit test com run de outra branch no mesmo SHA → não
  aprovado.
- [ ] **E22** · B · G-02 · `types-sync.yml`: usar `peter-evans/create-pull-request` com `branch-suffix: ''` e
  `delete-branch: true` (já tem) **mais** `labels: types-sync,automerge-ok`; se E15=(b), habilitar auto-merge no PR via
  `gh pr merge --auto --squash` no passo seguinte. Verificação: PR de sync mergeia sozinho quando verde.

### Fase 2 — Perímetro de segurança (E23–E40)

- [ ] **E23** · B · G-09 · `e2e-logado.yml:58` → `bun install --frozen-lockfile --ignore-scripts`; idem `ci.yml`
  (5 ocorrências), `db-guard.yml:153`, `types-sync.yml:287`. Se algum pacote precisar de postinstall (ex.: `esbuild`
  binário), listar e rodar `bun pm trust <pkg>` explícito. Verificação: `bun run build` e `bun run test` verdes com
  `--ignore-scripts`.
- [ ] **E24** · A+B · G-09 · Mover `SUPABASE_SERVICE_ROLE_KEY` para um environment `e2e-producao` (sem revisor, branch
  policy `main`) e apontar o job `e2e-logado` para ele; apagar do nível repo. Verificação: `GET /actions/secrets` sem a
  chave; `GET /environments/e2e-producao/secrets` com ela; run verde.
- [ ] **E25** · C+D ⚠️ · G-09 · Substituir o `curl DELETE` com service_role por uma RPC `e2e_cleanup_conversation_closures()`
  `SECURITY DEFINER` que só apaga linhas do contato fixo `04dff4dc-…` e só aceita o usuário E2E (`auth.uid()`);
  chamar com o JWT do próprio usuário de teste. Elimina a service_role do CI. **Envolve DDL** → PR aberta aguardando
  Joaquim; aplicar pela rota de 26/09 (MCP + ledger). Verificação: teardown ✅ sem `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **E26** · A+B · G-11 · Criar role Postgres `ci_readonly` (SELECT em `public`, `supabase_migrations`,
  `pg_catalog`; sem DML/DDL) e secret `DESTINO_URL_RO` em environment `banco-leitura`; `db-live-guard`,
  `types-sync`, `targeted-ledger-evidence` passam a usar ela. `DESTINO_URL` (escrita) fica só em `producao-ddl` e
  `legacy-import-destrutivo`. **Envolve DDL de role** → ⚠️. Verificação: `check-migration-drift.mjs` roda com a role RO;
  `supabase db push` com ela falha com `permission denied`.
- [ ] **E27** · B · G-10 · `e2e-talkx-pr.yml`: trocar `push` por `pull_request` **sem secrets** (só o projeto
  `chromium` deslogado dos 3 engines) **ou** manter `push` restrito a `branches: [hermes/**, claude/**, codex/**]`
  (nunca `devin/**` ou qualquer bot externo) e exigir `if: github.actor == 'adm01-debug'`. Recomendação: a 1ª para o
  check de PR, e o teste logado continua só na `main`. Verificação: push de `devin/*` não dispara; PR dispara sem
  `E2E_TEST_*` no `env`.
- [ ] **E28** · C · G-10 · `check-pr-workflow-secrets.mjs`: cobrir também `push` com `branches-ignore: main` ou
  `branches: ['**']` (qualquer gatilho que rode código de branch não protegida) — exceção só por lista explícita no
  próprio script com justificativa. Verificação: unit test com o `e2e-talkx-pr.yml` atual → violação; com E27 → OK.
- [ ] **E29** · B · G-12 · `db-migrate.yml`: adotar o mesmo bloco de `endurecerDestinoTls` + `PGSSLMODE=verify-full`
  dos outros 3 workflows (passo "Provar identidade"), e trocar `supabase db push --db-url "$DESTINO_URL"` por leitura
  via `PGPASSFILE`/`SUPABASE_DB_URL` em `env:` do passo (não argv). Verificação: `ps` no runner durante o dry-run sem
  a URL; `psql-environment.integration.mjs` cobre o caso.
- [ ] **E30** · A · G-18 · `allowed_actions: selected` com `patterns_allowed` = as 12 actions em uso + `github_owned_allowed:
  true` + `verified_allowed: false`. Verificação: PR que adiciona `uses: foo/bar@sha` falha no GitHub antes do CI.
- [ ] **E31** · C · G-18 · `check-workflow-pins.mjs`: validar também que o `owner/repo` está na mesma lista de E30
  (commitada em `scripts/ci/allowed-actions.json`), para o erro aparecer no CI local antes do GitHub. Verificação:
  unit test.
- [ ] **E32** · B · G-24 · Adicionar `actionlint` (binário pinado por SHA, via `rhysd/actionlint` release checksum) e
  `zizmor` (`pip`/binário pinado) ao job `lint-and-typecheck`, falhando em `error`; `zizmor` em modo `--persona
  regular` com baseline. Verificação: os 14 YAML passam ou cada achado vira etapa.
- [ ] **E33** · C · G-19 · Fechar o alerta #13: `validation.ts:143` deixa de devolver `error.stack`/mensagem interna ao
  cliente; logar no servidor. Verificação: CodeQL do PR sem `js/stack-trace-exposure`; alerta `fixed`.
- [ ] **E34** · A · G-40 · `prevent_self_review: true` nos 3 environments com `required_reviewers` **só depois** de
  existir uma segunda identidade (ver E36); até lá, documentar que o gate é "branch protegida", não "aprovação".
  Verificação: `GET /environments` coerente com o CLAUDE.md.
- [ ] **E35** · D ⚠️ · G-07 · Decidir `producao-edge-functions`: adicionar `required_reviewers` (volta o "Waiting"
  que travou 26–27/09) **ou** manter sem revisor e corrigir o CLAUDE.md (E11). Recomendação: sem revisor enquanto
  agentes e humano usam a mesma conta; registrar.
- [ ] **E36** · D ⚠️ · G-40 · Criar uma conta/GitHub App dedicada aos agentes (`zapp-bots`) com permissão `write`, e
  deixar `adm01-debug` como único revisor humano. Pré-requisito de qualquer gate de aprovação real. Decisão de negócio
  (custo zero, 1 seat em repo público).
- [ ] **E37** · A · G-39 · Ligar `secret_scanning_validity_checks` (grátis em público). Verificação: `GET /repos` →
  `enabled`.
- [ ] **E38** · A · G-21 · Apagar `VITE_CLIENTES_SUPABASE_URL` e `VITE_CLIENTES_SUPABASE_ANON_KEY` do repo (0 usos).
  Verificação: `GET /actions/secrets` → 15.
- [ ] **E39** · B · G-30 · `SUPABASE_PROJECT_REF`: trocar o secret por `env: PROJECT_REF: tnnnlkbymytvtqngbbqh` no
  topo dos 4 workflows (valor público; já literal em 4 lugares) e manter a asserção de igualdade. Apagar o secret.
  Verificação: logs mostram a URL da função legível; `deploy-functions` ✅.
- [ ] **E40** · B · G-22 · Trocar `if: github.ref == 'refs/heads/main'` do job por um passo "Exigir ref confiável da
  main" que falha com `::error::` em `db-migrate`, `db-live-guard`, `e2e-logado`, `targeted-ledger-evidence` (mesmo
  padrão de `deploy-functions:87-92`). Verificação: dispatch em branch ≠ main → run ❌ com mensagem, não `skipped`.

### Fase 3 — Guarda vivo e `types-sync` confiáveis (E41–E54)

- [ ] **E41** · B · G-14 · `db-live-guard.yml` `paths` do `push`: `supabase/migrations/**`, `supabase/config.toml`,
  `supabase/schema-*.json`, `supabase/deployment-manifest.json`, `scripts/db-audit/**`,
  `src/integrations/supabase/types.ts`, o próprio YAML — **não** `supabase/functions/**`. Verificação: merge só de edge
  não cria run.
- [ ] **E42** · B · G-14/F-22 · `db-live-guard.yml:37` `cancel-in-progress: false` (enfileira; GitHub mantém só o
  mais novo pendente) para o run agendado nunca ser cancelado por push. Verificação: push durante o schedule → ambos
  concluem.
- [ ] **E43** · B · G-03 · Veredito do guarda vivo: além da tabela, anexar ao `GITHUB_STEP_SUMMARY` e ao corpo do
  comentário as **20 primeiras linhas** da saída de cada passo que falhou (capturadas via `tee` em `/tmp/<id>.log`),
  e incluir esses logs no artifact `db-live-evidence-*`. Verificação: próximo ❌ mostra a version/tabela divergente
  sem abrir o run.
- [ ] **E44** · B · G-03 · Dedupe por **causa raiz**, não por conjunto de passos: hash = `sha256(passo mais à
  esquerda na ordem canônica migrations > catálogo > manifesto > types > grants > paridade)` + janela de 6 h; e
  comentar de novo sempre que o conjunto **cresce**, nunca quando encolhe. Verificação: fixture com os 5 conjuntos de
  #1342 → 2 comentários, não 7.
- [ ] **E45** · B · G-27 · pgbouncer: remover `continue-on-error` em `db-live-guard:89` e `types-sync:79`; o
  `gen-types.sh` passa a exigir pgbouncer quando `CI=true` (`exit 1` em vez de `Aviso:`). Verificação: run sem pgbouncer
  falha no passo de instalação, não com credencial em argv.
- [ ] **E46** · B · G-33 · `db-guard.yml`: fixar `postgres:17-alpine` por **digest** (`postgres:17.6-alpine@sha256:…`)
  numa única `env:` do job (`POSTGRES_TEST_IMAGE`) e fazer todos os 48 passos lerem dela; Dependabot não cobre, então
  `check-workflow-pins.mjs` ganha regra para `*_IMAGE` com digest. Verificação: grep de `postgres:17-alpine` sem
  digest → 0.
- [ ] **E47** · B · G-15 · `db-guard.yml`: subir **um** PostgreSQL 17 como `services:` do job (ou um `docker run`
  único no 1º passo) e fazer os `.test.sh` usarem `createdb`/`dropdb` por teste em vez de 48 containers; manter
  `retry-disposable-postgres-test.sh` só para os 2 que precisam de PostgREST. Verificação: duração do job cai de ~5 min
  para < 2 min; 48/48 verdes.
- [ ] **E48** · C · G-13 · `scripts/ci/check-test-inventory.mjs`: compara `find supabase/functions -name '*.test.ts'`
  × lista do `ci.yml`, e `ls scripts/db-audit/*.test.sh` × passos do `db-guard.yml`; falha se houver teste no disco
  fora do YAML (allowlist explícita para os deliberadamente manuais). Rodar no `lint-and-typecheck`. Verificação: hoje
  falha com 8 nomes; após E49/E50 passa.
- [ ] **E49** · B · G-13 · `ci.yml`: trocar a lista de 29 Deno tests por `deno test … $(git ls-files
  'supabase/functions/**/*.test.ts')` (ou `deno test supabase/functions` com `--ignore` explícito). Verificação: os 4
  testes órfãos passam a rodar (ou são corrigidos).
- [ ] **E50** · B · G-13 · `db-guard.yml`: adicionar os 4 `.test.sh` órfãos (`ai-block03-vocabulary-contract`,
  `mapa-f1-address-contract`, `talkx-settings-rls`, `user-settings-sound-integrity-contract`) — ou, com E47, um passo
  único que itera `scripts/db-audit/*.test.sh` com matriz de `env` lida de um `tests-manifest.json`. Verificação: 52/52.
- [ ] **E51** · C · G-16 · Fechar #888 com comentário final apontando E19/E20; apagar a label `types-sync` dos
  comentários antigos não é possível — registrar no CLAUDE.md que issues com > 20 comentários de bot devem ser
  fechadas e reabertas limpas. Verificação: #888 fechada.
- [ ] **E52** · B · G-26 · `db-live-guard` e `types-sync`: `concurrency.group` passa a incluir o `head_sha` **só no
  schedule** (`db-live-guard-${{ github.ref }}-${{ github.event_name == 'schedule' && github.run_id || 'push' }}`) para o
  agendado nunca disputar grupo com push. Verificação: schedule e push simultâneos → 2 runs completos.
- [ ] **E53** · C · G-03 · `check-migration-drift.mjs`: saída resumida de 1 linha por divergência no formato `version |
  disco | ledger | motivo` como primeira coisa no stdout (hoje o diagnóstico útil está no meio do log). Verificação:
  snapshot test.
- [ ] **E54** · B · G-03 · `db-live-guard.yml`: no `schedule` (e só nele), rodar também `node scripts/db-audit/
  check-triple-parity.mjs --require-live --verbose` e publicar o relatório como artifact de 14 dias — baseline semanal
  para auditorias. Verificação: artifact presente na run de segunda.

### Fase 4 — `deploy-functions` e `db-migrate` operáveis (E55–E66)

- [ ] **E55** · B · G-04 · `deploy-functions.yml`: `timeout-minutes` do passo de atestação = 10 (hoje só o job tem
  100); se a Management API não estabilizar em 10 min, falhar com `lastReason` e **não** marcar `success`. Verificação:
  unit test do `collect-remote.mjs` com `maxAttempts` reduzido.
- [ ] **E56** · C · G-04 · `collect-remote.mjs`: teste de regressão com o log real do run 36852598923 (ANSI + stderr +
  "No change found" + versão igual) e com o de 36583351162. Verificação: `node --test` verde; mutante que remove o
  strip de ANSI falha.
- [ ] **E57** · B · G-28 · `deploy-functions.yml`: input `dry_run: boolean` que executa tudo até o "Deploy" exclusive
  e publica o plano (função, digest local × remoto). Verificação: dispatch com `dry_run=true` não altera
  `edge-before.json` vs remoto.
- [ ] **E58** · B · G-28 · Só reescrever secrets nas edges quando o input `rotate_secrets=true` **ou** quando o
  `supabase secrets list` (digest) divergir; em rollback (`source_ref` preenchido) **nunca** reescrever. Verificação:
  deploy normal não chama `supabase secrets set`; log mostra "secrets inalterados".
- [ ] **E59** · B · G-28 · `--max-time 30` no curl do catálogo (`:222`) e `set -euo pipefail` no topo de todo `run:`
  multi-linha do workflow. Verificação: `actionlint` (E32) sem avisos de shell.
- [ ] **E60** · B · G-28 · Tags `edge-deploy/*`: manter só as últimas 50 (passo pós-deploy que apaga as mais antigas
  via API) **ou** trocar tag por **GitHub Deployment** (`POST /deployments` + status), que é o objeto certo para
  rastreabilidade e aparece em Environments. Recomendação: Deployment. Verificação: aba Deployments do
  `producao-edge-functions` lista o deploy com SHA e run.
- [ ] **E61** · B · G-28 · Rollback automático opcional: input `rollback_on_smoke_failure` (default false) que, se o
  smoke falhar, redispara o deploy da função com `source_ref` = SHA do último deploy ✅ (lido do Deployment de E60).
  Verificação: teste controlado com uma função de smoke propositalmente quebrada em branch de teste — ⚠️ só com
  Joaquim presente.
- [ ] **E62** · D ⚠️ · G-12 · Decidir o destino do `db-migrate.yml`: **(a)** manter como rota formal e aplicar E29 +
  E63–E65, **(b)** reduzir a um workflow de 150 linhas só com o contrato genérico (os 12 contratos dedicados e as 17
  validações pós-apply viram `docs/audits/evidence/db-migrate-contratos-historicos.md`), **(c)** arquivar em
  `_superseded/`. Recomendação: (b). O arquivo de 1.748 linhas é o maior risco de manutenção do repo e não roda desde
  26/09.
- [ ] **E63** · B · G-29 · `db-migrate.yml`: parsear a saída do `--dry-run` e exigir que a lista de migrations a
  aplicar seja **exatamente** `[TARGET_VERSION]` (ou o bundle); abortar caso contrário. Verificação: fixture de saída
  do CLI com 2 versions → `exit 1`.
- [ ] **E64** · B · G-29 · `confirm_runtime_sha256` passa a ser `sha256(runtime_sha256 + sha256(arquivo .sql) +
  github.sha do dry-run)`; o dry-run imprime os 3 componentes e o hash final. Verificação: editar o arquivo entre
  dry-run e apply → apply recusa.
- [ ] **E65** · B · G-29 · Pós-apply: além de `count(*)=1`, exigir `statements IS NOT NULL AND array_length(statements,1)
  > 0` e igualdade entre `statements` e o parse do arquivo (`register-migration.mjs` já tem `parseMigrationFile`).
  Verificação: teste com ledger `statements NULL` → ❌.
- [ ] **E66** · B · G-12 · `db-migrate.yml`: `timeout-minutes: 45` e `PSQL_CONNECT_RETRIES=2` no preflight (só leitura),
  nunca no apply. Verificação: lint do YAML + unit test que pina os dois valores.

### Fase 5 — Pipeline de PR mais rápido e barato (E67–E80)

- [ ] **E67** · B · G-15 · Cache do Bun: `actions/cache` (pinado) em `~/.bun/install/cache` com chave `bun-${{
  hashFiles('bun.lock') }}` nos 5 jobs do `ci.yml`, `db-guard`, `types-sync`, `e2e-*`. Medir antes/depois. Verificação:
  `bun install` cai de ~40 s para < 10 s com cache quente.
- [ ] **E68** · B · G-15 · Cache dos browsers Playwright: `~/.cache/ms-playwright` com chave
  `pw-${{ hashFiles('bun.lock') }}-${{ runner.os }}`; `bunx playwright install --with-deps` só em cache miss (`if:
  steps.pw-cache.outputs.cache-hit != 'true'`), senão só `install-deps`. Verificação: job `e2e` do `ci.yml` cai ≥ 2 min.
- [ ] **E69** · B · G-15 · Paralelizar o `ci.yml`: `test`, `security` e `e2e` deixam de depender de
  `lint-and-typecheck` (cada um já faz seu `bun install`); `build` depende só de `test`. Os required checks continuam os
  mesmos 6 nomes. Verificação: wall-clock de PR verde cai de ~7 min para ~4 min.
- [ ] **E70** · B · G-15 · Dividir `lint-and-typecheck` em 2 jobs: `🔍 Lint & TypeCheck` (ratchets + guards de
  workflow, nome **preservado** por ser required) e `🦕 Edge contracts` (Deno check + Deno tests + Go), este último não
  required por 1 semana e depois adicionado aos required (E100). Verificação: `Lint & TypeCheck` < 90 s.
- [ ] **E71** · B · G-31 · `if: github.event.pull_request.draft == false || github.event_name != 'pull_request'` nos
  jobs pesados (`test`, `build`, `e2e`, `security`) do `ci.yml`, `db-guard` e `codeql`; `lint` continua em draft para
  feedback rápido. Como os required checks precisam existir, o job pesado em draft termina com `exit 0` e resumo
  "pulado: draft" (não `skipped`). Verificação: PR draft roda só lint; `ready_for_review` roda tudo.
- [ ] **E72** · B · G-32 · Artifacts: `dist` só em `workflow_dispatch` (Vercel builda sozinho); `coverage-report` só
  na `main` (push) com 7 dias e publicado no Job Summary (`vitest --reporter=json-summary` → tabela); `playwright-report`
  só `if: failure()`. Verificação: PR verde cria 0 artifacts.
- [ ] **E73** · A · G-32 · Apagar os artifacts com mais de 7 dias via API (2.333 hoje) e definir
  `actions.artifact_and_log_retention_days = 14` no repo. Verificação: `GET /actions/artifacts` `total_count` < 300.
- [ ] **E74** · B · G-32 · `supabase-sync.yml:104` `retention-days: 7`; `deploy-functions` `deploy-output.log` passa
  por `::add-mask::` das URLs com token antes do upload e retenção 14. Verificação: grep no artifact sem
  `access_token`.
- [ ] **E75** · C · G-20 · Fonte única de versões de toolchain: `.github/toolchain.json` (`bun`, `deno`, `node`,
  `supabase-cli`, `playwright`, `postgres-image`) lido pelos workflows via um passo `Carregar toolchain` que escreve
  `GITHUB_ENV`; `check-workflow-pins.mjs` falha se um YAML literalizar uma versão. Verificação: grep de `1.4.0` nos
  YAML → 0.
- [ ] **E76** · B · G-20 · `e2e-talkx-pr.yml:59` `bunx playwright@1.63.0` → `bunx playwright` (versão do lockfile), e
  subir `@playwright/test` para a versão que os browsers instalados esperam, num PR só. Verificação: 3 engines verdes
  nos 3 workflows com a mesma versão.
- [ ] **E77** · C · G-20 · Dependabot: adicionar `package-ecosystem: docker` (não existe Dockerfile → usar
  `toolchain.json` + um script semanal `scripts/ci/bump-toolchain.mjs` que abre PR com as versões novas de Bun/Deno/
  Supabase CLI). Verificação: PR automático na próxima segunda.
- [ ] **E78** · B · G-15 · `codeql.yml`: `paths-ignore: ['docs/**', '**/*.md', 'supabase/migrations/**']` no
  `pull_request` (354 runs em 37 h, muitos de PR só de docs/SQL). Como não é required, não quebra merge. Verificação:
  PR só de docs não roda CodeQL.
- [ ] **E79** · C · G-15 · `scripts/ci/actions-kpi.mjs` (rodado pelo `branch-hygiene-audit` semanal): runs/semana por
  workflow, taxa de cancelamento, taxa de falha, minutos totais (via `/timing` que hoje devolve `billable: {}` em repo
  público — usar `run_started_at`/`updated_at`), top 5 jobs mais lentos. Publica no Job Summary e numa issue
  `[kpi-actions]` semanal. Verificação: primeira tabela gerada.
- [ ] **E80** · B · G-15 · `ci.yml` e `db-guard.yml` na `main`: medir com E79 a taxa de cancelamento por "1 pendente
  por grupo"; se > 20 %, trocar `concurrency.group` do push para `ci-main-${{ github.sha }}` (cada commit da `main`
  ganha veredito; custo = runs extras). Decisão com número, não com palpite.

### Fase 6 — E2E sem depender de produção (E81–E88)

- [ ] **E81** · C · G-05 · `playwright.config.ts`: `retries: process.env.CI ? 2 : 0` só para os projetos logados;
  `trace: 'retain-on-failure'`; `video: 'off'`; `workers: 2` nos projetos deslogados. Verificação: suíte deslogada do
  `ci.yml` < 2 min.
- [ ] **E82** · B · G-05 · `e2e-logado.yml`: `::add-mask::` do `E2E_TEST_EMAIL` antes do Playwright e upload do
  `playwright-report` **só** `if: failure()` com 3 dias — com o e-mail mascarado, o risco documentado no cabeçalho
  deixa de existir e o diagnóstico fica acessível. Verificação: artifact de uma falha sem o e-mail em claro.
- [ ] **E83** · B · G-05/G-23 · `e2e-logado.yml`: passo `if: failure()` que abre/comenta issue `[e2e-logado] Suíte
  logada quebrada na main` com dedupe por spec que falhou (mesmo mecanismo de E44) e fecha ao recuperar. Verificação:
  próxima falha gera issue; sucesso fecha.
- [ ] **E84** · B · G-10 · `e2e-talkx-pr.yml`: após E27, renomear para `e2e-talkx.yml` e usar `paths` que casem com o
  diff da **PR** (gatilho `pull_request` já faz isso corretamente — o problema era o `push` de merge commit).
  Verificação: PR de Contatos não dispara.
- [ ] **E85** · C · G-05 · Fixtures E2E em produção (`e2e0e2e0-…`, segmento `621521f3-…`, contato `04dff4dc-…`):
  documentar em `e2e/fixtures/README.md` **e** criar `scripts/db-audit/e2e-fixtures.test.sh` que prova a presença
  deles no banco (rodado no `db-live-guard` agendado). Verificação: remover um fixture num Postgres descartável → teste
  ❌.
- [ ] **E86** · D ⚠️ · G-05 · Avaliar `supabase start` + seed mínimo em CI para a suíte logada (`gen-types.sh --local`
  já prevê). Custo: ~3 min de boot por run; ganho: E2E sem tocar produção nem fixtures permanentes. Decisão após E79
  mostrar o custo atual.
- [ ] **E87** · C · G-05 · Quarentena formal: `e2e/quarantine.json` com spec, motivo, issue e prazo; `playwright.config`
  lê e marca `fixme`; `check-test-inventory.mjs` (E48) falha se um item passar do prazo. Verificação: item vencido →
  CI ❌.
- [ ] **E88** · B · G-35 · `ci.yml` job `e2e`: `--project=chromium` é o único deslogado que exercita `auth.spec.ts` com
  Chromium; `firefox-auth`/`webkit-auth` só valem em `main` → mover para `e2e-logado` (que já instala os 3 engines) e
  deixar o PR só com Chromium. Verificação: job `e2e` de PR < 90 s com cache (E68).

### Fase 7 — Governança, observabilidade e documentação (E89–E100)

- [ ] **E89** · D ⚠️ · G-08/G-16 · Inventariar e decidir os 9 GitHub Apps: manter SonarCloud (com E10), CodeRabbit
  **ou** cubic **ou** Copilot (não os 3 — 96 comentários em #1343), Vercel (necessário); **remover** Greptile (trial expirado, só posta aviso), ECC Tools (2
  comentários por push, sem permissão de check, zero valor) e Mermaid Sync (skipped sempre) e Supabase for GitHub
  (G-34). Registrar a lista final no CLAUDE.md. Verificação: PR nova recebe ≤ 3 comentários de bot.
- [ ] **E90** · B · G-23 · Notificação de falha na `main` por WhatsApp via N8N (webhook `workflow_run` →
  Evolution GO `PRINCIPAL` → número do Joaquim), só para `conclusion: failure` em `e2e-logado`, `db-live-guard`,
  `deploy-functions`, `types-sync`, com dedupe de 1 h por workflow. Verificação: forçar 1 falha → 1 mensagem.
- [ ] **E91** · B · G-36 · `branch-hygiene-audit.yml`: além do Job Summary, atualizar o corpo da issue #378 (ou abrir
  `[branch-hygiene]`) com a tabela; listar também PRs abertas há > 7 dias sem push (hoje #1153, #1206 de 29/09).
  Verificação: issue atualizada na próxima segunda.
- [ ] **E92** · C · G-38 · Corrigir `.github/ISSUE_TEMPLATE/config.yml` (URL do repo, remover telefone placeholder) e
  o PR template (tirar "staging"; adicionar "Migration? → arquivo + ledger + catálogo" e "Edge? → disparar
  deploy-functions após merge"). Verificação: revisão.
- [ ] **E93** · A · G-39 · Repo: `allow_merge_commit: false`, `allow_rebase_merge: false`,
  `squash_merge_commit_message: PR_BODY`, `use_squash_pr_title_as_default: true`. Verificação: `GET /repos`.
- [ ] **E94** · A · G-40 · Apagar environments `copilot`, `Preview`, `Production` (sem regra, sem uso por workflow;
  `Preview`/`Production` são do Vercel antigo — confirmar que a integração atual da Vercel não os usa antes).
  Verificação: `GET /environments` → 4.
- [ ] **E95** · C · G-37 · Seção nova no CLAUDE.md "Perímetro do GitHub — estado canônico" com **uma tabela** (branch
  protection, environments, secrets por escopo, apps, `allowed_actions`), e a regra: toda mudança nesses campos
  atualiza a tabela **e** o `github-settings-baseline.json` (E13) no mesmo PR. Verificação: `settings-guard` verde
  contra a tabela.
- [ ] **E96** · C · G-42 · `docs/ci/README.md` (novo): 1 parágrafo por workflow (gatilho, o que prova, o que acontece
  quando falha, quem é avisado), gerado a partir de um bloco `# docs:` no topo de cada YAML por
  `scripts/ci/render-workflow-docs.mjs --check` (falha se divergir). Verificação: `--check` verde no CI.
- [ ] **E97** · B · G-41 · `set -euo pipefail` como primeira linha de todo `run:` multi-linha (ou `defaults.run.shell:
  bash -euo pipefail {0}` por workflow) nos 8 workflows que não têm. Verificação: `actionlint`/`shellcheck` sem SC2086/
  SC2181.
- [ ] **E98** · C · todos · `scripts/ci/workflow-contracts.unit.mjs`: um teste por invariante deste plano que pode
  regredir em YAML (sem `pull_request` com secret; `persist-credentials: false`; `cancel-in-progress` só em PR;
  `--ignore-scripts`; pgbouncer sem `continue-on-error`; `paths` do guarda vivo sem `functions/**`; TLS em todo workflow
  com `DESTINO_URL*`). Verificação: desfazer qualquer etapa → teste ❌.
- [ ] **E99** · C · G-37 · Fechar o plano de 27/09: marcar os 17 itens entregues como `[x]` com o PR, e os demais como
  "substituído por E-xx deste plano". Verificação: `grep -c '\[x\]'` ≥ 17 naquele arquivo.
- [ ] **E100** · A · E70 · Após 7 dias de `🦕 Edge contracts` verde em todas as PRs, adicioná-lo aos required checks
  (PUT completo da branch protection, preservando `strict` conforme E15). Verificação: `GET` lista 7 contexts; nenhuma
  PR aberta fica bloqueada por check ausente.

---

## 5. O que **não** mexer (parece bug, não é)

- `talkx.spec.ts` nos 3 engines e os fixtures E2E em produção — ver CLAUDE.md (28/09) e E85.
- `vars.CRM_SYNC_WORKER_ENABLED` inexistente — preparação deliberada (E02 do plano de 20/09).
- `secret_scanning_non_provider_patterns` desligado — exige GitHub Secret Protection (pago).
- `merge_group` em `ci.yml`, `db-guard.yml`, `codeql.yml` — inerte em conta `User`, sem custo.
- `supabase-sync.yml` com `LEGACY_IMPORT_UNLOCK` ausente — desarmado de propósito.
- `TYPES_SYNC_PR_TOKEN` ausente — o passo "Destravar os checks" substitui o PAT (provado em 36134562996).
- `db-live-guard` sem `pull_request` — não expor `DESTINO_URL` a código de PR.
- `CodeQL (javascript-typescript)` fora dos required checks — decisão de 27/09.
- `can_approve_pull_request_reviews: true` — governa a **criação** de PR pelo Actions; desligar quebra o `types-sync`.
- O guard de imutabilidade de migration bloqueando a PR #1333 — comportamento correto (edição de `20260916230000` já
  aplicada); a solução é arquivo novo, como a mensagem diz.

---

## 6. Ordem recomendada (primeiros 10 dias úteis)

| Dia | Etapas | Resultado esperado |
|---|---|---|
| 1 (hoje) | E01, E02, E03, E04, E05, E06, E11, E12 | `main` sem vermelho no guarda vivo; #1342/#888 fechadas; atestação medida |
| 2 | E13, E14, E15, E16, E17, E18 | 4ª regressão de `strict` detectada em minutos; `types-sync` para de brigar com a `main` |
| 3 | E23, E24, E27, E28, E38, E39, E40 | nenhuma credencial de produção em job com `postinstall` ou em branch de bot |
| 4 | E09, E81, E82, E83 | `E2E logado` verde e avisando quando quebra |
| 5 | E41, E42, E43, E44, E45, E53 | guarda vivo diz **o que** divergiu e comenta 1× por causa |
| 6 | E19, E20, E21, E22, E51 | Gate 3 protege sem exigir `force_gate3` diário |
| 7 | E48, E49, E50, E46, E47 | 8 testes órfãos no CI; `db-guard` 2× mais rápido |
| 8 | E67, E68, E69, E71, E72, E73 | PR verde em ~4 min, 0 artifacts por PR |
| 9 | E29, E30, E31, E32, E33, E37 | perímetro: TLS em todo `DESTINO_URL`, lista de actions, actionlint, #13 fechado |
| 10 | E55–E60, E62 (decisão), E89 (decisão), E95, E96, E98 | deploy com `dry_run` e Deployment; `db-migrate` enxuto; apps podados; contratos de workflow testados |

Dependências duras: E03 depende de E01; E05 de E03+E04; E16 de E15; E22 de E15; E25/E26 de decisão do Joaquim
(DDL); E34 de E36; E84 de E27; E100 de E70 (+7 dias); E99 ao final.
