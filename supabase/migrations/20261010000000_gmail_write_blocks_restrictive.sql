-- N-146: Tornar os bloqueios de escrita no gmail_accounts RESTRICTIVE
-- para que nenhuma policy permissiva futura possa sobrescreve-los.
-- As policies permissivas existentes (WITH CHECK false) bloqueiam escritas agora.
-- As policies RESTRICTIVE adicionais impedem que policies permissivas futuras sobrescrevam o bloqueio.
-- Fonte: supabase/migrations/20260404174826_2a7cc468-0dc4-44de-a806-6f28e4b7525f.sql:3-19

-- 1. Manter as policies permissivas existentes (bloqueiam escritas agora)
--    NAO fazer DROP — elas sao a primeira linha de defesa

-- 2. Adicionar policies RESTRICTIVE que impedem que qualquer policy permissiva futura
--    sobrescreva o bloqueio de escrita em gmail_accounts
CREATE POLICY "Block authenticated gmail inserts (restrictive)"
ON public.gmail_accounts
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block authenticated gmail updates (restrictive)"
ON public.gmail_accounts
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block authenticated gmail deletes (restrictive)"
ON public.gmail_accounts
AS RESTRICTIVE
FOR DELETE
TO authenticated
WITH CHECK (false);
