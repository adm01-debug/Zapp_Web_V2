CREATE TABLE public.link_preview_cache (
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  preview JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.link_preview_cache TO service_role;

ALTER TABLE public.link_preview_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages link preview cache"
  ON public.link_preview_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_link_preview_cache_expires_at ON public.link_preview_cache (expires_at);

CREATE TRIGGER update_link_preview_cache_updated_at
  BEFORE UPDATE ON public.link_preview_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();