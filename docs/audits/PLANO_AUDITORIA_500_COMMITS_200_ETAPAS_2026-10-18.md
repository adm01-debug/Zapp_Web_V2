# PLANO — Auditoria exaustiva dos últimos 500 commits · 200 etapas · 2026-10-18

> **Origem:** auditoria coordenada de 5 agentes especializados (CI/CD, banco de dados, frontend,
> edge functions, testes/processo) sobre os **499 commits** entre `7a290dc1e` (01/10) e `fed4f57d7`
> (17/10) — 17 dias. **279 achados** catalogados.
>
> **Este documento é SÓ O PLANO. Nada aqui foi executado.** Foi escrito para outro agente executar.
>
> **Convenção:** etapas `Z001`–`Z200`. Uma etapa = um PR. Branch
> `claude/<tipo>-z<NNN>-<slug>-<AAMMDD-HHMM>`; título do PR termina em `(Z<NNN>)`.
> O prefixo `Z` foi escolhido para não colidir com `F###` (PR #1979), `W###` (plano de CI),
> `X###` (Talk X V4), `CV###` (Copiloto RADAR) nem `E###` (auditorias anteriores).
>
> **[JOAQUIM]** = decisão de negócio, custo, segredo, perímetro ou dado destrutivo.
> Agente **não executa** sem aprovação explícita.
>
> **Rastreabilidade:** cada etapa cita o achado de origem (`CI-nn`, `DB-nn`, `FE-nn`, `EF-nn`,
> `QA-nn`). Achados que **eu confirmei em primeira mão** estão marcados ✔ VERIFICADO.

---

## Parte 1 — Diagnóstico (medido em 2026-10-17/18)

### 1.1 O estado em uma frase

A `main` não tem portão. Todo o resto deste documento é consequência disso.

### 1.2 Os cinco fatos que mudam a prioridade de tudo

| # | Fato | Como foi medido | Consequência |
|---|---|---|---|
| 1 | **`main` sem branch protection e sem rulesets** ✔ VERIFICADO | `GET /branches/main/protection` → **404 "Branch not protected"**; `GET /rulesets` → `[]` | Nenhum check bloqueia merge. CI é decorativo. |
| 2 | **`anon` tem INSERT/UPDATE/DELETE em 117 tabelas e TRUNCATE em 116** ✔ VERIFICADO | contagem sobre `supabase/schema-manifest.json` → `user_roles`, `permissions`, `role_permissions`, `password_reset_requests`, `mfa_sessions`, `ip_whitelist`, `global_settings`, `webauthn_challenges`, `security_alerts` | A chave `anon` é pública (vai no bundle). **TRUNCATE ignora RLS.** |
| 3 | **`enforceRateLimit` quebrado no `main`** ✔ VERIFICADO | `_shared/validation.ts:359-370` usa `ctx`, ausente da assinatura | Limitador persistente das 32 edges desligado; todo 429 vira 500. |
| 4 | **Edge functions do lote de 16/10 estão fora do ar** ✔ VERIFICADO | `generate-manifest.mjs --check` → `Deployment manifest is stale` | Código mergeado ≠ código em produção. |
| 5 | **A suíte E2E escreve no banco de PRODUÇÃO** | `e2e/fixtures/supabase-env.ts:40-47` tem `.env.production` como fonte primária | Cria campanhas e apaga contatos reais; limpeza é best-effort. |

### 1.3 Por que a `main` está vermelha hoje (causas distintas das de 16/10)

Medido no HEAD `fed4f57d7`, run de 2026-10-17T16:07Z. **Importante:** estas causas **divergem** das
registradas na PR #1979 (medida em 16/10). A causa `D1` daquele plano (`bun.lock` inconsistente)
**já está resolvida** — `bun install --frozen-lockfile` passa ✔ VERIFICADO.

| Workflow | Causa-raiz medida hoje | Etapa |
|---|---|---|
| DB Guard (offline) | `check-migration-drift.mjs` exit 1: 51 exceções com campo `sql-sha256` não previsto + colisão de version + comment-only sem exceção (DB-01/02/03) | Z021–Z023 |
| CI/CD · Node CI Scripts | 25 de 954 testes falham; Playwright pinado `1.63.0` vs `1.64.1` do `bun.lock` (CI-11) | Z024–Z027 |
| CI/CD · Unit Tests (1/3 e 3/3) | testes de `bubble`; mock global de `@/lib/logger` ausente (QA/PR #2035) | Z028 |
| Deploy Edge Functions | `deployment-manifest.json` stale ✔ VERIFICADO | Z004 |
| types-sync | gate rejeita a proposta (step 23) | Z029 |
| E2E logado (3 shards) | suíte quebrada desde 12/10 (issue #1915) | Z136–Z140 |

Ruído de infra que polui todo log de `db-guard`: `FATAL: role "root" does not exist` em loop —
`--health-cmd pg_isready` sem `-U postgres` (CI-27).

### 1.4 Volume e forma dos 499 commits

| Tipo | Qtde | Leitura |
|---|---:|---|
| `fix` | 150 | **30% do total.** 116 deles (77%) tocam arquivo alterado nas 48 h anteriores — conserto de conserto. |
| `feat` | 125 | — |
| `docs` | 87 | 2º arquivo mais tocado do repo é um Markdown de plano. |
| `test` | 43 | — |
| `chore` | 35 | — |
| `ci` | 27 | `ci.yml` reescrito a cada 1,5 dia. |
| `refactor` | 14 | — |
| `perf` | 4 | — |
| `revert` | 1 | o lote de 880 cartões. |

**Autoria:** 466 dos 499 commits saem da mesma identidade (`adm01-debug`). Com squash merge e sem
`Co-Authored-By` por sessão, não há como atribuir trabalho a um agente — colisão vira inauditável.

### 1.5 Os 15 ciclos de retrabalho mais caros

Cada um é um tema consertado 3+ vezes porque a causa-raiz não foi atacada.

| # | Tema | Commits | Causa-raiz não resolvida | Etapas |
|---|---|---:|---|---|
| 1 | `deployment-manifest.json` | 68 (16 `fix`) | artefato derivado versionado à mão → conflito garantido entre sessões | Z086 |
| 2 | `ci.yml` | 31 (11 `fix`) | o portão segue o mesmo fluxo de auto-merge do código | Z033 |
| 3 | colisão de version de migration | 36 | `reserve_migration_version` existe mas não é obrigatória | Z066 |
| 4 | exceções `migration-evidence.json` | 22 | arquivo único = ponto de conflito entre sessões paralelas | Z070 |
| 5 | `fix(a11y)` tela a tela | 17 + 10 varreduras axe | não existe primitivo que force rótulo acessível | Z111–Z114 |
| 6 | contraste de tema | 8 (1 revert) | não existe gate de contraste no CI | Z115–Z117 |
| 7 | `fix(sonar)` | 10 + 2 refactor | regra `S2871` corrigida 3× por PRs temáticas sobrepostas | Z118 |
| 8 | `settings-guard` | 13 (9 `fix`) | guard apagado em 16/10; 1.181 linhas de artefato órfão sobraram | Z030 |
| 9 | `sql-lexer` do usage-guard | 5 em 2 dias | parser de SQL artesanal | Z078 |
| 10 | "E2E logado destravado" | 5 em 2 dias | 5 causas distintas, 1 PR cada, nenhum diagnóstico único | Z136 |
| 11 | QR Code / sessão órfã Evolution GO | 13 em 48 h | máquina de estados derivada por tentativa e erro | Z100 |
| 12 | vazamento de token da instância | 6 em 4 meses | sanitização em 2 pontos distintos, não na borda | Z101 |
| 13 | `types.ts` regenerado | 5 em **um dia**, 1 do **banco errado** | geração manual permitida | Z081 |
| 14 | gamificação: REVOKE repetido | 9 em 3 dias | causa era `ALTER DEFAULT PRIVILEGES`, não o grant | (resolvido — Z190 documenta) |
| 15 | lote 880 cartões | merge → revert → re-merge em 24 h | sem branch protection, lote que não compila entra | Z021 |

### 1.6 Colisão entre sessões paralelas — 27 PRs abertas

- **#2023** e **#1991** consertam o que já foi mergeado horas antes (`nextBestActionKey` já exportado
  em `useNextBestAction.ts:34`; scroll já corrigido em `24338a598`).
- **#1983** e **#1987** são a 2ª e 3ª tentativa de reconciliar o mesmo lote de 880 cartões, já
  mergeado em `025d0258d` — uma delas de outra ferramenta (`codex/`).
- **14 PRs do Copiloto RADAR** abertas em 4 horas (#1997…#2032), todas em draft, todas vermelhas
  pelo mesmo defeito (mock de `@/lib/logger`), nenhuma mergeada.
- Workflows foram **apagados e restaurados 3 vezes em 24 h** por sessões diferentes;
  `auto-update-pr-branch.yml`, `scorecard.yml` e `settings-guard.yml` não existem mais,
  `branch-hygiene-audit.yml` e `e2e-logado.yml` sobreviveram por acidente de ordem de merge.

### 1.7 Relação com a PR #1979 — ler antes de executar

A PR #1979 (`claude/tender-heisenberg-a4jk3s`) já contém
`docs/audits/PLANO_WORKFLOWS_FAILURE_200_ETAPAS_2026-10-16.md`, com 200 etapas `F001`–`F200`
**dedicadas a workflows em FAILURE**. Ela também modifica `ci.yml`, `db-live-guard.yml`,
`e2e-logado.yml`, `e2e-talkx.yml`, `types-sync.yml` e `scripts/ci/`.

**Este plano deliberadamente NÃO re-cobre CI/CD em profundidade.** A FASE 1 aqui tem 15 etapas e
trata só do que a #1979 não cobre ou do que mudou depois de 16/10. Antes de executar qualquer etapa
da FASE 1, **conferir se a #1979 mergeou** e marcar as etapas sobrepostas como `SUBSTITUÍDA POR F###`.

**Decisão pendente [JOAQUIM]:** #1979 está aberta há 2 dias em draft. Mergear, fechar ou deixar?
Enquanto ela estiver aberta, qualquer etapa deste plano que toque `.github/workflows/` colide com ela.

### 1.8 Dívida de planejamento — o contexto que torna este plano perigoso

| Plano | Etapas | Concluídas | Evidência |
|---|---:|---:|---|
| Talk X V4 | 200 | **2** | `docs/talkx/v4/STATUS.md` (placar gerado); 45 commits com marcador `(X###)` cobrindo 39 etapas, só 2 aceitas por `DONE_VERIFIED` |
| IA | 200 | 0 | sem placar nenhum |
| Copiloto RADAR | 150 | 0 | criado 16/10, 14 PRs em draft no mesmo dia |
| Multiplix | 200 | 12 | 196 marcadores de pendência |
| CI (3 versões vivas) | 100×3 | 18 | renumeração W01–W99 descartou o placar anterior |
| Workflows FAILURE (#1979) | 200 | 0 | aberta em 16/10 |
| **Este plano** | **200** | **0** | — |

**São 116 arquivos de plano em `docs/`, apenas 7 marcados como substituídos, somando >1.500 etapas
declaradas e <40 concluídas.**

> ⚠️ **Aviso ao agente executor e ao Joaquim:** este documento acrescenta 200 etapas a uma pilha
> que já não é executada. Ele só tem valor se a **FASE 0 e a FASE 1 forem executadas e as demais
> forem tratadas como backlog priorizado**, não como compromisso. A etapa **Z200** propõe
> explicitamente congelar planos novos. Se a escolha for executar só 35 etapas deste documento e
> arquivar o resto, isso é um **sucesso**, não um fracasso.

---

## Parte 2 — As 200 etapas

### FASE 0 — Segurança e produção: parar o sangramento (Z001–Z020)

Nada nesta fase espera por nada. São 20 etapas e todas são hoje.

**Z001** · **[JOAQUIM] Confirmar ao vivo os grants de escrita de `anon`.** · DB-18 ✔
Rodar `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')` em produção (SELECT, leitura).
O manifesto é um snapshot de 16/10 — esta etapa prova o estado atual. **Prova:** contagem ao vivo anexada ao PR.

**Z002** · **[JOAQUIM] REVOKE em bloco dos grants de escrita de `anon`.** · DB-18, DB-19 ✔
`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon;` em migration versionada.
**Risco:** se alguma função legítima depender disso, quebra. Z001 é pré-requisito e deve listar as exceções.
**Prova:** 0 linhas no SELECT da Z001 após apply.

**Z003** · Teste de regressão para grants de `anon`. · DB-21
`scripts/db-audit/check-anon-write-grants.sql`: DO block que levanta exceção se `anon` tiver qualquer
privilégio de escrita, com prova de não-vacuidade (falha se o role `anon` não existir).
**Prova:** o teste falha hoje e passa depois da Z002.

**Z004** · Regenerar `deployment-manifest.json` e destravar o deploy das edges. · EF-52, CI-39 ✔
`node scripts/edge-deploy/generate-manifest.mjs && git add supabase/deployment-manifest.json`.
**Prova:** `--check` sai 0 e o workflow Deploy Edge Functions fica verde.

**Z005** · Corrigir `enforceRateLimit`. · EF-01 ✔
`_shared/validation.ts:359` — adicionar `ctx: EnforceRateLimitContext = {}` à assinatura (a interface já
existe em `:311`). **Prova:** `deno check supabase/functions/_shared/validation.ts` sai 0.

**Z006** · Declarar `rateLimitLogWriter` em `RequireAuthOptions`. · EF-02
`_shared/validation.ts:456-471`. **Prova:** mesma da Z005.

**Z007** · Mover as 5 chamadas de `enforceRateLimit` para dentro do `try`. · EF-30
`get-mapbox-token:13`, `evolution-webhook:107`, `send-email:66`, `csp-report:98`, `talkx-link:137`.
**Prova:** teste que simula estouro de limite e espera 429, não 500.

**Z008** · **Investigar o fail-open da supressão de opt-out do Talk X.** · QA-02
`src/hooks/integrations/__tests__/useTalkXSuppression.test.ts:247` é um `it.fails` que documenta:
"falha FECHADO quando a consulta de contatos erra — hoje devolve false = **libera o envio**".
Erro de RLS ou de rede ao checar a blacklist resulta em mensagem enviada a quem pediu opt-out.
**Risco LGPD.** **Prova:** converter o `it.fails` em `it` que passa (fail-closed).

**Z009** · `deno check` de todas as edge functions no CI de PR. · EF-03
Job novo no `ci.yml`: `deno check supabase/functions/**/index.ts`. É a causa-raiz de Z005/Z006.
**Prova:** o job falha no commit anterior à Z005 e passa depois.

**Z010** · `deno check` como gate do deploy. · EF-04
`deploy-functions.yml`: passo de typecheck antes de `supabase functions deploy`.
**Prova:** deploy abortado em código que não typecheca.

**Z011** · Timing-safe na comparação de credencial do `sync-call-records`. · EF-05
`sync-call-records/index.ts:158` → `timingSafeStringEqual`. Reincidência do fix `f1e668348`.
**Prova:** teste de unidade.

**Z012** · Regra de lint contra comparação não-constant-time de segredo. · EF-05, ciclo 4
Proibir `===`/`!==` quando um dos lados tenha identificador casando `/secret|token|key|password/i`.
**Prova:** a regra pega o caso da Z011 se ele for reintroduzido.

**Z013** · Mascarar telefone nos logs de ingestão do webhook. · EF-06
`_shared/evolution-webhook-messages.ts:1082,1090` — aplicar a máscara de 6 dígitos que já existe em
`_shared/evolution-helpers.ts:42`. **Prova:** teste que verifica ausência de número completo no log.

**Z014** · Mascarar telefone nos logs de opt-out. · EF-07
`_shared/evolution-webhook-messages.ts:1171,1216,1221`. **Prova:** idem Z013.

**Z015** · `internalErrorResponse` nos três 500 que vazam `error.message`. · EF-08, EF-09, EF-10
`evolution-webhook:331`, `evolution-api:1207`, `gmail-cron-sync:95`. Os três são `new Response` crus que
o CodeQL não casa com o padrão — por isso sobreviveram a 5 rodadas de correção. **Prova:** teste por função.

**Z016** · `requireAuth` no `evolution-api`. · EF-11
`evolution-api/index.ts:66-71` hoje só faz `getUser()`, pulando `profiles.is_active` e a política de rede.
**Usuário desativado com JWT válido continua enviando WhatsApp.** **Prova:** teste com perfil inativo → 403.

**Z017** · `requireAuth` no `webhook-diagnostic`. · EF-13, EF-14
`webhook-diagnostic/index.ts:59-63`; capturar também o `error` da RPC de papel, hoje descartado.
**Prova:** teste com perfil inativo e teste com RPC indisponível.

**Z018** · Validar `select` nas duas pontes de banco externo. · EF-15
`external-db-bridge:159` e `external-db-proxy:137`: a allowlist cobre a tabela, não o `select`.
`*,outra_tabela(*)` traz recurso embarcado fora da allowlist com service_role.
**Prova:** teste que rejeita `select` contendo `(`.

**Z019** · Remover os ramos de escrita da `external-db-bridge`. · EF-16
`external-db-bridge:185-212` implementa `insert`/`update`/`delete` que nenhuma tabela permite.
Código morto armado. **Prova:** os ramos somem; `isOperationAllowed` continua negando.

**Z020** · Gate de ambiente na allowlist de CORS. · EF-19
`_shared/cors-origins.ts:21-25` libera `localhost` e `127.0.0.1` em produção.
**Prova:** em `ZAPP_ENV=production`, os dois padrões não entram na lista.

---

### FASE 1 — O portão de merge (Z021–Z035)

> Conferir a PR #1979 antes de cada etapa desta fase (ver §1.7).

**Z021** · **[JOAQUIM] Decidir: a `main` tem portão ou não?** · CI-01 ✔, QA-40, QA-47
Hoje: 404, sem rulesets. Opção (a) restaurar branch protection com os checks que **hoje existem e
passam**; opção (b) registrar por escrito que o repo opera sem gate.
**Não há opção (c).** Enquanto indefinido, todo documento que cite "required checks" está mentindo e
um lote que não compila entra na `main` — como aconteceu em 16/10.
**Recomendação:** (a), com apenas `🏗️ Build` obrigatório no primeiro momento. Um check verde e
confiável vale mais que seis vermelhos.

**Z022** · Corrigir as 51 exceções `pinned-replay`. · DB-03
`migration-evidence.json`: as 51 entradas têm o campo `sql-sha256` (adicionado por `c41f5e573`) que não
está em `expectedKeys` de `check-migration-drift.mjs:184-198`, e `hasExactKeys()` exige igualdade exata.
Decidir num PR só: acrescentar a chave ao validador **ou** removê-la das 51 entradas (ela duplica
`ledger_statements_sha256`). **Prova:** `check-migration-drift.mjs` sai 0.

**Z023** · Resolver a colisão de version `20261016220000`. · DB-01, DB-02
Dois arquivos na mesma version: `_fix_domain_case_sensitivity.sql` e `_search_events_rls_decision.sql`.
O segundo é 100% comentário. Renumerar **o que ainda não está no ledger** via
`reserve_migration_version`, com delete+create em commits separados (regra 3 da seção de alocação).
**Prova:** `ls *.sql | sed 's/_.*//' | sort | uniq -d` vazio.

**Z024** · Despinar o Playwright dos workflows. · CI-11, CI-10
`e2e-logado.yml:127,131` e `e2e-talkx.yml:91,95` têm `playwright@1.63.0`; o `bun.lock` está em `1.64.1`.
O commit `4641c8729` prometeu exatamente isso e corrigiu o verificador sem corrigir os 4 call sites.
Trocar por `bunx playwright` (resolve pelo lock) **e** decidir se `playwright` entra em `toolchain.json`
ou sai de `CHAVES_OBRIGATORIAS`. **Prova:** `check-workflow-pins.mjs` sai 0.

**Z025** · Separar o glob do job `Node CI Scripts` em bloqueante e informativo. · CI-06, QA-64
25 de 954 testes falham: 8 são contratos do `ci.yml` pré-16/10, ~13 são drift de documentação
(`ESTADO.md`, `FEATURE_REGISTRY.md`, `DB-INVENTORY.md`). Drift de README não pode manter o check vermelho.
**Prova:** o job bloqueante fica verde; o informativo reporta sem travar.

**Z026** · Reescrever os 8 contratos que descrevem o `ci.yml` anterior. · CI-05, QA-04
`ci-artifacts.unit.mjs`, 2 testes de `ci-e2e-projects.unit.mjs`, teste E81 de `playwright-config-e81.unit.mjs`.
Eles exigem jobs de lint, E2E e upload que o "CI mínimo" removeu.
**Prova:** 0 falhas; nenhum `test.skip` novo.

**Z027** · Apagar ou religar os 15 contratos neutralizados com `test.skip`. · QA-04
`arquitetura-sem-desperdicio.unit.mjs:59,68,110,124,130,147`, `secrets-environments.unit.mjs:169,175`,
e mais 7. Eles verificam workflows apagados. **Prova:** 0 `test.skip` em `scripts/ci/*.unit.mjs`.

**Z028** · Mock global de `@/lib/logger` no Vitest. · QA, PR #2035
Desbloqueia os shards 1/3 e 3/3 e as 14 PRs do Copiloto RADAR.
**Atenção:** a PR #2035 já faz isso — verificar antes e, se mergeada, marcar esta etapa concluída.

**Z029** · Publicar o motivo do gate do `types-sync` no Job Summary. · CI-35
Hoje o step 23 só falha; o diagnóstico exige baixar o log cru.
**Prova:** o motivo aparece no Summary antes da falha.

**Z030** · **[JOAQUIM] Decidir o destino do `settings-guard`.** · CI-03, QA-28
O workflow foi apagado em `5721e4f50`; sobraram `github-settings-guard.mjs` (605 linhas),
`github-settings-baseline.json` e `github-settings-guard.unit.mjs` (485 linhas) — 1.181 linhas provando
um guard que não existe, depois de 9 commits de correção. Ou religar num agendado mínimo, ou apagar os três
**e** a tabela "Perímetro do GitHub" do CLAUDE.md, no mesmo PR.

**Z031** · Anular o bloco `branch_protection_main` do baseline. · CI-02
`scripts/ci/github-settings-baseline.json:9-22` afirma `strict:true`, `enforce_admins:true` e 6 required
checks, medidos "2026-10-16". A API devolve 404 para a mesma branch. Baseline que descreve mundo
inexistente é pior que baseline nenhum. **Prova:** o arquivo reflete o estado real ou diz "ausente por decisão".

**Z032** · `--health-cmd pg_isready -U postgres -d postgres` no serviço do `db-guard`. · CI-27 ✔
Elimina o `FATAL: role "root" does not exist` a cada 5 s que polui todo log de diagnóstico.

**Z033** · **[JOAQUIM] Congelar `ci.yml` atrás de aprovação humana.** · QA-27, ciclo 2
31 commits e 11 `fix` em 16 dias; `01bbf6202` é literalmente "corrige regressao do PR-F" de horas antes.
Mudança no portão não deve seguir o mesmo fluxo de auto-merge do código.

**Z034** · Job agregador para a matriz de Unit Tests. · CI-22
`🧪 Unit Tests (n/3)` cria 3 checks; mudar para 4 shards renomeia todos de uma vez. Um job
`needs: unit-tests, if: always()` com nome fixo torna o sharding detalhe interno.
**Prova:** existe um check `🧪 Unit Tests` estável.

**Z035** · Job agregador para a matriz do `e2e-logado`. · CI-44
Mesmo problema: 3 grupos, nenhum resultado único. **Prova:** existe um check `E2E logado` estável.

---

### FASE 2 — Banco: ACL, RLS e `search_path` (Z036–Z065)

**Z036** · Inventário ao vivo de policies sem cláusula `TO`. · DB-25
58 policies nas migrations não declaram `TO`, valendo para o role `public` (que inclui `anon`).
Combinado com a FASE 0, a policy era o único filtro. **Prova:** lista ao vivo anexada.

**Z037–Z041** · Corrigir as 58 policies sem `TO`, em 5 lotes por módulo. · DB-25
Z037 Talk X (`20261002641230`), Z038 Multiplix (`20260927280000`, `20260926161000`),
Z039 Team Chat (`20260927270005`), Z040 inbox/contatos, Z041 restante.
Estender `scope-public-policies-authenticated.test.sh` até zerar. **Prova:** o teste falha hoje e passa ao fim.

**Z042** · Inventário das 100 policies de UPDATE sem `WITH CHECK`. · DB-26
Classificar: cobertas por trigger (como `contacts`, via `prevent_contact_assignee_hijack`) vs descobertas.
**Prova:** tabela no PR separando os dois grupos.

**Z043–Z046** · Adicionar `WITH CHECK` onde não há trigger. · DB-26
Z043 `multiplix_dispatches`/`recipients`/`blocks`, Z044 `talkx_campaign_segments`,
Z045 `team_conversation_members`, Z046 restante. **Prova:** teste de escalada de posse por UPDATE.

**Z047** · `SET search_path` em `set_conversation_status`. · DB-12
`20260905080000_conversation_status_fsm.sql:11-17` — `SECURITY DEFINER` sem `search_path`.

**Z048** · `SET search_path` em `talkx_increment_delivered`. · DB-13
`20260911120000:12-19` — `LANGUAGE sql SECURITY DEFINER` sem `search_path`, com GRANT para `service_role`.

**Z049** · **Fechar as 4 RPCs de tags de WhatsApp.** · DB-14
`20260927370000_add_wa_tag_rpc_functions.sql` — quatro `SECURITY DEFINER` sem `search_path` e **sem nenhum
GRANT/REVOKE no arquivo**, ou seja, nasceram com EXECUTE para PUBLIC. Duas delas
(`remove_wa_label_from_all_contacts`, `rename_wa_label_on_all_contacts`) fazem UPDATE em **toda** a tabela
`contacts` sem filtro por chamador. Adicionar `search_path`, `REVOKE ALL FROM PUBLIC, anon`, GRANT explícito
e validação do chamador dentro das duas funções. **Prova:** teste de ACL por função.

**Z050** · Substituir o `DO` block dinâmico do batch de `search_path`. · DB-15
`20261016190000:13-42` percorre `pg_proc` em tempo de apply — não é replayável nem determinístico, e o
`statements` do ledger não descreve o que rodou. Trocar por `ALTER FUNCTION` explícito por assinatura,
congelando a lista. **Prova:** replay local produz o mesmo resultado duas vezes.

**Z051** · Guard offline contra `SECURITY DEFINER` novo sem `search_path`. · DB-16, DB-48
Não existe hoje; foi por isso que `20261016170000` (15 funções) e `20261016190000` (121) precisaram existir.
Varrer migrations por `CREATE FUNCTION ... SECURITY DEFINER` sem `SET search_path` no mesmo statement.
**Prova:** o guard pega DB-12/13/14 se reintroduzidos.

**Z052** · Guard offline contra `SECURITY DEFINER` sem `REVOKE ... FROM PUBLIC`. · DB-48
Teria pego DB-14 em setembro. **Prova:** idem.

**Z053** · Corrigir o comentário tecnicamente errado sobre `pg_temp`. · DB-17
`20261016170000:4-7` afirma que `pg_temp` sombreia **funções** — o PostgreSQL nunca resolve funções em
`pg_temp` implicitamente. O risco real é o inverso: `pg_temp` entra implicitamente no **início** do caminho
para **tabelas**. O comentário errado já foi copiado para `20261016190000`. **Prova:** texto corrigido nos dois.

**Z054** · Adicionar `anon_table_write` ao `grants-baseline.sql`. · DB-21
`scripts/db-audit/grants-baseline.sql:31-37` só fotografa `anon_table_select` — a metade perigosa do ACL
ficou de fora, e é por isso que DB-18 nunca apareceu na perna C do `check-triple-parity`.
**Prova:** o baseline novo detecta a Z002 se ela for revertida.

**Z055** · Regenerar `grants-baseline.json`. · DB-22
Está 12 dias atrás do manifesto e guarda 2 achados já corrigidos (`anon_execute` com 2 funções que o
manifesto não tem). **Prova:** `generated_at` igual ao do manifesto.

**Z056** · **[JOAQUIM] `anon` deve ler `whatsapp_connections`?** · DB-23
4 relações (`whatsapp_connections` + 3 views) têm SELECT para `anon` no manifesto e não estão no baseline.
Existe `e44-whatsapp-connections-anon-grants.test.sh` — confrontar. Se não deve, REVOKE; se deve, registrar.

**Z057** · Regra de lint contra `GRANT ALL ... TO anon`. · DB-24
`20260930410000:31` fez `GRANT ALL ON talkx_settings TO anon` e só foi desfeito 2 dias depois, em outro
arquivo. O padrão "grant largo agora, revoke depois" já custou o incidente de 04/09.

**Z058** · Documentar as 9 tabelas com RLS e zero policy. · DB-27
`ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`, `catalog_rate_limits`, `edge_rate_limits`,
`gmail_oauth_states`, `link_preview_cache`, `talkx_storage_purge_queue`, `talkx_test_send_claims`.
Provavelmente deny-all intencional (só `service_role`), mas não há como distinguir de "esqueceram a policy"
— e o repo já reverteu uma correção dessas (`20261016130000`). `COMMENT ON TABLE` por tabela.

**Z059** · Manter `check-mcp-exec-acl.sql` entre os guards obrigatórios de PR. · DB-28
`mcp_exec`/`mcp_exec_many` executam SQL arbitrário como `SECURITY DEFINER`. Hoje o guard só roda contra
banco vivo. Nunca permitir que um `CREATE OR REPLACE` com assinatura nova recrie a função com ACL padrão.

**Z060** · Fixar o contrato de `record_failed_login` / `is_account_locked`. · DB-29
O GRANT para `anon` foi aplicado em 4 arquivos distintos em 3 dias (o ciclo do lockout de login de 04/09) e
hoje o manifesto não lista nenhum EXECUTE de `anon` — ou seja, foi perdido de novo.
`[NÃO CONFIRMADO]` se é deliberado (fluxo pode ter migrado para edge com service_role).
Decidir e travar em `login_gate_rpc.test.sh`. **Prova:** o teste falha se o par (função, role) mudar.

**Z061** · Documentar as 7 tabelas `multiplix_*` com `FORCE ROW LEVEL SECURITY`. · DB-09
São as únicas assim (161 tabelas com `true|false`, 7 com `true|true`). Registrar para a assimetria não ser
lida como drift por uma próxima auditoria.

**Z062–Z065** · Índices. · DB-39, DB-40, DB-38
Z062 medir `idx_scan` dos 21 índices que são prefixo estrito de outro (`messages` e `talkx_recipients` são
os mais caros — 3 índices sobrepostos em tabelas grandes).
Z063 dropar os redundantes confirmados por medição (`CREATE/DROP INDEX` simples — `CONCURRENTLY` falha no gateway).
Z064 criar índice nas 6 FKs sem cobertura: `conversation_events.from_queue_id`/`.to_queue_id`,
`multiplix_delivery_items.block_id`/`.recipient_id`, `multiplix_dispatches.whatsapp_connection_id`,
`talkx_campaign_segments.segment_id`, `talkx_optout_keywords.created_by`, `ai_model_prices.provider_id`.
Z065 padronizar nomes dos 16 pares de índices com definição idêntica sob nomes diferentes (nenhum risco em
produção — nunca coexistiram — mas os arquivos ensinam o nome errado).

---

### FASE 3 — Banco: reconciliar o lote de 219 migrations (Z066–Z085)

> **Pré-requisito:** Z022 e Z023. Sem o `check-migration-drift` verde, nada aqui é verificável.

**Z066** · Tornar obrigatória a reserva de version. · DB-30
`reserve_migration_version` existe desde `20260927640000` e mesmo assim houve colisão em 16/10 (DB-01).
Check offline que rejeite PR cuja version não tenha linha em `migration_version_reservations`.
**Prova:** o check pega a colisão da Z023 se reintroduzida.

**Z067** · **Provar o lote de 219 migrations contra o banco.** · DB-05, DB-06, DB-07
`025d0258d` adicionou 219 arquivos `.sql` cobrindo 05/10→16/10. Os objetos que eles criam — **32 tabelas e
126 funções** — não existem em `schema-catalog.json` nem em `schema-manifest.json`, ambos regenerados do banco
oficial em 16/10. **Ou o lote nunca foi aplicado, ou os artefatos mentem.** Rodar
`check-migration-drift.mjs` com `DESTINO_URL` e classificar cada migration como "apply pendente" ou "drift".
**Esta é a etapa mais importante da fase.** **Prova:** tabela objeto-a-objeto no PR.

**Z068** · **[JOAQUIM] Aplicar o que a Z067 classificar como pendente.** · DB-05
Via `db-migrate.yml` (dry-run → aprovação em `producao-ddl` → apply), nunca por MCP.
**Nenhuma migration nova deve entrar até este lote estar provado.**

**Z069** · Regenerar catálogo e manifesto **depois** do apply, no mesmo turno. · DB-08
Hoje `schema-catalog.json` (recommitado 17/10) e `schema-manifest.json` (16/10) saíram de snapshots
diferentes: 170 tabelas no catálogo vs 168 no manifesto — faltam `connection_alert_preferences` e
`search_events`. **Prova:** os dois com o mesmo `generated_at`.

**Z070** · Quebrar `migration-evidence.json` em um arquivo por version. · DB-32
22 commits mexeram nesse arquivo, 3 deles só resolvendo conflito de merge. Arquivo único = ponto de
conflito garantido entre sessões paralelas. `scripts/db-audit/evidence/<version>.json`.
**Prova:** a classe inteira de conflito desaparece.

**Z071** · Converter as 19 exceções `ledger-summary` em SQL real. · DB-42
São exatamente o caso que a regra 7 da seção 1 do CLAUDE.md diz que "obriga exceção pinned-replay para
sempre". O SQL real existe nos arquivos. **Prova:** 62 exceções caem para 43.

**Z072** · Converter as 10 exceções `format-only`. · DB-42 · **Prova:** 43 → 33.

**Z073** · Resolver as 2 exceções `ledger-only/comment-only`. · DB-43
Confirmar o objeto ao vivo (`pg_get_functiondef`/`pg_indexes`) e promover para SQL real, como já foi feito
em `e2d341ca4`.

**Z074** · Mover 3 arquivos superados para `_superseded/`. · DB-44
`20260916230000_talkx_e93_settings.sql` (usa `CREATE POLICY IF NOT EXISTS`, que **não existe** no
PostgreSQL — nunca rodou e nunca rodará), `20260927450000`, `20260929370000`.
**Prova:** `replay-known-failures.json` cai de 21 para 18.

**Z075** · Esvaziar `known-violations.json`. · DB-10
As 31 entradas são, 31/31, objetos criados pelo lote da Z067 e ausentes do catálogo. O guard passa com
`novas: 0` porque a dívida foi absorvida — ele não prova mais nada sobre acoplamento.
**Pré-requisito:** Z067+Z069. **Prova:** o guard falha de verdade se um acoplamento novo surgir.

**Z076** · Ancorar o cutoff da projeção forward-only no ledger. · DB-11
`supabase-usage-guard.mjs:196` usa `catalog.generated_at` como cutoff de 8 dígitos, então tudo entre o
último apply real e 16/10 fica invisível. **Prova:** a projeção cobre as 219 migrations.

**Z077** · Resolver as 64 diferenças do replay local. · DB-45
A seção 0 do CLAUDE.md manda desenvolver contra banco local, mas o replay deixa 21 falhas esperadas e
64 diferenças reais (52 funções, índices, políticas do Team Chat) contra o manifesto.
**Enquanto isso existir, a seção 0 inteira não é executável.** Dividir por módulo se necessário.

**Z078** · Substituir o `sql-lexer` artesanal. · DB-29(ciclo), QA-29
5 fixes em 2 dias, cada um uma descoberta de que o parser caseiro não entende SQL
(`standard_conforming_strings`, VIEW/RENAME TO, assinatura canônica, comentário entre `.schema()`,
dollar-quote astral ≥ U+10000). Trocar por `pgsql-parser`/`libpg_query`.

**Z079** · Derivar as exceções `pinned-replay` do ledger ao vivo. · QA-39
Versionar 51 entradas garante que elas fiquem obsoletas quando outra sessão corrigir o ledger em paralelo
— já aconteceu (incidente de 26/09).

**Z080** · Exigir diff de `supabase/migrations/` no PR que altera `*-baseline.json`. · DB-34
11 commits regeneraram baselines como ritual. "Regenerar o baseline" só deveria ser permitido junto da
migration que causou a mudança.

**Z081** · Proibir geração manual de `types.ts`. · QA-33
Regenerado 5 vezes em **um dia**, uma delas **do banco errado** (`76ddbc630`: "corrige geração do banco
errado") — exatamente o risco dos MCPs de nome quase idêntico que a seção 1 do CLAUDE.md documenta.
`db-guard` recusa diff em `types.ts` que não venha do `types-sync.yml`.

**Z082** · Agendar `DROP` das 2 tabelas de rollback. · DB-50
`_rb_message_reactions_contato_20261007001008` e `team_chat_media_acl_r2_db_020_rb`. Nenhuma migration
posterior as remove. Tabela de rollback sem prazo vira lixo permanente.

**Z083** · Mover os 2 arquivos de reconciliação pontual para `docs/audits/`. · DB-49
`reconcile-schema-migrations-20260924203300.sql` e suas notas convivem com ~250 guards permanentes;
a chance de alguém reexecutar por engano não é zero.

**Z084** · Decidir o destino de `ledger-history-limitations.json`. · DB-46
Ele próprio declara `"historical_content_proven": false` e não é revisitado há quase um mês.
Ou provar cada entrada, ou apagar — um inventário que se declara não-prova dá falsa sensação de cobertura.

**Z085** · Documentar o nível extra de subdiretório em `_foreign/`. · DB-04
`_foreign/singu/` tem 2 `.sql` que qualquer script usando `ls _foreign/*.sql` perde.

---

### FASE 4 — Edge functions (Z086–Z110)

**Z086** · **Gerar `deployment-manifest.json` no CI.** · QA-26, ciclo 1
É o arquivo mais tocado do repo: 68 commits, 16 `fix`. Sendo derivado e versionado à mão, toda PR que
encosta numa edge precisa regenerá-lo, gerando conflito com qualquer PR paralela.
Tratá-lo como `types.ts`: gerado, não editado. **Maior ganho isolado contra colisão entre sessões.**

**Z087** · Rodar os 200 testes de edge function no CI. · QA-11, EF-03
Eles não rodam em workflow nenhum. É onde vive a lógica de **envio de mensagem** (`talkx-send`,
`multiplix-send`, `evolution-webhook`). Restaurar no `ci.yml` ou no `db-guard.yml` (que ainda roda em PR).

**Z088** · `_shared/http.ts` com `fetchWithTimeout`. · EF-25
**24 funções** chamam provedor externo sem timeout nenhum. Um provedor lento segura o isolate até o teto.
O padrão correto já existe em `_shared/evolution-api-proxy.ts:205-208`.

**Z089–Z092** · Aplicar o timeout nas 24 funções, em 4 lotes. · EF-25
Z089 ElevenLabs (9), Z090 Gmail (5), Z091 e-mail/alertas (6), Z092 Bitrix/mídia (4).

**Z093** · `_shared/resend.ts`. · EF-26
7 funções montam `fetch("https://api.resend.com/emails")` à mão, cada uma com tratamento de erro,
remetente e retry diferentes; nenhuma com timeout.

**Z094** · `_shared/elevenlabs.ts`. · EF-27
Base e header `xi-api-key` reescritos em 9 funções; `output_format=mp3_44100_128` repetido em 5.

**Z095** · Unificar `resolveInstanceToken`. · EF-28
`evolution-webhook:74-94` tem a própria implementação e o próprio cache, enquanto `evolution-api` importa
de `_shared`. **Duas implementações do mesmo gate de credencial** — foi assim que o 4º vazamento de token
apareceu.

**Z096** · `evolution-webhook` usa `_shared/edge-boot.ts`. · EF-29

**Z097** · `requireEnv` nas credenciais críticas. · EF-41, EF-42
`?? ''` em `evolution-api:54,56,61`, `webhook-diagnostic:45,47,51`, `evolution-webhook:194-195`,
`talkx-report:237-238`, `edge-boot:41`. Com o segredo ausente, o client nasce com chave vazia e a falha
aparece depois como erro opaco de PostgREST. Pior em `requireAuth` (`validation.ts:507`): a plataforma
inteira cai em 401 indistinguível de token inválido.

**Z098** · Status HTTP real no proxy da Evolution. · EF-34
Timeout, 4xx, breaker aberto e credencial ausente devolvem todos **200** com `{error:true}`.
Qualquer monitor externo vê 100% de sucesso. Manter o corpo, enviar o status real (ou `x-upstream-status`).

**Z099** · Breaker e limiter fora da memória do isolate. · EF-33, EF-12
`cbState` e `rateLimitMap` são `Map` por isolate: o breaker abre em um e os outros continuam martelando a
GO. Respaldar em tabela/RPC, como já é feito com `consume_rate_limit`.

**Z100** · **Extrair a máquina de estados da conexão Evolution para função pura.** · EF ciclo 1
13 commits em 48 h (26–27/09) corrigindo o mesmo fluxo `connect`/`status`, cada um descobrindo um estado
não previsto (`connected:null`, `LoggedIn:true` não é órfã, `reconnecting` falso positivo, `qr_pending`
abortando pareamento). A lógica está espalhada num `index.ts` de 1.219 linhas.
Função pura em `_shared` com tabela-verdade testada. **Prova:** os 13 cenários viram casos de teste.

**Z101** · `stripSecrets()` único na borda de saída. · EF ciclo 2
O token da instância escapou por 4 caminhos distintos em 4 meses. Hoje a sanitização está em **dois**
pontos (`evolution-api-proxy.ts:64-71` e `evolution-webhook:192`) — que é exatamente a forma como o
quarto vazamento apareceu.

**Z102** · Corrigir o teste de entrega do painel de monitoramento. · EF-43
`useMonitoringActions.ts:31-37` invoca `evolution-webhook` **sem** `instanceToken`; a edge devolve 401
antes de tocar o banco. O botão "testar entrega" **sempre** reporta erro. Trocar por ação dedicada em
`webhook-diagnostic` (admin-only, token pelo Vault) em vez de o navegador fingir ser a Evolution.

**Z103** · Resolver a seleção de eventos ignorada sob GO. · EF-44
O front manda 20 nomes de evento; sob GO a rota vira `/instance/connect` com `subscribe:['ALL']` fixo.
A seleção do operador não tem efeito, sem aviso. Desabilitar na UI ou devolver o que foi aplicado.

**Z104** · Rejeitar ações sem rota GO no schema do `evolution-api`. · EF-45, EF-46
`translateV2ToGo` devolve `null` (passthrough) para ~25 rotas v2; `evolution-api:1191` ainda expõe
`set-evoai`, cuja rota não tem tradução → 404 da GO disfarçado de "Recurso não suportado".

**Z105** · Corrigir a heurística de LID por contagem de dígitos. · EF-48
`toUserJid` manda qualquer número com 14+ dígitos para `@lid`. O repo já reconhece o risco em
`handleLabel` (número internacional de 14-15 dígitos), mas `toUserJid` continua em `/user/avatar` e
`/user/info`. Usar a decisão explícita por origem do dado.

**Z106** · **[JOAQUIM] Allowlist de IP para o webhook da Evolution.** · EF-21
Sem assinatura HMAC (a GO não assina), o único gate é o token no corpo. O IP da VPS Hostinger é fixo.

**Z107** · Expirar o modo `shadow` do webhook. · EF-22
`EVOLUTION_WEBHOOK_ENFORCE='shadow'` processa eventos com token ausente, só logando. Um segredo mal setado
no Dashboard abre o webhook inteiro, sem alarme.

**Z108** · Remover os 3 helpers de shadow-mode mortos. · EF-23
`logWebhookAuthShadow`, `logElevenLabsAuthShadow`, `logGmailOidcAuthShadow` — sem nenhum chamador fora dos
testes; os três webhooks migraram para verificação bloqueante. 140 linhas que ainda documentam
"requisicao processada mesmo assim".

**Z109** · Validar esquema no redirect do `talkx-link`. · EF-24
GET público que redireciona para URL vinda do banco sem allowlist de esquema.

**Z110** · **[JOAQUIM] Decidir o destino das 6 funções órfãs.** · EF-49, EF-50, EF-51
`ai-usage-outbox-drain` (só aparece no manifesto), `talkx-ai`, `recover-message-media`,
`elevenlabs-agent-token`, `send-rate-limit-alert` (espera `X-Internal-Secret` que ninguém envia),
`sync-call-records` (chamada pelo N8N — órfã só do ponto de vista do repo).
Também: `orphan_allowlist` cita `sicoob-bridge`/`sicoob-bridge-reply`, que não existem.
Órfã publicada é superfície de ataque sem dono.

---

### FASE 5 — Frontend: atacar as 3 causas-raiz (Z111–Z135)

> Três causas-raiz explicam metade dos 50 achados de frontend. Esta fase ataca as causas, não os sintomas.

**Z111** · **Criar `<IconButton label>` obrigatório.** · FE-36, FE-35
17 commits `fix(a11y)` + 10 varreduras axe em 3 dias, e ainda há **28 botões sem rótulo acessível**
(61 de 600 `<button>` têm `aria-label` — 10% de cobertura). O defeito se repete a cada tela nova porque
**não existe primitivo que force o rótulo**.

**Z112** · Regra de lint `jsx-a11y/control-has-associated-label`. · FE-36
Proibir `<button>` cru contendo só um ícone.

**Z113–Z114** · Migrar os 28 botões sem rótulo para `IconButton`. · FE-35
Z113 contatos/inbox (`FilterPresets:158,161`, `MessageReactions:139`, `AdvancedMessageMenu:275`),
Z114 restante (`MobileFAB:72`, `CatalogBulkBar:60`, `FlowComponentPreview:21,101`).

**Z115** · **Teste automatizado de contraste nos 3 temas.** · FE-46
8 commits em 3 dias, **incluindo um revert** (`28a7dd699` desfez o fix WCAG-AA de `301aeaf7e`), e um deles
corrigiu "por classes locais" — contornando o sistema de tokens, que é exatamente o que gerou o incidente
do `bg-black`. **Não existe gate de contraste no CI**; cada correção é medida à mão e a próxima sessão
quebra outra. Teste par-a-par sobre os tokens em claro/escuro/alto-contraste.

**Z116** · Migrar os 93 usos de cor fixa para tokens. · FE-33
O token `--inbox-panel-bg` existe e funciona, mas só foi aplicado em `email/`, `gmail/` e `team-chat/`.
O inbox, os alertas e `voice/` nunca migraram. O pior caso é
`MonitoringConnectionsList.tsx:122` (`bg-white` cru — fundo branco fixo em tema escuro).

**Z117** · Trocar `bg-primary text-white` por `text-primary-foreground`. · FE-34
~35 ocorrências. Com 797 linhas de presets de tema, um preset com `--primary` claro deixa texto branco
ilegível — é o incidente de #755 em outra roupa.

**Z118** · Varredura única de `S2871` e regras Sonar com `--fix`. · QA-30
10 `fix(sonar)` + 2 refactor em 3 dias, com `01bbf6202` consertando a regressão de `936def714` do mesmo dia;
a regra do comparador de `.sort()` foi corrigida **3 vezes**. Resolver por lint, não por PRs temáticas.

**Z119** · **Criar `src/lib/queryKeys.ts`.** · FE-20
212 chaves literais espalhadas (`'talkx-campaigns'` em 20 lugares, `'message-reactions'` em 9).
Hoje um typo numa invalidação é invisível. Não há invalidação morta **hoje** (verificado), mas é a
causa-raiz do ciclo de "invalidação de lista de contatos esquecida" (FE-47, 2 rodadas).

**Z120–Z122** · Migrar para `queryKeys`, por módulo. · FE-20, FE-47
Z120 contatos (com `invalidateContacts()` único), Z121 Talk X, Z122 inbox/chat.

**Z123** · **Exportar o tipo de `useRealtimeInbox`.** · FE-01, FE-02, FE-03
Uma linha de `export type` paga 4 achados: as 4 props `any` de `ConversationListSidebar:60-66`, os 3
`eslint-disable exhaustive-deps` cujo comentário **já admite** serem consequência do `any`, e o
`lastMessage?: any` em `types/chat.ts:107` (tipo de domínio do inbox inteiro).

**Z124** · `mutationCache.onError` central. · FE-14
**40 de 153 `useMutation` não têm `onError`** — falha silenciosa é pior que erro: a UI mostra o estado
antigo e o usuário repete a ação. 5 seguidas em `useDepartmentManagement.ts` e 5 em
`SkillBasedRoutingSettings.tsx`.

**Z125** · Terminar o roll-out do `TalkXQueryBoundary`. · FE-15
Aplicado em 5 telas e parou; `useCampaignEditor` (7 queries, o maior consumidor) ficou de fora.
22 componentes com `useQuery` nunca leem `isError`. A camada de **hooks** está coberta (só 2 exceções) —
o buraco é na camada de componentes.

**Z126** · Corrigir a `queryKey` instável do wizard. · FE-13
`useCampaignEditor.ts:681` usa `JSON.stringify` das `rules` (vindas do banco como `jsonb`, sem ordem
garantida): a mesma audiência pode render duas entradas de cache ou reaproveitar a contagem errada.

**Z127** · Paginar a blacklist no servidor. · FE-21
`TalkXSuppression.tsx` baixa a blacklist inteira (3× `fetchAllTalkXPages`) e pagina no cliente.
Blacklist de LGPD cresce monotonicamente — degrada sem aviso e sem erro.

**Z128** · Paginar no servidor nos outros 6 módulos. · FE-22
`useReportsData` (4 queries), `useMediaLibrary`, `TranscriptionsHistoryView`, `useAgents`,
`useAgentRecentSends`. O helper `fetchAllRows` é bem feito — reservá-lo para agregações.

**Z129–Z131** · Decompor `useCampaignEditor`. · FE-27, FE-23
1.164 linhas, **47 `useState`**, 6 `useRef`, 7 `useQuery` — qualquer `setX` re-renderiza o wizard inteiro.
Z129 extrair o autosave (8 peças de estado = um `useReducer` disfarçado),
Z130 separar audiência e template, Z131 substituir a hidratação por efeito + estado-espelho
(3 variáveis para representar "o servidor respondeu", que `useQuery.isSuccess` já dá).

**Z132** · Decompor `catalogShared.tsx`. · FE-29
40 exports, 1.065 linhas. O Talk X já resolveu isso em `07a98e3e8` ("X042 divide talkxShared em kit com
barrel") — há precedente interno e funcionou.

**Z133** · Virtualizar as 3 listas que escalam. · FE-30
`ContactGroupedList` (map aninhado grupos × membros), `TasksListMode` (`.map` dentro de `AnimatePresence`
— cada item monta um nó de animação), `TalkXSuppression:627`. `@tanstack/react-virtual` já é dependência
e já é usado em 6 lugares.

**Z134** · Memoizar a raiz do inbox. · FE-32
`RealtimeInboxView` (505 linhas) tem 6 memoizações e recebe o objeto `inbox` inteiro, novo a cada render.
`VirtualizedRealtimeList` fez certo — replicar.

**Z135** · Escopar por usuário as 3 chaves de `localStorage`. · FE-39, FE-40, FE-41
`contact-recent-searches` (termos de busca = nome e telefone de cliente) e `contact-filter-presets` não têm
`userId` e **não** estão na limpeza de logout (`useAuth.tsx:156-162`). O repo já faz certo em
`useSearchHistory.ts` e documenta a convenção em `inboxDraftSession.ts:1-14`.
`offline_conversations` é limpo no logout (crédito), mas guarda 30 min de texto de cliente em claro.

---

### FASE 6 — Religar a rede de proteção (Z136–Z160)

**Z136** · **Diagnóstico único da suíte E2E logada.** · QA, ciclo 10
Quebrada desde 12/10 (issue #1915, 17 testes). Foram 5 PRs em 2 dias, cada uma com uma causa diferente —
sinal de que cada sessão viu só o sintoma da vez. **Fazer um diagnóstico só antes de qualquer correção.**

**Z137–Z140** · Corrigir a suíte E2E logada conforme a Z136. · QA
4 etapas reservadas; o conteúdo sai do diagnóstico.

**Z141** · **[JOAQUIM] Apontar o E2E para o banco local.** · QA-21, QA-22
A suíte escreve em **produção**: `supabase-env.ts:40-47` tem `.env.production` como fonte primária; o 7º
spec do Talk X cria rascunho real de campanha; `contacts-page.ts:110-129` apaga contatos por telefone via
RPC. A limpeza é `afterAll` — se o job for cancelado, o lixo fica.
O override (`E2E_SUPABASE_URL_OVERRIDE`) **já existe**; faltam 3 specs que fixam o project-ref
(`catalog.spec.ts:16`, `talkx-demo.ts:150,173`, `mapa-mocks.ts:26,132`) — pendência que o próprio
CLAUDE.md reconhece há 14 dias.

**Z142** · Falhar explicitamente quando o fixture de produção não existir. · QA-22
4 UUIDs hardcoded em 7 specs; a única proteção é um aviso em caixa alta no `e2e/README.md:136`.
Combinado com os skips condicionais, apagar a linha **não derruba** o teste: ele pula em silêncio.
`beforeAll` com mensagem explícita + seeder idempotente executado pelo workflow.

**Z143** · Trocar os 20 `test.skip` condicionais por asserção. · QA-06
`contacts-selection.spec.ts:23` pula se houver menos de 2 contatos; `onboarding-tour.spec.ts:121` pula se
o tour não abriu — **exatamente o cenário de regressão que o teste deveria pegar**.
Fixture ausente é falha de ambiente, não motivo para passar verde.

**Z144** · Corrigir o teste autoanulável do tour. · QA-66
`onboarding-tour.spec.ts:121`: como o usuário E2E é real e o tour passou a persistir a conclusão
(`d8723e19e`), a primeira execução bem-sucedida **desativa o teste permanentemente**.

**Z145** · **[JOAQUIM] Job E2E em pull request.** · QA-13
Nenhum E2E roda em PR: o código entra na `main` e só então os 444 casos rodam. Com auto-merge e sem
revisão, a primeira notícia de regressão de UI é a `main` vermelha.
Os projetos **deslogados** (`chromium-a11y`, `chromium-mapa`, `chromium-theme`,
`chromium-onboarding-dispensar`, `chromium-telefonia`) usam sessão falsa e backend mockado — não precisam
de secret e não violam `check-pr-workflow-secrets`.

**Z146** · Ligar ou remover os 10 projetos Playwright nunca invocados. · QA-14
`chromium-a11y`, `chromium-theme`, `chromium-contacts-visual`, `chromium-email-navy` (×3 browsers),
`chromium-multiplix-responsivo`, `chromium-onboarding-dispensar`, `chromium-talkx`,
`chromium-tarefas-linha-de-base`. Projeto declarado e não executado é cobertura fantasma com aparência de
matriz cross-browser.

**Z147** · Proteger o trabalho de a11y que já foi pago. · QA-15
Os specs de acessibilidade pertencem a `chromium-a11y` (nunca invocado); `a11y-inbox-teams` e
`a11y-tarefas-dashboard` não estão em `testMatch` de projeto nenhum e caem no catch-all sem o mock que
esperam. 27 commits de a11y sem rede de proteção.

**Z148** · Corrigir o projeto do `email-navy-visual.spec.ts`. · QA-16
Existem 3 projetos dedicados (nunca invocados) e o `testIgnore` do catch-all **não** o exclui — então o
spec de régua visual roda com sessão real contra produção.

**Z149** · Rodar a suíte de contratos no CI. · QA-12
95 arquivos; `grep test:contracts .github/workflows/` → **zero**. Inclui
`contraste-aa-componentes.contract.test.ts` (34 commits) e `_adv_edge_legacy_producers.test.ts` (34
commits) — os dois mais trabalhados da pasta, hoje inertes.
`docs/audits/MAPA_COBERTURA_TESTES_2026-10-03.md:13` ainda afirma que eles bloqueiam o merge.

**Z150** · Religar `check-test-inventory.mjs`. · QA-63
19 commits de manutenção e hoje é órfão — era exatamente o script que detectava suíte nova sem passo de
CI, o problema de Z087 e Z149. (A PR #1975, aberta, já tenta algo nessa direção — conferir antes.)

**Z151** · Ampliar o glob do job `node-scripts`. · QA-64
`node --test scripts/ci/*.unit.mjs` é raso: 42 `.test.mjs` e 208 `.test.sh` ficam fora.

**Z152** · **[JOAQUIM] Devolver o ESLint ao CI.** · CI-14, QA-65
`lint-ratchet.mjs` (608 linhas) + `eslint-baseline.json` (511 KB) + `lint-ratchet.unit.mjs` (649 linhas)
existem e **nenhum workflow os chama**. Ou religar, ou apagar os três. Deixar como está é pagar 511 KB de
baseline por zero cobertura — e as 101 promises flutuantes silenciadas em `d0b0f7f7e` não têm quem as cobre.

**Z153** · `check-bundle-secrets.mjs` após o build. · CI-15
Órfão. O repo é **público** e nenhum passo inspeciona `dist/`. Cabe no job `🏗️ Build`, que é o único que
produz `dist/`.

**Z154** · `bun audit --audit-level=high` no CI. · CI-55
Nenhum workflow verifica vulnerabilidade de dependência: sem `bun audit`, sem dependency-review, sem
gitleaks, sem scorecard. Custa segundos.

**Z155** · `render-workflow-docs.mjs --check` no CI. · CI-08, QA-49
O gerador existe e `--check` não roda em lugar nenhum; `docs/ci/README.md` diz "11 workflows" quando há 14.
**Pré-requisito:** Z156.

**Z156** · Completar o bloco `# docs:` do `notifica-falha-main.yml`. · CI-09
Faltam as chaves `falha:` e `avisa:`; o gerador aborta aí e nem chega a reportar a defasagem do Z155.

**Z157** · Inventariar os 12 guards órfãos de `scripts/ci/`. · CI-16
`check-workflow-pins`, `check-edge-error-exposure`, `bundle-budget`, `a11y-button-name-ratchet`,
`implicit-any-ratchet`, `check-quarantine`, `sla-code-scanning`, `audit-prod`, `check-claude-md-integrity`,
`fila-merge`, `reuso-arvore`, `branch-podaveis`. Só 4 scripts de `scripts/ci/` ainda têm chamador.
Classificar cada um em "religar" ou "apagar com seu `.unit.mjs`".

**Z158** · Medir a cobertura de `src/**`. · QA-08
`vitest.config.ts:20-30` mede apenas `src/lib`, `src/services`, o picker de localização, um formulário e
`src/components/catalog`. Ficam **fora**: todo `src/hooks`, `src/components/inbox`, `src/components/talkx`,
`src/components/auth`, `src/components/team-chat`, `src/pages`. O número publicado é de um recorte escolhido.

**Z159** · Re-medir e subir os pisos de cobertura. · QA-09
`lines: 36, statements: 35, functions: 43, branches: 31`, congelados desde 2026-09-05 — 43 dias e ~2.000
commits, com a suíte indo de 494 para 1.812 arquivos. Ratchet que nunca sobe é decoração.

**Z160** · Cobrir os 3 módulos críticos sem teste nenhum. · QA-10
164 arquivos de `src/` nunca são nomeados em teste algum. Os três que produzem incidente silencioso:
`src/lib/webauthnUtils.ts` (WebAuthn/MFA — **zero** cobertura), `src/hooks/chat/useMessageStatus.ts`
(status de entrega de mensagem), `src/hooks/auth/useSecureProfile.ts`.

---

### FASE 7 — Processo multi-agente (Z161–Z175)

> Esta fase é a que evita que as outras seis precisem ser refeitas em 30 dias.

**Z161** · **Converter os 21 `it.fails` em issues com severidade.** · QA-02
`it.fails` passa quando o código está errado e **falha quando alguém conserta** — é um bug congelado com
teste verde. Além do opt-out (Z008): desfazer em lote que não restaura nada
(`useInboxBulkActions.test.ts:633`), erro de RLS silenciado no geo-bloqueio (`useGeoBlocking.test.ts:466`),
meta com alvo 0 contando como cumprida (`useGoalsDashboard.test.tsx:527`), erro de leitura virando "alta de
100%" (`useAIStats.test.tsx:240`).

**Z162–Z164** · Corrigir os `it.fails` por severidade. · QA-02
Z162 os que silenciam erro de RLS, Z163 os de cálculo errado, Z164 o restante.

**Z165** · Dar prazo e dono aos 44 `it.todo` e 13 `test.fixme`. · QA-01, QA-03, QA-05
Estender o schema de `e2e/quarantine.js` (que **exige** `prazo` e `issue`) aos marcadores de unidade, com
`scripts/ci/check-todos.mjs` falhando no vencimento. Os 13 `fixme` reproduzem defeito confirmado de
produção — 2 de backend (401/500) e 4 de busca/foco.

**Z166** · Mover as listas de pendência para o issue tracker. · QA-03
`paridade-v3.pendencias.test.ts` tem **0 testes executáveis**; `paridade06-envio.pendentes.test.ts` idem.
Arquivo de teste sem asserção infla a contagem de "1.812 arquivos de teste".

**Z167** · Usar `e2e/quarantine.js` ou declará-lo morto. · QA-07
Está vazio enquanto 33 testes E2E estão desligados por outros meios. O próprio comentário do arquivo diz:
"Uma quarentena sem prazo é um skip com outro nome".

**Z168** · **Check de sobreposição de PRs.** · QA-42, QA-43, QA-44, DB-46
A regra 3 do CLAUDE.md ("listar PRs abertas e conferir sobreposição") é cumprida por disciplina e falhou
3 vezes só em 16/10 (#2023 e #1991 consertam o que já foi mergeado; #1983 e #1987 são a 2ª e 3ª tentativa
do mesmo lote). Tornar mecânico: workflow que lista PRs abertas tocando os mesmos arquivos e comenta na PR
nova. **Maior ganho isolado desta fase.**

**Z169** · Preservar a identidade da sessão no squash. · QA-41
466 dos 499 commits saem da mesma identidade. O padrão de branch
`claude/<slug>-<AAMMDD-HHMM>` já carrega a informação — basta preservá-la no corpo do commit
via `Co-Authored-By`. Sem isso, "qual sessão fez isso" é inauditável.

**Z170** · Publicar a métrica "conserto de conserto". · QA-25
116 de 151 `fix` tocam arquivo alterado nas 48 h anteriores. É o KPI que falta — usá-lo para decidir se o
ritmo de merge está acima da capacidade de validação.

**Z171** · **[JOAQUIM] Limite de tamanho de lote.** · DB-37, QA-40, FE-49
O lote de 880 cartões entrou com 219 migrations e 33.838 linhas num commit, não compilou, foi revertido e
re-mergeado em 24 h — e o revert **apagou de quebra** dois workflows. Limite duro de migrations e de
arquivos por PR.

**Z172** · Exclusão de workflow só em PR dedicado. · QA-47
Workflows foram apagados e restaurados 3 vezes em 24 h; dois sobreviveram por acidente de ordem de merge.

**Z173** · Exigir re-run do CI após resolução de conflito. · FE-49
`🏗️ Build` é required e ainda assim "a main não compilava" — o merge entrou por um caminho que não
revalidou o HEAD final da integração.

**Z174** · `scripts/ci/next-adr.mjs`. · QA-56
Três `ADR-007` e três `ADR-009` com nomes diferentes: sessões paralelas alocaram o mesmo número.
Mesmo padrão de `reserve_migration_version`.

**Z175** · **[JOAQUIM] Fatiar planos novos em ondas sequenciais.** · QA-45
O Copiloto RADAR nasceu em 16/10 e gerou **14 PRs em 4 horas**, todas em draft, todas bloqueadas pelo
mesmo defeito. A primeira etapa de um plano deve validar o andaime (mocks, fixtures) antes de abrir as outras.

---

### FASE 8 — Documentação e verdade (Z176–Z190)

> Toda sessão lê o CLAUDE.md como verdade. Hoje ele descreve um repositório que não existe.

**Z176** · **Reescrever a tabela "Perímetro do GitHub".** · QA-50, CI-04 ✔
Ela afirma 6 required checks (`🔍 Lint & TypeCheck`, `🔒 Security Audit`, `Contrato DB offline`,
`🎭 E2E Tests`) — **nenhum desses nomes existe** hoje; e 6 das 9 linhas dizem "Verificado por
`settings-guard`", que foi apagado. O `ci.yml:4` do próprio repo já admite: "a main nao tem branch
protection: nada e bloqueado".

**Z177** · Corrigir o inventário de workflows. · QA-48, CI-04
O CLAUDE.md lista 16 e cita `auto-update-pr-branch.yml`, `settings-guard.yml` e `supabase-sync.yml` —
**nenhum existe**; e não lista `notifica-falha-main.yml`, que existe. São **14**. O doc gerado canônico
(`docs/ci/README.md`) diz 11. Três números, nenhum certo.

**Z178** · Corrigir a seção de deploy de edge functions. · EF-52
O CLAUDE.md afirma que as edges sobem "**só** por `workflow_dispatch`"; o gatilho de push na `main`
voltou em 07/10 (`e5dcb3c0f`). Quem seguir o documento vai mergear achando que o código **não** está no
ar — quando está.

**Z179** · Atualizar a cadência do `db-live-guard`. · CI-31
O CLAUDE.md diz diário (`13 6 * * *`) e pós-merge; é **semanal** desde 16/10. Consequência operacional a
registrar: um DDL fora do fluxo agora passa até 7 dias sem detecção.

**Z180** · **Resolver a contradição sobre como DDL entra em produção.** · DB-31, DB-36
A seção 0 (regra 3) proíbe DDL por MCP para trabalho de agente; a seção "Decisões de 2026-09-26" o
**autoriza como caminho preferencial**. As duas estão no mesmo arquivo. É a contradição mais cara do
documento: 21 commits de reconciliação de drift vieram daí, e em 16/10 três DDLs foram aplicados e
revertidos direto em produção (`20261016130000`), repetindo literalmente o incidente #724.

**Z181** · Mover os 6 blocos HISTÓRICO/SUPERADO/REVOGADO para `docs/adr/`. · QA-51
40 linhas de contradição num arquivo lido por toda sessão. Um agente que lê de cima para baixo encontra
`strict: false` recomendado **duas vezes** antes de chegar à revogação na linha 227.

**Z182** · Atualizar o rodapé do CLAUDE.md. · QA-51
Diz "Atualizado em 2026-10-01" depois de 18 commits na janela.

**Z183** · Gerar o inventário de testes por script. · QA-52
`MAPA_COBERTURA_TESTES_2026-10-03.md` declara "494 arquivos / 5.946 testes" quando são **1.812 / ~14.308**
— subestima em 3,7× — e afirma que a suíte de contratos bloqueia o merge (não roda em lugar nenhum).
O documento diz "Todos os números foram **contados**, não estimados".

**Z184** · Cabeçalho `status:` obrigatório em todo `PLANO_*`. · QA-54
116 planos, **7** marcados como substituídos. Validado por script.

**Z185** · Consolidar as 5 cópias datadas do plano de CI. · QA-53
O CLAUDE.md aponta para a de 01/10; existem versões de 14/10 e 15/10, e os commits recentes citam etapas
`W04…W99`, que só existem nas novas.

**Z186** · Resolver as duplicatas explícitas de plano. · QA-54
3 cópias do plano Multiplix de 200 etapas; `PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS` em duas pastas;
`PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS` em duas.

**Z187** · Converter decisões revertidas em ADR. · QA-55
`PLANO_REMOVER_COLUNAS_6_8` (07/10) e `PLANO_RESTAURAR_COLUNAS_6_8` (08/10);
`PLANO_CONTATOS_REDESIGN_100_ETAPAS` e `..._REV2` no mesmo dia.

**Z188** · Mover as provas de auditoria para artifacts. · QA-57
`docs/` pesa **123 MB** para 661 `.md` — CSVs de benchmark, dumps `.out`, `.jsonl` e um PDF versionados.

**Z189** · Gerar o status dos planos a partir de dados. · QA-37
`docs/mapa/PLANO_FINALIZACAO_100_ETAPAS` recebeu 39 commits, 14 deles num único dia só para atualizar
prosa. `docs/talkx/v4/STATUS.md` já tem o padrão certo (gerado por script).

**Z190** · Registrar as 3 lições que custaram 9+ commits cada. · DB-33, FE-50
(a) "REVOKE repetido 3× = procure o `ALTER DEFAULT PRIVILEGES`" — o ciclo de gamificação;
(b) "`as any` por `types.ts` dessincronizado vira permanente porque o `types-sync` é semanal e o DDL é
diário" — o cast deve carregar a versão da migration e um script deve falhar quando a RPC já existir no
`types.ts`;
(c) "um DDL fora do fluxo nunca é só aquele objeto" — quebra o catálogo até o próximo `types-sync`.

---

### FASE 9 — Verificação e fechamento (Z191–Z200)

**Z191** · `main` verde nos 6 workflows, provado por 3 pushes consecutivos.
**Z192** · `check-migration-drift.mjs`, `supabase-usage-guard.mjs` e `check-triple-parity.mjs` saem 0 com baseline **vazio** (Z075).
**Z193** · `anon` sem nenhum privilégio de escrita, confirmado ao vivo e travado por teste (Z003).
**Z194** · `deno check` + `deno test` verdes sobre as 83 edge functions, rodando em PR.
**Z195** · Paridade arquivos↔ledger: 1.046 arquivos = N registros, com md5 dos prefixos conferido.
**Z196** · Cobertura medida sobre `src/**` com piso re-medido e **subido** (Z158, Z159).
**Z197** · Zero `test.skip` em `scripts/ci/*.unit.mjs`; zero projeto Playwright declarado e não invocado.
**Z198** · CLAUDE.md sem nenhuma afirmação contradita pela API ou pelo disco — conferir item a item contra a tabela de §1.2.
**Z199** · Métrica "conserto de conserto" publicada e **abaixo de 40%** por 2 semanas consecutivas (hoje: 77%).
**Z200** · **[JOAQUIM] Congelar planos novos acima de 50 etapas** até Talk X V4 sair de 2/200.
São >1.500 etapas declaradas em 116 planos, com <40 concluídas. O custo marginal de escrever um plano é
zero; o de executá-lo é tudo. **Este documento é o último até essa régua mudar.**

---

## Parte 3 — Instruções para o agente executor

### Ordem obrigatória

1. **FASE 0 inteira** (Z001–Z020). Não depende de nada e cobre o que está quebrado em produção agora.
2. **Z021** (decisão do portão). Trava a FASE 1; **não é desbloqueável por agente**.
3. **FASE 1** (Z022–Z035) — mas conferir a PR #1979 antes de cada etapa (§1.7).
4. **Z067** (provar o lote de 219 migrations). Trava metade da FASE 3.
5. O resto por severidade: P0 → P1 → P2 → P3.

### Regras

- **Uma etapa = uma branch = uma PR.** Branch `claude/<tipo>-z<NNN>-<slug>-<AAMMDD-HHMM>`,
  título terminando em `(Z<NNN>)`.
- **Antes de abrir PR:** listar PRs abertas e conferir sobreposição de arquivos (regra 3 do CLAUDE.md).
  Havia 27 PRs abertas quando este plano foi escrito. Se existe PR tocando os mesmos arquivos, **pare e avise**.
- **Nunca trabalhar em branch de outra sessão**, mesmo que trate do mesmo assunto.
- **Etapas [JOAQUIM] não são executáveis por agente.** São 14: Z001, Z002, Z021, Z030, Z033, Z056, Z068,
  Z106, Z110, Z141, Z145, Z152, Z171, Z175, Z200.
- **Toda etapa precisa de prova.** "Pronto" = PR mergeada + CI verde + comportamento verificado
  (log, query ou request real). Faltou um dos três → diga em que ponto parou.
- **Se uma etapa já estiver feita** (outra sessão chegou antes), marcar `CONCLUÍDA POR <hash>` e seguir.
  Não refazer.
- **Se uma etapa estiver errada** (o achado não se confirma), marcar `DESCARTADA — <motivo>`.
  Um achado derrubado por evidência é um resultado válido.

### Achados que eu confirmei em primeira mão (não re-verificar)

`main` sem protection e sem rulesets · 117 relações com escrita para `anon`, 116 com TRUNCATE ·
`enforceRateLimit` sem `ctx` em `validation.ts:359-370` · `deployment-manifest.json` stale ·
`bun install --frozen-lockfile` passa · `role "root" does not exist` no `db-guard` ·
Playwright `1.63.0` vs `1.64.1`.

### Achados marcados `[NÃO CONFIRMADO]` — verificar antes de agir

- Build com `VITE_SUPABASE_URL` vazio em PR de fork (CI-25).
- `required_reviewers` do environment `producao-edge-functions` (CI-40, EF-52): o YAML e o CLAUDE.md se
  contradizem e o token de workflow devolve 403 no campo administrativo.
- Quem removeu a branch protection e quando: a API não dá audit log em conta tipo `User`. Só o **Security
  log** da conta responde (Settings → Security log, filtro `protected_branch`) — **só o Joaquim abre**.
- `getClientIP` usando o elemento mais à direita de `X-Forwarded-For` (EF-38): exige medir um request real.
- `record_failed_login`/`is_account_locked` sem EXECUTE para `anon` (DB-29): pode ser deliberado.
- Existência real em produção das 32 tabelas e 126 funções do lote (DB-06, DB-07) — é a Z067.

---

## Anexo — Rastreabilidade dos 279 achados

| Auditoria | Achados | P0 | Relatório |
|---|---:|---:|---|
| CI/CD e workflows | 55 | 8 | `CI-01`…`CI-55` |
| Banco de dados | 50 | 3 | `DB-01`…`DB-50` |
| Frontend | 50 | 1 | `FE-01`…`FE-50` |
| Edge functions | 56 | 4 | `EF-01`…`EF-56` |
| Testes e processo | 68 | 9 | `QA-01`…`QA-68` |
| **Total** | **279** | **25** | — |

Os relatórios completos não foram versionados (ficaram na sessão que os produziu). Cada etapa deste plano
cita o identificador do achado de origem e reproduz a evidência necessária para executá-la sem o relatório.

### O que está bem feito — não refazer

Registrado para que uma próxima auditoria não gaste PRs "corrigindo" o que já está certo:

- **`src/lib/emailHtml.ts`** — sanitizador com instância DOMPurify isolada por factory, `cssUnescape`
  contra `\70 osition`, bloqueio de pixel de rastreamento. O melhor código de segurança do `src/`.
- **Realtime sem vazamento:** 12/12 canais com `removeChannel`; zero `setInterval` órfão.
- **Zero segredos hardcoded e zero PII em log no front** — 5 `console.log` em 190k linhas, 0 `@ts-ignore`.
- **Limpeza no `SIGNED_OUT`** cobre 4 áreas, inclusive o caminho em que o sign-out do Supabase falha.
- **Code splitting por rota completo** (`ViewRouter` + `lazyViews`).
- **Idempotência de envio** (lease/claim/release em `talkx-send`, `multiplix-send`, `message-delivery`):
  não há risco de mandar a mesma mensagem duas vezes ao cliente.
- **Autorização das edges**, no geral: papel + `is_active` + política de rede + fail-closed.
  As exceções estão nas etapas Z016 e Z017.
- **Camada de hooks** praticamente toda expondo erro (2 exceções em ~200).
- **`check-secdef-public-execute.sql`** — guard exemplar, com duas provas de não-vacuidade.
- **RLS habilitada em 168/168 tabelas** do manifesto.
- **`db-guard` × `db-live-guard`**: a sobreposição é intencional e correta (offline roda código de PR sem
  `DESTINO_URL`; live roda só na `main` com o segredo). Não mexer.

---

*Plano escrito em 2026-10-18 a partir de auditoria de 5 agentes sobre 499 commits (01/10–17/10).*
*Nada foi executado. Nenhum DDL foi aplicado. Nenhum workflow foi disparado.*
