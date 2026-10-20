-- E31: marcar contatos LID legados para excluí-los do fluxo ativo.
-- LIDs (WhatsApp internal IDs com >=14 dígitos sem prefixo 55) foram
-- recebidos antes da implementação do normalizePhone (E35, 02/09/2026).
-- Não podem ser mergidos com contatos reais pois LID ≠ número de telefone.
-- A coluna é reversível: UPDATE contacts SET is_lid_legacy=false WHERE ...

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_lid_legacy BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial eficiente (apenas os 595 legados)
CREATE INDEX IF NOT EXISTS idx_contacts_is_lid_legacy
  ON public.contacts(is_lid_legacy)
  WHERE is_lid_legacy = true;

-- Marcar os 595 LIDs legados:
--   >=15 dígitos = LID definitivo do WhatsApp
--   14 dígitos sem prefixo 55 = LID suspeito (não-BR)
UPDATE public.contacts
SET is_lid_legacy = true
WHERE
  (length(phone) >= 15)
  OR (length(phone) = 14 AND phone NOT LIKE '55%');

-- Validação inline (falha a migration se algo errado)
DO $$
DECLARE
  marked   INTEGER;
  total    INTEGER;
  normal   INTEGER;
BEGIN
  SELECT count(*) INTO marked  FROM contacts WHERE is_lid_legacy = true;
  SELECT count(*) INTO total   FROM contacts;
  SELECT count(*) INTO normal  FROM contacts WHERE is_lid_legacy = false;

  -- Deve ter marcado entre 400 e 700 LIDs (margem para crescimento)
  IF marked < 400 OR marked > 700 THEN
    RAISE EXCEPTION 'E31: contagem inesperada de LIDs marcados: %. Esperado 400-700.', marked;
  END IF;

  -- Normal + LID deve somar total
  IF normal + marked <> total THEN
    RAISE EXCEPTION 'E31: inconsistência — normal(%) + lid(%) != total(%)', normal, marked, total;
  END IF;

  RAISE NOTICE 'E31: OK — total=%, lid_legacy=%, normal=%.', total, marked, normal;
END;
$$;
