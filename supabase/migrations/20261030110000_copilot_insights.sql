-- CV-012: Insights do copiloto (cada "pensamento" do RADAR)
-- Sugest√£o, alerta, pr√≥xima a√ß√£o, obje√ß√£o detectada, etc.

CREATE TABLE IF NOT EXISTS public.copilot_insights (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid        NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES auth.users(id),
  insight_type    text        NOT NULL
    CHECK (insight_type IN (
      'suggestion','alert','next_action','objection','brinde_field',
      'temperature_change','stage_change','attachment','follow_up','other'
    )),
  content         text        NOT NULL,
  source          text        NOT NULL DEFAULT 'local'
    CHECK (source IN ('local','edge','cache')),
  model_version   text,
  state_version   integer     NOT NULL DEFAULT 1,
  shown_at        timestamptz,
  used_at         timestamptz,
  dismissed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_insights_session_time
  ON public.copilot_insights (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_insights_profile
  ON public.copilot_insights (profile_id);

ALTER TABLE public.copilot_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_own_insights" ON public.copilot_insights
  FOR ALL USING (profile_id = auth.uid());

CREATE POLCIY -ï…Ÿ•çï}…Ω±ï}•πÕ•ù°—ÃàÅ=8Å¡’â±•åπçΩ¡•±Ω—}•πÕ•ù°—Ã(ÄÅ=HÅ10ÅQ<ÅÕï…Ÿ•çï}…Ω±îÅUM%9Ä°—…’î§Å]%Q Å!,Ä°—…’î§Ï((¥¥ÅA’â±•çÖ»Å¡Ö…ÑÅIïÖ±—•µîÄ°çÖπÖ∞ÅçΩ¡•±Ω–µ•πÕ•ù°—ÃÈÌÕïÕÕ•Ωπ%ëÙ§)1QHÅAU	1%Q%=8ÅÕ’¡ÖâÖÕï}…ïÖ±—•µîÅÅQ	1Å¡’â±•åπçΩ¡•±Ω—}•πÕ•ù°—ÃÏ