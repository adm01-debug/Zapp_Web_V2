-- Add owner_id column to stickers table for personal stickers
ALTER TABLE public.stickers
ADD COLUMN owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT NULL;

-- Index for fast lookups by owner
CREATE INDEX idx_stickers_owner_id ON public.stickers(owner_id) WHERE owner_id IS NOT NULL;