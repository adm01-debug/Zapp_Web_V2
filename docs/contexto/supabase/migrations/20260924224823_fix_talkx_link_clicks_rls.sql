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
