-- ============================================================================
-- Contatos -- debito pos-#1187 (item 2), parte 1/2: helper UNICO de permissao
-- ============================================================================
-- O predicado "quem pode ver/editar este contato" estava copiado em 4 lugares:
--   1. policy de UPDATE "Users can update their assigned contacts" (public.contacts)
--   2. policy de SELECT "contacts_select_policy"                (public.contacts)
--   3. corpo de public.search_contacts
--   4. corpos de public.delete_contact / public.delete_contacts
-- Qualquer mudanca futura em um so lugar cria divergencia silenciosa entre
-- "o que o usuario ve na lista", "o que ele edita" e "o que ele exclui" -- foi
-- exatamente essa divergencia que gerou o bug do #1187.
--
-- `can_edit_contact` recebe os DOIS campos do contato que participam da regra
-- (`assigned_to`, `queue_id`) em vez do id: assim serve tanto no USING de uma
-- policy (linha corrente) quanto em corpo de RPC/search com alias de tabela,
-- sem um SELECT extra por linha.
--
-- Equivalencia com o que existia:
--   - policy de SELECT: identica (nao tinha o guard `queue_id IS NOT NULL`).
--   - policy de UPDATE: o guard `p_queue_id IS NOT NULL` era redundante -- com
--     `queue_id` nulo, `qm.queue_id = p_queue_id` nunca casa. Resultado igual.
--   - search_contacts / delete_*: os tres usavam o mesmo conjunto de condicoes.
-- Entao esta funcao NAO concede nada novo: ela apenas centraliza o predicado.
--
-- Classe ADITIVA (funcoes novas) -- aplicada na propria tarefa. O arquivo
-- 20260929780000 reaponta as policies e os 4 corpos para este helper (classe
-- contrato: aplicado pos-merge).

CREATE OR REPLACE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    public.is_admin_or_supervisor(auth.uid())
    OR p_assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    OR EXISTS (
         SELECT 1
         FROM public.queue_members qm
         WHERE qm.queue_id = p_queue_id
           AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
           AND qm.is_active = true
       )
$function$;

COMMENT ON FUNCTION public.can_edit_contact(uuid, uuid) IS
  'Predicado unico de permissao do modulo Contatos (natureza: ver/editar/excluir). Fonte de verdade compartilhada pelas policies de public.contacts (SELECT e UPDATE), por search_contacts e pelas RPCs delete_contact/delete_contacts. Trocar a regra aqui muda as quatro de uma vez.';

-- Lista, para os contatos de uma pagina da lista, quais o chamador pode excluir.
-- Usada pela UI para NAO oferecer "Excluir" em contato fora do alcance do usuario
-- (antes o item aparecia sempre e o erro so surgia no clique).
CREATE OR REPLACE FUNCTION public.can_delete_contacts(p_ids uuid[])
 RETURNS TABLE(contact_id uuid, can_delete boolean)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id, public.can_edit_contact(c.assigned_to, c.queue_id)
  FROM public.contacts c
  WHERE c.id = ANY(p_ids)
    AND c.deleted_at IS NULL
$function$;

COMMENT ON FUNCTION public.can_delete_contacts(uuid[]) IS
  'Para cada id informado, se o chamador pode excluir o contato (mesmo predicado de can_edit_contact). Contatos inexistentes ou ja excluidos nao retornam linha. Alimenta o gate do item "Excluir" na UI do modulo Contatos.';

REVOKE EXECUTE ON FUNCTION public.can_edit_contact(uuid, uuid) FROM PUBLIC, anon;
-- O `authenticated` PRECISA de EXECUTE: a funcao e chamada dentro do USING das
-- policies de public.contacts, e expressao de policy roda como o CHAMADOR (nao
-- como o dono). Sem este GRANT, qualquer SELECT em contacts falha com
-- "permission denied for function can_edit_contact" (o contrato de banco cobre isso).
GRANT EXECUTE ON FUNCTION public.can_edit_contact(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_delete_contacts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_contacts(uuid[]) TO authenticated, service_role;
