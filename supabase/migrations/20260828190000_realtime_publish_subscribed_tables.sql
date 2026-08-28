-- Migration: 20260828190000_realtime_publish_subscribed_tables
-- Adiciona tabelas subscritas pelo front (useSupabaseRealtime) à publicação
-- supabase_realtime. Todas tinham REPLICA IDENTITY FULL ou DEFAULT e PK.
-- Antes deste fix, updates/inserts nessas tabelas nunca chegavam ao cliente.
-- Aplicado em 28/08/2026 via db_query (service_role).

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.agent_stats,
  public.audit_logs,
  public.connection_health_logs,
  public.email_messages,
  public.email_threads,
  public.password_reset_requests,
  public.payment_links,
  public.queue_goals,
  public.rate_limit_logs,
  public.sales_deals,
  public.talkx_recipients,
  public.warroom_alerts,
  public.whisper_messages;
