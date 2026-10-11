Especialista: workersql

## O que mudou e por quê (5 arquivos no commit, 1 de teste)
- supabase/migrations/20261011184530_evolution_observability.sql (nova, só aditiva): cria public.evolution_api_calls (id, created_at, instance, endpoint, method, status_code, ok, latency_ms, attempt, retry_reason, error_code) e public.webhook_events_log (id, received_at, instance, event_type, message_type, processing_status, error_code, latency_ms). Checks: endpoint começa com "/" e não tem "?"; method/processing_status em domínio fechado; status 100..599; latências ≥ 0; attempt ≥ 1. Sem NENHUM dado pessoal (sem telefone, texto, mídia ou token). RLS ligada nas duas; índices por tempo e por instance+tempo; duas RPCs de agregação para a tela (evolution_api_calls_overview, webhook_events_overview: totais, taxa de erro, latência média/p90 por instância e por hora; SECURITY DEFINER, SET search_path = pg_catalog, public, checando is_admin(auth.uid())) e a retenção de 30 dias (evolution_observability_retention) agendada no pg_cron (job 'evolution-observability-retention', diário 30 4 * * *).
- supabase/migrations/...: ACL por GRANT/REVOKE, não por USING (true): authenticated só SELECT e a policy de leitura é explícita (is_admin(auth.uid())); service_role só INSERT; anon sem nada; UPDATE/DELETE não concedidos (o expurgo roda como dono via função SECURITY DEFINER). Nada existente foi tocado: nenhuma tabela, policy, GRANT ou dado pré-existente mudou; não há DML/backfill, logo nenhum gatilho BEFORE UPDATE dispara.
- scripts/db-audit/evolution-observability.test.sh (novo, o único teste do commit): prova em PostgreSQL 17 descartável, aplicando a migration REAL e exercitando papéis reais (service_role grava; authenticated não-admin vê 0 linha; admin vê tudo; authenticated não insere; anon não lê), a agregação (contagem, taxa de erro, média e p90 corretos; não-admin 42501; anon negado), a retenção e o rollback real.
- scripts/ci/check-test-inventory.mjs: registra o teste novo na ALLOWLIST do inventário (6 linhas + comentário).
- src/integrations/supabase/types.ts: tipagens geradas de evolution_api_calls, webhook_events_log e das três funções, na ordem alfabética do gerador.
- .tmp/relato.md: este relato.

## Prova
- vermelho antes: `bash scripts/db-audit/evolution-observability.test.sh .tmp/migration-vazia.sql` → `[FALHOU] duas tabelas com RLS ligada: esperado [2], obtido [0]` e `ERROR: relation "public.evolution_api_calls" does not exist`.
- verde depois: `bash scripts/db-audit/evolution-observability.test.sh` → todos os cenários [OK] e `evolution-observability (postgres:17-alpine): todos os cenarios passaram.` (rc=0), incluindo `rollback removeu as tabelas/funcoes/job (=0)`.
- typecheck: `npx tsc -b --force` → rc=0.
- inventário: `node scripts/ci/check-test-inventory.mjs` reconhece o teste novo.
- banco local: `hermes-db-migrar` aplicou no banco LOCAL da tarefa (produção não tocada); o rollback foi executado no teste.

## Por que toquei arquivos fora de "ARQUIVOS QUE PODE TOCAR" (indispensável)
- scripts/db-audit/evolution-observability.test.sh: o critério de pronto exige "testes" e o teste de permissão (quem pode, quem não pode, anônimo). A prova de banco da área, por norma do repositório (skill area-sql-banco, docs/MIGRATIONS.md, FLUXO-HERMES), roda em PostgreSQL descartável aplicando a migration real, em scripts/db-audit/. As opções do cartão não servem: supabase/tests/*.sql roda contra o banco canônico/produção (proibido pela R1) e tests/contracts/ é vitest de contrato de código (não executa Postgres). Logo scripts/db-audit/ é o único lugar cabível.
- scripts/ci/check-test-inventory.mjs: um .test.sh novo sem passo no CI é reprovado como órfão. O próprio arquivo prevê a ALLOWLIST para o agente, que não edita workflow ("a promover em db-guard.yml pelo dono do workflow"). Sem esse registro o CI/check-test-inventory reprova. A promoção do passo no db-guard.yml fica PENDENTE para o worker de CI.

## O que NÃO fiz e por quê
- types.ts: editado à mão no formato do gerador porque `gen-types.sh` introspecta produção (R1 proíbe); o types-sync regenera após o merge.
- baseline do pg_cron (scripts/db-audit/pg-cron-jobs-baseline.json) e workflow não foram tocados: são do worker de CI; o job novo não altera o db-guard local.
- Confirmação de paridade: a base (branch dia/2026-10-11) já tinha processed_webhook_events e webhook_failures (fila de mortos), mas nada de registro consultável de chamadas à Evolution nem de todos os eventos do webhook — a lacuna não estava resolvida.
