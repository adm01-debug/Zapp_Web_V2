-- Coluna usada pelo cron de avatars para backoff de 7 dias.
-- NULL = nunca tentado (entra na proxima run).
-- Valor preenchido = ultima tentativa; batch filtra attempted_at < now()-7d
-- para retentar contatos ocultos que colocaram foto semanas depois.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avatar_fetch_attempted_at timestamptz;
