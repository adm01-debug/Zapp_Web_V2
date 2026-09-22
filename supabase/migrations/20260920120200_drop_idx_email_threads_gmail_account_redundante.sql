-- E15 lote 1 (plano 2026-09-20): idx_email_threads_gmail_account_id e
-- estritamente redundante — idx_email_threads_account_date cobre o mesmo
-- prefixo (gmail_account_id, last_message_at DESC) para qualquer consulta
-- por conta. idx_scan=0 com estatisticas acumuladas desde a criacao do
-- projeto (pg_stat_database.stats_reset IS NULL) e 30+ dias de trafego
-- real de e-mail. Unico drop desta rodada: os demais "sem uso" sao
-- suporte de FK ou indices de features ainda vazias (analise no dossie).
DROP INDEX IF EXISTS public.idx_email_threads_gmail_account_id;
