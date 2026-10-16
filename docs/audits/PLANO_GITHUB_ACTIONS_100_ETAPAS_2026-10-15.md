# Auditoria exaustiva do GitHub Actions — plano de correções e melhorias em 100 etapas (v5)

**Data:** 2026-10-15 (23:15 UTC) · **Repo:** `adm01-debug/Zapp_Web_V2` · **HEAD da `main` auditado:** `c181d1b`
(`b9df94e` + #1954, só documentação)
**Escopo:** os **17** arquivos de `.github/workflows/` (6.642 linhas, lidos integralmente, linha a linha), os 3
workflows dinâmicos, `dependabot.yml`, `toolchain.json`, `actionlint.yaml`, `codeql/`, `CODEOWNERS`, templates, os
scripts que os workflows chamam (`scripts/ci/`, `scripts/db-audit/`, `scripts/edge-deploy/`, `e2e/`), e o **estado ao
vivo**: API do GitHub (branch protection, settings, environments, secrets por escopo, cache, artifacts, Code Scanning,
runs de 7 dias com log das falhas, check-runs do HEAD, PRs e issues abertas), API da Vercel (3 projetos) e banco
oficial `tnnnlkbymytvtqngbbqh` (só `SELECT`: ledger, funções, `pg_cron`, `auth.sessions`).
**Método:** 7 auditores em paralelo, cada um com um recorte (CI/CodeQL/Scorecard · db-guard · guardas vivos +
types-sync · db-migrate + deploy de edge · E2E + fila · perímetro/higiene/notificação/Dependabot · estado ao vivo).
Cada achado tem evidência ao lado (arquivo:linha, run id, resposta da API). Os P0 foram re-conferidos à mão.
Nada foi alterado em GitHub, Vercel ou Supabase durante a auditoria.
**Status:** **PROPOSTO — nenhuma etapa executada.** Substitui o `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-14.md` quando
o dono adotar (etapa GA100). Prefixo das etapas: **GA** (não colide com E/W/X/G/K dos planos anteriores).

**Legenda:** P0 = quebrado agora · P1 = alto risco/segurança · P2 = médio · P3 = baixo.
Tipo: **A** configuração ao vivo (API, agente executa) · **B** YAML de workflow · **C** script/teste/doc ·
**D** decisão ou ação só do Joaquim · **E** externo (Vercel/Supabase/N8N). ⚠️ = mexe em perímetro, segredo, DDL ou
dado de produção: PR fica aberta para o Joaquim (regra 8 do fluxo Git).

---

## 0. Sumário executivo — o que está quebrado agora

| Sinal | Medido em 15/10, 22:47–23:10 UTC | Leitura |
|---|---|---|
| **Lote de banco** | `db-migrate.yml` **não consegue aplicar migration nova** desde o #1942: o hash de confirmação sai contaminado por uma linha de log (`validate-runtime-proof.mjs:599` no stdout, capturado em `db-migrate.yml:269`). E mesmo quando aplica, reprova o próprio apply (`verify-ledger-statements.mjs:98`: o CLI grava o cabeçalho `--` no ledger; run 37355980323) | A única rota prevista na seção 0 do `CLAUDE.md` está inutilizada; não roda desde 05/10. Resultado: `20261015200000` (e2e_cleanup) foi aplicada **por fora**, de novo (2º caso depois de 26/09), e `20261009190000` (Talk X) está **pendente desde 15:01** |
| **Guarda vivo amanhã 06:13 UTC** | `e2e_cleanup` existe em produção e não existe em `schema-catalog.json`, `schema-manifest.json`, `types.ts` nem `grants-baseline.json`; `types-sync` só roda de novo na segunda (cron `49 5 * * 1`) | Vermelho certo no agendado: migrations, catálogo, manifesto, types e paridade de grants |
| **types-sync Gate 3** | `types-sync.yml:320` copia o catálogo novo por cima do antigo **antes** do Gate 3 (`:436`), que compara os dois | O guarda de remoção destrutiva compara o arquivo com ele mesmo: um `DROP` de tabela usada pelo front passa. E com o auto-merge do W34, entra sozinho |
| **E2E logado** | **0 sucessos em 7 dias.** Último executado (38815384490): 17 falhas, 4 flaky, **78 não rodaram**, 58 ok, 13 min | Causa fixa, não lentidão: a fixture insere mensagem com `sender:'contact'` e o trigger `guard_message_provenance_fields` (migration de 06/10) recusa → `HTTP 403 message_sender_forbidden` 16–22 vezes por run, retries e estouro do `--global-timeout` |
| **E2E logado — concorrência** | Grupo por SHA: runs 38818452494 e 38819239875 rodaram **ao mesmo tempo contra produção** | Um teardown apaga dados do outro; dois logins alimentam o rate limit do `auth-login` |
| **E2E logado — segurança** | `workflow_run` com `branches: [main]` compara o nome da branch: PR de **fork** com branch chamada `main` passa; checkout do código do fork com `E2E_TEST_*` | Confirmado pelo Scorecard (#40, critical). Traces públicos podem levar JWT do supervisor; usuário de teste com **50 sessões ativas** desde 05/10; senha vazada em 15/10 **não foi trocada** (`updated_at` 24/09) |
| **Settings Guard** | 29 ❌ / 29 em 7 dias. Próximo run (00:15 UTC) acusa 7×6 checks — a PR #1960 de outra sessão corrige o baseline | Além disso: `selected-actions` lido no endpoint errado (404 → ponto cego eterno), `merge.*` nunca lido nem com PAT, "restauração" é código morto |
| **Notificação de falha (WhatsApp)** | **Nunca disparou.** 3 dos 5 nomes vigiados não existem (`E2E Tests (Logado)`, `Contrato DB vivo`, `Database Migration`) e o secret `N8N_WEBHOOK_FALHA_MAIN` não existe | O E2E falhou 5× na `main` em 15/10 e ninguém foi avisado |
| **Deploy de edge** | Automático em todo push (desde 07/10), **sem revisor** e **sem check de edge obrigatório**: em `78b46da` o deploy publicou às 16:14 e o `deno check` da `main` rodou às 16:17 | Saúde pós-deploy volta 404 e só avisa (nunca falha); `rollback_to_last_success` reimplanta o SHA atual e fica verde |
| **Volume** | **1.012 runs em 7 dias; 844 em 28 h** (14/10: 303 na semana). Uma branch (`claude/charming-mccarthy-jbxy56`) gerou **414 runs com 96 pushes**; 98 runs de YAML inválido | A regra R6 (um push por lote) não está sendo cumprida por quem empurra |
| **Armazenamento** | Cache **6,54 GB** (era 3,03); artifacts 945 / 3,16 GB; **retenção 90 dias** ao vivo | O plano de 14/10 marcou a retenção de 14 dias como aplicada (W47): não está |
| **Code Scanning** | CodeQL 0 abertos; **Scorecard 13 abertos** (1 critical, 9 high) | O critical é real (fork no E2E); os 8 TokenPermissions apontam 4 workflows |
| **Segredos** | 15 no repo; 1 em environment. `DESTINO_URL`, `SUPABASE_ACCESS_TOKEN`, `CRON_SECRET`, chaves service_role externas seguem no repo; `producao-edge-functions` e `banco-leitura` vazios | Qualquer job que rode na `main` lê a credencial de escrita do banco; no `types-sync` ela fica exposta a `bun install` e a actions de terceiros |
| **SonarCloud** | Quality Gate ❌ em 4 commits seguidos da `main` (Security **E**, Reliability **D** em código novo) | Vermelho que ninguém trata esconde vermelho real |
| **Vercel** | `zapp_web_v2` (oficial, `zappweb.app.br`) **e** `zapp-web-v2-main` (duplicado) fazem build de **todo push de toda branch**; `zapp-web` parado desde 03/09 | Até ~358 builds em 28 h; metade é desperdício |
| **PRs** | #1922 e #1930 obsoletas, com conflito e **auto-merge ligado**; #1956–#1959 (Dependabot) fora da fila; #1957 vermelha por teste real; #1960 (baseline 7 checks) aguardando | A fila serial tenta a #1930 a cada push e recebe 422 |

**Incidente desta noite (registrado, já resolvido pela própria sessão):** o commit `a50d52a` (22:53 UTC) da branch
`claude/chore-codeql-required-baseline-261015-2241` substituiu o `CLAUDE.md` inteiro pela palavra "placeholder"
(+1/−637). A sessão corrigiu 11 min depois (`2d8eb47`) e a PR #1960 hoje altera só 15 linhas. Na `main` o arquivo nunca
foi afetado. Mostra o risco: sessão que cai no meio da escrita + auto-merge = `CLAUDE.md` apagado em produção (GA02).

---

## 1. O plano de 14/10 marcou como feito o que não está feito

Medido no código e ao vivo, não nos checkboxes. Cada linha volta a ser etapa deste plano.

| Etapa (14/10) | Marcada | Realidade medida em 15/10 | Substituída por |
|---|---|---|---|
| W06 | [~] "edge lenta + suíte maior que o job" | Causa principal é a fixture recusada pelo trigger (403), presente desde 06/10 | GA11, GA12 |
| W22 | [x] | No push só `migrations` e paridade ficam neutros; catálogo/manifesto/types não | GA24 |
| W23 | [x] | Run continua vermelho com `awaiting_apply`; supressão da issue vale para **qualquer** pendência | GA23 |
| W27 | [x] | `apply_all_missing` **não existe** (4 inputs); `docs/MIGRATIONS.md:494` manda usar; dispatch com ele dá 422 | GA13, GA14 |
| W31 | [x] | As 17 validações históricas seguem inline (`db-migrate.yml:323-854`), 858 linhas (meta < 500) | GA16 |
| W33 | [x] | Nenhum disparo de `types-sync` após o apply (grep vazio) | GA15 |
| W47 | [x] | `GET /actions/permissions/artifact-and-log-retention` → **90 dias** | GA79 |
| W51 | [x] | **16** passos `SKIP_DOCKER_SHIM` (meta ≤ 3; `CLAUDE.md` diz 15) | GA98 |
| W52 | [x] | Shard talkx 4 min 12 s; run 38814499753 4,4 min (meta < 3 min) | GA71 |
| W55 | [x] | Somado ao reuso R2, os contratos **nunca rodam** para mudanças em `db-migrate.yml`, `db-guard.yml`, `scripts/lib/`, `scripts/ci/deno.*` | GA65 |
| W57 | [x] | X034 ainda puxa `postgres:17-alpine` do Docker Hub e PostgREST do ECR por tag | GA67 |
| W65 | [x] | Management API responde 404 em todos os deploys; vira aviso; nunca falha | GA29 |
| W66 | [x] | Rollback escolhe o próprio SHA atual ("No change", verde) | GA30 |
| W69 | [x] | `CLAUDE.md:534-539`, `DEPLOYMENT.md`, template de PR ainda dizem "merge não deploya" | GA37 |
| W76 | [x] | Firefox/WebKit deslogados e `chromium-telefonia` não rodam em workflow nenhum | GA47 |
| W91 | [x] | `scripts/ci/issue-rotativa.mjs` não é importado por nenhum workflow (só pelo teste) | GA78 |
| W92 / W96 | [x] | Colunas prometidas não existem; `docs/ci/kpi.json` nunca é gerado (README com "—") | GA93 |
| W97 | [x] | Nunca disparou: nomes errados + secret inexistente | GA10, GA94 |
| E19 (01/10) | "confirmado" | Gate 3 compara o catálogo com ele mesmo | GA20 |

---

## 2. O que está certo e não deve ser mexido (medido hoje)

Pin por SHA resolvendo para o commit real da tag em 100 % dos `uses:`; `persist-credentials: false` em todos os
checkouts; nenhuma injeção de expressão `${{ }}` com dado não confiável em `run:`; reuso de árvore R2
(`reuso-arvore.mjs`) correto para `ci.yml` (compara árvore do squash com a do head, exige último run 100 % verde, erro
de API = roda tudo); suíte de unidade única (R3) com cobertura idêntica à rodada completa antiga; agregador
`Contrato DB offline` com `!cancelled()` exigindo os 3 shards; TLS `verify-full` com CA pinada e `DESTINO_URL` fora de
argv nos guardas vivos; retry de conexão em **uma** camada só (`LEDGER_RETRY_DELAYS_MS: ""`); hash do `db-migrate`
amarrando estado do banco + sha do arquivo + `github.sha`; `ref` só `main` em todo workflow de produção; redator de
relatório E2E abrindo ZIP embutido e aninhado e falhando fechado; `e2e_cleanup()` em produção com `SECURITY DEFINER`,
`search_path` fixo e checagem do uid; `auto-update-pr-branch` com grupo único e guarda contra fork; CodeQL reportando
em PR de Dependabot e de docs; Scorecard verde desde #1952; `render-workflow-docs --check` OK; 832/833 testes
`scripts/ci/*.unit.mjs` (a falha é de ambiente local).

---

## 3. As 100 etapas

### Fase 0 — Parar o sangramento (GA01–GA12)

- [ ] **GA01** · P0 · D ⚠️ · Revisar e mergear a #1960 (outra sessão: baseline e `CLAUDE.md` com 7 checks, `CodeQL`
  incluído) **antes do settings-guard das 00:15 UTC**. Sem ela, o guard comenta na #1943 a cada 6 h (o dedupe é de 6 h,
  igual ao cron). **Verificação:** `workflow_dispatch` do settings-guard → "branch protection: OK".
- [ ] **GA02** · P1 · C · Trava anti-apagão do `CLAUDE.md` no check `🔍 Lint & TypeCheck`: reprova se o arquivo perder
  as seções "Banco de dados OFICIAL", "Perímetro do GitHub" e "CI sem desperdício", ou encolher mais de 30 % numa PR.
  Motivo: commit `a50d52a` desta noite. **Verificação:** mutação (arquivo com "placeholder") → teste ❌.
- [ ] **GA03** · P1 · B+C · Completar o que a #1960 não cobre: (a) baseline com `checks: [{context, app_id}]` e guard
  comparando `app_id` (hoje compara só o nome: trocar o `CodeQL` para "qualquer app" passa); (b) `codeql.yml:6-10` e
  `:90-92` ("não é required"); (c) `CONTRIBUTING.md:51` e `docs/ci/README.md:158` ("6 checks"); (d)
  `auto-update-pr-branch.yml:29-33` acordar também ao fim do workflow `CodeQL`. **Verificação:** caso novo em
  `fila-merge.unit.mjs` com `CodeQL` em FAILURE → PR `bloqueada`; `render-workflow-docs.mjs --check`.
- [ ] **GA04** · P0 · C · `db-migrate` volta a aplicar: as mensagens de `validate-runtime-proof.mjs:599` e
  `run-runtime-contract.mjs:198` vão para **stderr** (ou o hash vai para `$GITHUB_OUTPUT`). **Verificação:** teste que
  exige stdout `^[a-f0-9]{64}\n$` no contrato genérico e stdout só-JSON com `.expect.json`.
- [ ] **GA05** · P1 · C · `verify-ledger-statements.mjs:98`: normalizar o lado do ledger com
  `ledger.flatMap(splitStatements)` (o CLI grava o cabeçalho `--`). Fixture tirada da linha real de `20261004195051`.
  **Verificação:** o caso do run 37355980323 passa; arquivo diferente continua reprovando.
- [ ] **GA06** · P0 · A · Disparar `types-sync` por `workflow_dispatch` para absorver `e2e_cleanup` em
  catálogo/manifesto/types/grants **antes do agendado das 06:13 UTC**. **Verificação:** PR de sync aberta; dispatch do
  `db-live-guard` vermelho só na `20261009190000`.
- [ ] **GA07** · P0 · D ⚠️ · Aplicar o lote pendente (`20261009190000`, e a de GA11 se já mergeada) **pelo
  `db-migrate.yml`**, depois de GA04/GA05: dry-run → aprovação do Joaquim em `producao-ddl` → apply. Nunca por MCP.
  **Verificação:** ledger = arquivos (817 = 817), md5 da lista igual.
- [ ] **GA08** · P1 · B · `e2e-logado.yml`: `if:` no **job** — `workflow_dispatch` **ou** (`workflow_run.conclusion ==
  'success'` **e** `workflow_run.event == 'push'` **e** `head_repository.full_name == github.repository`). Fecha o fork
  com branch `main` (Scorecard #40) e o passo "Pular se CI falhou" que não pula nada (`:87-95`). **Verificação:**
  contrato do YAML exigindo as 3 condições; mutação → ❌.
- [ ] **GA09** · P1 · B · `e2e-logado.yml:46-51`: concurrency com grupo **fixo** `e2e-logado`,
  `cancel-in-progress: false` (fica só o pendente mais novo). Corrigir o comentário `:49`. **Verificação:** nunca mais de
  1 run `in_progress` (API de runs, 48 h).
- [ ] **GA10** · P0 · B+C · `notifica-falha-main.yml:15-18`: nomes reais (`E2E logado`, `DB Live Guard`,
  `DB Migrate (production)`) + `CI/CD Pipeline` + `types-sync`. Contrato: todo item de `workflow_run.workflows` existe
  como `name:` em `.github/workflows/*.yml`. **Verificação:** mutação (renomear um workflow) → ❌.
- [ ] **GA11** · P0 · C ⚠️ · Fixture E2E sem violar o trigger de proveniência: RPC `e2e_fixture_message(op)`
  `SECURITY DEFINER`, restrita ao uid do usuário E2E e ao contato fixo (mesmo padrão da `e2e_cleanup`), que insere e
  apaga a mensagem `[E2E fixture setup]`; `e2e/fixtures/e2e-contact.ts:105-118` passa a chamá-la. DDL entra no lote
  (GA07). **Verificação:** run sem `message_sender_forbidden`.
- [ ] **GA12** · P1 · B+C · Orçamento da suíte logada: Chromium logado num job, Firefox/WebKit logados em outro (matriz),
  cada um com `--global-timeout` próprio; `did not run > 0` vira falha explícita "orçamento estourado" na issue.
  **Verificação:** run com `did not run = 0` e duração < timeout em cada job.

### Fase 1 — Lote diário de banco de ponta a ponta (GA13–GA26)

- [ ] **GA13** · P1 · B · `db-migrate.yml` em 2 jobs: `preflight` (sem environment: dry-run, plano, hash) e `apply`
  (`environment: producao-ddl`, só quando `apply=true`). Hoje até o dry-run espera aprovação (`:74`).
  **Verificação:** dry-run conclui sem `Waiting`.
- [ ] **GA14** · P1 · B+C · Input `apply_all_missing` de verdade: aplica todas as versions locais ausentes do ledger, em
  ordem; hash sobre a lista ordenada + sha de cada arquivo + `github.sha`; liga `avaliarPlanoDoDryRunApplyAll`
  (`dry-run-plan.mjs:125`, hoje nunca chamada). Remove os 3 bundles fixos (`:200-221`). **Verificação:** lote com 2
  migrations aplica sem editar o YAML; fixture com migration que entrou depois do dry-run → recusa.
- [ ] **GA15** · P1 · B · W33 de verdade: último passo do `apply` (só com sucesso) dispara `types-sync` e
  `db-live-guard` (`gh workflow run … --ref main`, `actions: write` só nesse job). **Verificação:** apply → PR de sync
  em < 10 min → guarda vivo verde no mesmo dia.
- [ ] **GA16** · P2 · C · W31 de verdade: as 17 validações pós-apply de versions históricas (`:323-854`) vão para
  `scripts/db-audit/contracts/`; YAML < 500 linhas. **Verificação:** `wc -l`; contratos históricos continuam rodando.
- [ ] **GA17** · P2 · C ⚠️ · Portão de migration destrutiva no `preflight`: o `sql-lexer` lista
  `DROP`/`REVOKE`/`TRUNCATE`/`DELETE`/`ALTER … DROP`; apply exige input `confirm_destructive=<version>` e registra no Job
  Summary (hoje o único portão é o revisor, que é a mesma conta que dispara). **Verificação:** fixture com `DROP TABLE`
  sem confirmação → recusa.
- [ ] **GA18** · P3 · C · `run-runtime-contract.mjs`: `-f x.sql` escrito no texto do contrato (até em comentário) executa
  outro arquivo (`:148`); hash calculado e descartado (`:203-213`). **Verificação:** fixture com `-f` em comentário →
  ignorado.
- [ ] **GA19** · P1 · C · Código de saída exclusivo para "só apply pendente" (ex.: 3) em `check-migration-drift.mjs`,
  `lote-pendente.mjs`, `db-live-guard.yml:171` e `types-sync.yml:396`; 2 volta a ser só erro. Hoje uma falha de
  autenticação no ledger vira "apply aguardado" e **verde** (reproduzido). Teste real de `lote-pendente.mjs` (o atual
  reimplementa a lógica). **Verificação:** psql falso falhando → rc ∉ {0, 3}.
- [ ] **GA20** · P1 · B+C · Gate 3 do `types-sync`: catálogo antigo vem de `git show HEAD:supabase/schema-catalog.json`.
  **Verificação:** contrato proíbe que o 1º argumento seja arquivo sobrescrito antes; fixture com remoção consumida → ❌.
- [ ] **GA21** · P1 · B · `DESTINO_URL` nunca no `GITHUB_ENV` (`types-sync.yml:175`): job `ler-banco` (credencial, sem
  `bun install`) gera os artefatos; job `gates-e-pr` (sem credencial) roda tsc, gates e abre a PR. **Verificação:**
  `env | grep -c DESTINO` = 0 no job dos gates.
- [ ] **GA22** · P1 · B+C · Auto-merge da PR de sync só quando `grants_changed=false` **e** todo objeto novo/alterado é
  explicado por versions do ledger posteriores ao último sync; senão label `needs-human`, sem auto-merge. Corpo da PR
  (`:612`) coerente com isso. Hoje DDL feito por fora é "legalizado" sozinho. **Verificação:** fixture com grant sem
  version → PR sem auto-merge.
- [ ] **GA23** · P2 · B · Com apply pendente: `types-sync` não abre PR (evita reverter o lote) e termina verde; a
  supressão da issue do Gate 1 vale só para objetos das versions pendentes e por até 24 h. **Verificação:** fixture com
  erro de tsc fora das versions pendentes → issue aberta.
- [ ] **GA24** · P2 · B · `db-live-guard` no push: diferença de catálogo/manifesto/types neutra só quando os objetos
  divergentes vêm das versions pendentes; estado explícito "sync pendente" entre apply e merge do sync.
  **Verificação:** lote com `types.ts` local não abre issue no push.
- [ ] **GA25** · P1 · C+B · Detector de DDL fora do fluxo: toda version nova no ledger precisa de um Deployment
  `producao-ddl` registrado pelo `db-migrate` (o job `apply` passa a registrar); o guarda vivo acusa version sem
  Deployment desde 16/10. Motivo: `20261015200000` aplicada por fora em 15/10 (2º caso). **Verificação:** fixture de
  version sem Deployment → issue.
- [ ] **GA26** · P2 · C + D ⚠️ · Portar para a `main` o que a #1930 tem de único (tabela `version | disco | ledger |
  classe` e `--json`) e então o Joaquim fecha a #1930 e a #1922 (de outras sessões; conteúdo já na `main`; ambas com
  conflito e auto-merge ligado, e a #1930 faria apply pendente sair 0). **Verificação:** 0 PRs `dirty` com auto-merge.

### Fase 2 — Deploy de edge com portão de verdade (GA27–GA37)

- [ ] **GA27** · P1 · B · `deploy-functions.yml`: `deno check` + `deno test` de `supabase/functions` (com
  `scripts/ci/deno.json --frozen`) **antes** do passo Deploy. Hoje nenhum check obrigatório testa edge e o deploy sai
  antes do CI da `main`. **Verificação:** função com erro de tipo → deploy não acontece.
- [ ] **GA28** · P2 · A+C ⚠️ · Tornar `🦕 Edge contracts & Go` obrigatório depois de 7 dias verde (baseline + tabela do
  `CLAUDE.md` no mesmo PR). **Verificação:** branch protection com o check; settings-guard OK.
- [ ] **GA29** · P1 · C · `health-check.mjs`: endpoint e método documentados da Management API para logs de função
  (hoje POST em `logs.all` → 404 em todo deploy); 4xx = `::error::`, só 5xx/timeout = aviso. **Verificação:** log do
  run com "invocações: N | taxa".
- [ ] **GA30** · P1 · B+C · `rollback_to_last_success` escolhe o último `success` com `deployed_sha` **diferente** do
  publicado agora e recusa se não houver; grupo de concorrência próprio (push não cancela rollback). Doc: rollback com
  migration aplicada exige PR de revert. **Verificação:** fixture com o `success` mais recente = SHA atual → escolhe o
  anterior.
- [ ] **GA31** · P2 · C · Antes do deploy, comparar os nomes lidos por `Deno.env.get` (58, menos os `SUPABASE_*` da
  plataforma) com `secrets-list.json` remoto; falhar se faltar. **Verificação:** fixture com secret ausente → ❌.
- [ ] **GA32** · P3 · B · Credenciais fora da linha de comando: `secrets set` por `--env-file` (arquivo 600),
  `curl -H @arquivo` (`deploy-functions.yml:315,339-424`) e `--db-url` do `db-migrate.yml:283,294`. **Verificação:**
  grep sem valor de secret em argv.
- [ ] **GA33** · P3 · B · Smoke do CRM e do catálogo externos (`:320-389`) só bloqueia funções que dependem deles;
  hoje um 5xx externo aborta o deploy das 80. **Verificação:** fixture com CRM 503 → demais funções publicam.
- [ ] **GA34** · P3 · B · Capturar o manifesto remoto com `if: ${{ !cancelled() }}` (`:487`) e listar no erro quais
  funções subiram num deploy parcial. **Verificação:** falha simulada no meio deixa evidência.
- [ ] **GA35** · P3 · B · `paths-ignore` cobrir `**/__fixtures__/**` (a pasta real é `_shared/__fixtures__`).
- [ ] **GA36** · P2 · D ⚠️ · Decidir se `producao-edge-functions` exige aprovação. Recomendação: **manter automático**
  com os portões GA27/GA28 (velocidade); exigir clique a cada deploy é mais seguro e mais lento.
- [ ] **GA37** · P2 · C · Documentação do comportamento real: `CLAUDE.md:534-539` e `:322-327`, `docs/DEPLOYMENT.md:56,
  81-88, 139-147`, `.github/PULL_REQUEST_TEMPLATE.md:40`, cabeçalho `db-migrate.yml:18-28` (manda DDL por MCP, contra a
  seção 0). **Verificação:** teste de documento que proíbe "merge não deploya".

### Fase 3 — E2E logado verde e seguro (GA38–GA48)

- [ ] **GA38** · P1 · C · Redator cobre JWT (`eyJ[\w-]+\.[\w-]+\.[\w-]+`), `access_token`/`refresh_token` e cabeçalho
  `Authorization`, ou exclui `data/*.zip` dos traces logados; `contarRestantes` estendido. **Verificação:** fixture de
  trace com Bearer → redigido; upload recusado se sobrar.
- [ ] **GA39** · P1 · B · Teardown faz `POST /auth/v1/logout?scope=global` (depois de GA09, para não derrubar run
  paralelo). **Verificação:** `auth.sessions` do usuário E2E estável entre runs.
- [ ] **GA40** · P1 · D ⚠️ · Revogar as 50 sessões e refresh tokens acumulados do usuário E2E (escrita em `auth` de
  produção; sem impacto em cliente). **Verificação:** `SELECT count(*)` = 0 antes do próximo run.
- [ ] **GA41** · P1 · D ⚠️ · Trocar `E2E_TEST_PASSWORD` (vazou em artifacts públicos em 15/10; `updated_at` 24/09) e
  decidir `E2E_PADRAO_EMAIL`/`E2E_PADRAO_PASSWORD` (criadas 21:57, usadas por nada): usar ou apagar.
- [ ] **GA42** · P2 · C · Alertas do E2E: fechar por prefixo `[e2e-logado]` (o título de login não fecha nunca —
  #1946); marcador ignora `.playwright-artifacts-*` e tira `-retryN` (#1915 contou diretórios como testes).
  **Verificação:** #1946 fecha sozinha no próximo verde; 2 runs iguais → 1 comentário.
- [ ] **GA43** · P3 · B · Teardown robusto (`:222-252`): corpo por `jq -n --arg` via stdin (senha fora do argv e
  imune a `"`), `|| ACCESS_TOKEN=""` para o ramo "login falhou" existir, `::warning::` em toda falha.
- [ ] **GA44** · P3 · B+C · W77 de verdade: ler `error-context.md` **depois** do redator (hoje procura arquivos que o
  Playwright não grava); dispatch fora da `main` não roda teardown nem abre alerta.
- [ ] **GA45** · P2 · C · Triagem das falhas que sobrarem após GA11 (ex.: `color-contrast (serious)` no inbox): cada
  spec corrigida ou em quarentena com prazo (`check-quarantine.mjs`). **Verificação:** run verde na `main`.
- [ ] **GA46** · P2 · C · Scorecard #40 (DangerousWorkflow) após GA08: dispensar com justificativa registrada no YAML e
  no alerta. **Verificação:** 0 critical abertos.
- [ ] **GA47** · P2 · B+C · Projetos Playwright órfãos: `chromium-telefonia` no `ci.yml:660`; os 4 Firefox/WebKit
  deslogados num job próprio ou apagados; contrato inverso em `ci-e2e-projects.unit.mjs` (todo projeto roda em algum
  workflow ou está em allowlist com prazo); renomear o passo "Install Playwright (Chromium, Firefox, WebKit)" que só
  instala Chromium.
- [ ] **GA48** · P3 · D · Reavaliar Supabase local para a suíte logada (W79) **só depois** de GA11/GA12 medidos.
  Recomendação: não agora.

### Fase 4 — Fila de merge, PRs e disciplina de push (GA49–GA58)

- [ ] **GA49** · P1 · C · `fila-merge.mjs:40-70`: PR em dia com todos os checks obrigatórios COMPLETED e algum ≠
  success vira `bloqueada` (hoje `CANCELLED`/ausente = pendente eterno); teto de 45 min sem check em andamento; laço de
  aprovação (`auto-update-pr-branch.yml:179-187`) repete até a contagem de runs estabilizar. **Verificação:** casos
  novos em `fila-merge.unit.mjs`.
- [ ] **GA50** · P3 · C · `mergeable` no `gh pr list`: `CONFLICTING` = fora (hoje a #1930 é escolhida a cada push e
  devolve 422); resumo lista as PRs "fora" com auto-merge ligado. **Verificação:** run sem 422.
- [ ] **GA51** · P2 · B · Medir e corrigir: merge por auto-merge do `GITHUB_TOKEN` não dispara workflows de push
  (anti-loop) → após o merge das PRs de automação, `workflow_dispatch` do `db-live-guard` e do `auto-update`.
  **Verificação:** issue do guarda vivo fecha no mesmo dia do sync.
- [ ] **GA52** · P2 · D · Política do Dependabot: auto-merge quando verde para `actions-misc` e `codeql-action`;
  `deps-semanal` (43 updates) segue manual. Recomendação: sim nesses termos.
- [ ] **GA53** · P2 · C · #1957: corrigir `ChatPopup.rolagem-mensagem-nova` (quebra real após o bump de dependências).
- [ ] **GA54** · P2 · C · R6 com dente: o KPI diário acusa branch com > 15 pushes em 24 h e comenta na PR pedindo lote
  (15/10: 96 pushes numa branch → 414 runs). **Verificação:** fixture com 20 heads → alerta.
- [ ] **GA55** · P2 · C · Contrato R2 exige `!cancelled()` no `if` de todo job com `needs: reuso` (sem ele, o job é
  pulado em toda PR e o check sai verde); corrigir o texto da R2 no `CLAUDE.md`. **Verificação:** mutação → ❌.
- [ ] **GA56** · P3 · B · Shard de unidade com `timeout 11m` interno (sai com erro antes do teto do job; evita
  `cancelled` virar `skipped` no agregador) e nome do check sem `${{ matrix.shard }}` literal quando pulado.
- [ ] **GA57** · P3 · B · Check do corpo de PR Talk X lê título/corpo em tempo de execução pela API e o gatilho inclui
  `edited` (hoje corrigir o corpo exige push novo, contra a R6).
- [ ] **GA58** · P3 · B · `ci.yml:43-48`: concurrency de push na `main` por SHA (ou comentário honesto) e
  `workflow_dispatch` fora do grupo do push.

### Fase 5 — SAST e limpeza do CI de PR (GA59–GA64)

- [ ] **GA59** · P2 · B ⚠️ · O check `CodeQL` fecha com a 1ª análise que chega (a de `actions`, ~20 s antes da JS/TS):
  `analyze-actions: needs: analyze` e exigir também `🔬 CodeQL (javascript-typescript)` (baseline no mesmo PR).
  **Verificação:** PR de teste com alerta proposital é barrada.
- [ ] **GA60** · P3 · B · Limpezas do `ci.yml`: remover o ignore obsoleto de `.github/actionlint.yaml:6-8` (escondeu o
  YAML inválido do branch-hygiene) e os secrets `VITE_SUPABASE_*` sem uso no job `build` (`:481-486`).
- [ ] **GA61** · P3 · B · `types-sync`: `paths-ignore` de `known-violations.json` (o merge do sync redispara o
  workflow), grupo de concorrência separado para dispatch e push, veredito com `!cancelled()` em vez de `always()` (R5).
- [ ] **GA62** · P3 · B · CodeQL agendado diário (hoje semanal e não roda em push na `main`; estado dos alertas da
  branch padrão atrasa até 7 dias).
- [ ] **GA63** · P2 · B+C · Triagem do Scorecard: #41–#48 (TokenPermissions em auto-update, types-sync,
  talkx-status-regen, deploy-functions) com escrita só no job que precisa; #51 (CodeReview) dispensado com
  justificativa (sem revisão obrigatória por decisão registrada). **Verificação:** ≤ 2 alertas abertos, todos com dono.
- [ ] **GA64** · P2 · B · `branch-hygiene-audit.yml:162-190`: publicar a issue com `if: ${{ !cancelled() }}` e o SLA
  como último passo; SLA conta só CodeQL ou alertas não dispensados (em 29/10 vencem os 13 do Scorecard e o job ficaria
  vermelho toda semana sem publicar).

### Fase 6 — `db-guard` (GA65–GA74)

- [ ] **GA65** · P1 · B+C · Filtro W55 por exclusão: só pula quando **todos** os arquivos são docs (`^docs/`, `\.md$`);
  o job marca "contratos pulados" e `reuso-arvore.mjs` não reusa run com contratos pulados. Hoje mudanças em
  `db-migrate.yml`, `db-guard.yml`, `scripts/lib/`, `scripts/ci/deno.*` nunca rodam os contratos (PR pula, `main`
  reusa). **Verificação:** PR que altera só o heredoc do `db-migrate.yml` executa R2-INF-005.
- [ ] **GA66** · P2 · C · `docker-shim:144`: `$(< file 2>/dev/null || true)` devolve sempre vazio → `rm` emite
  `DROP ROLE` para todos os roles (880 erros no log do job 116695653090); `run` sai 0 com `CREATE DATABASE` falho.
  Corrigir os dois e acrescentar asserts no `docker-shim.test.sh`.
- [ ] **GA67** · P2 · B+C · Imagens pinadas injetadas nos passos com SKIP (`TALKX_ENGINE_PROVIDER_PG_IMAGE`,
  `…_PGRST_IMAGE`, `CATALOG_TEST_POSTGRES_IMAGE`); trocar `postgres:17-alpine` fixo por `${POSTGRES_TEST_IMAGE:?}`;
  contrato reprova imagem sem `@sha256` em `scripts/db-audit`. **Verificação:** log do X034 sem Docker Hub nem ECR.
- [ ] **GA68** · P2 · B · Guarda de imutabilidade e W55 com > 3.000 arquivos: falhar fechado ou usar
  `git diff --name-status base...head` (a API corta justamente `supabase/`, que vem por último).
- [ ] **GA69** · P3 · B · Exceção de `migration-evidence.json` lida do `baseSha`, não do checkout da PR (`:193`).
- [ ] **GA70** · P3 · C · Shim exporta o nome do banco; testes voltam a afirmar `proof.database` contra
  `EXPECTED_DB` (o #1942 removeu a asserção e o validador de produção ainda exige `postgres`).
- [ ] **GA71** · P3 · B · Custo dos shards: tirar `src/` e `tests/` do filtro (nenhum contrato lê), `Setup Bun`/
  `bun install` dos shards talkx/multiplix e `Setup Deno` do multiplix; uma chave de cache por shard; testes sem docker
  fora do `SKIP_CONTRACTS`. **Verificação:** wall-clock do run < 3 min (meta do W52).
- [ ] **GA72** · P3 · B · `--health-cmd "pg_isready -U postgres"` (hoje `FATAL: role "root"` a cada 5 s, 47 linhas
  por job poluindo o resumo de falha).
- [ ] **GA73** · P3 · C · `check-test-inventory.mjs:93-96` conta só blocos `run:` (menção em comentário não vale) e
  checa o sentido inverso (YAML apontando arquivo inexistente).
- [ ] **GA74** · P3 · C · `retry-disposable-postgres-test.sh:139-145` transmite o log em tempo real (`tee`); remover o
  fallback ghcr→ECR morto (`${imagem%%@*}` puxa `:latest`).

### Fase 7 — Perímetro, segredos e supply chain (GA75–GA88)

- [ ] **GA75** · P1 · C · `github-settings-guard.mjs:271`: endpoint correto `/actions/permissions/selected-actions`
  (hoje 404 → ponto cego eterno; o mock do teste congela o erro); normalizar o sufixo `@*`; alinhar baseline e
  `scripts/ci/allowed-actions.json` (tirar `step-security/harden-runner`, que passa no check de pins e morreria com
  `startup_failure`). **Verificação:** run do guard com "selected actions: OK".
- [ ] **GA76** · P1 · C · `merge.*` e `security_and_analysis` lidos por GraphQL (`autoMergeAllowed`,
  `squashMergeAllowed`…); o que não for legível é declarado ponto cego (hoje o `return` antecipado `:229-231` pula o
  bloco de segurança calado). Tabela do `CLAUDE.md` sem "verificado por" falso.
- [ ] **GA77** · P2 · C · Remover a "restauração" do guard (código morto: `GITHUB_TOKEN` não escreve; se escrevesse,
  mandaria `contexts` legado e perderia o `app_id`) e corrigir o `CLAUDE.md` ("é ela que o settings-guard restaura").
- [ ] **GA78** · P2 · C · Uma rotina de issue de alerta para todos: `issue-rotativa.mjs` usado por settings-guard,
  db-live-guard, types-sync e e2e-logado (remover as cópias inline); rotacionada fecha como `not_planned`; types-sync
  fecha a própria issue ao voltar a verde; marcador `<!-- falhas: -->` que não quebra em vírgula (#1912).
- [ ] **GA79** · P2 · A · Retenção de artifacts e logs 90 → 14 dias (o W47 não pegou ou regrediu) + campo no baseline
  conferido pelo guard. **Verificação:** `GET …/artifact-and-log-retention` = 14.
- [ ] **GA80** · P1 · C ⚠️ · Perímetro só por script versionado: `scripts/ci/aplicar-perimetro.mjs` aplica o baseline
  (dry-run por padrão, `checks` com `app_id`); `CLAUDE.md` proíbe PATCH manual. Motivo: o `strict` regrediu 4 vezes e o
  `CodeQL` entrou às ~22:11 por API sem baseline. **Verificação:** dry-run sem diferença contra o vivo.
- [ ] **GA81** · P1 · D ⚠️ · Mover os **valores** dos secrets para os environments (W62/W63): `DESTINO_URL` →
  `banco-leitura`/`producao-ddl`; `SUPABASE_ACCESS_TOKEN`, `CRON_SECRET`, `EXTERNAL_`/`PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY`
  → `producao-edge-functions`; depois apagar do repo. Roteiro: `docs/runbooks/migracao-segredos-environments.md`.
- [ ] **GA82** · P2 · D ⚠️ · Role `ci_readonly` + `DESTINO_URL_RO` para os guardas (W64), depois de GA81.
- [ ] **GA83** · P1 · D ⚠️ · Tokens: (a) recriar o `SETTINGS_GUARD_TOKEN` com origem e escopo conhecidos, rotação 90 d
  (W11); (b) o token de escrita usado pelos agentes tem escopos administrativos amplos (`admin:org`, `admin:repo_hook`,
  `delete:packages`, `workflow`…) — qualquer sessão muda branch protection sem PR. Recomendação: token fino por repo
  para o dia a dia e token administrativo só para o `aplicar-perimetro` (GA80).
- [ ] **GA84** · P2 · D ⚠️ · Bots (W90): remover ECC Tools (24 comentários numa PR de 1 arquivo), Greptile (trial
  expirado), CodeRabbit, Devin, cubic, Mermaid; manter Codex, SonarCloud, Vercel e Claude.
- [ ] **GA85** · P3 · D ⚠️ · Desinstalar o app "Supabase for GitHub" (W89): o check `Supabase Preview` sai `skipped` em
  todo commit.
- [ ] **GA86** · P2 · C · SonarCloud vermelho em 4 commits seguidos da `main` (Security E, Reliability D em código novo,
  05826d1..c181d1b): corrigir os achados reais ou registrar falso positivo; a `main` volta a ✅.
- [ ] **GA87** · P2 · B+C · Go alinhado: `toolchain.json`, `go-version` do `ci.yml:298`, `go.mod` e Dockerfile do
  egress-proxy na mesma versão; `docker build` (sem push) da imagem no CI; contrato "tag do Dockerfile == toolchain".
  Decide a #1956 (golang 1.24 → 1.27 sem a imagem ser construída em lugar nenhum).
- [ ] **GA88** · P3 · C · `dependabot.yml`: majors em grupo próprio (a #1958 mistura dependency-review v4→v5),
  `scorecard-action` no grupo de actions, grupos para `gomod`/`docker`; `toolchain.json` sem chaves duplicadas
  (`actionlint`/`actionlint-version`, `zizmor`/`zizmor-version`); `bump-toolchain.mjs` sem a chave `playwright`
  inexistente e cobrindo go/zizmor/shellcheck.

### Fase 8 — Custo, observabilidade, notificação e documentação (GA89–GA100)

- [ ] **GA89** · P2 · B+A · Cache 6,54 GB → < 3 GB: cache do Playwright salvo só em push na `main` e restaurado nas PRs
  (hoje 9 caches presos a `refs/pull/N/merge`, ~2,6 GB); apagar o overlay CodeQL 2.27.1 parado desde 09/10 (363 MB).
- [ ] **GA90** · P3 · B · Artifacts 3,16 GB: `playwright-report-logado` (até 257 MB) só em falha e por 3 dias;
  `edge-deployment-evidence` (644) com `retention-days` explícito (o Deployment do GitHub já é o registro).
- [ ] **GA91** · P2 · D+E ⚠️ · Vercel (W67): desconectar `zapp-web-v2-main` do Git (duplica todo build de toda branch)
  e arquivar `zapp-web` (parado desde 03/09). Oficial: `zapp_web_v2` (`zappweb.app.br`).
- [ ] **GA92** · P1 · C · `actions-kpi.mjs:173-193` faz 1 GET por run (1.014 em 7 d) e estoura o limite de 1.000/h do
  `GITHUB_TOKEN` → o branch-hygiene de segunda (19/10) aborta. Coletar jobs só de runs com falha ou amostra; passo com
  `continue-on-error`. **Verificação:** fixture com 1.500 runs → < 300 chamadas.
- [ ] **GA93** · P3 · C · KPI de verdade (W92/W96): `actions-kpi` grava `docs/ci/kpi.json` (cancelado antes de começar,
  minutos desperdiçados, p50/p95, causa) e o `render-workflow-docs` lê; README sem "—".
- [ ] **GA94** · P1 · D+B ⚠️ · Criar o webhook no N8N e o secret `N8N_WEBHOOK_FALHA_MAIN`; enquanto não existir, o
  notifica **falha** em `workflow_run` em vez de sair verde ("não configurado"). **Verificação:** 1 falha forçada → 1
  mensagem no WhatsApp.
- [ ] **GA95** · P3 · B · Notifica: `RUN_URL` de `workflow_run.html_url` (hoje sai malformada), `startup_failure`
  também notifica (foi a falha do branch-hygiene em 15/10), payload montado com `jq`.
- [ ] **GA96** · P3 · B · `talkx-status-regen.yml`: filtro `paths:`, `fetch-depth: 1`, `timeout-minutes`, escrita só no
  passo da PR (21 runs desde 13/10, todos sem mudança), corpo da PR coerente com o auto-merge.
- [ ] **GA97** · P3 · C · `CODEOWNERS:11` ("todas as mudanças requerem aprovação") e `PULL_REQUEST_TEMPLATE.md:39-40`
  ("registro no ledger", "merge não deploya") alinhados à seção 0 do `CLAUDE.md`.
- [ ] **GA98** · P3 · C · Documentação sincronizada com o vivo: agendamentos no `CLAUDE.md` (faltam auto-update
  `7,37 * * * *` = 48/dia e scorecard), 16 passos `SKIP_DOCKER_SHIM` (falta `talkx-current-template-version`),
  retenção, comentários mortos do `db-guard.yml` (`:277, :348, :505, :580, :1075, :1150, :1216, :1232, :1376`) e do
  `db-live-guard.yml` (`:33-36, :49-51, :377`), `lote-pendente.mjs:57`; `render-workflow-docs.mjs:89` lendo itens
  `nao-e-bug` de várias linhas.
- [ ] **GA99** · P2 · C · Contrato anti-regressão deste plano em `workflow-contracts.unit.mjs`: nomes do notifica
  existem; `e2e-logado` com o `if` de GA08 e grupo fixo; Gate 3 sem arquivo sobrescrito; stdout do hash limpo;
  `DESTINO_URL` fora do `GITHUB_ENV`; `!cancelled()` com `needs: reuso`; nenhuma imagem sem digest.
- [ ] **GA100** · P3 · C · Adoção: `CLAUDE.md` "Plano vigente" aponta para este arquivo; no plano de 14/10, as etapas da
  seção 1 voltam a `[ ]` com o link da GA que as substitui; `ci-docs-baseline.unit.mjs` passa a cobrir este plano.

---

## 4. Ordem de execução

Cada lote = **um push validado** (R6). Toda PR de CI fica aberta para o Joaquim mergear (regra 8), exceto o que ele
liberar.

| Quando | Lote | Etapas | Resultado esperado |
|---|---|---|---|
| Agora (antes das 00:15 e 06:13 UTC) | 0 | GA01, GA06 | settings-guard e guarda vivo sem alarme falso |
| Dia 1 | 1 | GA02–GA05, GA08–GA10, GA19, GA20 | `db-migrate` aplica de novo; E2E sem fork e sem run paralelo; WhatsApp liga; Gate 3 protege |
| Dia 1 (DDL) | 2 | GA11 → GA07 | lote de banco em dia; fixture E2E válida |
| Dia 2 | 3 | GA12, GA38, GA39, GA42–GA44, GA47 | E2E logado verde, sem token em artifact |
| Dia 2–3 | 4 | GA13–GA18, GA21–GA25 | lote diário de ponta a ponta sem editar YAML; DDL por fora detectado |
| Dia 3 | 5 | GA27, GA29–GA35, GA37 | deploy de edge só com código que compila e testa |
| Dia 4 | 6 | GA49–GA51, GA53–GA61 | fila não trava; CI de PR honesto |
| Dia 4 | 7 | GA62–GA74 | Scorecard triado; db-guard sem ponto cego e < 3 min |
| Dia 5 | 8 | GA75–GA80, GA86–GA88 | perímetro verificável e só por script |
| Dia 5 | 9 | GA89, GA90, GA92, GA93, GA95–GA99 | custo e ruído na metade; docs = realidade |
| Fim | — | GA100 | plano adotado |

**Decisões do Joaquim em paralelo:** GA01, GA07, GA26, GA28, GA36, GA40, GA41, GA48, GA52, GA59 (check novo), GA81–GA85,
GA91, GA94.

**Dependências duras:** GA04 e GA05 antes de GA07; GA11 antes de GA07 (mesmo lote de DDL); GA09 antes de GA39; GA08 antes
de GA46; GA13 antes de GA14/GA15/GA17; GA19 antes de GA23/GA24; GA14 antes de GA25; GA01 antes de GA03; GA81 antes de
GA82; GA80 depois de GA03 e GA75; GA99 depois das fases 0–6; GA100 por último.

---

## 5. Decisões que só o Joaquim toma (com recomendação)

| Etapa | O que decide | Recomendação | Risco de não decidir |
|---|---|---|---|
| GA01 | Mergear a #1960 | Sim, agora | Alarme falso a cada 6 h na issue do guard |
| GA07 | Aprovar o apply do lote em `producao-ddl` | Sim, logo após GA04/GA05 | Correção do Talk X parada; agentes voltam a aplicar DDL por fora |
| GA41 | Trocar a senha do usuário de teste | Sim, hoje (2 min) | Senha que vazou em artifact público continua válida |
| GA40 | Revogar 50 sessões do usuário de teste | Sim (nenhum cliente afetado) | Token antigo vazado continua válido |
| GA36 | Deploy de edge exigir clique | Manter automático + portões GA27/GA28 | Sem os portões, código quebrado vai direto ao ar |
| GA28 / GA59 | Novos checks obrigatórios (edge; CodeQL JS/TS) | Sim, após 7 dias verdes | PR mergeia sem teste de edge e sem SAST completo |
| GA81–GA83 | Segredos em environments, role só-leitura, tokens | Sim, nessa ordem | Qualquer job na `main` lê a credencial de escrita do banco; qualquer sessão muda o perímetro |
| GA84 / GA85 | Bots e app da Supabase | Ficar com Codex, Sonar, Vercel, Claude | ~70 % dos comentários de PR são ruído |
| GA91 | Projetos Vercel | Desconectar `zapp-web-v2-main`, arquivar `zapp-web` | Builds em dobro (custo por time na Vercel) |
| GA94 | Webhook do N8N para falha da `main` | Sim | `main` quebra e ninguém é avisado |
| GA52 | Auto-merge do Dependabot | Sim para actions/CodeQL; não para o grupo de 43 libs | PRs de segurança paradas na fila |
| GA26 | Fechar #1922 e #1930 | Sim, depois de portar o `--json` | A fila tenta a #1930 a cada push |
| GA48 | Supabase local para E2E | Não agora | — |

---

## 6. Fora do escopo (anotado, não entra nas 100)

- `pg_cron` com `VACUUM FULL ANALYZE public.messages` agendado para todo 2 de setembro (`20 3 2 9 *`), sobra do
  expurgo — banco, não workflow.
- Etapa W16 (validity checks do secret scanning) continua bloqueada por plano pago.

## 7. Anexo — como foi medido (reprodutível, tudo só leitura)

- Workflows: leitura integral dos 17 arquivos; `actionlint` 1.7.7 local; `node --test scripts/ci/*.unit.mjs`
  (832/833), testes de `scripts/db-audit/` ligados (≈ 400), `docker-shim.test.sh` (17/17),
  `render-workflow-docs.mjs --check`.
- Runs: `GET /actions/runs` desde 2026-10-08 (1.012) e desde 2026-10-14T18:30Z (844), agregados por workflow × evento
  × conclusão; `get_run_failure_summary` e logs de 38815384490, 38818452494, 38819239875, 38786106562, 38786316390,
  38742685683, 38814499753, 38756705863, 38767166432, 37355980323, 38819215026.
- Perímetro: `/branches/main/protection`, `/repos`, `/actions/permissions/*`, `/actions/permissions/artifact-and-log-retention`,
  `/environments` (+ secrets por environment), `/actions/secrets`, `/actions/variables`, `/actions/cache/usage`,
  `/actions/caches`, `/actions/artifacts`, `/code-scanning/alerts`, `/dependabot/alerts`, `/secret-scanning/alerts`,
  check-runs e statuses do HEAD, PRs e issues abertas, `/pulls/1960/files`, compare da branch da #1960.
- Vercel: `list_projects`, `get_project`, `list_deployments` dos 3 projetos do time `juca1`.
- Supabase (`SELECT`): `supabase_migrations.schema_migrations` (816 linhas, md5 da lista × arquivos), `pg_proc`
  (`e2e_cleanup`), `cron.job`, `auth.sessions`/`auth.refresh_tokens` do usuário E2E (contagem).
