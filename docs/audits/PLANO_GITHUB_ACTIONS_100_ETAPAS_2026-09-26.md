# Auditoria exaustiva do GitHub Actions — plano de correção em 100 etapas

**Data:** 2026-09-26 (19:30 UTC) · **Repo:** `adm01-debug/Zapp_Web_V2` · **HEAD auditado:** `0a83e44`
**Escopo:** os 13 workflows em `.github/workflows/`, os 3 workflows dinâmicos (Dependabot ×2, Copilot reviewer),
branch protection da `main`, environments, secrets, variáveis, permissões de Actions, cache, artifacts,
webhooks, Code Scanning, Secret Scanning, Dependabot e o histórico real de runs.

**Fonte de evidência (tudo lido ao vivo pela API do GitHub nesta sessão, não de memória):**
- 100 últimos runs com `conclusion=failure` desde 19/09 (página 1; havia 496 no total — só os 100 mais recentes foram lidos);
- 100 últimos runs na `main` (todos de 26/09 16:24→19:27; havia 1.702 desde 24/09);
- histórico completo por workflow para `db-live-guard` (100 runs desde 22/09), `e2e-logado` (60), `types-sync` (15),
  `db-migrate` (10), `deploy-functions` (15), `branch-hygiene-audit` (1), `crm-sync-worker` (3 de 1.635);
- logs dos jobs que falham hoje: `db-live-guard` run 36265441191, `e2e-logado` run 36263276693,
  `deploy-functions` run 36265426245, `db-guard` run 36261679494, `ci.yml` runs 36258930215 e 36256967175;
- branch protection, 16 secrets (nomes), 7 environments, 0 variáveis, permissões de Actions, 52 caches,
  3.034 artifacts, 1 webhook + 5 entregas, 5 alertas de Code Scanning, 0 de Dependabot, 0 de Secret Scanning,
  3 PRs abertas, 30 PRs fechadas mais recentes, 9 issues abertas.

Convenção de prioridade: **P0** quebra hoje ou mascara quebra · **P1** risco real / desperdício grande ·
**P2** melhoria de confiabilidade ou custo · **P3** higiene.
Convenção de quem mergeia (regra 8 do fluxo Git): **🔒 Joaquim** = toca CI, secrets, environments, branch
protection, dado destrutivo ou custo → PR aberta aguardando aprovação · **🤖 autônomo** = escopo comum.

---

## 0. Sumário executivo

| Sinal | Número medido | Leitura |
|---|---|---|
| Runs na `main` em 3 dias (24→26/09) | 1.702 | ~7 workflows disparam a cada merge; ~190 PRs mergeadas em 48h |
| Falhas registradas só em 26/09 (amostra de 100) | 100 | 64 `DB Live Guard`, 25 `E2E logado`, 6 `CI` em PR, 3 `Deploy Edge`, 2 `DB Guard` em PR |
| `DB Live Guard` desde 22/09 | 79 falhas, 19 cancelados, **0 sucessos** | vermelho contínuo desde 25/09 22:39; hoje falha no 1º passo (drift de conteúdo em 3 migrations) |
| Issue #724 (alerta do guarda vivo) | ~150 comentários automáticos | 1 comentário por falha → alerta virou ruído, ninguém lê |
| `E2E logado` em 26/09 | 25 falhas + 19 cancelados + 6 sucessos | dependia de dado de produção com nome divergente; corrigido às 18:59 (#873); 3 sucessos depois |
| `db-migrate` | 2 runs zumbis (`waiting` desde 14:09 e `pending` desde 18:44) | ocupam a concurrency `db-migrate-production`; qualquer dispatch novo fica na fila |
| Cache do Actions | 52 caches · **10,89 GB** (limite 10 GB) | 47 são bancos CodeQL "overlay-base" de ~225 MB, um por commit da `main`; evicção já em curso |
| Webhook `n8n …/gh-push-graph-sync` | 5/5 entregas com HTTP 404 | morto; cada push gera entrega falha |
| Code Scanning | 5 alertas abertos (4 high, 1 medium) | mais antigo de 03/09; 1 é em arquivo de teste |
| Branch protection `main` | `strict=false`, sem review, sem conversation resolution, sem linear history | perímetro real = 7 checks + `enforce_admins` + sem force-push/deleção |
| Actions permissions | `allowed_actions: all` | qualquer action do marketplace pode entrar; só o pin por SHA segura |
| Secrets com poder de produção | `DESTINO_URL`, `SUPABASE_ACCESS_TOKEN`, 2 service_role keys | todos no nível **repo**, nenhum em environment |
| Dependabot | `bun` + `github-actions` | falta `gomod` (`infrastructure/preview-egress-proxy` tem `go.mod` e roda `go test` no CI) |

**Gates que estão funcionando como projetado (não são bugs):** as 6 falhas de CI em PR de hoje foram
`typography parity guard` (1 ocorrência acima do teto) e `bundle budget` (initial-js 380 KB > 340 KB) — os
autores corrigiram e mergearam depois. O `DB Guard offline` pegou a colisão de version `20260926160000`
(dois arquivos) na PR #859; resolvido por rename em #872. SHA pinning, fronteira de secrets em PR e
`default_workflow_permissions: read` estão corretos.

---

## 1. Inventário dos workflows (estado ao vivo)

| Arquivo | Gatilhos | Permissões (workflow → job) | Concurrency | Timeout | Estado hoje |
|---|---|---|---|---|---|
| `ci.yml` (372 l.) | push `main,develop` · PR · merge_group | `contents:read` → audit-report eleva `contents+PR:write` | por PR, cancela só em PR | 20–30 min | 12 ✅ / 1 cancelado na `main`; 6 ❌ em PR (gates legítimos) |
| `db-guard.yml` (184 l.) | push · PR · merge_group · dispatch | `contents:read` | cancela sempre (inclusive `main`) | 20 | 10 ✅ / 3 cancelados na `main`; 2 ❌ em PR (colisão de version) |
| `codeql.yml` (83 l.) | push · PR · merge_group · seg 09:30 | `security-events:write` no job | cancela em push | 30/15 | 9 ✅ / 4 cancelados na `main` |
| `db-live-guard.yml` (258 l.) | push `main` · seg 06:13 · dispatch | `issues:write` no job | cancela em push | 25 | **79 ❌ / 0 ✅ desde 22/09** |
| `types-sync.yml` (483 l.) | push `main` (paths) · seg 05:49 · dispatch | `contents+issues+PR+actions:write` no job | fila | 30 | 13 ✅ hoje; 2 em fila |
| `e2e-logado.yml` (70 l.) | push `main` · dispatch | `contents:read` | cancela em push | 15 | 25 ❌ / 19 cancel / 6 ✅ hoje |
| `auto-update-pr-branch.yml` (94 l.) | push `main` · dispatch | **workflow-level** `contents+PR+actions:write` | fila | **sem timeout** | 14 ✅ hoje, todos no-op ("nenhum PR behind") |
| `deploy-functions.yml` (327 l.) | dispatch | `contents:read` | fila | 30 | 3 ❌ / 2 cancel / 3 ✅ hoje; environment `producao-edge-functions` |
| `db-migrate.yml` (**1.723 l., 92 KB**) | dispatch | `contents:read` | fila | 25 | 2 zumbis; último ✅ 23/09; environment `producao-ddl` |
| `supabase-sync.yml` (110 l.) | dispatch | `contents:read` | fila | 45 | desarmado (secret `LEGACY_IMPORT_UNLOCK` não existe) |
| `targeted-ledger-evidence.yml` (91 l.) | dispatch | `contents:read` | fila | 10 | environment `db-ledger-evidence` |
| `branch-hygiene-audit.yml` (78 l.) | seg 07:56 · dispatch | `contents+PR:read` | cancela | 10 | 1 run (21/09) ✅; relatório só no Job Summary |
| `crm-sync-worker.yml` (75 l.) | dispatch (schedule comentado) | `contents:read` | fila | 5 | 1.635 runs históricos `skipped`; parado desde 22/09 |
| dinâmico `dependabot-updates` | — | — | — | — | API não expõe runs (404); 0 PRs abertas do bot |
| dinâmico `update-graph` | — | — | — | — | criado 10/09 |
| dinâmico `copilot-pull-request-reviewer` | — | — | — | — | ativo desde 13/06 |

Observações transversais:
- `develop` **não existe** como branch; `ci.yml` e `db-guard.yml` ainda o listam em `push`/`pull_request`.
- `runs-on`: 12 workflows fixam `ubuntu-24.04`; `auto-update-pr-branch.yml` usa `ubuntu-latest`.
- `SUPABASE_CLI_VERSION: '2.116.0'` está copiado em 4 workflows; `bun-version: '1.4.0'` em 5; `node-version: '24'` em 6;
  o bloco "Exigir credencial do banco oficial" (identidade + TLS) está duplicado em 5 workflows com pequenas variações
  (`types-sync` e `db-migrate` **não** endurecem TLS nem pinam CA; `db-live-guard` e `targeted-ledger-evidence` sim).
- Nenhuma injeção de expressão encontrada: os únicos `${{ }}` dentro de `run:` usam outputs próprios (`steps.diff.*`);
  `head_commit.message` só aparece em `if:`. O job `🔬 CodeQL (actions)` cobre isso continuamente.
- O log do job de E2E tem 49.381 linhas com `##[debug]` → debug logging está ligado em algum nível (não há
  `ACTIONS_STEP_DEBUG` em variáveis nem nos 16 secrets listados; origem a confirmar — etapa E19).

---

## 2. Achados (com evidência)

### P0 — quebra hoje ou mascara quebra

- **F-01 · `DB Live Guard` vermelho contínuo.** 79 falhas e 0 sucessos desde 22/09 (amostra de 100 runs).
  Hoje falha em `Comparar migrations com schema_migrations` com **drift de conteúdo** em 3 versions:
  `20260926152000` (`search_contacts_returns_latlng`), `20260926160000` (`search_contacts_add_lat_lon`) e
  `20260926180000` (`multiplix_send_engine`) — SHA do arquivo ≠ SHA do ledger. Isto é a regra 6/7 da seção 1 do
  CLAUDE.md violada de novo: o SQL aplicado em produção não é o que está no arquivo mergeado (ou o arquivo foi
  editado depois do apply). Como o guarda morre no 1º passo, catálogo, manifesto, `types.ts`, ACLs, paridade
  tripla e runtime config **não são verificados há 2 dias** — o artefato de evidência sai vazio.
- **F-02 · Alerta do guarda vivo saturado.** Issue #724 aberta em 25/09 recebe 1 comentário por falha
  (~150 hoje, 50 páginas de 3). Não há dedupe por causa, nem throttle. Sinal indistinguível de ruído.
- **F-03 · Dois runs zumbis de `db-migrate`.** Run 36247549783 `waiting` (aprovação do environment) desde
  14:09 e run 36263608943 `pending` desde 18:44 (preso atrás do primeiro na concurrency `db-migrate-production`,
  `cancel-in-progress: false`). Qualquer dispatch novo entra na fila e nunca roda até alguém aprovar ou cancelar
  na aba Actions. `timeout-minutes` não cobre tempo em `waiting`.
- **F-04 · `E2E logado` acoplado a dado de produção mutável.** 25 falhas hoje: `conversation.spec.ts:60`
  esperava `[E2E] Contato de teste - nao apagar` em `conversation-item` e o nome renderizado divergia. Fix em
  #873 (18:59) → 3 sucessos seguidos. O teste roda `bun run dev` contra o Supabase **de produção** com usuário real
  e muta estado (resolve conversa, reabre). Não existe ambiente de staging. Além disso, 19 runs cancelados
  hoje por `cancel-in-progress` em push (PR #878 aberta propõe enfileirar).
- **F-05 · `deploy-functions` engole o motivo da falha.** 3 falhas hoje no passo "Capturar e validar manifesto
  remoto pos-deploy" após exatamente ~3 min (18 tentativas × 10 s de estabilização). O `main().catch(() => …)` em
  `scripts/edge-deploy/collect-remote.mjs` imprime a mesma frase genérica para "não estabilizou", "401 na Management
  API" e "argumento inválido". Operador não consegue distinguir. Dois disparos concorrentes (19:11 e 19:13→19:15)
  foram cancelados à mão — pessoas disparando em paralelo sem saber da fila.

### P1 — risco real ou desperdício grande

- **F-06 · Fan-out por push na `main`.** Cada merge dispara 7 workflows (`ci`, `db-guard`, `codeql`,
  `db-live-guard`, `types-sync` se tocar paths, `e2e-logado`, `auto-update-pr-branch`). Com ~95 merges/dia isso
  deu 1.702 runs em 3 dias. `db-live-guard` abre conexão com o banco de produção a cada push mesmo quando o diff é
  só `src/`; `auto-update-pr-branch` roda 14×/dia e é sempre no-op porque `strict=false` (PR nunca fica `BEHIND`).
- **F-07 · Cache do Actions saturado por CodeQL.** 52 caches, 10,89 GB (limite 10 GB). 47 são
  `codeql-overlay-base-database-…-<sha>` de 222–228 MB, um por commit da `main`, chave nunca reutilizada. Os
  caches úteis (`bun-*` 35 MB de 29/08, `setup-go`, `gitleaks`) estão na fila de evicção.
- **F-08 · Secrets de produção no nível repo.** `DESTINO_URL` (banco oficial), `SUPABASE_ACCESS_TOKEN`,
  `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`, `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` estão como repo
  secrets. Qualquer workflow novo (ou um `pull_request_target` que escape ao `check-pr-workflow-secrets`) os alcança.
  Environments com `deployment_branch_policy: protected_branches` já existem e restringiriam o acesso a jobs
  declarados com `environment:` rodando em `main`.
- **F-09 · `allowed_actions: all`.** Qualquer action de terceiro pode ser adicionada; só o pin por SHA e o
  `check-workflow-pins.mjs` seguram. `selected` + `github_owned_allowed` + `verified_allowed` + lista de padrões
  (`oven-sh/setup-bun@*`, `denoland/setup-deno@*`, `supabase/setup-cli@*`, `peter-evans/create-pull-request@*`,
  `gitleaks/gitleaks-action@*`) fecha a porta sem quebrar nada que existe.
- **F-10 · Code Scanning com 5 alertas abertos há até 23 dias.** #7 `js/xss-through-dom` em
  `src/components/team-chat/TeamFileUploader.tsx:143` (high); #2 `js/stack-trace-exposure` em
  `supabase/functions/_shared/validation.ts:152` (medium, edge function em produção); #15 e #21
  `js/incomplete-sanitization` em `useTalkXSegments.ts:76` e `scripts/qa/medir-tipografia.cjs:201`; #14 idem em
  `EscapeBypass.test.ts:35` (arquivo de teste → dismiss "used in tests").
- **F-11 · Webhook morto.** Hook 671865950 → `https://n8n.atomicabr.com.br/webhook/gh-push-graph-sync-v1b2c3d4`
  responde 404 em 100% das entregas (5/5 nas últimas). Confirma o que o CLAUDE.md já suspeitava do
  "Graph Sync — Dispatcher".
- **F-12 · Dependabot sem `gomod`.** `infrastructure/preview-egress-proxy/go.mod` roda `go test ./...` no job
  Lint, mas nenhum updater cobre módulos Go. Também não há updater para `scripts/ci/deno.lock` (frozen) nem para a
  imagem `postgres:17-alpine` (tag mutável usada em ~20 testes do `db-guard`).
- **F-13 · Job `audit-report` do `ci.yml` nunca produz PR verde.** Só dispara se a mensagem do commit contiver
  "audit"; abre PR com `github.token` via `peter-evans/create-pull-request` → checks nascem `action_required` e não há
  passo de destravamento (o `types-sync` tem, este não). Issue #379 ("Audit Report sempre skipping") aberta desde 13/09.
- **F-14 · `types-sync` e `db-migrate` conectam ao banco sem `verify-full` nem CA pinada.** Os dois usam só
  `validarDestino`; `db-live-guard` e `targeted-ledger-evidence` já usam `endurecerDestinoTls` + `validarSupabaseCa`.
  Inconsistência de perímetro no mesmo secret.

### P2 — confiabilidade e custo

- **F-15 · CodeQL e DB Guard cancelam runs da `main`.** `codeql.yml` `cancel-in-progress: push` e `db-guard.yml`
  `cancel-in-progress: true` (sem distinguir evento) → 4 + 3 runs cancelados na `main` hoje. Commits da `main`
  ficam sem análise CodeQL; a lição que o `ci.yml` já aprendeu ("cada commit mantém seu próprio veredito") não foi
  replicada.
- **F-16 · Pipeline de PR serial.** `test` depende de `lint-and-typecheck`; `build` depende dos dois; `e2e` e
  `security` dependem de `lint`. O job Lint acumula deno check + 16 testes Deno + node --test + go test + 5 ratchets +
  guards. Média medida de `CI/CD Pipeline` na `main`: 8,0 min. Tudo isso roda também em PR só de docs.
- **F-17 · Agendamentos semanais para guardas de produção.** `db-live-guard` e `types-sync` só na segunda; sem push
  no fim de semana, DDL fora do fluxo passa até 60 h sem detecção.
- **F-18 · Retries do Playwright.** `retries: 2` + `workers: 1` → cada falha real custa 3× o tempo; o job de E2E
  em PR tem 20 min de teto e o logado 15.
- **F-19 · `db-migrate.yml` com 1.723 linhas.** Contratos runtime por version hard-coded (20+ `case`), dois bundles
  atômicos fixos, um teste unitário (`db-migrate-workflow.unit.mjs`) que afirma o conteúdo do YAML. Manutenção
  inviável; e a decisão de 26/09 (CLAUDE.md) já moveu o DDL para MCP + ledger. O workflow segue como rota "oficial
  no papel" que ninguém usa e que ainda trava com zumbis (F-03).
- **F-20 · `branch-hygiene-audit` escreve só no Job Summary.** Ninguém abre a aba Actions de segunda para ler.
  Issue #378 pede a mesma coisa desde 13/09.
- **F-21 · Artifacts.** 3.034 artifacts vivos; `dist` 22 × ~10 MB = 219 MB (retenção 3 d, só em PR — ok); relatório
  Playwright e cobertura por run. Sem problema de limite, mas `dist` não é consumido por nada (Vercel builda sozinho).
- **F-22 · `auto-update-pr-branch.yml`.** `ubuntu-latest`, sem `timeout-minutes`, permissões `write` no nível do
  workflow (não do job), e no-op enquanto `strict=false`. Se `strict` voltar a `true`, o ciclo de `BEHIND` de 25/09
  volta junto (documentado no CLAUDE.md).

### P3 — higiene

- **F-23** `develop` inexistente em `ci.yml`/`db-guard.yml`.
- **F-24** `use_squash_pr_title_as_default: false` e 3 estratégias de merge habilitadas → histórico da `main` com
  "Merge branch 'main' into hermes/…" (visto em `git log`). `delete_branch_on_merge: true` já está ligado.
- **F-25** Environments `copilot`, `Preview`, `Production` sem regra e com `deployment_branch_policy: null`
  (criados pelo Vercel/Copilot em junho). `prevent_self_review: false` em todos os `required_reviewers` (inevitável
  com um único usuário).
- **F-26** `secret_scanning_validity_checks: disabled` (gratuito em repo público; avisa se um token vazado ainda é válido).
- **F-27** `dependabot.yml` usa a chave `reviewers` (deprecada pelo GitHub em 2025; verificar aviso no log do Dependabot).
- **F-28** CLAUDE.md diz "12 workflows"; são 13 arquivos + 3 dinâmicos.
- **F-29** `supabase-sync.yml` + `supabase-export/import.sh` continuam no repo como código morto com potencial
  destrutivo (desarmado por secret ausente). Decisão pendente: apagar ou manter.
- **F-30** `ci.yml` não tem `workflow_dispatch` (não dá para reexecutar a suíte na `main` sem push).
- **F-31** `CODEOWNERS` decorativo (sem `required_pull_request_reviews`) — deliberado, mas o arquivo induz a erro.
- **F-32** Issues #374–#382 (13/09) e #724 (25/09) abertas sem dono nem prazo; #378/#379 duplicam achados deste plano.

---

## 3. Plano de correção — 100 etapas

Legenda por etapa: **[Pn]** prioridade · **🔒/🤖** quem mergeia · **Aceite** = o que prova que terminou.

### Fase 0 — Tirar o vermelho da `main` e desarmar zumbis (E01–E12)

- [ ] **E01** [P0] 🤖 Reconciliar o drift de conteúdo das 3 migrations de 26/09. Para cada version
  (`20260926152000`, `20260926160000`, `20260926180000`): ler `statements` do ledger, comparar com o arquivo,
  decidir qual é a verdade (o que está em produção manda) e alinhar o arquivo ao ledger **ou** aplicar a diferença
  faltante via `db_query` + `UPDATE … statements` guardado por `RETURNING`, seguindo regra 7. Nunca editar o ledger
  para "casar" com um arquivo que não foi aplicado. · `supabase/migrations/`, `scripts/db-audit/register-migration.mjs`
  · **Aceite:** `check-migration-drift.mjs` com `DESTINO_URL` sai 0; `db-live-guard` verde no próximo push.
- [ ] **E02** [P0] 🤖 Descobrir a origem do drift de E01: `git log -p` dos 3 arquivos após o merge de cada PR
  (#862, #859, #864) e comparar com a hora do registro no ledger. Documentar no PR de E01 quem editou depois de
  aplicar. · **Aceite:** parágrafo no CLAUDE.md seção "Incidente" com a cadeia real.
- [ ] **E03** [P0] 🔒 Cancelar os 2 runs zumbis de `db-migrate` (36247549783 `waiting`, 36263608943 `pending`)
  via `github_cancel_workflow_run`. · **Aceite:** `GET /actions/workflows/db-migrate.yml/runs?status=waiting` vazio.
- [ ] **E04** [P0] 🔒 Fechar a issue #724 com comentário final apontando para E01 e reabrir limpa só se o guarda
  falhar de novo depois de E01. · **Aceite:** issue fechada; próxima falha abre issue nova (comportamento já
  existente do workflow).
- [ ] **E05** [P0] 🔒 Dedupe do alerta do `db-live-guard`: no passo "Abrir ou atualizar alerta", só comentar se a
  **causa** (nome do passo que falhou + primeira linha de `FALHA:`) for diferente do último comentário, ou se
  passaram > 6 h. Guardar a causa num marcador HTML `<!-- cause:sha256 -->` no corpo. · `.github/workflows/db-live-guard.yml`
  · **Aceite:** 10 pushes seguidos com a mesma falha geram 1 comentário.
- [ ] **E06** [P0] 🔒 Incluir no alerta o **passo exato** que falhou (`steps.<id>.outcome`) e as 5 primeiras linhas
  de `FALHA:` do log, em vez do texto genérico "migrations, catalogo, manifesto, types.ts, ACLs ou paridade".
  · **Aceite:** comentário da issue cita a version divergente sem abrir o log.
- [ ] **E07** [P0] 🔒 `deploy-functions`: em `collect-remote.mjs`, o `catch` deve imprimir `error.name` e uma
  classificação (`did-not-stabilize` / `management-api-<status>` / `invalid-args`) sem corpo de resposta; e o passo
  do YAML deve gravar essa classificação no Job Summary. · `scripts/edge-deploy/collect-remote.mjs`,
  `scripts/edge-deploy/stable-inventory.mjs`, `deploy-functions.yml` · **Aceite:** run que falha em estabilização mostra
  "did-not-stabilize after 18 samples" no summary.
- [ ] **E08** [P1] 🔒 `deploy-functions`: subir `maxAttempts` para cobrir o pior caso observado (o CLI leva até
  ~90 s para propagar versão em deploy total de 69 funções) **ou** tornar `--scope` único mais tolerante a funções
  `unchanged` — decidir com dados dos runs 36265304769/36265426245 (ambos morreram em ~3 min).
  · **Aceite:** 3 deploys seguidos de função única sem falha de atestado.
- [ ] **E09** [P1] 🔒 `deploy-functions`: passo inicial "Detectar deploy concorrente" que lista runs
  `in_progress|queued|waiting` do mesmo workflow e falha com mensagem clara em vez de entrar na fila silenciosa.
  · **Aceite:** 2º dispatch simultâneo termina em < 30 s com aviso.
- [ ] **E10** [P0] 🔒 Mergear #878 (`e2e-logado` enfileira em vez de cancelar) após revisar; ou, se rejeitada,
  manter cancel mas rodar o job **só no último commit de um lote** via `concurrency` + `if` de `github.run_attempt`.
  · **Aceite:** 0 runs `cancelled` do `e2e-logado` em um dia com > 20 merges.
- [ ] **E11** [P0] 🤖 `e2e/conversation.spec.ts`: tornar o seletor do contato seedado independente do nome
  renderizado (buscar pelo `contact_id` `04dff4dc-…` via `data-contact-id` ou pelo telefone), e falhar com mensagem
  explícita "fixture ausente em produção" quando o contato não existir. · **Aceite:** renomear o contato em produção
  não quebra o teste; apagar o contato produz erro nomeado.
- [ ] **E12** [P0] 🤖 Adicionar ao `e2e-logado.yml` um passo `Verificar fixture` antes do Playwright: `curl` na
  edge/REST com o token do usuário de teste confirmando que o contato fixture existe e está atribuído; se não, `exit 78`
  (neutral) em vez de vermelho. · **Aceite:** ausência de fixture aparece como "neutral" com motivo, não como falha de UI.

### Fase 1 — Cortar o fan-out por push e o ruído (E13–E24)

- [ ] **E13** [P1] 🔒 `db-live-guard.yml`: filtrar `push` por `paths` (`supabase/**`, `scripts/db-audit/**`,
  `src/integrations/supabase/types.ts`, o próprio workflow). Pushes só de `src/` não abrem conexão com produção.
  O `schedule` e o `workflow_dispatch` continuam sem filtro. · **Aceite:** merge de PR só de front não dispara o guarda.
- [ ] **E14** [P1] 🔒 `db-live-guard.yml` e `types-sync.yml`: schedule **diário** (ex.: `13 6 * * *` e `49 5 * * *`),
  mantendo a ordem types-sync → live-guard. · **Aceite:** run agendado todo dia; DDL fora do fluxo detectado em < 24 h.
- [ ] **E15** [P1] 🔒 `auto-update-pr-branch.yml`: desligar o gatilho `push` enquanto `strict=false` (deixar só
  `workflow_dispatch`), ou remover o workflow e registrar no CLAUDE.md que ele volta junto com `strict=true`.
  · **Aceite:** 0 runs no-op por dia.
- [ ] **E16** [P1] 🔒 `auto-update-pr-branch.yml` (se mantido): `runs-on: ubuntu-24.04`, `timeout-minutes: 10`,
  mover `permissions` para o nível do job. · **Aceite:** `check-workflow-pins` e `security-workflow.unit.mjs` verdes.
- [ ] **E17** [P1] 🔒 Remover o webhook 671865950 (n8n 404) ou corrigir a URL no N8N e testar com `github_ping_webhook`.
  Decisão de negócio: o Graph Sync automático vale a manutenção? · **Aceite:** `last_response.code` 200 ou hook inexistente.
- [ ] **E18** [P1] 🔒 Cache: job semanal `cache-janitor` (ou passo em `branch-hygiene-audit`) que apaga caches
  `codeql-overlay-base-database-*` com mais de 2 dias e qualquer cache com `last_accessed_at` > 7 d, via API. Antes,
  limpar manualmente os 47 atuais. · **Aceite:** uso total < 5 GB; caches `bun-*` sobrevivem.
- [ ] **E19** [P1] 🔒 Descobrir por que os logs saem com `##[debug]` (49 k linhas por job de E2E): checar se
  `ACTIONS_STEP_DEBUG`/`ACTIONS_RUNNER_DEBUG` existe como secret/variable no nível de usuário ou se alguém reexecutou
  com debug; desligar. · **Aceite:** log do `e2e-logado` < 3 k linhas.
- [ ] **E20** [P2] 🔒 `codeql.yml`: `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` (mesma regra
  do `ci.yml`), para nenhum commit da `main` ficar sem análise. · **Aceite:** 0 runs `cancelled` do CodeQL na `main`.
- [ ] **E21** [P2] 🔒 `db-guard.yml`: idem E20 (`cancel-in-progress` só em PR). · **Aceite:** idem.
- [ ] **E22** [P2] 🔒 `codeql.yml`: avaliar desligar o modo overlay (fonte dos caches de 225 MB por commit) ou
  restringi-lo a `pull_request`; medir tempo antes/depois (média atual 3,1 min). · **Aceite:** ≤ 1 cache CodeQL novo
  por dia na `main` sem aumentar o tempo de análise em PR acima de 5 min.
- [ ] **E23** [P2] 🔒 Remover `develop` de `on.push.branches`/`on.pull_request.branches` em `ci.yml` e `db-guard.yml`.
  · **Aceite:** grep `develop` nos workflows vazio.
- [ ] **E24** [P2] 🔒 `ci.yml`: adicionar `workflow_dispatch` (sem inputs) para reexecutar a suíte na `main` sem
  push. · **Aceite:** botão "Run workflow" disponível.

### Fase 2 — Perímetro de segurança (E25–E44)

- [ ] **E25** [P1] 🔒 Criar environment `db-leitura` com `deployment_branch_policy: protected_branches`, **sem**
  reviewers, e mover `DESTINO_URL` para lá como environment secret. · **Aceite:** secret ausente no nível repo.
- [ ] **E26** [P1] 🔒 Declarar `environment: db-leitura` nos jobs de `db-live-guard.yml` e `types-sync.yml`
  (os únicos que precisam do banco sem aprovação humana). · **Aceite:** ambos verdes com o secret só no environment.
- [ ] **E27** [P1] 🔒 Duplicar `DESTINO_URL` também em `producao-ddl` e `db-ledger-evidence` (secrets de
  environment) para `db-migrate.yml`, `targeted-ledger-evidence.yml` e `supabase-sync.yml` continuarem funcionando.
  · **Aceite:** dry-run do `db-migrate` passa o passo "Provar identidade".
- [ ] **E28** [P1] 🔒 Mover `SUPABASE_ACCESS_TOKEN`, `EXTERNAL_SUPABASE_*`, `PROMOGIFTS_SUPABASE_*`,
  `PREVIEW_EGRESS_*` e `CRON_SECRET` para o environment `producao-edge-functions` (o único consumidor é
  `deploy-functions.yml`; `crm-sync-worker.yml` precisa de `CRON_SECRET` + `SUPABASE_PROJECT_REF` → declarar
  `environment` nele também ou criar `crm-worker`). · **Aceite:** repo secrets restantes = `VITE_*`, `E2E_TEST_*`,
  `SUPABASE_PROJECT_REF`.
- [ ] **E29** [P1] 🔒 Atualizar `scripts/ci/check-pr-workflow-secrets.mjs` para também rejeitar `environment:` em
  jobs de workflows com `pull_request` (environment secrets são a nova superfície). · **Aceite:** teste unitário novo
  em `check-pr-workflow-secrets.unit.mjs` cobre o caso.
- [ ] **E30** [P1] 🔒 `github_set_actions_permissions`: `allowed_actions: selected`, `github_owned_allowed: true`,
  `verified_allowed: true`, `patterns_allowed` = exatamente as 8 actions de terceiros em uso (`oven-sh/setup-bun@*`,
  `denoland/setup-deno@*`, `supabase/setup-cli@*`, `peter-evans/create-pull-request@*`, `gitleaks/gitleaks-action@*`
  e as que o `check-workflow-pins` listar). · **Aceite:** todos os workflows rodam; action fora da lista é recusada.
- [ ] **E31** [P1] 🔒 Teste unitário `scripts/ci/allowed-actions.unit.mjs` que compara a lista de `uses:` dos
  workflows com `patterns_allowed` (lido de um JSON versionado) e falha se divergir. · **Aceite:** adicionar uma
  action nova sem atualizar o JSON quebra o Lint.
- [ ] **E32** [P1] 🤖 Corrigir alerta CodeQL #7 (`TeamFileUploader.tsx:143`, DOM text → HTML): usar `textContent`
  ou sanitizar com `dompurify` (já é dependência). · **Aceite:** alerta fechado como `fixed` na próxima análise.
- [ ] **E33** [P1] 🤖 Corrigir alerta #2 (`_shared/validation.ts:152`, stack trace na resposta): logar server-side e
  devolver mensagem genérica. Deploy da edge afetada via `deploy-functions` + aprovação. · **Aceite:** alerta `fixed`;
  smoke da função verde.
- [ ] **E34** [P1] 🤖 Corrigir #15 (`useTalkXSegments.ts:76`) e #21 (`medir-tipografia.cjs:201`): `replace` com regex
  global e escape de `\`. · **Aceite:** ambos `fixed`.
- [ ] **E35** [P1] 🔒 Dismiss do alerta #14 (`EscapeBypass.test.ts`) com razão `used in tests`. · **Aceite:** alerta
  `dismissed`.
- [ ] **E36** [P2] 🔒 Ligar `secret_scanning_validity_checks` (gratuito em repo público). · **Aceite:** campo `enabled`
  em `github_get_repo`.
- [ ] **E37** [P1] 🔒 `types-sync.yml` e `db-migrate.yml`: adotar `endurecerDestinoTls` + `validarSupabaseCa` +
  `PGSSLMODE=verify-full` como já fazem `db-live-guard` e `targeted-ledger-evidence`. · **Aceite:** os 5 workflows que
  usam `DESTINO_URL` têm o mesmo bloco.
- [ ] **E38** [P1] 🔒 Extrair esse bloco para uma composite action local `.github/actions/db-identity/action.yml`
  (entrada: `destino_url`; saída: `DESTINO_URL` endurecido em `GITHUB_ENV`). `check-workflow-pins` já ignora `./`.
  · **Aceite:** 5 workflows consomem a action; 0 duplicação do trecho.
- [ ] **E39** [P2] 🔒 Composite action `.github/actions/setup-db-tooling` (Node 24 + Supabase CLI versão única +
  `install-postgresql-client.sh` + pgbouncer opcional). Fonte única de `SUPABASE_CLI_VERSION`. · **Aceite:** grep
  `SUPABASE_CLI_VERSION` retorna 1 arquivo.
- [ ] **E40** [P2] 🔒 Decidir o destino de `supabase-sync.yml` + `supabase-export/`: **recomendação: apagar**
  (snapshot legado, defasado, destrutivo, desarmado). Se manter, registrar no CLAUDE.md a data-limite. · **Aceite:**
  decisão registrada; arquivos removidos ou prazo escrito.
- [ ] **E41** [P2] 🔒 Environments `Preview`/`Production` (Vercel) e `copilot`: definir
  `deployment_branch_policy` (Production → protected branches) ou documentar que são geridos pelo Vercel.
  · **Aceite:** nenhum environment com `deployment_branch_policy: null` sem nota no CLAUDE.md.
- [ ] **E42** [P2] 🔒 Branch protection: decidir e registrar por escrito (CLAUDE.md) o estado desejado de
  `strict`, `required_linear_history`, `required_conversation_resolution`, `required_signatures`. Recomendação:
  `required_linear_history=true` + squash-only (E90) e manter `strict=false` enquanto não houver merge queue.
  · **Aceite:** `github_get_branch_protection` bate com o texto do CLAUDE.md.
- [ ] **E43** [P2] 🔒 `auto-update-pr-branch.yml`: se ficar, restringir o `approve` de runs a PRs cujo autor seja
  colaborador com `write` (checar `author_association`), para não aprovar run de fork. · **Aceite:** teste com PR de
  fork simulado não é aprovado.
- [ ] **E44** [P3] 🔒 Revisar `CODEOWNERS`: ou ligar `require_code_owner_reviews` (inviável com 1 humano e
  auto-merge) ou trocar o cabeçalho para "informativo; não é regra ativa" para não induzir a erro. · **Aceite:** texto
  do arquivo coerente com a proteção real.

### Fase 3 — Workflows de produção confiáveis (E45–E60)

- [ ] **E45** [P1] 🔒 `db-migrate.yml`: extrair os contratos runtime por version (linhas 186–1114) para arquivos
  `scripts/db-audit/runtime-contracts/<version>.sql|.mjs` carregados por nome; o YAML fica com 1 passo genérico.
  Atualizar `db-migrate-workflow.unit.mjs`. · **Aceite:** YAML < 400 linhas; dry-run de uma version antiga
  (`20260830170000`) produz o mesmo `runtime_sha256` de antes.
- [ ] **E46** [P1] 🔒 `db-migrate.yml`: mover os bundles atômicos fixos (`ATOMIC_DELIVERY_BUNDLE`,
  `TALKX_RECOVERY_BUNDLE`) para `scripts/db-audit/migration-bundles.json` validado por teste. · **Aceite:** YAML
  sem listas de versions embutidas.
- [ ] **E47** [P1] 🔒 `db-migrate.yml`: passo inicial "Bloquear se houver run em `waiting`" (mesma lógica de E09)
  para não criar zumbi em cima de zumbi. · **Aceite:** 2º dispatch com o 1º em `waiting` falha rápido com instrução.
- [ ] **E48** [P2] 🔒 Decidir a rota canônica de DDL: o CLAUDE.md (26/09) diz "MCP + ledger no mesmo turno";
  o `db-migrate.yml` diz "dry-run + hash + aprovação". Escolher **uma**, escrever no CLAUDE.md e no cabeçalho do
  workflow, e desligar (`disable_workflow`) a outra ou marcá-la como "rota de emergência". · **Aceite:** um único
  procedimento documentado; sem contradição entre os dois textos.
- [ ] **E49** [P1] 🔒 Guard preventivo de drift **em PR**: no `db-guard.yml`, passo que rejeita PR alterando um
  arquivo `supabase/migrations/*.sql` já existente na `main` (só criação é permitida; edição exige version nova),
  a menos que `migration-evidence.json` tenha exceção. Ataca a causa raiz de F-01. · **Aceite:** PR que edita
  migration existente fica vermelha com mensagem explicando a regra 7.
- [ ] **E50** [P1] 🤖 Guard de colisão de version **antes do push**: hook `pre-push` (`.husky/pre-push`) roda
  `check-migration-drift.mjs` (modo local) para pegar `versao duplicada` na máquina/container, não na CI.
  · **Aceite:** repetir o cenário de #859 falha no `git push`.
- [ ] **E51** [P2] 🔒 `types-sync.yml`: o passo "Destravar os checks" só aprova runs cujo `head_sha` bate com o
  PR criado (já faz) — adicionar log do `name` de cada run aprovado no Job Summary (já faz parcialmente) e um
  contador em issue mensal para detectar regressão de permissão. · **Aceite:** summary lista runs por nome.
- [ ] **E52** [P2] 🔒 `types-sync.yml`: Gate 3 (`REMOVED > 10` linhas) — registrar no summary o diff resumido
  (nomes de tipos removidos) para a revisão humana não precisar baixar o artifact. · **Aceite:** summary mostra
  os identificadores removidos.
- [ ] **E53** [P2] 🔒 `deploy-functions.yml`: `supabase secrets set` roda em **todo** deploy (mesmo de 1 função) e
  reescreve secrets já iguais — comparar `supabase secrets list` (digest) antes e só setar quando mudar.
  · **Aceite:** deploy de função única sem chamada a `secrets set` quando nada mudou.
- [ ] **E54** [P2] 🔒 `deploy-functions.yml`: publicar o `edge-deployment-attestation.json` também como
  **GitHub Deployment** (API `create_deployment` + `deployment_status`) no environment `producao-edge-functions`,
  para o histórico de deploys aparecer na aba Deployments e não só em artifacts de 30 dias. · **Aceite:** aba
  Deployments mostra o SHA e a função por deploy.
- [ ] **E55** [P2] 🔒 `deploy-functions.yml`: input `dry_run` (bundle + manifesto + preflights, sem `functions
  deploy`) para validar antes de pedir aprovação humana. · **Aceite:** dry-run termina sem tocar produção.
- [ ] **E56** [P2] 🔒 `crm-sync-worker.yml`: documentar no cabeçalho que a reativação exige (a) `vars.CRM_SYNC_WORKER_ENABLED`,
  (b) descomentar o schedule, (c) E28 (secrets em environment). Hoje só (a) e (b) estão escritos.
  · **Aceite:** cabeçalho atualizado.
- [ ] **E57** [P2] 🔒 `targeted-ledger-evidence.yml`: `retention-days: 1` é bom, mas o `public_key_base64` vem como
  input de texto livre → validar formato PEM antes de cifrar (hoje o script falha no meio). · **Aceite:** input
  inválido falha no 1º passo com mensagem.
- [ ] **E58** [P2] 🔒 `db-live-guard.yml`: quando o 1º passo falha, os demais não rodam e o artifact sai vazio.
  Trocar por `continue-on-error: true` + passo final "Consolidar veredito" que falha se qualquer um falhou, para o
  alerta listar **todas** as divergências de uma vez. · **Aceite:** run com drift em migrations ainda publica
  `fresh-catalog.json`.
- [ ] **E59** [P2] 🔒 `db-live-guard.yml`: alerta também por **Job Summary** estruturado (tabela passo × resultado)
  para quem abre o run não precisar ler 640 linhas. · **Aceite:** summary presente em falha e sucesso.
- [ ] **E60** [P3] 🔒 `branch-hygiene-audit.yml`: além do Job Summary, abrir/atualizar uma issue única
  `[branch-hygiene]` com o relatório (mesmo padrão do live-guard), fechando #378. · **Aceite:** issue atualizada
  toda segunda.

### Fase 4 — Pipeline de PR mais rápido e barato (E61–E72)

- [ ] **E61** [P2] 🔒 Medir por job: exportar `jobs` dos últimos 50 runs de `ci.yml` (duração de
  `lint-and-typecheck`, `test`, `build`, `security`, `e2e`) e registrar a baseline em `docs/audits/`.
  · **Aceite:** tabela com p50/p95 por job.
- [ ] **E62** [P2] 🔒 Quebrar `lint-and-typecheck` em 3 jobs paralelos: `lint-typecheck` (ratchets + guards),
  `edge-deno` (deno check + testes Deno), `tooling-contracts` (node --test + go test + pins + secrets boundary +
  manifesto). **Manter o nome** `🔍 Lint & TypeCheck` no job que os agrega (`needs` + `if: always()` + falha se algum
  falhou) para não quebrar o required check. · **Aceite:** p50 do caminho crítico cai ≥ 30 % sem renomear checks.
- [ ] **E63** [P2] 🔒 `test` e `security` não precisam de `needs: lint-and-typecheck` (só gastam wall-clock em
  fila). Remover a dependência; manter `build` dependente de `test`. · **Aceite:** jobs iniciam em paralelo.
- [ ] **E64** [P2] 🔒 Skip inteligente para PR só de docs: passo `paths-filter` (ou `git diff --name-only` contra
  a base) no início de cada job; se só `docs/**`/`*.md` mudou, os passos pesados são pulados e o job **termina verde**
  (o check continua reportando). · **Aceite:** PR só de `.md` fecha CI em < 2 min com os 7 checks verdes.
- [ ] **E65** [P2] 🔒 Cache do `bun install` explícito (`actions/cache` com chave `bun.lock` hash) nos 6 jobs que
  instalam, ou confirmar que `setup-bun` já reaproveita o cache `bun-*` de 29/08 (35 MB) — medir tempo de
  `bun install` com e sem. · **Aceite:** `bun install` < 20 s em cache quente.
- [ ] **E66** [P2] 🔒 Cache do Playwright (`~/.cache/ms-playwright`, chave = versão de `@playwright/test`) nos 2
  workflows de E2E. · **Aceite:** `playwright install` < 15 s em cache quente.
- [ ] **E67** [P2] 🔒 `db-guard.yml`: os ~20 testes com `postgres:17-alpine` sobem 20 containers em série. Subir
  **um** `services: postgres` no job e apontar todos os `*.test.sh` para ele (os scripts já recebem `*_POSTGRES_IMAGE`;
  aceitar `*_POSTGRES_URL`). · **Aceite:** job `Contrato DB offline` < 1,5 min.
- [ ] **E68** [P2] 🔒 Pinar `postgres:17-alpine` por digest (`postgres:17-alpine@sha256:…`) nos scripts e no
  `services:`; Dependabot `docker` não cobre scripts, então registrar o digest em `scripts/db-audit/postgres-image.json`
  com teste de frescor mensal. · **Aceite:** imagem imutável; atualização via PR.
- [ ] **E69** [P2] 🤖 Playwright: `retries: 1` em CI (2 retries triplicam o tempo da falha real) e `trace: 'retain-on-failure'`
  só no `ci.yml` (no logado continua sem upload por segurança). · **Aceite:** falha real do E2E em PR encerra em < 8 min.
- [ ] **E70** [P2] 🔒 `ci.yml` job `build`: o artifact `dist` (10 MB × PR) não é consumido por ninguém (Vercel
  builda sozinho). Remover o upload ou reduzir `retention-days: 1`. · **Aceite:** 0 artifacts `dist` novos ou
  retenção 1 d.
- [ ] **E71** [P3] 🔒 `ci.yml` job `security`: `gitleaks` com `fetch-depth: 0` clona o repo inteiro (49 MB) a cada
  PR; usar `fetch-depth` = nº de commits do PR + 1 (`github.event.pull_request.commits`). · **Aceite:** checkout do
  job `security` < 10 s.
- [ ] **E72** [P3] 🔒 Padronizar `timeout-minutes` por classe (leves 10, médios 20, E2E 25, deploy 30) e documentar
  a tabela no cabeçalho de `scripts/ci/README.md`. · **Aceite:** todos os jobs com timeout; nenhum > 30.

### Fase 5 — Dependências e supply chain (E73–E82)

- [ ] **E73** [P1] 🔒 `dependabot.yml`: adicionar `package-ecosystem: gomod`, `directory: /infrastructure/preview-egress-proxy`,
  semanal, label `dependencies`. · **Aceite:** Dependabot abre PR de Go quando houver atualização.
- [ ] **E74** [P2] 🔒 Confirmar que o ecossistema `bun` está de fato produzindo PRs (0 PRs abertas e nenhuma entre as
  30 fechadas mais recentes): ler o log em Insights → Dependency graph → Dependabot; se estiver falhando (alias
  `zod3`, `overrides`), corrigir. · **Aceite:** último job do Dependabot `bun` com status verde e data desta semana.
- [ ] **E75** [P2] 🔒 Deno: job mensal que roda `deno outdated`/`deno update` em `scripts/ci/deno.json` e abre PR
  (mesmo padrão do `types-sync`, com destravamento de checks). · **Aceite:** PR mensal de deps Deno.
- [ ] **E76** [P3] 🔒 Trocar `reviewers` em `dependabot.yml` (deprecado) por atribuição via `CODEOWNERS` ou
  `assignees`. · **Aceite:** log do Dependabot sem aviso de deprecação.
- [ ] **E77** [P2] 🔒 Dependabot `github-actions`: agrupar `actions/*` (checkout, setup-node, upload-artifact,
  github-script, setup-go) num único grupo semanal — hoje só `codeql-action` está agrupado; cada bump abre 1 PR e roda
  os 7 checks (8 min) por PR. · **Aceite:** ≤ 2 PRs de actions por semana.
- [ ] **E78** [P2] 🔒 `check-workflow-pins.mjs`: exigir que o comentário `# vX.Y.Z` ao lado do SHA exista e bata
  com uma tag real (Dependabot precisa dele para atualizar). · **Aceite:** teste unitário novo; SHA sem comentário
  falha o Lint.
- [ ] **E79** [P2] 🔒 SBOM: job no `codeql.yml` (schedule semanal) que baixa `github_get_sbom` e publica como
  artifact de 90 d, para ter inventário de dependências datado. · **Aceite:** artifact `sbom-YYYY-MM-DD.spdx.json`.
- [ ] **E80** [P2] 🔒 `deploy-functions.yml`: gerar atestado de proveniência (`actions/attest-build-provenance`)
  do bundle de cada função deployada (o summary hoje declara "Source/bundle binary equivalence: NOT proven").
  · **Aceite:** atestado visível em Security → Attestations.
- [ ] **E81** [P3] 🔒 `bun-version: '1.4.0'` e `deno-version: '2.9.5'` são inputs de action, não deps — criar
  `scripts/ci/toolchain.json` (bun, deno, node, supabase-cli, go) e um teste que compara com os workflows, para os 5
  lugares não divergirem. · **Aceite:** mudar a versão em 1 lugar quebra o teste até propagar.
- [ ] **E82** [P3] 🔒 `engines` do `package.json` (`node >=24`, `bun >=1.3`) vs. CI (`24`, `1.4.0`): adicionar
  `engine-strict` no `bunfig.toml` e checagem no Lint. · **Aceite:** rodar com Node 22 falha localmente.

### Fase 6 — E2E e cobertura sem depender de produção (E83–E90)

- [ ] **E83** [P1] 🔒 **Decisão de negócio (custo):** criar projeto Supabase de staging (ou usar branching
  pago) para o `e2e-logado` deixar de mutar produção. Alternativa sem custo: isolar por **organização/tenant de
  teste** dentro do banco atual com RLS e limpeza pós-teste. Apresentar as duas com custo mensal. · **Aceite:**
  decisão registrada no CLAUDE.md.
- [ ] **E84** [P1] 🤖 `e2e/fixtures/e2e-contact.ts`: passo de **reset** do fixture no `afterAll` (reabrir
  conversa, limpar mensagens de teste com prefixo `[E2E]`) para o estado não vazar entre runs concorrentes.
  · **Aceite:** 2 runs simultâneos não interferem.
- [ ] **E85** [P2] 🤖 `e2e-logado.yml`: expor `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` explicitamente
  (hoje o dev server depende de valor embutido no código) para a troca de alvo (E83) ser 1 linha. · **Aceite:**
  workflow declara o alvo; sem valor hard-coded no cliente.
- [ ] **E86** [P2] 🤖 Habilitar `talkx.spec.ts` no logado: criar um 2º usuário de teste com perfil supervisor
  (secrets `E2E_SUPERVISOR_EMAIL/PASSWORD`) e project `chromium-supervisor`. · **Aceite:** Campanhas coberto por E2E.
- [ ] **E87** [P2] 🤖 Cobertura: ratchet atual só em `src/lib` + `src/services` (issue #376). Estender `include`
  para `src/hooks/**` com piso medido no dia (não inventar número). · **Aceite:** thresholds novos = valor medido,
  arredondado para baixo.
- [ ] **E88** [P2] 🔒 Publicar o resumo de cobertura (`text-summary`) no Job Summary do job `test` para ver a
  tendência sem baixar o artifact. · **Aceite:** summary com linhas/branches por run.
- [ ] **E89** [P3] 🤖 `ci.yml` job `e2e`: `bun run test:e2e -- --project=chromium` sobe `vite dev`; usar
  `vite preview` do `dist` já buildado (job `build`) reduz variabilidade de "vite frio" (causa documentada na run
  36249048738). · **Aceite:** E2E em PR sem timeout por cold start em 20 runs.
- [ ] **E90** [P3] 🤖 Relatório Playwright do `ci.yml` (deslogado) pode continuar público; garantir no
  `playwright.config.ts` que `outputDir` nunca inclui `e2e/.auth/` mesmo se um project logado for adicionado ao
  `ci.yml` por engano (guard em `check-pr-workflow-secrets` ou teste). · **Aceite:** teste que falha se
  `ci.yml` invocar `--project=setup|chromium-*authenticated|e2e-core`.

### Fase 7 — Governança, observabilidade e documentação (E91–E100)

- [ ] **E91** [P2] 🔒 Squash-only: `allow_merge_commit=false`, `allow_rebase_merge=false`,
  `use_squash_pr_title_as_default=true` + `required_linear_history=true` (E42). Evita os "Merge branch 'main' into…"
  na `main` e deixa `git bisect` utilizável. · **Aceite:** `github_get_repo` reflete; próximo merge é squash.
- [ ] **E92** [P2] 🔒 Painel diário de saúde do Actions: job agendado (`ops-daily-report`) que resume runs por
  workflow/conclusão nas últimas 24 h, caches, artifacts, zumbis (`waiting` > 2 h), webhooks com erro, e abre/atualiza
  issue `[ops] Saúde do Actions` — o equivalente automatizado desta auditoria. · **Aceite:** issue atualizada 1×/dia.
- [ ] **E93** [P2] 🔒 Notificação fora do GitHub: o `ops-daily-report` e o alerta do `db-live-guard` publicam
  também no WhatsApp via Evolution GO (instância `PRINCIPAL`) ou e-mail, porque issue ninguém lê (F-02).
  · **Aceite:** mensagem recebida em teste controlado.
- [ ] **E94** [P2] 🔒 Fechar/triar as issues #374–#382 e #724: as que este plano cobre (#378, #379, #376, #377)
  recebem link para a etapa e são fechadas quando a etapa fechar. · **Aceite:** cada issue com label e etapa
  referenciada.
- [ ] **E95** [P2] 🤖 CLAUDE.md: corrigir "12 workflows" → 13 + 3 dinâmicos; adicionar tabela de inventário
  (seção 1 deste plano) e a regra "toda mudança em `.github/` atualiza esta tabela". · **Aceite:** CLAUDE.md coerente
  com `github_list_workflows`.
- [ ] **E96** [P2] 🤖 `scripts/ci/README.md`: documentar cada guard (o que bloqueia, como atualizar baseline,
  quem aprova) — hoje cobre lint/typecheck/pins/secrets; faltam `bundle-budget`, `medir-tipografia`, `audit-prod`,
  `implicit-any`, `supabase-usage-guard`. · **Aceite:** 1 seção por guard.
- [ ] **E97** [P2] 🔒 `ci.yml` job `audit-report`: decidir — (a) remover (issue #379), ou (b) mover para
  `schedule` mensal com o passo de destravamento de checks do `types-sync`. Recomendação: (a); o PDF pode ser
  gerado sob demanda. · **Aceite:** job removido ou verde em execução real.
- [ ] **E98** [P3] 🔒 Retenção de logs/artifacts: definir `retention-days` padrão do repo (Settings → Actions) em
  30 dias e por workflow (evidências de deploy 90 d, relatórios 3 d). · **Aceite:** política escrita e aplicada.
- [ ] **E99** [P3] 🔒 Badge de status do `ci.yml`, `db-live-guard.yml` e `e2e-logado.yml` no `README.md` — o
  vermelho da `main` passa a ser visível para quem abre o repo, não só para quem abre Actions. · **Aceite:** 3 badges.
- [ ] **E100** [P0→contínuo] 🔒 Reauditar em 30 dias com o mesmo método (seção "Fonte de evidência") e registrar
  em `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_<data>.md` o delta: runs/dia na `main`, falhas por workflow,
  cache, secrets por nível, alertas abertos. · **Aceite:** documento novo com a tabela do sumário executivo
  preenchida lado a lado.

---

## 4. O que **não** mexer (parece bug, não é)

Reafirmado a partir do CLAUDE.md e confirmado ao vivo nesta sessão:
- `db-live-guard.yml` sem `pull_request` — design (não expor `DESTINO_URL` a código de PR).
- `Contrato DB vivo` fora dos required checks — consequência do item acima.
- `🔬 CodeQL (actions)` como job separado e não required — renomear o job `analyze` travaria todos os merges.
- `merge_group` em `ci.yml`, `db-guard.yml`, `codeql.yml` — inertes, sem custo; merge queue é impossível em conta `User`.
- `can_approve_pull_request_reviews: true` — necessário para o `types-sync` abrir PR.
- `talkx.spec.ts` fora do `e2e-logado` — usuário de teste é agente (E86 propõe o caminho).
- `secret_scanning_non_provider_patterns` desligado — recurso pago.
- `vars.CRM_SYNC_WORKER_ENABLED` inexistente com condição no workflow — preparação deliberada.
- Nome do check `Contrato DB offline` sem emoji — renomear quebra a branch protection.
- As falhas de CI em PR de hoje (`typography parity`, `bundle budget`, `versao duplicada`) — gates funcionando.

## 5. Ordem recomendada de execução (primeiros 10 dias úteis)

| Dia | Etapas | Efeito para o negócio |
|---|---|---|
| 1 | E01–E04, E10–E12 | `main` volta a ficar verde; alerta de banco volta a ter significado |
| 2 | E05–E09, E13–E15 | ruído cai ~70 %; deploy de edge diz por que falhou |
| 3 | E17–E19, E25–E28 | secrets de produção fora do alcance de workflow novo |
| 4 | E30–E35, E37 | porta do marketplace fechada; 5 alertas de segurança zerados |
| 5 | E20–E24, E49–E50 | causa raiz do drift bloqueada antes de chegar à `main` |
| 6–7 | E45–E48, E53–E55 | DDL e deploy com uma rota só, sem zumbis |
| 8 | E61–E64, E67 | CI de PR mais rápido, docs-only em 2 min |
| 9 | E73–E78 | dependências Go/Deno/Actions cobertas |
| 10 | E83 (decisão), E91–E95 | staging decidido; governança escrita |

---

*Gerado a partir de leitura ao vivo da API do GitHub e dos arquivos do repositório em 2026-09-26. Números de
runs referem-se à página 1 (100 itens) de cada listagem, como declarado na seção "Fonte de evidência".*
