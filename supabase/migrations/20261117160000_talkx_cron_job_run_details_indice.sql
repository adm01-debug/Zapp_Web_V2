-- Resgate de claude/fix-talkx-cron-startup-timeout-261025-1700 (nunca mergeada).
-- Renomeada de ..._indice_e_retencao.sql para ..._indice.sql: a metade da
-- retencao saiu (ver bloco C1b abaixo) e o nome do arquivo vira o `name` do
-- ledger ao vivo. Seguro renomear porque esta migration nunca foi aplicada
-- (supabase_migrations.schema_migrations para em 20261117120000).
--
-- Aquela branch diagnosticou 4.007 falhas do job pg_cron 'talkx-scheduler-1min'
-- em 30 dias (9,3%) e apontou tres causas raiz. A 20261117110000 desta mesma PR
-- resgatou DUAS delas (janela de 14 dias em talkx_engine_cron_runs; advisory
-- lock + captura de query_canceled/57014 no tick). Faltava a peca que ataca a
-- causa raiz C1 — sem ela as outras so aliviam o sintoma:
--
--   C1 (indice): cron.job_run_details nao tem indice por (jobid, start_time).
--       Toda leitura do historico do job faz varredura sequencial — 69 MB na
--       medicao da branch — e estoura o statement_timeout. A janela de 14 dias
--       da 20261117110000 reduz o conjunto DEVOLVIDO, mas sem indice o Postgres
--       ainda varre a tabela inteira para aplicar o filtro.
--
-- Medido no banco oficial em 18/11/2026, antes de aplicar esta migration:
--   select indexname from pg_indexes
--    where schemaname='cron' and tablename='job_run_details';
--   -> so 'job_run_details_pkey' (UNIQUE btree em runid). O indice composto
--      realmente nao existe; a leitura por (jobid, start_time) nao tem apoio.
--
-- Nao ha DML de dado de negocio aqui: cron.job_run_details e o historico de
-- execucoes do proprio agendador.

-- C1: indice composto. IF NOT EXISTS para replay idempotente.
--
-- POR QUE ESTA DENTRO DE UM BLOCO QUE ENGOLE insufficient_privilege: tentei
-- aplicar em 18/11/2026 e o banco recusou com 42501, "must be owner of table
-- job_run_details". Medido na hora:
--
--   select pg_get_userbyid(c.relowner) as dono, current_user,
--          pg_has_role(current_user, c.relowner, 'MEMBER')
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname='cron' and c.relname='job_run_details';
--   -> dono = supabase_admin | current_user = postgres | membro = false
--
-- Ou seja: NENHUM papel ao alcance deste projeto pode criar o indice — nem o
-- MCP, nem o workflow db-migrate, que tambem conecta como `postgres`. Criar o
-- indice depende de chamado no Supabase (supabase_admin).
--
-- Sem este bloco a migration falharia no apply e travaria a fila inteira de
-- migrations, deixando drift permanente entre arquivo e ledger. Com ele, o
-- apply passa, o ledger anda e a falta do indice fica GRITANDO no log em vez de
-- virar silencio. Quando o Supabase conceder, basta reaplicar: o IF NOT EXISTS
-- torna o replay inofensivo.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_job_run_details_jobid_start
    ON cron.job_run_details (jobid, start_time DESC, runid DESC);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'X065/C1 PENDENTE: indice idx_job_run_details_jobid_start NAO criado. cron.job_run_details pertence a supabase_admin e o papel % nao e membro; abrir chamado no Supabase. Enquanto isso, a leitura do historico do agendador segue em varredura sequencial.', current_user;
END;
$$;

-- C1b (RETENCAO) — DELIBERADAMENTE FORA DESTA MIGRATION.
--
-- A branch original tambem reagendava uma limpeza diaria de
-- cron.job_run_details ('cleanup-cron-run-details-7d', 0 4 * * *). Essa metade
-- ficou REDUNDANTE antes desta migration ser aplicada: a retencao de 7 dias ja
-- existe na main desde 20261102022200_cron_historico_retencao_7d.sql:18, e esta
-- ATIVA em producao (conferido em 18/11/2026 em cron.job: jobid 35, jobname
-- 'cron-historico-retencao-7d', schedule '17 3 * * *', active = true, comando
-- `delete from cron.job_run_details where coalesce(end_time, start_time) < ...`).
--
-- Reagendar aqui nao seria idempotente de verdade: o unschedule da branch casa
-- por jobname ('cleanup-cron-run-details-7d'), que NAO e o nome do job vivo.
-- O efeito seria um SEGUNDO job apagando a mesma tabela em outro horario —
-- dois DELETEs concorrentes no historico do agendador, sem nenhum ganho.
-- Por isso a retencao fica com a 20261102022200, dona unica da regra.
--
-- Os prazos continuam diferentes de proposito: a UI le ate 14 dias
-- (20261117110000) e a retencao guarda 7. O SELECT com janela de 14 dias segue
-- correto — devolve o que existir; o diagnostico de falha usa as ultimas horas.

-- Rollback:
-- DROP INDEX IF EXISTS cron.idx_job_run_details_jobid_start;
