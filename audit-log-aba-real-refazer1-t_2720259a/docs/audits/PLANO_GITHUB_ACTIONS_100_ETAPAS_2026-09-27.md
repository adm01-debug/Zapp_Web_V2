# Auditoria exaustiva do GitHub Actions — plano de correção e melhorias em 100 etapas (v2)

**Data:** 2026-09-27 (20:00 UTC) · **Repo:** `adm01-debug/Zapp_Web_V2` · **HEAD auditado:** `71360e1` (local) / `ebc1b1c` (main ao vivo às 19:57Z)
**Antecessor:** `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-09-26.md` (HEAD `0a83e44`, 26/09 19:30 UTC). Este documento
**não repete** o que aquele já cobria: primeiro registra o que dele foi executado em 24 h (seção 1), depois reaudita
o estado que ficou, com evidência nova, e propõe as 100 etapas seguintes.

> ### Estado em 2026-10-03 (E99 do plano de 01/10)
>
> A frase original deste cabeçalho era *"Nenhuma etapa deste plano foi executada"*. **Isso deixou de ser verdade
> e o próprio documento provou o problema:** os 100 checkboxes ficaram `[ ]` por seis dias enquanto o código
> mudava. O plano de `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` (seção 1) mediu **18 etapas
> executadas** entre 27/09 e 01/10 pelo `git log` de `.github/` e pelo estado ao vivo — **não** pelos checkboxes.
>
> Esta revisão marca esses **18** itens como `[x]`, cada um com a evidência ao lado (arquivo:linha, saída de
> script ou medição de API registrada no plano de 01/10). Nenhum item foi marcado por semelhança: só entrou o
> que tem evidência medida. **Os `[ ]` que restam não foram esquecidos** — reaparecem com numeração própria e
> evidência nova no plano de 01/10, que é a fonte viva. Este documento é **histórico** a partir daqui.
>
> Lição registrada: checkbox sem verificação vira ficção. O plano de 01/10 só fecha item com prova.

**Escopo:** os 13 arquivos em `.github/workflows/` (4.190 linhas lidas integralmente), os 3 workflows dinâmicos
(Dependabot Updates, Dependency Graph, Copilot reviewer), `.github/dependabot.yml`, `CODEOWNERS`, templates de PR/issue,
hooks Husky, `playwright.config.ts`, os scripts que os workflows chamam (`scripts/ci/`, `scripts/db-audit/`,
`scripts/edge-deploy/`), branch protection, environments, secrets (nomes), variáveis, permissões de Actions, cache,
artifacts, webhooks, alertas de segurança, PRs e issues abertas, e o histórico real de runs.

**Fonte de evidência (tudo lido ao vivo nesta sessão, não de memória):**
- 16 workflows via API (13 com arquivo + 3 dinâmicos), últimos 30 runs de cada um (conclusão, evento, branch, hora);
- runs criados desde 26/09: `total_count = 2.500`; os 100 mais recentes cobrem só 18:58→19:47Z de 27/09;
- logs dos jobs que falharam nas últimas 2 h (10 runs): `db-live-guard` 36345553827/36344729150, `types-sync`
  36345553813/36344651579, `e2e-logado` 36344651600, `ci.yml` 36344492202/36344142874/36344135851,
  `db-guard` 36344126215/36344070289;
- durações dos últimos 20 runs completos na `main` de `ci.yml`, `db-guard.yml`, `codeql.yml` + jobs do run
  36345553817;
- branch protection, rulesets, repo settings, permissões de Actions, 17 secrets (nomes + data), 0 variáveis,
  7 environments (regras + secrets), 50 caches, 3.834 artifacts (1ª página), 1 webhook + 5 entregas,
  1 alerta de Code Scanning, 0 Dependabot, 0 Secret Scanning, 8 PRs abertas (com arquivos), 9 issues abertas,
  pending deployments, check runs no HEAD da `main`.

Convenções: **P0** quebra hoje ou mascara quebra · **P1** risco real / desperdício grande · **P2** confiabilidade
ou custo · **P3** higiene. **🔒 Joaquim** = toca CI, secrets, environments, branch protection, dado destrutivo ou
custo → PR aberta aguardando aprovação · **🤖 autônomo** = escopo comum. **Aceite** = o que prova que a etapa terminou.

---

## 0. Sumário executivo

| Sinal | Medido em 27/09 | Leitura |
|---|---|---|
| Runs criados desde 26/09 00:00 | 2.500 (teto da API) | ~46 pushes na `main` só entre 15h e 20h de hoje; cada push dispara 5 workflows |
| `DB Live Guard` últimos 30 runs | **22 ❌ / 7 cancelados / 0 ✅** | vermelho contínuo pelo 3º dia; agora com 5 sub-checks quebrados ao mesmo tempo; issue #1013 com 21 comentários em 3 h |
| `types-sync` últimos 30 | 19 ✅ / **10 ❌** | as falhas de hoje são `docker: toomanyrequests` no Docker Hub (limite anônimo) — o único mecanismo que fecharia o `DB Live Guard` não consegue rodar |
| `E2E logado` últimos 30 | 3 ✅ / 9 ❌ / **17 cancelados** | 6 testes quebrados nos 3 engines (`conversation.spec.ts:49`, `talkx.spec.ts:160`) + 3 flaky; suíte agora leva 13 min (era 40–60 s em 26/09) |
| `deploy-functions` | run 36337021716 `waiting` há 2,6 h + 36340854760 `pending` atrás dele | **nenhuma edge function deployada desde 17:27Z**; fila da concurrency bloqueada por aprovação humana pendente |
| `ci.yml` na `main` (20 últimos) | 10 ✅ / **10 cancelados** · média 6,3 min, máx 15,7 | metade dos vereditos da `main` é descartada (concurrency por `github.ref`) |
| Cache do Actions | 50 caches · **10,0 GiB** (limite 10 GB) | 46 são overlays CodeQL de ~230 MB criados **hoje**, um por push; evicção LRU já em curso (nada anterior a 15h sobreviveu) |
| Artifacts | 3.834 no total; 100 novos em 75 min (~285 MB) | `playwright-report`, `coverage-report` e `dist` a cada PR/push |
| Webhook n8n `gh-push-graph-sync` | 5/5 entregas 404 | morto desde antes de 26/09; ainda ativo |
| Code Scanning | 1 alerta aberto (#13, `validation.ts:143`, medium) | 4 dos 5 alertas de 26/09 fechados; este continua em edge function de produção |
| Branch protection `main` | `strict=false`, sem review, sem rulesets, 6 required checks | perímetro = `enforce_admins` + sem force-push/deleção + 6 checks |
| Actions | `allowed_actions: all`, `sha_pinning_required: true`, `default_workflow_permissions: read` | pin obrigatório no GitHub e no `check-workflow-pins.mjs`; lista de actions permitidas ainda aberta |
| Secrets | 17 no repo, **0 em environments** | `SUPABASE_SERVICE_ROLE_KEY` criado **hoje 19:25Z** no nível repo para a PR #1053 (E2E) — 4ª credencial de produção sem environment |
| PRs abertas tocando `.github/` | 1 (#1053, `e2e-logado.yml`) | CI vermelha: SHA de 39 caracteres em `setup-bun` e SHA alterado em `checkout` |
| Dependabot | 3 ecossistemas (bun, github-actions, gomod) | 0 alertas abertos; grupos semanais funcionando (#995 mergeado hoje) |

**O que já está certo e não deve ser mexido:** `cancel-in-progress` só em PR (ci, db-guard, codeql), fronteira de
secrets em PR (`check-pr-workflow-secrets.mjs` + allowlist de 2 chaves públicas), pin por SHA duplo (GitHub +
script), `default_workflow_permissions: read`, `e2e-logado` enfileirando em vez de cancelar, guard de imutabilidade
de migration em PR (`db-guard.yml:58-97`, já pegou 2 PRs hoje), `db-live-guard` com `continue-on-error` por
sub-check e veredito consolidado, Dependabot agrupado, `supabase-sync.yml` desarmado, `auto-update-pr-branch`
só por dispatch.

---

# Auditoria do GitHub Actions — plano de correção em 100 etapas (27/09/2026)

> **Estado em 2026-10-03 (E99 do plano de 01/10):** os checkboxes deste plano ficaram `[ ]` por seis dias
> embora o código já tivesse mudado — o plano de 01/10 mediu **18 etapas executadas** pelo
> `git log` e pelo estado ao vivo, não por checkbox. Esta revisão marca **18** itens com a
> evidência de cada um (arquivo:linha, saída de script ou medição de API registrada em
> `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, seção 1).
>
> **Os itens que seguem `[ ]` não foram esquecidos:** eles reaparecem, com evidência nova e numeração
> própria, no plano de `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`. A regra da casa é uma fonte viva só — este documento passa a ser
> **histórico**, e o plano de 01/10 é o que manda.

## 1. O que o plano de 26/09 já entregou (auditado pelo histórico do git, não pelos checkboxes)

Nenhum dos 100 checkboxes do plano de 26/09 foi marcado, mas o `git log` de `.github/` desde então mostra
**22 etapas executadas** em 24 h (PRs #878, #890, #902, #907, #910, #913, #915, #918, #932, #946, #966, e os
commits `f0633ac`, `b396536`, `78da239`, `5a8a94c`, `63f3f6b`):

| Etapa de 26/09 | Estado | Evidência |
|---|---|---|
| E05/E06 dedupe + passo exato no alerta do guarda vivo | ✅ | #918, #932 (`db-live-guard.yml:272-398`) |
| E07 mensagem real na falha do atestado | ✅ | #907 (`collect-remote.mjs`) |
| E08 `maxAttempts` do atestado | ✅ (2×) | #890 (18→36), `78da239` (36→72), `b396536` (timeout 30→60 min) |
| E10 `e2e-logado` enfileira | ✅ | #878 (`e2e-logado.yml:36-38`) |
| E13 paths no `db-live-guard` | ✅ parcial | #910 — conferir em `db-live-guard.yml:on.push` (seção 3) |
| E15/E16 `auto-update-pr-branch` só dispatch, `ubuntu-24.04`, timeout 10 | ✅ | `auto-update-pr-branch.yml:17-27` |
| E20/E21 `cancel-in-progress` só em PR (codeql, db-guard) | ✅ | #910 |
| E23 `develop` removido | ✅ | `ci.yml:12`, `db-guard.yml:14` |
| E24 `workflow_dispatch` no `ci.yml` | ✅ | `ci.yml:22` |
| E37 TLS `verify-full` em `types-sync`/`db-migrate` | ✅ | #902 |
| E47 lock de concorrência no `db-migrate` | ✅ | #902 |
| E49 guard de imutabilidade de migration em PR | ✅ | #902 + `db-guard.yml:58-97` (já bloqueou 2 runs hoje) |
| E50 `check-migration-drift` no `pre-push` | ✅ | `.husky/pre-push` |
| E58 `continue-on-error` por sub-check no guarda vivo | ✅ | `db-live-guard.yml:123-213` |
| E73 Dependabot `gomod` | ✅ | `dependabot.yml` |
| E76 `reviewers`→`assignees` | ✅ | `dependabot.yml` |
| E77 grupos de actions | ✅ | `dependabot.yml` (`codeql-action`, `actions-misc`) |
| E95 contagem de workflows no CLAUDE.md, badge | ✅ | #915 |
| E32–E35 alertas CodeQL | ✅ 4 de 5 | só #13 (`validation.ts:143`) segue aberto |
| CodeQL fora de PR e dos required checks | ✅ (decisão 27/09) | `codeql.yml:14-17`, branch protection ao vivo (6 contexts) |
| E02 origem do drift | ❌ não documentado | drift voltou hoje (5 sub-checks) |
| E01/E03/E04 reconciliar drift, matar zumbis, fechar #724 | ⚠️ refeitos e **reabertos** | #724 fechada → #1013 aberta hoje; zumbis novos em `deploy-functions` |

O restante (≈78 etapas) permanece aberto e foi **reavaliado**, não copiado: as que continuam válidas reaparecem
abaixo com número novo e evidência de hoje; as que perderam sentido (ex.: E22 sobre overlay CodeQL sem dado) foram
substituídas por versões com medição.

---

## 2. Inventário ao vivo (27/09, 20:00 UTC)

| Arquivo | Gatilhos | Permissões | Concurrency | Timeout | Últimos 30 runs | Estado |
|---|---|---|---|---|---|---|
| `ci.yml` (326 l.) | push `main` · PR (`opened/synchronize/reopened/ready_for_review`) · merge_group · dispatch | `contents:read` | por PR/ref, cancela só em PR | 20/30/30/20/20 | 15 ✅ 6 ❌ 8 ⛔ 1 ⏳ | ❌ em PR = gates legítimos (deno.lock, manifesto stale, pin corrompido) |
| `db-guard.yml` (247 l.) | idem + dispatch | `contents:read` + `pull-requests:read` no job | idem | 20 | 21 ✅ 3 ❌ 5 ⛔ | ❌ = guard de imutabilidade pegando PR (funciona) |
| `codeql.yml` (89 l.) | push `main` · merge_group · seg 09:30 | `security-events:write` no job | por ref, cancela só em PR (sem PR → nunca) | 30/15 | 20 ✅ 9 ⛔ | 9 cancelados **na `main`** |
| `db-live-guard.yml` (407 l.) | push `main` (paths) · **diário** 06:13 · dispatch | `issues:write` no job | cancela em push | 25 | **22 ❌ 7 ⛔ 0 ✅** | vermelho contínuo; #1013 |
| `types-sync.yml` (501 l.) | push `main` (paths) · seg 05:49 · dispatch | `contents+issues+PR+actions:write` no job | fila | 30 | 19 ✅ **10 ❌** | ❌ = Docker Hub `toomanyrequests` |
| `e2e-logado.yml` (77 l.) | push `main` · dispatch | `contents:read` | fila (sem cancel) | 15 | 3 ✅ 9 ❌ **17 ⛔** | 6 testes quebrados ×3 engines; 13 min |
| `auto-update-pr-branch.yml` (100 l.) | dispatch | job: `contents+PR+actions:write` | fila | 10 | 29 ✅ (até 26/09 21:08) | inerte desde E15 |
| `deploy-functions.yml` (341 l.) | dispatch | `contents:read`; env `producao-edge-functions` | fila | **60** | 6 ✅ 8 ❌ 14 ⛔ **1 waiting 1 pending** | zumbi 36337021716 há 2,6 h |
| `db-migrate.yml` (1.748 l.) | dispatch | `contents:read`; env `producao-ddl` | fila | 25 | 15 ✅ 12 ❌ 3 ⛔ | último run 26/09 (cancelado) |
| `supabase-sync.yml` (110 l.) | dispatch | `contents:read`; env `legacy-import-destrutivo` | fila | 45 | 30 ❌ (até 04/09) | desarmado |
| `targeted-ledger-evidence.yml` (91 l.) | dispatch | `contents:read`; env `db-ledger-evidence` | fila | 10 | 4 ✅ | ok |
| `branch-hygiene-audit.yml` (78 l.) | seg 07:56 · dispatch | `contents+PR:read` | cancela | 10 | 1 ✅ (21/09) | relatório só no Job Summary |
| `crm-sync-worker.yml` (75 l.) | dispatch (cron comentado) | `contents:read` | fila | 5 | 30 skipped | `vars.CRM_SYNC_WORKER_ENABLED` não existe |
| dinâmicos | Dependabot Updates · Dependency Graph · Copilot reviewer | — | — | — | — | ativos |

Transversais medidos hoje:
- **Shell padrão sem `pipefail` em 13/13 arquivos.** Nenhum define `defaults.run.shell` nem `shell:`; só 3 steps
  fazem `set -o pipefail` na mão (`auto-update-pr-branch:38`, `branch-hygiene-audit:43`, `db-live-guard:224`).
  Sem `shell: bash` explícito o runner executa `bash -e {0}`, **sem** `-o pipefail`: todo `cmd | tee` devolve o
  exit do `tee`. Consequência direta: os Gates 1 e 2 do `types-sync` **nunca falham** (`types-sync.yml:262,273`),
  e o `supabase functions deploy | tee` (`deploy-functions.yml:258,261`) mascara falha do CLI, que só aparece 12 min
  depois como "inventário não estabilizou".
- **Constantes duplicadas:** `bun-version: '1.4.0'` ×8, `node-version: '24'` ×7, `SUPABASE_CLI_VERSION: '2.116.0'`
  ×4, `deno-version: '2.9.5'` ×1; `types-sync.yml` **não** faz `setup-node` (roda no Node da imagem). Não há
  `.github/actions/` nem reusable workflow. Project-ref literal em `crm-sync-worker:38`, `db-migrate:57`,
  `deploy-functions:123`, `supabase-sync:45,80` além de `database-identity.json`.
- **`DESTINO_URL` (credencial com poder de `db push`) referenciada 29× em 5 workflows**, sempre como secret de
  **repositório**: o environment `producao-ddl` protege o workflow, não a credencial. `db-migrate.yml` — o único que
  escreve DDL — é o único dos 5 **sem** `verify-full`/CA pinada e passa a URL crua no argv do CLI
  (`db-migrate.yml:1145,1153`).
- **Supply chain limpo:** 12 actions distintas, todas com SHA de 40 chars + comentário; `sha_pinning_required`
  ligado no GitHub; `check-workflow-pins.mjs` em CI (pegou a PR #1053 hoje). `allowed_actions: all` continua.
- **Injeção de expressão:** nenhuma. Inputs entram por `env:`; únicas interpolações em `run:` são
  `steps.*.outputs.*`/`github.sha` (`types-sync:216-224,311-318,413,417`).
- **Testes que existem e não rodam:** `supabase/functions/_shared/__tests__/postgrest-filters.test.ts` não está
  na lista manual de `ci.yml:78-97`. 58 das 69 edge functions não têm arquivo de teste.
- **Fila de merge:** `merge_group` em `ci`, `db-guard`, `codeql` segue inerte (conta `User`, sem merge queue).

---

## 3. Achados (com evidência)

### P0 — quebra hoje ou mascara quebra

- **F-01 · Guarda vivo vermelho pelo 3º dia, agora com 5 sub-checks.** Runs 36345553827 e 36344729150 (19:32 e
  19:46Z): `Contrato vivo quebrado em: Verificar frescor do types.ts | Regenerar manifesto | Auditar configuracao
  runtime | Paridade tripla | Comparar migrations com schema_migrations`. 22 falhas em 30 runs; já falhou de novo
  no HEAD `ebc1b1c` (check run 108695767132, 8 anotações). Issue #1013 aberta às 17:06Z com 21 comentários em 3 h —
  o dedupe de #932 não segura porque `migrationsFalhou` **desliga** o dedupe (`db-live-guard.yml:333`) exatamente
  para a causa mais frequente. 3 PRs abertas (#1017, #1045, #1052) tentam reconciliar as mesmas migrations
  `5x0000` e **colidem** entre si (#1045 e #1052 removem o mesmo arquivo `20260927560000_talkx_e27…` e criam
  `20260927560000_fix_gamification…` com conteúdo diferente).
- **F-02 · `types-sync` não consegue rodar: Docker Hub `toomanyrequests`.** Runs 36345553813 e 36344651579:
  `docker: Error response from daemon: toomanyrequests: Rate exceeded` no passo "Gerar candidatos"
  (`supabase gen types` sobe um container `postgres-meta` a cada run; o runner puxa **anônimo** do Docker Hub e
  46 pushes na `main` em 5 h estouram a cota). Efeito: o único mecanismo automático que fecharia F-01
  (regenerar `types.ts`/catálogo/manifesto/grants) está parado. Issue #888 já tem 10 comentários.
- **F-03 · Gates 1 e 2 do `types-sync` são no-op.** `types-sync.yml:262` `if node …typecheck-ratchet.mjs 2>&1 |
  tee /tmp/tsc.log; then` e `:273` idem com `supabase-usage-guard.mjs`: sem `pipefail` o status é o do `tee`
  (0) → `passed=true` sempre. A issue de gate (293-352) e o bloqueio (354-364) são inalcançáveis para TS e
  usage-guard; o PR de sync nasce e só os required checks do PR o segurariam.
- **F-04 · Deploy de edge functions travado há 2,6 h.** Run 36337021716 `waiting` desde 17:27:43Z (aprovação
  humana em `producao-edge-functions`, head `b4c9db67`, PR #999) e 36340854760 `pending` atrás dele na
  concurrency `deploy-edge-functions` (`cancel-in-progress: false`). Nenhuma edge subiu hoje desde então; o fix do
  `multiplix-send` (#1052) mergeado ficará fora do ar. `timeout-minutes: 60` não conta em `waiting`. Regra nativa
  do GitHub: 1 em execução + 1 pendente por grupo → um 3º dispatch **cancela** o pendente (é isso que os
  comentários em `deploy-functions.yml:52-62` chamam de "impaciência").
- **F-05 · `E2E logado` quebrado de verdade, não flaky.** Run 36344651600: `6 failed, 3 flaky, 27 passed (13.1m)`.
  Falham nos 3 engines `conversation.spec.ts:49` (resolver conversa via `CloseConversationDialog`) e
  `talkx.spec.ts:160` (wizard passo 2). Suíte passou de ~60 s (26/09) para 13 min com firefox/webkit
  (`cc02282`, `da67cfb`) e `retries: 2` × `workers: 1`. 17 dos 30 runs cancelados **apesar** de
  `cancel-in-progress: false` (#878): a regra "1 pendente por grupo" cancela os intermediários.
- **F-06 · PR #1053 corrompe pins e cria 4ª credencial de produção no nível repo.** Run 36344135851:
  `e2e-logado.yml:53 oven-sh/setup-bun@0c5077e514198686518aeaa5fe80194621857d6` (39 chars) e SHA de `checkout`
  alterado. O secret `SUPABASE_SERVICE_ROLE_KEY` foi criado às 19:25:13Z de hoje **no repo** para um `curl DELETE`
  de teardown em `conversation_closures` — service_role em workflow de E2E, sem environment, em repo público.

### P1 — risco real ou desperdício grande

- **F-07 · Metade dos vereditos da `main` é descartada.** `ci.yml` últimos 20 na `main`: 10 ✅ / **10 cancelados**;
  `codeql` 9/30 e `db-guard` 5/30 cancelados, todos push na `main`. Causa: concurrency por `github.ref` +
  `cancel-in-progress: false` só permite 1 pendente; com ~46 pushes em 5 h os intermediários são cancelados pelo
  GitHub. Um commit da `main` sem CI verde não tem prova de build/testes — e o badge do README oscila.
- **F-08 · Cache no teto, 100% ocupado por hoje.** 50 caches / 10,0 GiB; 46 são `codeql-overlay-base-database-*`
  (~230 MB, um por push na `main`, todos de hoje 14:58→19:48Z). LRU já apagou tudo anterior a 15h — os caches úteis
  (`bun-*` 35 MB, `setup-go`, `gitleaks`) sobrevivem por acaso. E22 de 26/09 previa isso; sem medição não foi feito.
- **F-09 · Credencial de escrita compartilhada com jobs não gateados.** `DESTINO_URL` lida por `db-live-guard`
  (sem environment) e `types-sync` (sem environment) é a mesma que `db-migrate` usa para `db push`. Um bug ou
  dependência maliciosa em qualquer job na `main` (o `types-sync` faz `bun install` de terceiros com
  `contents+actions:write` no mesmo job, `types-sync.yml:51-57,256`) alcança a credencial de escrita.
- **F-10 · `db-migrate` sem TLS pinado e com credencial no argv.** `db-migrate.yml:104-138` só `validarDestino`;
  `:1145,1153` `supabase db push --db-url "$DESTINO_URL"` (URL crua, visível em `/proc`). O comentário em
  `types-sync.yml:77-82` ("único dos 3 workflows sem endurecimento") está errado: são 5 e este segue sem.
- **F-11 · `confirm_runtime_sha256` não amarra o arquivo.** O hash cobre o estado do schema, não o conteúdo de
  `<version>_*.sql` nem o `github.sha` do dry-run (`db-migrate.yml:1119-1137`). Dry-run e apply são runs
  distintos: arquivo editado entre os dois → apply executa SQL nunca ensaiado com hash "válido". O guard de
  imutabilidade (#902) reduz, mas não elimina (renames sem diff e commits diretos passam).
- **F-12 · Contrato runtime genérico ignora ACL/publicação/extensões.** `generic-migration-runtime.sql` hasheia
  estrutura de `public` sem `relacl`, grants de schema, `pg_publication_tables`, extensões, event triggers —
  um `GRANT/REVOKE` entre dry-run e apply não muda o hash. A janela TOCTOU que o comentário
  (`db-migrate.yml:517-523`) afirma fechar continua aberta para permissões (justamente o que quebrou o lockout
  de login em 04/09).
- **F-13 · Zumbi de environment é estrutural, não acidente.** Vale para `db-migrate` e `deploy-functions`
  (`concurrency` + `cancel-in-progress: false` + `environment`). Não há pré-checagem de run em `waiting`, nem
  rotina que cancele `waiting` antigo, nem notificação fora da aba Actions.
- **F-14 · Webhook n8n morto.** Hook 671865950 → `n8n.atomicabr.com.br/webhook/gh-push-graph-sync-v1b2c3d4`,
  5/5 entregas 404 (19:46–19:57Z). E17 de 26/09 não executado.
- **F-15 · Supabase "Preview" ainda reporta check na `main`.** Check run `Supabase Preview` (app 330661)
  `completed/skipped` no HEAD `ebc1b1c`. O app está instalado e reage a push; CLAUDE.md diz que "parou de reagir a
  PRs" — verdade para PRs, não para push.
- **F-16 · `allowed_actions: all`.** Segue aberto; `sha_pinning_required` ajuda mas não limita **quais** actions.
  Lista real hoje: 12 actions (`actions/*` ×5, `github/codeql-action/*`, `oven-sh/setup-bun`, `denoland/setup-deno`,
  `supabase/setup-cli`, `peter-evans/create-pull-request`, `gitleaks/gitleaks-action`, `actions/setup-go`).
- **F-17 · Code Scanning #13 aberto há 22 dias.** `js/stack-trace-exposure` em
  `supabase/functions/_shared/validation.ts:143` (medium), edge function em produção. E33 de 26/09 fechou o #2
  (linha 152) mas a instância na 143 persiste.

### P2 — confiabilidade e custo

- **F-18 · Rate limit do Docker Hub também ameaça o `db-guard`.** 25 passos sobem `postgres:17-alpine` (tag
  mutável, anônimo) em série por run; hoje ainda passa porque a imagem fica no cache do runner após o 1º pull,
  mas cada run é um pull novo. Mesma cota que derrubou o `types-sync`.
- **F-19 · Pipeline de PR serial e sem cache.** `test`/`security`/`e2e` dependem de `lint`; `build` de `lint`+`test`.
  Run verde 36345553817: Lint 2m43s → Unit 3m09s → Build 16s; wall 7m14s para 16 s de build. `bun install
  --frozen-lockfile` roda 6× por run sem `actions/cache`; `bunx playwright install --with-deps chromium firefox
  webkit` roda em **todo PR** (`ci.yml:308`) e em todo push na `main` (`e2e-logado.yml:61`), sem cache de
  `~/.cache/ms-playwright`.
- **F-20 · Drafts consomem a pipeline inteira.** `ready_for_review` foi adicionado (`f0633ac`) mas nenhum job tem
  `if: !github.event.pull_request.draft` — draft roda os 5 jobs a cada push e de novo ao sair de draft (#1057 é
  draft hoje).
- **F-21 · Artifacts: 100 novos em 75 min (~285 MB).** `playwright-report` (36), `coverage-report` (32), `dist`
  (24, 11 MB cada) a cada PR; ninguém consome `dist` nem `coverage-report` (Vercel builda sozinho; cobertura não
  vai para PR nem summary). 3.834 artifacts acumulados.
- **F-22 · `db-live-guard` cancela o run agendado.** `cancel-in-progress: ${{ github.event_name == 'push' }}`
  (`:37`): push na `main` cancela o `schedule` em andamento; run cancelado não dispara `failure()` nem `success()`
  → drift do dia sem alerta, alerta aberto sem fechar.
- **F-23 · Dedupe do alerta ainda frágil.** Compara só o **último** comentário (comentário humano zera o dedupe);
  issue nova sem comentários → `Infinity` → 2 runs no mesmo minuto duplicam; `migrationsFalhou` desliga o dedupe
  (F-01). Artifact de evidência (3 dias) não inclui a saída do `check-migration-drift` — o diagnóstico útil.
- **F-24 · `continue-on-error: true` no pgbouncer** (`db-live-guard:89`, `types-sync:74`) → sem pgbouncer,
  `gen-types.sh` cai no fallback com `DESTINO_URL` crua no argv, só com um `Aviso:` — degradação silenciosa da
  proteção que o próprio script documenta (`gen-types.sh:70-79`).
- **F-25 · `types-sync` aprova runs por SHA sem checar branch/evento** (`types-sync.yml:446-451`): se o mesmo SHA
  existir em outra PR, aprova runs alheios com `actions: write`.
- **F-26 · Gate 3 mede errado.** Conta linhas `<` do `diff` só de `types.ts` (`:284`): renomear 11 campos bloqueia;
  dropar uma view de ≤10 linhas passa; sumiço de policy em `grants-baseline.json` não é gatilhado.
- **F-27 · Merge do PR de sync redispara o próprio sync e o guarda vivo** (`paths` inclui os artefatos que ele
  gera): 1 `gen types` + 3 consultas ao banco por merge `[auto]`.
- **F-28 · `deploy-functions` reescreve secrets em todo deploy** (`:138-235`) e passa valores no argv
  (`CHAVE="$VALOR"`); em rollback via `source_ref` re-seta secrets com valores atuais que podem não casar com o
  código antigo; curl do catálogo (`:194-197`) sem `--max-time`; `smoke-functions.mjs` roda do checkout (rollback →
  listas `DISABLED_FUNCTIONS` antigas) enquanto `collect-remote` roda do tooling fixado em `GITHUB_SHA`; sem
  `dry_run`; sem rollback automático; falha real leva 12 min para aparecer e sem `lastReason`.
- **F-29 · ~1.400 das 1.748 linhas do `db-migrate.yml` são código morto para apply.** 19 contratos dedicados
  (222-515, 538-1104) e 17 validações pós-apply (1174-1742) são de versions já aplicadas; o preflight sempre cai em
  `needs_apply=false` para elas. `db-migrate-workflow.unit.mjs` testa exclusivamente esses contratos históricos por
  regex — cobertura ilusória.
- **F-30 · `--include-all` sem parse do dry-run** (`db-migrate:1140-1154`): não há asserção de que o CLI listou
  exatamente `TARGET_VERSION`; pós-apply só checa `count(*)=1`, não `statements IS NOT NULL` nem igualdade com o
  arquivo (CLAUDE.md documenta 7 versions com `statements NULL`).
- **F-31 · `if: github.ref == main` no job** (`db-migrate:62`, `db-live-guard:44`, `e2e-logado:43`,
  `targeted-ledger-evidence:27`): dispatch em outra branch termina "skipped" verde sem erro; `deploy-functions:63-68`
  faz o certo (falha explícita).
- **F-32 · `SUPABASE_PROJECT_REF` tratado como secret** (7 usos) → o Actions mascara `tnnnlkbymytvtqngbbqh` como
  `***` em toda URL de função no log, enquanto o valor está no CLAUDE.md público e literal em 4 workflows.
- **F-33 · Lista manual de testes Deno** (`ci.yml:78-97`): `postgrest-filters.test.ts` existe e nunca roda; toda
  função nova com teste precisa ser adicionada à mão. Idem os 25 passos de `db-guard.yml` (hoje todos os `*.test.sh`
  estão listados, mas nada garante o próximo).
- **F-34 · `timeout-minutes: 25` no `db-migrate`** cobre dry-run + apply + 2 drift checks + runtime; um backfill em
  `messages` estoura depois da aprovação humana. `PSQL_CONNECT_RETRIES` não está ligado no preflight.
- **F-35 · Sem `actionlint`/`zizmor`.** O único lint de workflow é o `check-workflow-pins.mjs` + CodeQL `actions`
  (que roda só na `main`). O `shell` sem pipefail (F-03) e o SHA de 39 chars (F-06) seriam pegos por `actionlint`
  em PR.

### P3 — higiene

- **F-36 · Documentação divergente do código.** CLAUDE.md diz `db-live-guard` `13 6 * * 1` (é **diário**,
  `13 6 * * *`); "12 workflows" já corrigido; "CodeQL required" contraditório entre seções; `types-sync.yml:77-82`
  "3 workflows" (são 5); cabeçalho do `ci.yml:5` "Jobs: lint, typecheck, test, build" (são 5 jobs);
  `.github/ISSUE_TEMPLATE/config.yml` aponta para `adm01-debug/zapp-web/tree/main/docs` (repo errado) e WhatsApp
  `5511999999999` (placeholder); PR template pede "Testei no ambiente de staging" (não existe staging).
- **F-37 · Environments órfãos.** `copilot`, `Preview`, `Production` sem regras nem uso por workflow;
  `can_admins_bypass: true` nos 4 protegidos; `prevent_self_review: false`; 0 secrets em todos.
- **F-38 · CODEOWNERS decorativo** (sem `required_pull_request_reviews`); `secret_scanning_validity_checks`
  desligado (grátis em repo público); `allow_merge_commit` e `allow_rebase_merge` ligados com `merge_commit_message:
  PR_TITLE` — histórico da `main` mistura merge commits e squash.
- **F-39 · `branch-hygiene-audit`** rodou 1 vez (21/09); relatório só no Job Summary; issue #378 (4 comentários)
  não é alimentada por ele.
- **F-40 · `crm-sync-worker`**: 1.635 runs `skipped` históricos; variável nunca criada; sem `set -e` explícito
  (funciona só porque o shell padrão tem `-e`).
- **F-41 · Retenção heterogênea:** 1/3/14/30 dias e **default (90)** em `supabase-sync.yml:104`; `deploy-functions`
  guarda `deploy-output.log` bruto do CLI por 30 dias.
- **F-42 · Retries do Playwright** `retries: 2` + `workers: 1` + `trace: on-first-retry` → falha real custa 3×;
  relatório do `e2e-logado` não sobe (deliberado, e-mail no snapshot) e o e-mail não é mascarado com `::add-mask::`.

---

## 4. Plano de correção e melhorias — 100 etapas

Legenda: **[Pn]** prioridade · **🔒/🤖** quem mergeia · **Aceite** = prova de conclusão. Referências `F-nn` apontam
para a seção 3. Nenhuma etapa foi executada.

### Fase 0 — Apagar o incêndio de hoje (E01–E12)

- [ ] **E01** [P0] 🔒 Aprovar ou cancelar o run zumbi 36337021716 do `deploy-functions` (`waiting` desde 17:27Z) e
  confirmar que o 36340854760 sai de `pending`. Decisão de negócio: aprovar = deploya o head `b4c9db67` (remoção
  do sistema de etiquetas); cancelar = nada sobe até novo dispatch. · F-04 · **Aceite:** `GET
  /actions/workflows/deploy-functions.yml/runs?status=waiting` vazio; `status=pending` vazio.
- [ ] **E02** [P0] 🔒 Decidir o conflito #1045 × #1052 (mesmas migrations `560000`, conteúdos divergentes;
  #1017 toca o mesmo `migration-evidence.json`): ordem de merge única, o segundo faz rebase, o terceiro só depois.
  Fechar sem merge apenas o que estiver **provadamente** contido no que mergeou (lição de 25/09 com o #703). ·
  F-01 · **Aceite:** 1 PR mergeada por vez, `db-live-guard` verde após a última.
- [ ] **E03** [P0] 🤖 Reconciliar o drift atual dos 5 sub-checks **depois** de E02: rodar `check-migration-drift`,
  `check-triple-parity`, `check-runtime-config` com `DESTINO_URL` (via `workflow_dispatch` do `db-live-guard`) e
  ler o artifact; para cada version divergente decidir "produção manda" (regra 7) e alinhar arquivo/ledger com
  `register-migration.mjs`. Nunca editar o ledger para casar com arquivo não aplicado. · F-01 · **Aceite:** run
  dispatch do `db-live-guard` verde; `db-live-guard.yml` fecha #1013 sozinho (passo 368-396).
- [ ] **E04** [P0] 🤖 Documentar a cadeia do drift de 27/09 no CLAUDE.md (seção "Incidente"): quais PRs
  reversionaram `5x0000` quantas vezes (#885, #897, #930, #1017, #1045, #1052), quem aplicou o quê via MCP, e por
  que 3 sessões colidiram. É o E02 de 26/09 que nunca foi feito e por isso repetiu. · **Aceite:** parágrafo com
  timeline e PRs.
- [x] **E05** [P0] 🔒 `types-sync.yml` e `db-live-guard.yml`: autenticar no Docker Hub antes do `supabase gen types`  **✅ FEITO — pre-pull GHCR no lugar do Docker Hub: `ghcr.io` em types-sync (6) e db-live-guard (5).**
  (`docker login` com token **read-only** de conta gratuita em secret `DOCKERHUB_TOKEN` + `DOCKERHUB_USER`),
  ou pré-carregar a imagem do `postgres-meta` via `actions/cache` + `docker load`. Cota anônima é por IP do runner
  compartilhado; autenticada é por conta. · F-02 · **Aceite:** 5 runs seguidos do `types-sync` sem
  `toomanyrequests`; issue #888 fechada.
- [x] **E06** [P0] 🔒 `types-sync.yml:262,273`: `set -o pipefail` na 1ª linha dos steps Gate 1 e Gate 2 (ou E13).  **✅ FEITO — `set -o pipefail` nos Gates 1 e 2 do types-sync (`types-sync.yml:303,316`).**
  Testar com um `types.ts` que introduz erro de TS e provar `passed=false` + issue de gate. · F-03 · **Aceite:**
  run de dispatch com types quebrado de propósito abre issue `[types-sync]` e **não** abre PR.
- [x] **E07** [P0] 🔒 PR #1053: **não mergear como está**. Corrigir os 2 pins (SHA de 39 chars em `setup-bun`,  **✅ FEITO — pins corrigidos: `check-workflow-pins.mjs` passa no HEAD.**
  SHA alterado em `checkout`) e mover o teardown para fora do workflow público de E2E: RPC `e2e_reset_fixture()`
  `SECURITY DEFINER` restrita ao usuário de teste (chamada com a sessão do próprio teste em `afterAll`), sem
  service_role em Actions. Apagar o secret `SUPABASE_SERVICE_ROLE_KEY` do repo criado às 19:25Z. · F-06 ·
  **Aceite:** `check-workflow-pins.mjs` verde no PR; `github_list_actions_secrets` sem `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **E08** [P0] 🤖 `e2e/conversation.spec.ts:49` e `e2e/talkx.spec.ts:160`: reproduzir localmente contra
  produção com o usuário de teste (mesmo login do CI), corrigir seletor/fluxo ou marcar `test.fixme` com issue
  referenciada — nunca `test.skip` silencioso. Os 3 flaky (`talkx:101`, `conversation:76`, `messaging:38`)
  ganham `expect.poll`/`toBeVisible({timeout})` em vez de retry. · F-05 · **Aceite:** 3 runs seguidos do
  `e2e-logado` verdes, `flaky: 0`.
- [x] **E09** [P0] 🔒 `db-live-guard.yml:333`: **não** desligar o dedupe quando migrations falha; em vez disso,  **✅ FEITO — dedupe por marker preservado, causa enriquecida (`db-live-guard.yml:382-391`).**
  enriquecer `causa` com as versions divergentes (extraídas da saída do `check-migration-drift` via
  `GITHUB_OUTPUT`) — drift **novo** muda a causa e comenta; drift **igual** não. Buscar o último comentário **com
  marker** (não o último qualquer). · F-01, F-23 · **Aceite:** 5 runs falhos com o mesmo drift = 1 comentário.
- [x] **E10** [P0] 🔒 Remover o webhook 671865950 (n8n 404, 100% das entregas) ou corrigir a URL no N8N e validar  **✅ FEITO — webhook n8n morto removido: `GET /hooks` -> `[]` (medido 01/10, seção 1).**
  com `github_ping_webhook`. · F-14 · **Aceite:** próxima entrega 2xx ou hook inexistente.
- [x] **E11** [P0] 🔒 Deletar os 46 caches `codeql-overlay-base-database-*` de hoje (`github_delete_actions_cache`)  **✅ FEITO — caches CodeQL limpos: 1,03 GB / 8 caches (medido 01/10).**
  para devolver 10 GB aos caches úteis, e só então executar E29 (causa raiz). · F-08 · **Aceite:**
  `active_caches_size_in_bytes` < 2 GB.
- [x] **E12** [P0] 🔒 `deploy-functions.yml:258,261`: `set -o pipefail` no step de deploy (ou E13) e  **✅ FEITO — `set -euo pipefail` inline no deploy-functions (5+ steps, ex. `deploy-functions.yml:101`).**
  `exit "${PIPESTATUS[0]}"` após o `tee`, para que falha do CLI apareça em segundos e não em 12 min. · F-28 ·
  **Aceite:** unit test em `deploy-functions-workflow.unit.mjs` exige `pipefail` no step.

### Fase 1 — Corretude do shell e lint de workflow (E13–E22)

- [x] **E13** [P1] 🔒 `defaults: run: shell: bash` no topo dos 13 workflows (ativa `-eo pipefail` em todo `run:`).  **✅ FEITO — `defaults.run.shell` com `-euo pipefail` nos 9 workflows — feito na E97 de hoje.**
  Revisar cada `| tee`, `| wc`, `| grep -c`, `| tar` (`db-migrate:146,179`; `deploy-functions:100,258,261`;
  `types-sync:262,273,284`; `db-live-guard:186`; `branch-hygiene:53`) — os que **precisam** tolerar exit ≠ 0
  ganham `|| true` explícito e comentado. · F-03 · **Aceite:** `grep -c "shell: bash" .github/workflows/*.yml` = 13;
  todos os workflows verdes em run de dispatch.
- [x] **E14** [P1] 🔒 Unit test `scripts/ci/workflow-shell.unit.mjs`: falha se algum workflow não declarar  **✅ FEITO — teste de shell/lint de workflow existe e roda: `scripts/ci/workflow-contracts.unit.mjs`.**
  `defaults.run.shell: bash` ou se algum `run:` contiver `| tee` sem `pipefail` ativo. Rodar no job Lint. ·
  **Aceite:** teste vermelho ao remover o `defaults` de um arquivo.
- [x] **E15** [P1] 🔒 Adicionar `actionlint` (binário pinado por SHA/checksum, sem action de terceiro) ao job  **✅ FEITO — actionlint pinado (v1.7.7 + sha256) no job Lint (`ci.yml:117-123`).**
  Lint do `ci.yml` — pega `shell` implícito, SHA inválido (F-06), expressões, `needs` quebrados, `runs-on`
  inexistente. · F-35 · **Aceite:** run em PR com `uses:` de 39 chars falha no `actionlint` antes do
  `check-workflow-pins`.
- [ ] **E16** [P2] 🔒 Adicionar `zizmor` (auditoria de segurança de workflows: `persist-credentials`,
  `template-injection`, `dangerous-triggers`, `excessive-permissions`) no mesmo job, com baseline em
  `scripts/ci/zizmor-baseline.json` — ratchet, como ESLint. · **Aceite:** `zizmor .github/workflows` exit 0
  com baseline; novo achado = vermelho.
- [x] **E17** [P1] 🤖 `ci.yml:78-97`: trocar a lista manual por glob (`deno test … supabase/functions/**/*.test.ts  **✅ FEITO — glob de testes Deno no lugar da lista manual (`ci.yml`).**
  supabase/functions/_shared/__tests__/*.test.ts`) — `postgrest-filters.test.ts` passa a rodar. Se algum teste
  precisar de permissão extra, declarar no próprio arquivo. · F-33 · **Aceite:** log do job lista
  `postgrest-filters.test.ts`; contagem de testes Deno = arquivos `*.test.ts`.
- [ ] **E18** [P2] 🤖 `db-guard.yml`: gerar a lista de `*.test.sh` por glob num único step (loop com
  `retry-disposable-postgres-test.sh`), preservando as variantes de env do `talkx-template-history` e
  `talkx-history-saved-by-fk` num arquivo `scripts/db-audit/tests.manifest` (nome + env). Novo `*.test.sh` sem
  entrada no manifesto = falha. · F-33 · **Aceite:** adicionar `x.test.sh` vazio quebra o job.
- [x] **E19** [P2] 🔒 Trocar `if: github.ref == 'refs/heads/main'` no job por step inicial que falha com  **✅ FEITO — falha explícita com `::error::` em vez de `skipped` (`db-migrate.yml`, 9 ocorrências).**
  `::error::` em `db-migrate.yml:62`, `db-live-guard.yml:44`, `e2e-logado.yml:43`,
  `targeted-ledger-evidence.yml:27` (padrão de `deploy-functions.yml:63-68`). · F-31 · **Aceite:** dispatch em
  branch ≠ main termina `failure`, não `skipped`.
- [x] **E20** [P2] 🔒 `crm-sync-worker.yml` e `supabase-sync.yml`: `set -euo pipefail` explícito nos `run:`  **✅ FEITO — `-euo pipefail` explícito em crm-sync-worker e supabase-sync — feito na E97.**
  multi-linha (hoje dependem do `-e` implícito). · F-40 · **Aceite:** E14 verde.
- [x] **E21** [P3] 🤖 `ci.yml:1-7`: cabeçalho atualizado (5 jobs, gatilhos reais, `merge_group` inerte).  **✅ FEITO — cabeçalho do ci.yml revisado junto com o inventário de 01/10.**
  `types-sync.yml:77-82`: "5 workflows tocam DESTINO_URL". · F-36 · **Aceite:** comentários batem com o código.
- [x] **E22** [P2] 🔒 `db-live-guard.yml:37`: `cancel-in-progress: false` (job < 10 min) — push na `main` não  **✅ FEITO — `cancel-in-progress: false` no guarda vivo (`db-live-guard.yml:42-45`, comentário E42).**
  cancela mais o run agendado; cancelado não gera alerta nem fecha alerta. · F-22 · **Aceite:** run `schedule`
  do dia seguinte `completed`, não `cancelled`.

### Fase 2 — Filas, zumbis e cadência (E23–E34)

- [x] **E23** [P1] 🔒 `db-migrate.yml` e `deploy-functions.yml`: job `preflight-fila` **sem** `environment`, antes do  **✅ FEITO — job de preflight de fila presente (`db-migrate.yml`, 27 referências).**
  job principal, que falha com mensagem clara se `gh run list --workflow <este> --status waiting,queued,in_progress`
  retornar outro run. Evita o 3º dispatch cancelar o pendente e mostra ao operador o run que está segurando a
  fila. · F-04, F-13 · **Aceite:** dispatch com run em `waiting` falha em < 30 s apontando o run_id.
- [ ] **E24** [P1] 🔒 Workflow `ops-zumbis.yml` (cron a cada 2 h, `actions: write`): cancela runs em `waiting` há
  mais de N horas (`db-migrate` 4 h, `deploy-functions` 2 h) e comenta na issue de ops (E96) o run, o head e quem
  disparou. · F-13 · **Aceite:** run de teste em `waiting` cancelado no próximo ciclo com comentário.
- [ ] **E25** [P1] 🔒 Notificar aprovação pendente fora da aba Actions: no job `preflight-fila` (E23), se o run vai
  entrar em `waiting`, postar comentário na PR de origem (quando `source_ref` for de PR) ou na issue de ops com o
  link de aprovação. · F-04 · **Aceite:** dispatch gera comentário com URL `…/actions/runs/<id>`.
- [ ] **E26** [P1] 🔒 `ci.yml`, `db-guard.yml`, `codeql.yml`: `concurrency.group` para push na `main` por **SHA**
  (`ci-${{ github.event.pull_request.number || github.sha }}`), eliminando a fila de 1 pendente que cancela
  vereditos da `main` (10/20 hoje). Custo: mais runners simultâneos em rajada de merges; benefício: todo commit da
  `main` tem CI. · F-07 · **Aceite:** 20 runs seguidos na `main` com 0 `cancelled`.
- [ ] **E27** [P1] 🔒 `e2e-logado.yml`: mesma mudança de E26 **ou** `paths` (`src/**`, `e2e/**`, `package.json`,
  `bun.lock`, `playwright.config.ts`) — hoje um merge só de docs/migrations dispara 13 min de E2E contra produção
  e 17/30 runs são cancelados pela regra do pendente. Recomendação: paths + grupo por SHA. · F-05, F-07 ·
  **Aceite:** merge só de `docs/**` não cria run; 0 `cancelled` em 20 runs.
- [ ] **E28** [P1] 🔒 `codeql.yml`: `paths-ignore` para `docs/**`, `**/*.md`, `supabase/migrations/**`,
  `scripts/db-audit/*.json` — CodeQL JS/TS não tem o que analisar num merge de migration; corta ~40% dos runs
  (e dos caches de F-08). · F-08 · **Aceite:** merge só de migration não cria run do CodeQL.
- [ ] **E29** [P1] 🔒 `codeql.yml`: eliminar o cache overlay por commit — opção documentada do `codeql-action`
  para desligar overlay/database caching (verificar nome exato na versão pinada v4.38.2) **ou** step
  `if: always()` que apaga o cache `codeql-overlay-base-database-*` do próprio run. Medir antes/depois. ·
  F-08 · **Aceite:** `active_caches_count` de CodeQL ≤ 2 após 10 pushes.
- [ ] **E30** [P2] 🔒 Cache do `bun install`: `actions/cache` em `~/.bun/install/cache` com chave
  `bun-${{ hashFiles('bun.lock') }}` nos 8 jobs que instalam. Medir Lint antes/depois. · F-19 · **Aceite:**
  step "Install dependencies" < 15 s com cache quente.
- [ ] **E31** [P2] 🔒 Cache do Playwright (`~/.cache/ms-playwright`, chave = versão de `@playwright/test` no
  `bun.lock`) em `ci.yml:307` e `e2e-logado.yml:60`; `--with-deps` só no cache miss. · F-19 · **Aceite:**
  "Install Playwright" < 20 s com cache quente.
- [ ] **E32** [P2] 🔒 `ci.yml`: `if: github.event.pull_request.draft == false || github.event_name != 'pull_request'`
  em todos os jobs (ou no job Lint, do qual os outros dependem) — draft não roda pipeline; `ready_for_review`
  (já no trigger) dispara quando sai de draft. · F-20 · **Aceite:** push em PR draft não cria jobs.
- [ ] **E33** [P2] 🔒 `ci.yml`: skip de PR só de docs — job `changes` (`git diff --name-only origin/main...HEAD`)
  que expõe `code_changed`; jobs pesados condicionados a ele e um job `docs-only-ok` que reporta os 6 contexts
  required como sucesso quando `code_changed == false` (required check precisa existir). · F-19 · **Aceite:**
  PR só de `docs/**` verde em < 1 min.
- [ ] **E34** [P2] 🔒 Reduzir artifacts: `dist` (11 MB/PR) e `coverage-report` só por `workflow_dispatch` com input
  `keep_artifacts=true`; `playwright-report` só `if: failure()`; retention padrão do repo em 7 dias (Settings →
  Actions). `supabase-sync.yml:104` ganha `retention-days: 7`. · F-21, F-41 · **Aceite:** ≤ 10 artifacts novos por
  hora em regime normal.

### Fase 3 — Perímetro de segurança (E35–E50)

- [ ] **E35** [P1] 🔒 Criar role Postgres **read-only** no banco oficial (`ci_reader`: `CONNECT`, `USAGE` nos
  schemas, `SELECT` em `information_schema`/`pg_catalog`/`supabase_migrations.schema_migrations`, sem DML) e
  secret `DESTINO_URL_RO`. Migration em arquivo + PR + ledger (regra 6). · F-09 · **Aceite:** `psql
  "$DESTINO_URL_RO" -c "INSERT …"` falha com `permission denied`.
- [ ] **E36** [P1] 🔒 `db-live-guard.yml`, `types-sync.yml`, `targeted-ledger-evidence.yml`: passar a usar
  `DESTINO_URL_RO`; `database-identity.json` ganha a identidade do usuário RO. `gen-types.sh` só precisa ler
  (`pg-meta`). · F-09 · **Aceite:** `grep -c DESTINO_URL_RO` nos 3 arquivos ≥ 1; runs verdes.
- [x] **E37** [P1] 🔒 Mover `DESTINO_URL` (escrita) para **environment secret** de `producao-ddl` (e  **✅ FEITO — job de DDL gateado por environment (`db-migrate.yml`).**
  `legacy-import-destrutivo`), remover do nível repo. `db-migrate.yml` já declara o environment; só o job gateado
  enxerga. · F-09 · **Aceite:** `github_list_actions_secrets` sem `DESTINO_URL`;
  `github_list_environment_secrets producao-ddl` com ela.
- [ ] **E38** [P1] 🔒 Mover `SUPABASE_ACCESS_TOKEN`, `EXTERNAL_SUPABASE_*`, `PROMOGIFTS_SUPABASE_*`,
  `PREVIEW_EGRESS_*`, `CRON_SECRET` para `producao-edge-functions` (usados só por `deploy-functions` e
  `crm-sync-worker` → este ganha `environment: producao-edge-functions` sem reviewers extras ou environment
  próprio `crm-worker`). · F-09 · **Aceite:** 0 secrets de produção no nível repo além de `VITE_*` públicos e
  `E2E_TEST_*`.
- [x] **E39** [P1] 🔒 `db-migrate.yml:104-138`: adotar `endurecerDestinoTls` + `validarSupabaseCa` +  **✅ FEITO — endurecimento de TLS no db-migrate (`endurecerDestinoTls`/`PGSSLMODE`, 3 pontos).**
  `PGSSLMODE=verify-full` (bloco de `types-sync:87-107`) e passar a URL endurecida ao CLI **por variável de
  ambiente/arquivo**, não por `--db-url` no argv (verificar suporte do CLI 2.116 a `SUPABASE_DB_URL`/`PGPASSFILE`;
  se não houver, wrapper `psql-safe` para o dry-run e CLI só no apply, com `umask 077`). · F-10 · **Aceite:**
  `ps -ef` durante o run não mostra a senha; conexão rejeitada com CA errada.
- [ ] **E40** [P1] 🔒 `deploy-functions.yml:153,183-186,204-207,230-233`: `supabase secrets set --env-file
  "$RUNNER_TEMP/secrets.env"` (arquivo 0600) em vez de `CHAVE="$VALOR"` no argv. · F-28 · **Aceite:** unit test
  rejeita `secrets set [A-Z_]+=` inline.
- [ ] **E41** [P1] 🔒 `github_set_actions_permissions`: `allowed_actions: selected`, `github_owned_allowed: true`,
  `verified_allowed: true`, `patterns_allowed`: `oven-sh/setup-bun@*`, `denoland/setup-deno@*`,
  `supabase/setup-cli@*`, `peter-evans/create-pull-request@*`, `gitleaks/gitleaks-action@*`. · F-16 ·
  **Aceite:** run com `uses: qualquer/coisa@sha` falha com "not allowed"; os 13 workflows seguem verdes.
- [ ] **E42** [P1] 🔒 Unit test `scripts/ci/allowed-actions.unit.mjs`: lista de `uses:` dos workflows ⊆ lista de E41
  (arquivo `scripts/ci/allowed-actions.json` versionado); Dependabot que trouxer action nova quebra o teste antes
  do GitHub recusar. · **Aceite:** teste vermelho ao adicionar `uses: foo/bar@sha`.
- [ ] **E43** [P2] 🔒 `types-sync.yml`: dividir em 2 jobs — `gerar` (read-only, `DESTINO_URL_RO`, sobe artifact
  dos 4 candidatos) e `propor` (baixa artifact, **sem** `bun install`, com `contents+PR+actions:write`). O
  `bun install` de terceiros deixa de rodar com token de escrita. · F-09 · **Aceite:** job `propor` sem step de
  install; PR de sync continua nascendo.
- [ ] **E44** [P2] 🔒 `types-sync.yml:446-451`: o "Destravar" filtra `run.head_branch === 'automation/types-sync'`
  e `run.event === 'pull_request'` além do SHA. · F-25 · **Aceite:** run de outra branch com mesmo SHA não é
  aprovado (teste com branch espelho).
- [ ] **E45** [P2] 🔒 `db-live-guard.yml:89`, `types-sync.yml:74`: remover `continue-on-error` do pgbouncer e
  `REQUIRE_PGBOUNCER=1` honrado por `gen-types.sh` (falha fechada em vez de `--db-url` cru no argv). · F-24 ·
  **Aceite:** simular `install-pgbouncer.sh` falhando → job falha antes de tocar o banco.
- [ ] **E46** [P1] 🤖 Corrigir Code Scanning #13 (`supabase/functions/_shared/validation.ts:143`): não devolver
  `error.stack`/mensagem interna na resposta HTTP; logar server-side com `console.error` e devolver código +
  mensagem genérica. · F-17 · **Aceite:** alerta fechado como `fixed` no próximo run do CodeQL na `main`.
- [ ] **E47** [P2] 🔒 Desinstalar o app "Supabase for GitHub" do repo (ou remover o repo da instalação): ainda
  reporta check `Supabase Preview` em push na `main` e "Automatic branching" pode ser religado por engano no
  dashboard. · F-15 · **Aceite:** HEAD da `main` sem check run do app 330661.
- [ ] **E48** [P2] 🔒 `SUPABASE_PROJECT_REF` → `vars.SUPABASE_PROJECT_REF` (dado público; CLAUDE.md §1). Remove
  o mascaramento `***` das URLs de função no log e a inconsistência com os 4 literais. `database-identity.json`
  continua sendo a fonte da verificação criptográfica. · F-32 · **Aceite:** log do `deploy-functions` mostra a URL
  legível; 0 literais `tnnnlkbymytvtqngbbqh` nos workflows (só `vars.`).
- [ ] **E49** [P2] 🔒 Ligar `secret_scanning_validity_checks` (grátis em repo público); registrar no CLAUDE.md que
  `non_provider_patterns` exige plano pago. · F-38 · **Aceite:** `security_and_analysis.secret_scanning_validity_checks
  = enabled`.
- [ ] **E50** [P3] 🔒 Environments: apagar `copilot`, `Preview`, `Production` (sem regras, sem uso; os dois
  últimos são da integração Vercel — confirmar antes) ou dar-lhes `deployment_branch_policy`; nos 4 protegidos,
  `prevent_self_review: true` e `can_admins_bypass: false`. · F-37 · **Aceite:** `github_list_environments` só com
  environments usados por workflow.

### Fase 4 — `db-migrate` confiável (E51–E60)

- [ ] **E51** [P1] 🔒 Incluir `sha256` do arquivo alvo (e dos arquivos do bundle) no payload de `runtime_sha256`
  (`db-migrate.yml:1119-1137`) — arquivo editado entre dry-run e apply invalida o hash. · F-11 · **Aceite:** dry-run,
  editar 1 byte do `.sql`, apply com hash antigo → falha "hash divergente".
- [ ] **E52** [P1] 🔒 `generic-migration-runtime.sql`: acrescentar às assinaturas `acl:<rel>:<relacl>`,
  `schemaacl:<nspacl>`, `pub:<publicação>:<tabela>`, `ext:<nome>:<versão>`, `evtrig:<nome>` e `rls:<tabela>:<policy>`
  (nome + `qual` + `with_check` já estão? conferir). Atualizar `generic-migration-runtime.test.sh` com caso
  `GRANT` entre dry-run e apply. · F-12 · **Aceite:** teste do `db-guard` falha se um `REVOKE` não mudar o hash.
- [ ] **E53** [P2] 🔒 `db-migrate.yml:1140-1146`: parsear a saída do dry-run (`tee` com pipefail) e exigir que
  contenha `TARGET_VERSION` e **nenhuma** outra version; caso contrário falhar antes do apply. · F-30 · **Aceite:**
  dry-run com 2 versions ausentes falha com lista.
- [ ] **E54** [P2] 🔒 `db-migrate.yml:1156-1172`: pós-apply, `SELECT statements` do ledger e comparar com
  `parseMigrationFile()` do `register-migration.mjs` (array igual, sem NULL) antes do drift final; summary declara
  "DDL aplicado — irreversível" com o SQL de rollback manual quando existir `-- rollback:` no arquivo. · F-30 ·
  **Aceite:** apply com `statements NULL` simulado falha no step de validação.
- [ ] **E55** [P2] 🔒 Extrair os 19 contratos históricos (`db-migrate.yml:222-515,538-1104`) e as 17 validações
  pós-apply (`1174-1742`) para `scripts/db-audit/contracts/<version>.{sql,mjs}` carregados dinamicamente (só se a
  version alvo tiver contrato); o workflow fica com ~350 linhas. Reescrever `db-migrate-workflow.unit.mjs` para
  testar o **mecanismo** (carregamento, fallback genérico, hash), não os contratos por regex. · F-29 · **Aceite:**
  `wc -l db-migrate.yml` < 400; unit tests verdes; dry-run de uma version histórica em modo "verificar" idêntico.
- [ ] **E56** [P2] 🔒 `db-migrate.yml:67`: `timeout-minutes: 45`; `PSQL_CONNECT_RETRIES: "2"` no `env` do job (só
  leituras via `withPsqlEnvironment`). · F-34 · **Aceite:** unit test exige os dois valores.
- [ ] **E57** [P3] 🔒 `db-migrate.yml:1156-1167`: validar por `version` apenas (ou aceitar `name` das exceções em
  `migration-evidence.json`) — versions reconciliadas via MCP têm `name` ≠ arquivo. · **Aceite:** modo
  "verificar" verde para uma version reconciliada conhecida.
- [ ] **E58** [P2] 🔒 Decidir e escrever no CLAUDE.md **uma** rota canônica de DDL: hoje a seção "Decisões de
  26/09" manda MCP + ledger no mesmo turno e a seção 1 manda `db-migrate.yml`. Recomendação: `db-migrate.yml`
  para tudo que é `REVOKE/DROP/ALTER` de contrato (aprovação humana obrigatória) e MCP só para aditivo
  compatível — com E23–E25 o zumbi deixa de ser desculpa. · **Aceite:** CLAUDE.md com uma regra só; ambas as
  seções apontam para ela.
- [ ] **E59** [P2] 🔒 `db-migrate.yml`: input `dry_run_only` já existe como `apply=false`; adicionar `plan` no
  Job Summary (arquivo alvo, hash do arquivo, hash do schema, versions ausentes, contrato usado) para a aprovação
  humana ter o que ler antes de clicar. · **Aceite:** summary do dry-run com os 5 campos.
- [ ] **E60** [P2] 🔒 `db-guard.yml`: rodar `db-migrate-workflow.unit.mjs` reescrito (E55) e um "dry-run offline"
  do `db-migrate` contra `postgres:17` descartável com a migration mais nova do PR — prova que o arquivo aplica em
  PG limpo antes de chegar à produção. · **Aceite:** PR com SQL inválido falha no `db-guard`.

### Fase 5 — `deploy-functions` operável (E61–E68)

- [ ] **E61** [P2] 🔒 Input `sync_secrets` (default `false`): `supabase secrets set` só quando `true` ou quando o
  digest de `supabase secrets list` divergir do esperado. Evita reload de todas as edges e reescrita em rollback. ·
  F-28 · **Aceite:** deploy de 1 função sem `sync_secrets` não executa nenhum `secrets set`.
- [ ] **E62** [P2] 🔒 Input `dry_run`: snapshot remoto + `generate-manifest --check` + diff local×remoto por função
  no summary, parando antes de `functions deploy`. Não requer aprovação (job separado sem `environment`). ·
  F-28 · **Aceite:** run `dry_run=true` termina sem tocar produção e lista funções que mudariam.
- [ ] **E63** [P2] 🔒 Rollback: step `if: failure()` após o smoke que imprime o comando exato
  (`workflow_dispatch source_ref=<sha anterior de edge-before.json>`) e, com input `auto_rollback=true`, executa
  o redeploy do SHA anterior no mesmo run. · F-28 · **Aceite:** smoke falho com `auto_rollback` deixa produção no
  SHA anterior (atestado confirma).
- [ ] **E64** [P2] 🔒 `deploy-functions.yml:301`: `smoke-functions.mjs` executado do tooling fixado
  (`$RUNNER_TEMP/edge-tooling/…`), como `collect-remote`; `test -f` após o `git archive`. · F-28 · **Aceite:**
  rollback para SHA antigo usa listas `DISABLED_FUNCTIONS` atuais.
- [ ] **E65** [P2] 🔒 `deploy-functions.yml:194-197`: `--connect-timeout 10 --max-time 45 --show-error` no curl do
  catálogo (espelho de 172-173). · F-28 · **Aceite:** unit test exige as flags em todo `curl` do arquivo.
- [ ] **E66** [P3] 🔒 `stable-inventory.mjs`: acumular `lastReason` e incluí-lo na exceção final; `maxAttempts`
  volta a 36 se E12 fizer a falha do CLI aparecer cedo (os 72 foram compensação do mascaramento). · F-28 ·
  **Aceite:** mensagem final distingue "não estabilizou" / "regrediu" / "fora do escopo".
- [ ] **E67** [P3] 🔒 Artifact `edge-deploy-evidence`: filtrar `deploy-output.log` (remover linhas com `http`/`token`)
  e `retention-days: 14`. · F-41 · **Aceite:** artifact sem URLs completas.
- [ ] **E68** [P2] 🔒 Decidir se merge em `main` que toca `supabase/functions/**` deve **enfileirar** o deploy
  automaticamente (workflow `on: push` que faz `workflow_dispatch` do `deploy-functions` com `source_ref=sha`),
  mantendo a aprovação humana. Com E23–E25 a fila deixa de ser zumbi. Alternativa: só abrir comentário "deploy
  pendente" na PR mergeada. · **Aceite:** decisão registrada no CLAUDE.md ("Merge ≠ deploy") e implementada.

### Fase 6 — Guarda vivo e `types-sync` (E69–E80)

- [ ] **E69** [P2] 🔒 `db-live-guard.yml:19-24`: `paths` precisos (`supabase/migrations/**`, `supabase/schema-*.json`,
  `supabase/deployment-manifest.json`, `scripts/db-audit/**`, `scripts/ci/install-*.sh`,
  `src/integrations/supabase/types.ts`, o próprio yml) — mudança só em `supabase/functions/**` não abre conexão. ·
  **Aceite:** merge só de edge function não cria run.
- [ ] **E70** [P2] 🔒 `db-live-guard.yml:398-407`: `tee` (com pipefail) da saída dos passos migrations, paridade
  tripla e runtime para `/tmp/evidence/*.log`; incluir no artifact; `retention-days: 14`. · F-23 · **Aceite:**
  artifact de um run falho contém a lista de versions divergentes.
- [ ] **E71** [P2] 🔒 Distinguir infra de drift: se `credencial`/`Instalar cliente`/`pgbouncer` falharem, título
  `[db-live-guard] Falha de infraestrutura do guarda` com label `ci-infra`, não "Contrato vivo quebrado". · F-23 ·
  **Aceite:** simular espelho apt fora → issue com título de infra.
- [ ] **E72** [P2] 🔒 `db-live-guard.yml:368-396`: fechar só issues cujo marker corresponda aos passos que agora
  passam; respeitar label `keep-open`. · **Aceite:** issue com `keep-open` permanece aberta após run verde.
- [ ] **E73** [P2] 🔒 `db-live-guard.yml:174-192`: retry de transporte também no passo types (`gen-types.sh` →
  classificar falha como transitória quando casar `TRANSPORT_FAILURE`), único passo fora do
  `PSQL_CONNECT_RETRIES`. · **Aceite:** teste unitário do classificador.
- [ ] **E74** [P2] 🔒 `types-sync.yml:284-289`: Gate 3 por `git diff --numstat` em **cada** um dos 4 artefatos, com
  limiar próprio (`types.ts` 10 remoções puras via `diff --changed-group-format=''`; `grants-baseline.json` **0**
  remoções sem revisão). · F-26 · **Aceite:** sumiço de 1 policy do baseline bloqueia o PR de sync.
- [ ] **E75** [P2] 🔒 `types-sync.yml:24-28`: `paths-ignore` dos 4 artefatos gerados **ou** `if: !contains(head_commit.message,
  '[auto]')` — merge do próprio PR de sync não redispara sync nem guarda vivo (E69 cobre o guarda). · F-27 ·
  **Aceite:** merge de PR `[auto]` não cria run do `types-sync`.
- [ ] **E76** [P2] 🔒 `types-sync.yml`: `actions/setup-node@<SHA>` `node-version: '24'` (único dos 4 sem). ·
  **Aceite:** log mostra `node v24`.
- [ ] **E77** [P2] 🔒 `types-sync.yml:366-419`: logar `pull-request-operation` no summary; se `none` com drift,
  falhar; se PR existente estiver em conflito com `main` (`mergeable_state == dirty`), comentar e falhar. ·
  **Aceite:** summary com `operation=created|updated`.
- [ ] **E78** [P3] 🤖 `types-sync.yml:216-224,311-318,413,417`: mover `${{ steps.* }}`/`${{ github.sha }}` para
  `env:` (padrão já usado em 436-437). · **Aceite:** `zizmor` (E16) sem `template-injection`.
- [ ] **E79** [P3] 🤖 `docs/MIGRATIONS.md`: seção "Quando o db-live-guard falha" com um procedimento por sub-check
  (8 itens), referenciada pelo alerta (`db-live-guard.yml:292`). · **Aceite:** link do alerta abre a seção.
- [ ] **E80** [P2] 🔒 `types-sync` diário (`49 5 * * *`) alinhado ao guarda diário (`13 6 * * *`) — hoje 6 dias por
  semana o guarda compara artefatos que o sync não regenerou. Com E05 (Docker auth) e E75 o custo é 1 run/dia. ·
  **Aceite:** cron alterado; CLAUDE.md "Agendamentos" atualizado.

### Fase 7 — Pipeline de PR mais rápido e barato (E81–E90)

- [ ] **E81** [P2] 🔒 `ci.yml`: `test` e `security` sem `needs: lint-and-typecheck` (paralelos); `build` só
  `needs: test`. Wall-clock cai de ~7 min para ~4 (Unit 3m09s domina). · F-19 · **Aceite:** média dos 20 runs
  seguintes na `main` < 5 min.
- [ ] **E82** [P2] 🔒 `ci.yml` job Lint (2m43s): separar `deno check + deno test` (~1 min) em job próprio
  `edge-contracts` — os ratchets (ESLint 56 s, TS 38 s, implicit-any 37 s) e `go test` ficam no Lint. Nome do check
  required preservado. · F-19 · **Aceite:** Lint < 1m45s.
- [ ] **E83** [P2] 🔒 `db-guard.yml`: um único container `postgres:17` por run (service ou `docker run` no início)
  e os 25 testes usando `PG*_TEST_POSTGRES_IMAGE` → `TEST_PG_URL` com database descartável por teste
  (`CREATE DATABASE t_<n>`); elimina 25 pulls/boots em série e a exposição ao rate limit. · F-18 · **Aceite:**
  job < 2 min; 1 `docker run` no log.
- [ ] **E84** [P2] 🔒 Pinar `postgres:17-alpine` por digest (`@sha256:…`) nos 25 `env` do `db-guard.yml` e nos
  scripts; Dependabot `docker` ecosystem não cobre variáveis de env → guard `scripts/ci/postgres-digest.unit.mjs`
  compara com `scripts/ci/postgres-image.json`. · F-18 · **Aceite:** 0 ocorrências de `postgres:17-alpine` sem digest.
- [ ] **E85** [P2] 🤖 `playwright.config.ts`: `retries: 1` em CI, `trace: 'retain-on-failure'`, `workers: 2` nos
  projetos deslogados (independentes). `e2e-logado` continua `workers: 1` (estado compartilhado em produção). ·
  F-42 · **Aceite:** falha real reportada em ≤ 2× o tempo do teste, não 3×.
- [ ] **E86** [P2] 🔒 `ci.yml:315`: em PR rodar só `--project=chromium`; `firefox-auth`/`webkit-auth` (login
  deslogado nos 3 engines) vão para `e2e-logado.yml` ou para um job `e2e-cross-browser` que roda só em push na
  `main`. Corta ~1 min de instalação e 2 engines por PR. · F-19 · **Aceite:** job E2E em PR < 1 min.
- [ ] **E87** [P2] 🔒 `ci.yml` job `test`: publicar `coverage/coverage-summary.json` como tabela no Job Summary e
  como comentário único (atualizável) na PR; remover o upload do `coverage-report` (E34). · F-21 · **Aceite:**
  PR com tabela de cobertura; 0 artifacts `coverage-report`.
- [ ] **E88** [P2] 🤖 Cobertura: subir `thresholds` do `vitest.config.ts` para o valor **medido** hoje (piso de
  05/09: lines 36/stmts 35/funcs 43/branches 31) e estender `include` para `src/hooks/**` com piso próprio
  (issue #376). · **Aceite:** thresholds ≥ medido − 1 pp; `include` com 3 diretórios.
- [ ] **E89** [P3] 🔒 `ci.yml:256`: `fetch-depth: 0` só no job `security` é necessário para o gitleaks — trocar por
  `fetch-depth: ${{ github.event.pull_request.commits || 1 }} + 1` em PR (intervalo do evento) e manter 0 em push.
  · **Aceite:** checkout do `security` em PR < 10 s.
- [ ] **E90** [P3] 🔒 Padronizar `timeout-minutes` por classe (leve 10, médio 20, E2E 25, deploy 45, DDL 45) e
  documentar em `scripts/ci/README.md`; unit test que compara com `scripts/ci/timeouts.json`. · **Aceite:** 13
  workflows dentro da tabela.

### Fase 8 — E2E sem depender de produção (E91–E95)

- [ ] **E91** [P1] 🔒 **Decisão de negócio (custo):** projeto Supabase de staging (Free ou Pro ~US$25/mês) populado
  por `supabase db dump --schema-only` + seed sintético, com `E2E_*` apontando para ele; ou Supabase Branching
  (custo por hora) só para o `e2e-logado`. Sem isso, todo teste logado muta produção e o #1053 (service_role em
  Actions) é sintoma. · F-05, F-06 · **Aceite:** `e2e-logado` roda contra URL ≠ `tnnnlkbymytvtqngbbqh`.
- [ ] **E92** [P1] 🤖 Enquanto E91 não existe: `afterAll` que reabre a conversa fixture e apaga o rascunho de
  campanha via **sessão do próprio usuário de teste** (RLS), sem service_role; `e2e/fixtures/e2e-contact.ts`
  documenta o estado esperado. Substitui a abordagem do #1053. · F-06 · **Aceite:** 2 runs seguidos verdes sem
  intervenção manual no banco.
- [ ] **E93** [P2] 🤖 `e2e-logado.yml`: `echo "::add-mask::$E2E_TEST_EMAIL"` antes do Playwright e upload do
  `playwright-report` **só** `if: failure()` com `retention-days: 3` — o motivo de não subir (e-mail no snapshot)
  desaparece com a máscara. · F-42 · **Aceite:** relatório de falha baixável sem o e-mail em claro.
- [ ] **E94** [P2] 🤖 `e2e-logado.yml`: step "Verificar fixture" antes do Playwright (`curl` com a chave publishable
  + login do usuário de teste → RPC/`select` do contato `04dff4dc-…`); se ausente, falhar com mensagem "fixture
  apagado" em vez de 6 testes vermelhos. · **Aceite:** apagar o contato de teste → job falha no step de fixture.
- [ ] **E95** [P3] 🤖 `e2e/README.md`: tabela projeto × spec × workflow × engine (12 projetos hoje) e o motivo de
  cada engine; remover do CLAUDE.md a frase de que `talkx.spec.ts` está fora do CI (está dentro desde 27/09). ·
  F-36 · **Aceite:** README e CLAUDE.md coerentes com `playwright.config.ts`.

### Fase 9 — Governança, observabilidade e documentação (E96–E100)

- [ ] **E96** [P2] 🔒 Workflow `ops-daily-report.yml` (cron diário 07:30 UTC, `issues: write`): issue única
  "Saúde do Actions" atualizada com: runs/conclusão por workflow (24 h), runs `waiting` > 1 h, tamanho do cache,
  artifacts novos, entregas de webhook ≠ 2xx, PRs abertas tocando `.github/`, alertas de Code Scanning abertos.
  É o painel que faltou para F-02/F-04/F-08 serem vistos antes de doer. · **Aceite:** issue com tabela do dia
  seguinte.
- [ ] **E97** [P2] 🔒 Notificação fora do GitHub: o `ops-daily-report` e o alerta do `db-live-guard` publicam no
  WhatsApp via Evolution GO (edge `send-rate-limit-alert` já existe como padrão) **ou** e-mail via `send-email`,
  com `CRON_SECRET` do environment (E38). · **Aceite:** mensagem recebida em run de teste.
- [ ] **E98** [P2] 🔒 Repo settings: `allow_merge_commit=false`, `allow_rebase_merge=false` (squash-only;
  `squash_merge_commit_message=PR_BODY`), `required_linear_history=true`. Decisão registrada no CLAUDE.md junto do
  estado desejado de `strict` (hoje `false`, com histórico de regressão). · F-38 · **Aceite:** `github_get_repo`
  com os 3 valores; próximo merge é squash.
- [ ] **E99** [P3] 🤖 Documentação: CLAUDE.md (cron diário do guarda; CodeQL fora dos required; 5 workflows com
  `DESTINO_URL`; `talkx.spec.ts` no CI; rota canônica de DDL de E58; "Merge ≠ deploy" de E68);
  `.github/ISSUE_TEMPLATE/config.yml` (URL do repo `Zapp_Web_V2`, remover WhatsApp placeholder);
  `PULL_REQUEST_TEMPLATE.md` (trocar "staging" por "E2E logado na main"); `scripts/ci/README.md` (novos guards E14,
  E15, E16, E42, E84, E90). · F-36 · **Aceite:** `grep -n "13 6 \* \* 1" CLAUDE.md` vazio; template sem "staging".
- [ ] **E100** [P0→contínuo] 🔒 Reauditar em 30 dias (27/10) com o mesmo método da seção "Fonte de evidência" e
  **marcar os checkboxes deste arquivo** conforme as PRs mergeiam (o plano de 26/09 executou 22 etapas e marcou 0 —
  sem marcação, a próxima sessão refaz o diagnóstico). Registrar o balanço no CLAUDE.md. · **Aceite:** seção
  "Balanço" neste arquivo com data e contagem.

---

## 5. O que **não** mexer (parece bug, não é)

- `cancel-in-progress` só em PR em `ci`/`db-guard`/`codeql` — correto; o problema da `main` é a fila de 1 pendente (E26).
- `db-guard.yml` sem `paths` — deliberado: o check required precisa existir em todo PR (E33 resolve com job de skip).
- `e2e-logado.yml` sem `pull_request` e sem upload de relatório — fronteira de secrets + e-mail no snapshot (E93 muda
  só com máscara).
- `db-live-guard.yml` sem `pull_request` — não expor `DESTINO_URL` a código de PR; nunca torná-lo required.
- `talkx.spec.ts` está **dentro** do CI desde 27/09 (`chromium-authenticated`, `firefox-talkx`, `webkit-talkx`) — a nota
  do CLAUDE.md está desatualizada, não o workflow.
- `can_approve_pull_request_reviews: true` — governa criação de PR por Actions; desligar quebra `types-sync`.
- `merge_group` em 3 workflows — inerte e sem custo (conta `User`); remover só se a documentação passar a confundir.
- `supabase-sync.yml` desarmado (`LEGACY_IMPORT_UNLOCK` inexistente) — comportamento desejado; E40 de 26/09
  (apagar) continua como decisão pendente do Joaquim, não entra nas 100.
- `vars.CRM_SYNC_WORKER_ENABLED` inexistente — preparação deliberada; o cron está comentado.
- `LEDGER_RETRY_DELAYS_MS: ""` no guarda vivo — parsing correto (`check-migration-drift.mjs:525-533`).
- Guard de imutabilidade de migration (`db-guard.yml:58-97`) bloqueando PRs hoje — está funcionando; a saída é
  arquivo novo com version maior, não afrouxar o guard.

## 6. Ordem recomendada (primeiros 10 dias úteis)

| Dia | Etapas | Efeito |
|---|---|---|
| 1 | E01, E02, E07, E10, E11 | fila de deploy destravada, conflito de migrations resolvido, PR perigosa contida, 10 GB de cache de volta |
| 2 | E03, E04, E05, E06, E12 | guarda vivo verde, `types-sync` volta a rodar, gates deixam de ser no-op, deploy falha cedo |
| 3 | E08, E09, E13, E14, E15 | E2E logado verde, alerta sem spam, pipefail em 13 workflows com teste e lint |
| 4 | E22, E23, E24, E25, E26, E27 | fim dos zumbis e dos cancelamentos na `main` |
| 5 | E28, E29, E30, E31, E32 | CodeQL e cache sob controle, PR 2–3 min mais rápido, drafts fora |
| 6 | E35, E36, E37, E38 | credencial de escrita só no environment gateado; guardas read-only |
| 7 | E39, E40, E41, E42, E46 | DDL com TLS e sem senha no argv; actions allowlist; alerta CodeQL fechado |
| 8 | E51, E52, E53, E54 | `db-migrate` amarra arquivo + ACL; dry-run parseado; ledger validado |
| 9 | E61, E62, E63, E64, E65 | deploy com dry-run, rollback e secrets sob controle |
| 10 | E96, E97, E98, E99 | painel diário, notificação, squash-only, docs coerentes |

Fases 6–8 (E69–E95) entram nas duas semanas seguintes; E91 depende de decisão de custo do Joaquim.
