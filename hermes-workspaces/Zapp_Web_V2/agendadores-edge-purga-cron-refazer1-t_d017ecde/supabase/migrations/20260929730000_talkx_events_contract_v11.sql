-- V11 do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 (Fase 1 — integridade do motor).
--
-- O contrato de eventos do Talk X cobria só o ciclo de vida escrito pelo
-- CLIENTE: created, updated, scheduled, started, paused, resumed, cancelled,
-- completed, note (CHECK de 20260908120000, 9 valores, conferido vivo).
--
-- A partir da V12 quem grava o ciclo de vida é o SERVIDOR, e as etapas de
-- proteção/segmentos precisam de trilha em eventos que o CHECK não conhece:
-- retomada automática (V03), conexão caída, contato suprimido pulado, trilha
-- de supressão (V71–V80), revisão de segmentos e checklist de lançamento.
--
-- Duas mudanças de forma:
--   1) event_type ganha 10 valores — superconjunto do CHECK vivo, então
--      nenhuma linha existente viola.
--   2) campaign_id passa a aceitar NULO, para evento de ENTIDADE (supressão,
--      segmento). Para o alvo continuar explícito entram entity_type e
--      entity_id, e um CHECK novo garante que a linha aponta para campanha OU
--      para entidade — linha sem alvo nenhum é recusada, em vez de virar
--      evento órfão.
--
-- ATENÇÃO — achado que NÃO estava no plano: as duas policies de
-- talkx_campaign_events condicionam tudo a
-- EXISTS (SELECT 1 FROM talkx_campaigns tc WHERE tc.id = campaign_id AND ...).
-- Com campaign_id nulo essa condição é falsa, então um evento de entidade não
-- passaria em NENHUMA policy: nem para gravar, nem para ler. Por isso as
-- policies são recriadas com a regra de campanha INALTERADA mais um ramo de
-- evento de entidade, restrito a admin/supervisor — quem já enxerga a
-- supressão pelas policies de talkx_blacklist. O ramo de campanha fica
-- idêntico ao vivo (copiado do repo, não transcrito de pg_get_expr).

ALTER TABLE public.talkx_campaign_events DROP CONSTRAINT IF EXISTS talkx_campaign_events_type_check;
ALTER TABLE public.talkx_campaign_events ADD CONSTRAINT talkx_campaign_events_type_check
  CHECK (event_type IN (
    'created', 'updated', 'scheduled', 'started', 'paused', 'resumed', 'cancelled', 'completed', 'note',
    'scheduled_updated', 'limits_updated', 'connection_failed', 'resumed_auto', 'skipped_suppressed',
    'suppression_add', 'suppression_remove', 'suppression_update', 'segments_reviewed', 'checklist'
  ));

ALTER TABLE public.talkx_campaign_events ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE public.talkx_campaign_events ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.talkx_campaign_events ADD COLUMN IF NOT EXISTS entity_id uuid;

ALTER TABLE public.talkx_campaign_events DROP CONSTRAINT IF EXISTS talkx_campaign_events_target_check;
ALTER TABLE public.talkx_campaign_events ADD CONSTRAINT talkx_campaign_events_target_check
  CHECK (campaign_id IS NOT NULL OR (entity_type IS NOT NULL AND entity_id IS NOT NULL));

DROP POLICY IF EXISTS "talkx_campaign_events_select" ON public.talkx_campaign_events;
CREATE POLICY "talkx_campaign_events_select" ON public.talkx_campaign_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
      AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid())))
    OR (talkx_campaign_events.campaign_id IS NULL AND public.is_admin_or_supervisor(auth.uid()))
  );

DROP POLICY IF EXISTS "talkx_campaign_events_insert" ON public.talkx_campaign_events;
CREATE POLICY "talkx_campaign_events_insert" ON public.talkx_campaign_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
      AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid())))
    OR (talkx_campaign_events.campaign_id IS NULL AND public.is_admin_or_supervisor(auth.uid()))
  );
