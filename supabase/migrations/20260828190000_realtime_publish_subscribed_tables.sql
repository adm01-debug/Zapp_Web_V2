-- Publicacao de tabelas adicionais no canal Realtime (supabase_realtime).
-- Aplicada diretamente no banco em 27-28/08/2026 pela sessao paralela;
-- este arquivo fecha a paridade repo <-> supabase_migrations.schema_migrations.
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
