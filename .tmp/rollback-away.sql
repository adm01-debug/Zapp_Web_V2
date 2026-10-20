-- copia LITERAL do bloco "-- Rollback (SQL executavel, na ordem)" da migration
-- 20261015211150_away_message_decision.sql, para o ciclo RED/GREEN no banco local
-- da tarefa: roda o inverso, prova o RED com o arquivo final de teste, e a
-- migration logo depois devolve tudo (idempotencia).
drop policy if exists "Admins e supervisores leem o log de ausencia" on public.away_message_log;
drop index if exists public.away_message_log_busca_idx;
drop table if exists public.away_message_log;
drop function if exists public.record_away_message(uuid, uuid, timestamptz);
drop function if exists public.should_send_away_message(uuid, uuid);
alter table public.away_messages drop column if exists enabled;
