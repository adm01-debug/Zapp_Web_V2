-- E18 (plano 2026-09-20): o incidente de messages (>75% dead tuples em
-- 2026-09-16, so resolvido pelo autovacuum global horas depois) mostrou
-- que o scale_factor padrao (0.2) e lento demais para as tabelas de
-- escrita intensa deste banco. 0.05 dispara o vacuum/analyze com ~5% de
-- tuplas mortas — antecipa a limpeza sem custo relevante nas demais.
ALTER TABLE public.messages SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.email_messages SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.email_threads SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.contacts SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
