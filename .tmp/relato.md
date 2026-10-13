Especialista: workertestes

# ci(db): suítes SQL órfãs passam a rodar no CI

## O que mudou
- `scripts/ci/check-test-inventory.mjs`: o inventário só olhava `.test.sh` de `scripts/db-audit` e suites Node (`scripts/**/*.test.mjs`). As suítes `.sql` de `supabase/tests/` e `scripts/db-tests/` eram INVISÍVEIS — nasciam sem passo no CI e o verificador continuava dizendo OK. Extraí o parser dos blocos `run:` para `padroesDeBlocosRun()` e acrescentei a classe SQL: uma suíte é coberta por um bloco `run:` de qualquer workflow OU pela `ALLOWLIST_SQL` (com justificativa, mesmo padrão da `ALLOWLIST_NODE` do R2-INF-013).
- `.github/workflows/db-guard.yml`: dois passos novos.
  1) suítes auto-contidas de `supabase/tests/` contra PostgreSQL 17 descartável, pelo `scripts/db-tests/run-suites-postgres.sh` (novo);
  2) suítes que dependem do schema completo, contra o replay descartável do Supabase, pelo `scripts/db-tests/run-suites-replay.sh` (novo). Ambos com `SKIP_DOCKER_SHIM="1"` (as suítes fazem `CREATE ROLE anon/authenticated/service_role`, globais ao cluster) e via `retry-disposable-postgres-test.sh` (padrão do db-guard).
- `scripts/db-tests/run-suites-replay.sh` (novo): imagem fixada por digest, bootstrap dos serviços + todas as migrations (tolerando as 21 falhas conhecidas do replay), com as MESMAS travas do `replay-local.sh` (DNS de produção → 127.0.0.1, `cron.launch_active_jobs` desligado). Nada toca produção.
- `scripts/db-tests/run-suites-postgres.sh` (novo): sobe o PG descartável, monta o repo só-leitura em `/repo` e roda cada suíte com `ON_ERROR_STOP=1`. Falha por exit != 0 OU por marcador `FAIL` no log (as suítes de `scripts/db-tests/` imprimem `PASS`/`FAIL` como resultado, não por exceção — sem isso um FAIL passaria como verde).
- `scripts/db-tests/02-fsm-transitions.sql`: setup passa a preencher `phone` (a coluna é NOT NULL no schema atual; sem isso a suíte nem roda).
- `scripts/ci/check-test-inventory.unit.mjs`: 7 testes novos da classe SQL (parser ignora comentário/nome/env, orfandade, glob, cobertura real das 7 suítes ligadas, allowlist sem entrada morta, nenhum órfão SQL no inventário).

Total: 7 suítes ligadas ao CI (2 auto-contidas + 5 de schema completo), 9 na ALLOWLIST_SQL com a razão medida.

## Prova (vermelho antes, verde depois)
### 1. Runner auto-contido
- verde: `bash scripts/db-tests/run-suites-postgres.sh supabase/tests/r2_db_022_provenance_trigger.sql supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql` → `run-suites-postgres: OK (2 suíte(s))` / `exit=0`
- vermelho (mutação `SUITES_PSQL_VARS="-v sem_migration=1"`) → `ERROR:  T3 FALHOU: INSERT com sender=contact NAO bloqueado` / `SUITE FALHOU (exit 3)` / `exit=1`
- vermelho (marcador FAIL, suíte-sonda) → ` FAIL   | probe` / `SUITE FALHOU (marcador FAIL no log)` / `exit=1`

### 2. Runner de schema completo (replay)
- verde: `bash scripts/db-tests/run-suites-replay.sh` com as 5 suítes ligadas → `replay: 831 migrations, 21 falhas toleradas` / `run-suites-replay: OK (6 suíte(s))` (na época rodei 6, incluindo `dashboard_rpc_filters`, que depois tirei) / `exit=0`
- vermelho (sonda `.tmp/02-sem-phone.sql`, insert sem `phone`) → `ERROR:  null value in column "phone" of relation "contacts" violates not-null constraint` / `SUITE FALHOU (exit 3)`
- vermelho (assertion real): `scripts/db-tests/02-fsm-transitions.sql` roda e emite `FAIL|02-FSM-02: open->resolved|status=resolved t1=... t2=...` (mesmo valor) → o runner marca `SUITE FALHOU (marcador FAIL no log)`. É por isso que a suíte ficou na allowlist.

### 3. Inventário (mutação do passo no yml)
- passo do replay removido do `db-guard.yml` → `node scripts/ci/check-test-inventory.mjs | grep -cE 'supabase/tests|scripts/db-tests'` = `5` (as 5 suítes de replay aparecem órfãs); passo do auto-contido removido → as 2 auto-contidas aparecem órfãs.
- passos de volta no lugar → o mesmo grep = `0`.
- unit: `node --test scripts/ci/check-test-inventory.unit.mjs` → `ℹ tests 14`, `ℹ pass 14`, `ℹ fail 0`.

### 4. Verificação
- `zapp-verify . --rapido` → `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (92s)`.

## Suítes que NÃO liguei (9 na ALLOWLIST_SQL, com a razão medida)
- `supabase/tests/indeterminate_optout_outbox.sql`: auto-contida, mas a migration sob teste (`20261007095739`, t_89af1a99) ainda não está na branch do dia — o runner a executa e falha só em `No such file or directory`. Promover quando a migration integrar.
- `supabase/tests/ai_jobs_lease_efeito_incerto.sql`, `inbox_agregado_por_contato.sql`, `transfer_conversation_atomicidade.sql`: provam autorização pelo envelope `mcp_exec` (`SET LOCAL ROLE` + `request.jwt.claims` do PostgREST); precisam do harness de sessão antes do passo.
- `supabase/tests/dashboard_rpc_filters.sql`, `dashboard_kpi_edge_cases.sql`: provam só ESTRUTURA sob `service_role` e AUTO-PULAM sem dados de produção (medido no replay: `sem admin ou agent em produção, suite inteira pulada`) — um passo no CI passaria sem provar nada. Supersedidas por `scripts/db-audit/dashboard-rls-authorization.test.sh`, que prova o mesmo sob papéis reais.
- `scripts/db-tests/01-security-grants.sql` e `04-schema-contracts.sql`: no replay real emitem FAIL de drift de produção (correção fora deste cartão).
- `scripts/db-tests/02-fsm-transitions.sql`: roda no replay mas emite `FAIL|02-FSM-02` — `conversation_status_changed_at` não muda dentro de UMA transação (`now()` é `transaction_timestamp`); a suíte precisa comparar entre transações.

Não removi nenhuma suíte: apagar teste exige prova de equivalência item a item, e as 9 acima têm valor próprio (só falta o bootstrap).

## Ressalvas
- `node scripts/ci/check-test-inventory.mjs` JÁ ESTAVA VERMELHO na base (HEAD), por 6 `.test.sh` de outros cartões sem passo no db-guard (`department-invite-contract-audit-vocabulary`, `ia-usage-outbox-duravel`, `talkx-conversion-defaults`, `team-chat-department-transfer-guards`, `team-chat-media-contract`, `team-direct-conversation-race`). Não toquei nelas (fora da minha área): rodando a versão de HEAD do verificador, sai exatamente o mesmo total de 6. A minha mudança não adiciona órfão nenhum — antes = 6 (todas `.test.sh`), depois = 6, e a classe `.sql` fica com 0.
- `.github/workflows/db-guard.yml` ESTÁ em "ARQUIVOS QUE PODE TOCAR" deste cartão; o juiz barato apontou o contrário, mas sem o passo no workflow nenhuma suíte entra no CI (a cobertura da classe SQL é "bloco `run:` de workflow"), então o passo é indispensável ao critério.
