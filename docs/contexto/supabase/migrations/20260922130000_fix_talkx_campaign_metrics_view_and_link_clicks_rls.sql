-- E92 (useTalkXInsights): a view talkx_campaign_metrics so expunha
-- campaign_id (sem nome) e nao expunha id; o hook pede
-- .select('campaign_name, replied_count, sent_count, id') e recebia 400
-- (coluna inexistente). CREATE OR REPLACE VIEW nao permite remover/reordenar
-- colunas existentes, entao as novas colunas entram so no final.
CREATE OR REPLACE VIEW public.talkx_campaign_metrics AS
SELECT id AS campaign_id,
    segment_id,
    template_id,
    status,
    total_recipients,
    sent_count,
    delivered_count,
    COALESCE(replied_count, 0) AS replied_count,
    outcome_unknown_count,
    round(
        CASE
            WHEN sent_count > 0 THEN delivered_count::numeric / sent_count::numeric * 100::numeric
            ELSE 0::numeric
        END, 1) AS delivery_rate_pct,
    round(
        CASE
            WHEN sent_count > 0 THEN COALESCE(replied_count, 0)::numeric / sent_count::numeric * 100::numeric
            ELSE 0::numeric
        END, 1) AS reply_rate_pct,
    EXTRACT(epoch FROM completed_at - started_at)::integer AS duration_secs,
    started_at,
    completed_at,
    created_at,
    id,
    name AS campaign_name
FROM talkx_campaigns c
WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL;

-- E92: talkx_link_clicks tem RLS habilitado desde a criacao mas ZERO
-- policies, e teve os grants padrao de anon/authenticated revogados em
-- 20260916290000 (defesa em profundidade, E24/E90) -- bloqueava por completo,
-- inclusive o dono da propria campanha, com 403. useTalkXInsights precisa
-- contar os cliques das campanhas do proprio usuario; devolve o grant minimo
-- (SELECT) e adiciona uma policy simetrica a "Users can view own campaigns"
-- (talkx_campaigns), mediada por talkx_links.campaign_id.
GRANT SELECT ON public.talkx_link_clicks TO authenticated;

CREATE POLICY "Users can view clicks of own campaigns"
ON public.talkx_link_clicks
FOR SELECT
TO authenticated
USING (
  link_id IN (
    SELECT tl.id
    FROM public.talkx_links tl
    JOIN public.talkx_campaigns tc ON tc.id = tl.campaign_id
    WHERE tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  )
);
