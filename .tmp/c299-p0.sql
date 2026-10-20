-- talkx_cancel_em_voo_mantem_confirmacao.sql
-- R2-DB-014 / item 299 (P2) — prova, em PostgreSQL 17 descartável, de que o
-- CANCELAMENTO de campanha do Talk X deixa de descartar a confirmação do provedor
-- de um destinatário EM VOO.
--
-- POR QUE AQUI (e não em scripts/db-audit/*.test.sh): o inventário do CI
-- (scripts/ci/check-test-inventory.mjs) reprova todo .test.sh de scripts/db-audit
-- que não tenha passo em .github/workflows/db-guard.yml — e esse passo é do dono do
-- workflow. As suítes supabase/tests/*.sql rodam por glob, ficam no mesmo commit da
-- migration e o inventário não olha .sql.
--
-- O QUE PROVA (critério do cartão):
--   T1 cancelar com POST em voo preserva o destinatário em voo ('sending' + lease) e
--      fecha o pendente sem POST; a confirmação do provedor grava DEPOIS do cancel;
--   T2 desfecho incerto do provedor vira quarentena durável (outcome_unknown + contador);
--   T3 falha explícita do provedor é registrada (failed + contador);
--   T4 worker morto pós-POST: o sweeper resolve o em voo (nenhum efeito incerto sem trilha);
--   T5 ACL: EXECUTE de transition_talkx_campaign segue só para service_role;
--   TR o bloco `-- Rollback:` da migration EXECUTA e devolve o comportamento ANTERIOR
--      (o defeito volta: em voo descartado + recibo recusado) — é o que discrimina a correção.
--
-- COMO RODA. A superfície é criada À MÃO (roles, schema auth, as tabelas do Talk X
-- que as migrations ALTERam): só roda em Postgres descartável — no banco da tarefa as
-- roles, as FKs e as tabelas já existem.
--   docker run --rm -d --name zapp-v2-c299 -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-c299 psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v raiz=/repo < supabase/tests/talkx_cancel_em_voo_mantem_confirmacao.sql
--   (`-v raiz=/repo` é o padrão; passe `-v raiz=<cópia>` se o repositório não estiver em /repo)
-- VERDE: termina com os NOTICE 'Tn OK' / 'TR OK' e sem erro.
-- VERMELHO esperado SEM a correção (mesmo comando + `-v sem_migration=1`): falha já em
-- T1 ('T1 em voo preservado (status|token|POST) FALHOU: esperado sending|true|true,
-- veio cancelled|false|false'), porque sem a guarda de POST em voo o cancel descarta o
-- destinatário. Os ids sintéticos fixos (50/51…) não são de cliente nenhum.
\set ON_ERROR_STOP on

\if :{?raiz}
\else
  \set raiz /repo
\endif

-- -v sem_migration=1: NÃO aplica a correção sob teste (é o modo VERMELHO).
\if :{?sem_migration}
  \echo '=== VERMELHO: correção sob teste NÃO aplicada (sem_migration) ==='
\else
  \echo '=== VERDE: aplicando a correção sob teste ==='
\endif

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (o resto vem das MIGRATIONS REAIS, aplicadas por \i)
-- ---------------------------------------------------------------------------
