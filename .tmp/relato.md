# test(ci): inventaria as suítes SQL órfãs de supabase/tests e scripts/db-tests

Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `scripts/ci/check-test-inventory.mjs`: o inventário de testes olhava só os `.test.sh` de
  `scripts/db-audit/` e as suítes Node de `scripts/**`. As suítes `.sql` de `supabase/tests/` e
  `scripts/db-tests/` eram INVISÍVEIS: existem no disco, nenhum passo do CI as executa e o
  verificador continuava dizendo OK — suíte nova nascia sem passo nenhum. Extraí o parser de blocos
  `run:` para `padroesDeBlocosRun` e acrescentei a classe SQL (coberta por bloco `run:` de QUALQUER
  workflow OU por `ALLOWLIST_SQL` com justificativa, mesmo padrão da `ALLOWLIST_NODE` do R2-INF-013).
- `.github/workflows/db-guard.yml`: passo novo que roda as 2 suítes SQL auto-contidas de
  `supabase/tests/` contra PostgreSQL 17 descartável, via `retry-disposable-postgres-test.sh` e com
  `SKIP_DOCKER_SHIM="1"` (cada suíte faz `CREATE ROLE anon/authenticated/service_role`, globais ao
  cluster — no docker-shim colidiriam com as roles do serviço).
- `scripts/db-tests/run-suites-postgres.sh` (novo): runner genérico — sobe o Postgres descartável,
  monta o repo somente-leitura em `/repo` e roda cada suíte com `ON_ERROR_STOP=1`; falha por exit ≠ 0
  ou por marcador `FAIL` no log (as suítes de `scripts/db-tests/` imprimem `PASS`/`FAIL` como
  resultado, não por exceção).
- `scripts/ci/check-test-inventory.unit.mjs`: 7 testes novos da classe SQL (parser, orfandade, glob,
  cobertura real das 2 suítes, allowlist sem entrada morta).

## Prova (vermelho antes, verde depois)
1) O runner executa as suítes de verdade
- verde: `bash scripts/db-tests/run-suites-postgres.sh supabase/tests/r2_db_022_provenance_trigger.sql supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql`
  → `run-suites-postgres: OK (2 suíte(s))` / `exit=0`
- vermelho (mutação `SUITES_PSQL_VARS="-v sem_migration=1"` na mesma suíte) →
  `ERROR:  T3 FALHOU: INSERT com sender=contact NAO bloqueado` /
  `SUITE FALHOU (exit 3): supabase/tests/r2_db_022_provenance_trigger.sql` / `exit=1`
- vermelho (detecção de marcador `FAIL`, suíte-sonda em `.tmp/fail-probe.sql`) →
  ` FAIL   | probe` / `SUITE FALHOU (marcador FAIL no log)` / `exit=1`

2) O inventário (prova por mutação do passo do CI)
- vermelho antes (passo removido do `db-guard.yml`) → `node scripts/ci/check-test-inventory.mjs` lista
  `supabase/tests/r2_db_022_provenance_trigger.sql` e
  `supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql` como
  "nenhum bloco run: de workflow" / `MUT_EXIT=1`
- verde depois (passo restaurado) → órfãos da classe SQL: `0`
- `node --test scripts/ci/check-test-inventory.unit.mjs` → `ℹ pass 14` / `ℹ fail 0`

3) Verificação
- `zapp-verify . --rapido` → `OK db_guard 0s`, `OK tipos 87s`, `OK lint`, `OK migrations`,
  `VERIFY: VERDE SEM BANCO (92s)`

## O que NÃO fiz e por quê
Liguei 2 das suítes e NÃO removi nenhuma (apagar teste exige prova de equivalência item a item). As
outras 14 ficaram na `ALLOWLIST_SQL` com justificativa porque cada uma precisa de bootstrap próprio —
o que medi no PG limpo e no replay:
- `scripts/db-tests/01..05.sql`: harness legado (`run-all.mjs`, mcp_exec/service_role contra o banco
  canônico) e dependem do schema completo. No PG limpo: `01-security-grants` e `05-rls-smoke` dão
  PASS VAZIO (0 objetos → não provam nada) e `02/03/04` falham por relação ausente (`contacts`,
  `agent_stats`, `public.team_conversations`).
- `supabase/tests/{ai_jobs_lease_efeito_incerto, inbox_agregado_por_contato, transfer_conversation_atomicidade}.sql`:
  dependem do envelope mcp_exec (SET LOCAL ROLE + `request.jwt.claims`) — precisam do harness de sessão.
- `supabase/tests/{rls_dashboard, dashboard_rpc_filters, dashboard_kpi_edge_cases, rls_whatsapp_media_select_via_messages}.sql`:
  rodam como service_role (BYPASSRLS) e NÃO provam enforcement — supersedidas por
  `scripts/db-audit/dashboard-rls-authorization.test.sh` (papéis reais).
- `supabase/tests/indeterminate_optout_outbox.sql`: é auto-contida, mas a migration sob teste
  (`20261007095739`, dependência t_89af1a99) ainda não está na branch do dia — o runner acusa
  `No such file or directory`. Promove assim que a migration integrar.

Ressalva fora do meu escopo (herança da base, não da minha mudança): `node scripts/ci/check-test-inventory.mjs`
JÁ estava vermelho no HEAD por 6 `.test.sh` de outros cartões sem passo no `db-guard.yml`
(`department-invite-contract-audit-vocabulary`, `ia-usage-outbox-duravel`, `talkx-conversion-defaults`,
`team-chat-department-transfer-guards`, `team-chat-media-contract`, `team-direct-conversation-race`).
Não toquei nelas (fora da minha área). A minha mudança não adiciona nenhum órfão — antes = os mesmos 6;
depois = os mesmos 6, e a classe `.sql` fica com 0.
