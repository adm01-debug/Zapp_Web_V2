-- 20260902000300_drop_redundant_idx_wc_instance_id
-- Drop de indice redundante (prefixo esquerdo de outro indice).

DROP INDEX IF EXISTS public.idx_wc_instance_id;
