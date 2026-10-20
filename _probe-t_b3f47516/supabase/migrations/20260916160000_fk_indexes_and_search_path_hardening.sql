-- Auditoria 2026-09-16 (docs/audits/PLANO_CORRECOES_50_ETAPAS_2026-09-16.md, E21/E22/E25).
-- Aditivo e compativel: indices novos em FKs sem cobertura (tabelas vazias, sem custo de lock)
-- + 1 funcao SECURITY DEFINER sem search_path fixo (unica das 101 sem essa protecao).

CREATE INDEX idx_talkx_recipients_variant_id ON public.talkx_recipients(variant_id);

CREATE INDEX idx_catalog_send_events_agent_id ON public.catalog_send_events(agent_id);

CREATE INDEX idx_talkx_template_versions_saved_by ON public.talkx_template_versions(saved_by);

CREATE INDEX idx_talkx_blacklist_source_message_id ON public.talkx_blacklist(source_message_id);

CREATE INDEX idx_talkx_blacklist_removed_by ON public.talkx_blacklist(removed_by);

ALTER FUNCTION public.talkx_increment_delivered(uuid) SET search_path = public, pg_temp;
