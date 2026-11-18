-- X065/C1 — indice de cron.job_run_details, agora tolerante a falta de permissao.
--
-- SUBSTITUI 20261117160000_talkx_cron_job_run_details_indice.sql, REMOVIDA nesta
-- mesma PR. Aquele arquivo nunca foi aplicado (o ledger ao vivo para em
-- 20261117120000), entao nao ha historico imutavel a preservar — e por isso ele
-- sai em vez de ser editado: a regra 7 proibe mudar o CONTEUDO de uma migration
-- que ja existe no repositorio, e o guard "Contrato DB offline" do db-guard.yml
-- so ignora arquivos REMOVIDOS.
--
-- POR QUE A VERSAO ANTERIOR NAO SERVIA: tentei aplica-la em 18/11/2026 e o banco
-- recusou com
--
--   ERRO 42501: must be owner of table job_run_details
--
-- Medido na hora, no banco oficial:
--
--   select pg_get_userbyid(c.relowner) as dono, current_user,
--          pg_has_role(current_user, c.relowner, 'MEMBER') as membro
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'cron' and c.relname = 'job_run_details';
--   -> dono = supabase_admin | current_user = postgres | membro = false
--
-- Ou seja: NENHUM papel ao alcance deste projeto cria o indice — nem o MCP, nem
-- o workflow db-migrate, que tambem conecta como `postgres`. Depende de chamado
-- no Supabase (supabase_admin).
--
-- Com o CREATE INDEX solto, o apply falharia e travaria a fila inteira de
-- migrations, deixando drift permanente entre arquivo e ledger. Com o bloco
-- abaixo, o apply passa, o ledger anda, e a falta do indice fica GRITANDO no log
-- em vez de virar silencio. Quando o Supabase conceder, basta reaplicar: o
-- IF NOT EXISTS torna o replay inofensivo.
--
-- CONTEXTO (herdado de claude/fix-talkx-cron-startup-timeout-261025-1700, nunca
-- mergeada): a causa raiz C1 das 4.007 falhas (9,3%) do job 'talkx-scheduler-1min'
-- em 30 dias e a varredura sequencial de cron.job_run_details. A retencao de 7
-- dias (20261102022200, job 'cron-historico-retencao-7d', jobid 35, ativo) e a
-- janela de 14 dias (20261117110000) ja limitam o estrago; o ganho do indice so
-- vem com o chamado.
--
-- Rollback: DROP INDEX IF EXISTS cron.idx_job_run_details_jobid_start;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_job_run_details_jobid_start
    ON cron.job_run_details (jobid, start_time DESC, runid DESC);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'X065/C1 PENDENTE: indice idx_job_run_details_jobid_start NAO criado. cron.job_run_details pertence a supabase_admin e o papel % nao e membro; abrir chamado no Supabase. Ate la, a leitura do historico do agendador segue em varredura sequencial.', current_user;
END;
$$;
