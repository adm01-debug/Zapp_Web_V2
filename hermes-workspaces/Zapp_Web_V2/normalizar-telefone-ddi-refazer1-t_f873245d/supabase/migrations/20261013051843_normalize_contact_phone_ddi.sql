-- normalize_contact_phone_ddi
-- Rollback: recoloca o corpo ANTERIOR de public.normalize_contact_phone() (só tira não-dígitos, sem DDI) e devolve o telefone anterior das linhas mudadas pelo backfill a partir da tabela de apoio public._rb_normalize_contact_phone_ddi; depois apaga essa tabela. O CREATE OR REPLACE do rollback vem ANTES da restauração dos dados de propósito: com a função nova (que acrescenta 55) ainda ativa, o "119..." devolvido viraria "55119..." de novo. O REVOKE EXECUTE re-afirma a trava que já existe desde 20260905010000 — não há, nesse ponto, nada a restaurar. Desliga/religa o gatilho update_contacts_updated_at em volta do UPDATE para o rollback também não reescrever updated_at.
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.normalize_contact_phone() RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $rb$ BEGIN IF NEW.phone IS NOT NULL THEN NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g'); END IF; RETURN NEW; END; $rb$;
--   ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at;
--   UPDATE public.contacts AS c SET phone = r.phone_anterior FROM public._rb_normalize_contact_phone_ddi AS r WHERE c.id = r.id;
--   ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at;
--   DROP TABLE IF EXISTS public._rb_normalize_contact_phone_ddi;
--   REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone() FROM PUBLIC, anon, authenticated;
--
-- Complemento do PD-53 no banco. O gatilho trg_normalize_contact_phone (migration
-- 20260412224600) só removia não-dígitos de contacts.phone: um número brasileiro
-- gravado como "(11) 98888-7777" virava "11988887777" (11 dígitos) e FICAVA sem o
-- código do país, enquanto o mesmo número vindo da conexão do WhatsApp já chegava
-- com "55". Os dois formatos não batem entre si (busca, deduplicação e envio),
-- e no banco real havia 5 contatos nessa forma sem DDI.
--
-- O QUE ESTA MIGRATION FAZ
--   1) normalize_contact_phone() passa a: tirar não-dígitos e, se o resultado for
--      um número brasileiro SEM DDI (DDD + número = 10 ou 11 dígitos), acrescentar
--      o código do país 55. Números com 12+ dígitos já trazem o DDI (ou são
--      estrangeiros) e ficam intactos. É idempotente: o resultado nunca volta a
--      casar '[0-9]{10,11}'.
--   2) Backfill das linhas legadas de 10-11 dígitos, gravando o valor anterior na
--      tabela de apoio public._rb_normalize_contact_phone_ddi (só id + telefone
--      anterior) para o rollback poder desfazer. SKIP nas linhas cuja forma com 55
--      já existe em OUTRO contato (constraint contacts_phone_key): nenhuma linha é
--      apagada nem sobrescrita, e o caso é anunciado por RAISE NOTICE (sem telefone).
--   3) Não mexe em RLS, GRANT de tabela, policy nem em qualquer outra função. O
--      REVOKE abaixo apenas re-afirma o fechamento já aplicado em 20260905010000.
--
-- Backfill preserva updated_at: desliga o gatilho genérico update_contacts_updated_at
-- em volta do UPDATE — normalizar a forma não é uma alteração lógica do contato, e
-- não deve reescrever a data nem disparar sincronização por "recém-atualizado".

-- 1) Trigger de normalização: acrescenta o DDI 55 ao número brasileiro sem DDI.
CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    IF NEW.phone ~ '^[0-9]{10,11}$' THEN
      NEW.phone := '55' || NEW.phone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Tabela de apoio do rollback (só id + telefone anterior; PII fechada por RLS/REVOKE).
CREATE TABLE IF NOT EXISTS public._rb_normalize_contact_phone_ddi (
  id             uuid PRIMARY KEY,
  phone_anterior text NOT NULL,
  registrado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._rb_normalize_contact_phone_ddi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._rb_normalize_contact_phone_ddi FROM PUBLIC, anon, authenticated;

-- 3) Anuncia (sem telefone) as colisões que o backfill NÃO vai tocar, para não
--    mascarar nenhuma linha e não apagar nada.
DO $$
DECLARE
  v_colisoes integer;
BEGIN
  SELECT count(*) INTO v_colisoes
    FROM public.contacts AS c
   WHERE c.phone ~ '^[0-9]{10,11}$'
     AND EXISTS (
       SELECT 1 FROM public.contacts AS d
        WHERE d.id <> c.id AND d.phone = '55' || c.phone
     );
  IF v_colisoes > 0 THEN
    RAISE NOTICE 'normalize_contact_phone_ddi: % contato(s) de 10-11 digitos cuja forma com 55 ja existe em outro contato: PRESERVADOS sem alteracao (nenhuma linha apagada ou sobrescrita).', v_colisoes;
  END IF;
END $$;

-- 4) Backfill idempotente: grava o valor anterior e aplica o DDI, pulando colisões.
ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at;

WITH alvos AS (
  SELECT c.id, c.phone
    FROM public.contacts AS c
   WHERE c.phone ~ '^[0-9]{10,11}$'
     AND NOT EXISTS (
       SELECT 1 FROM public.contacts AS d
        WHERE d.id <> c.id AND d.phone = '55' || c.phone
     )
),
gravados AS (
  INSERT INTO public._rb_normalize_contact_phone_ddi (id, phone_anterior)
  SELECT id, phone FROM alvos
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
UPDATE public.contacts AS c
   SET phone = '55' || c.phone
  FROM gravados AS g
 WHERE c.id = g.id;

ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at;

-- 5) Re-afirma a trava da função de gatilho (já revogada em 20260904330000/20260905010000).
REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone() FROM PUBLIC, anon, authenticated;
