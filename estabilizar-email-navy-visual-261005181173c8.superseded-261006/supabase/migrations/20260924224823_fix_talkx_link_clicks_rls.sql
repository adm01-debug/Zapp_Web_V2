-- Bug encontrado em auditoria de RLS (2026-09-24): a policy de SELECT em
-- talkx_link_clicks ("Users can view clicks of own campaigns", adicionada em
-- 20260922130000_fix_talkx_campaign_metrics_view_and_link_clicks_rls.sql) faz
-- JOIN/subquery contra talkx_links para resolver a carteira do dono da campanha:
--
--   link_id IN (
--     SELECT tl.id FROM talkx_links tl JOIN talkx_campaigns tc ON tc.id = tl.campaign_id
--     WHERE tc.created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
--   )
--
-- Porem talkx_links tem RLS habilitado desde a criacao (20260916200000_talkx_e90_links.sql,
-- que fez REVOKE ALL ... FROM PUBLIC + GRANT ALL ... TO service_role) e nunca recebeu
-- nenhuma policy nem grant de SELECT para authenticated. Resultado: QUALQUER usuario
-- authenticated que tenta ler talkx_link_clicks recebe "permission denied for table
-- talkx_links" -- a subquery da policy falha porque o planner exige privilegio SELECT em
-- talkx_links para avaliar a condicao, mesmo para quem "passaria" no WHERE. A feature de
-- "cliques por campanha" (useTalkXInsights) fica 100% quebrada para todo usuario
-- authenticated, dono da campanha ou nao -- nao e vazamento de dado, e bloqueio total
-- (permission denied / 403 no client).
--
-- Fix minimo, espelhando exatamente o padrao ja usado em talkx_campaigns (mesma funcao
-- auxiliar is_admin_or_supervisor(), mesma condicao de carteira via profiles.created_by):
--   1) GRANT SELECT (e so SELECT -- nada de INSERT/UPDATE/DELETE) em talkx_links para
--      authenticated, para a subquery da policy de talkx_link_clicks conseguir rodar.
--   2) Duas policies de SELECT em talkx_links, simetricas as ja existentes em
--      talkx_campaigns:
--        - "Admins can view all links": is_admin_or_supervisor(auth.uid())
--        - "Users can view links of own campaigns": campaign_id pertence a uma campanha
--          cujo created_by e o profile do usuario logado.
--
-- NAO aplicada em producao por este commit -- aguardando aprovacao humana explicita
-- (mexe em RLS/GRANT). Ver corpo da PR para detalhes de validacao.

GRANT SELECT ON public.talkx_links TO authenticated;

CREATE POLICY "Admins can view all links"
ON public.talkx_links
FOR SELECT
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can view links of own campaigns"
ON public.talkx_links
FOR SELECT
TO authenticated
USING (
  campaign_id IN (
    SELECT tc.id
    FROM public.talkx_campaigns tc
    WHERE tc.created_by = (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1
    )
  )
);
