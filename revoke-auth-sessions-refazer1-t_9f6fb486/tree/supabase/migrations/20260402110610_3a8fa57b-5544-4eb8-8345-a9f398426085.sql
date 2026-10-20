
DROP POLICY "Authenticated users can update NPS surveys" ON public.nps_surveys;
DROP POLICY "Authenticated users can delete NPS surveys" ON public.nps_surveys;
DROP POLICY "Authenticated users can create NPS surveys" ON public.nps_surveys;

CREATE POLICY "Authenticated users can create NPS surveys"
ON public.nps_surveys FOR INSERT TO authenticated 
WITH CHECK (agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update NPS surveys"
ON public.nps_surveys FOR UPDATE TO authenticated 
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can delete NPS surveys"
ON public.nps_surveys FOR DELETE TO authenticated 
USING (public.is_admin_or_supervisor(auth.uid()));
