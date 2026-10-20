-- Clean up duplicate sticker policies (keep only the ownership-based ones)
DROP POLICY IF EXISTS "Users can delete own stickers" ON public.stickers;
DROP POLICY IF EXISTS "Users can update own stickers" ON public.stickers;