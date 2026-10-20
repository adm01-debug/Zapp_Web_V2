-- Realtime: REPLICA IDENTITY FULL nas 12 tabelas publicadas com REPLICA IDENTITY DEFAULT
--
-- Contexto: migration 20260828190000 adicionou 13 tabelas à publicação supabase_realtime.
-- audit_logs já tinha FULL. As demais 12 ficaram com DEFAULT (só PK no WAL).
--
-- Impacto sem FULL:
--   - event: 'UPDATE' no canal Realtime não inclui os valores antigos das colunas.
--   - filter: 'coluna_nao_pk=eq.UUID' em canais UPDATE é silenciosamente ignorado:
--     o servidor não consegue avaliar o filtro sem o valor antigo na linha WAL.
--
-- Call sites confirmados com filter em FK (não-PK):
--   talkx_recipients: filter=campaign_id=eq.UUID  (TalkXLiveMonitor.tsx:54)
--   email_threads:    filter=gmail_account_id=eq.UUID  (useGmail.ts:153)
--   email_messages:   filter=gmail_account_id=eq.UUID  (useGmail.ts:154)
--
-- Custo: todas as tabelas são pequenas (< 100 kB). Impacto em WAL é proporcional
-- ao volume de UPDATE — negligível neste tamanho.

ALTER TABLE public.agent_stats           REPLICA IDENTITY FULL;
ALTER TABLE public.connection_health_logs REPLICA IDENTITY FULL;
ALTER TABLE public.email_messages         REPLICA IDENTITY FULL;
ALTER TABLE public.email_threads          REPLICA IDENTITY FULL;
ALTER TABLE public.password_reset_requests REPLICA IDENTITY FULL;
ALTER TABLE public.payment_links          REPLICA IDENTITY FULL;
ALTER TABLE public.queue_goals            REPLICA IDENTITY FULL;
ALTER TABLE public.rate_limit_logs        REPLICA IDENTITY FULL;
ALTER TABLE public.sales_deals            REPLICA IDENTITY FULL;
ALTER TABLE public.talkx_recipients       REPLICA IDENTITY FULL;
ALTER TABLE public.warroom_alerts         REPLICA IDENTITY FULL;
ALTER TABLE public.whisper_messages       REPLICA IDENTITY FULL;
