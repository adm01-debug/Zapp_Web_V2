-- E27: adiciona talkx_campaign_events, talkx_segments e talkx_templates
-- à publicação supabase_realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_campaign_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_templates;
