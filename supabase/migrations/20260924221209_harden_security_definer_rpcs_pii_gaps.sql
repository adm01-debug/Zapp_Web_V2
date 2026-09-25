-- Auditoria adversarial (5 agentes de validação) desta sessão encontrou 3
-- funções SECURITY DEFINER sem checagem de auth.uid()/visibilidade real:
--
-- 1) get_last_message_dates(contact_ids uuid[]) -- EM USO ATIVO
--    (src/services/contact.service.ts, src/hooks/crm/useContactsSearch.ts).
--    Zero checagem de visibilidade: qualquer usuário authenticated podia
--    passar um array de UUIDs de contatos fora da fila/atribuição dele e
--    descobrir se/quando houve última mensagem (vazamento de metadado por
--    enumeração). Fix: filtra cada linha por is_contact_visible_to_user
--    (mesma função já usada em search_contacts/close_conversation_atomic/
--    get_conversation_tab_counts), sem mudar o contrato pra quem já só
--    manda contact_ids visíveis (uso legítimo atual).
--
-- 2) set_conversation_status(p_contact_id, p_next, p_reason) -- CÓDIGO MORTO
--    Zero call site em src/ ou supabase/functions/ (só types.ts gerado).
--    UPDATE arbitrário em contacts.conversation_status de QUALQUER contato
--    sem checar quem chama. REVOKE de authenticated fecha a brecha sem
--    quebrar nada -- o substituto correto em uso é close_conversation_atomic,
--    que já checa is_contact_visible_to_user.
--
-- 3) get_own_lockout_status(p_email) -- NÃO CONECTADO À UI AINDA
--    Permite a qualquer authenticated consultar attempt_count/locked_until
--    de QUALQUER email (enumeração de lockout de terceiros), já que a
--    função não amarra p_email a nenhuma identidade do chamador. REVOKE de
--    authenticated -- quem ligar isso à UI decide o design de acesso certo
--    (provavelmente anon, pré-login) e re-concede explicitamente.

CREATE OR REPLACE FUNCTION public.get_last_message_dates(contact_ids uuid[])
RETURNS TABLE(contact_id uuid, last_message_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    m.contact_id,
    MAX(m.created_at) AS last_message_at
  FROM public.messages m
  WHERE m.contact_id = ANY(contact_ids)
    AND public.is_contact_visible_to_user(m.contact_id, auth.uid())
  GROUP BY m.contact_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.get_own_lockout_status(text) FROM authenticated;
