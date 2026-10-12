-- contact_is_vip
-- Rollback: desfaz a coluna is_vip, a RPC set_contact_vip e a trilha de auditoria do VIP; a etiqueta de origem (o elemento 'vip' em contacts.tags) NUNCA e tocada, entao nenhum dado se perde ao reverter.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_audit_contact_vip_change on public.contacts;
--   drop function if exists public.audit_contact_vip_change();
--   drop function if exists public.set_contact_vip(uuid, boolean);
--   alter table public.contacts drop column if exists is_vip;
--
-- CONTEXTO
-- O selo VIP do inbox vinha da ETIQUETA 'vip' gravada em contacts.tags
-- (src/components/inbox/VirtualizedRealtimeList.tsx:355:
--  tags.some(t => t.toLowerCase() === 'vip')). A remocao das etiquetas (cartao t_b7b5d9f3)
-- apaga essa origem; o campo proprio contacts.is_vip preserva o estado.
-- Esta migration roda ANTES da remocao de tags (versao 20261012223017 e anterior a versao
-- que a remocao vai reservar), portanto o backfill ainda encontra a etiqueta na base.
-- Fonte unica do backfill = contacts.tags, exatamente o que o front lia (case-insensitive,
-- sem trim: lower(t) = 'vip'). Quem le is_vip no front e o mesmo carregamento do contato
-- (a coluna vem na consulta que ja existe), por isso nao ha RPC de leitura.

-- ── 1) Coluna propria -----------------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false;

-- ── 2) Backfill da etiqueta 'vip' ----------------------------------------------
-- Idempotente (AND c.is_vip = false): rodar de novo nao altera nada.
-- O gatilho update_contacts_updated_at (BEFORE UPDATE, SEM clausula WHEN) reescreveria o
-- updated_at das linhas legadas — isso distorceria a idade do contato usada pelo
-- ChurnPredictionDashboard. Ele e desligado SÓ durante o backfill e religado em seguida.
ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at;

UPDATE public.contacts c
   SET is_vip = true
 WHERE c.is_vip = false
   AND EXISTS (
     SELECT 1
       FROM unnest(c.tags) AS t
      WHERE lower(t) = 'vip'
   );

ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at;

-- ── 3) RPC de alternar VIP ------------------------------------------------------
-- Alternar (ligar/desligar): mesma autorizacao do UPDATE da RLS (can_edit_contact) — quem
-- pode editar o contato muda o VIP. anon nao executa (ACL no bloco 5).
-- Devolve o valor resultante.
CREATE OR REPLACE FUNCTION public.set_contact_vip(p_contact_id uuid, p_is_vip boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_value boolean; BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_contact_id IS NULL OR p_is_vip IS NULL THEN
    RAISE EXCEPTION 'Informe o contato e o novo valor de VIP (true ou false).'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.contacts c
     SET is_vip = p_is_vip
   WHERE c.id = p_contact_id
     AND c.deleted_at IS NULL
     AND public.can_edit_contact(c.assigned_to, c.queue_id,
              (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
              (SELECT public.get_profile_id_for_user(auth.uid())),
              (SELECT public.is_admin_or_supervisor(auth.uid())))
  RETURNING c.is_vip INTO v_value;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contato nao encontrado ou sem permissao para alterar o VIP.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_value;
END;
$function$;

-- ── 4) Auditoria de cada mudanca de VIP -----------------------------------------
-- Mesmo padrao de audit_contact_address_change (20260929150000): AFTER UPDATE OF is_vip, so
-- registra quando o valor REALMENTE mudou. Sem PII — apenas o id do contato e o valor novo.
-- Criado DEPOIS do backfill: as linhas do backfill nao entram na trilha.
CREATE OR REPLACE FUNCTION public.audit_contact_vip_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.is_vip IS DISTINCT FROM NEW.is_vip THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'contact_vip_changed',
      'contacts',
      NEW.id,
      jsonb_build_object('contact_id', NEW.id, 'is_vip', NEW.is_vip)
    );
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_contact_vip_change ON public.contacts;

CREATE TRIGGER trg_audit_contact_vip_change
AFTER UPDATE OF is_vip ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_vip_change();

-- ── 5) ACL: fechar por padrao (funcao nova nasce com EXECUTE para PUBLIC) --------
REVOKE EXECUTE ON FUNCTION public.set_contact_vip(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_contact_vip_change() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_contact_vip(uuid, boolean) TO authenticated, service_role;
