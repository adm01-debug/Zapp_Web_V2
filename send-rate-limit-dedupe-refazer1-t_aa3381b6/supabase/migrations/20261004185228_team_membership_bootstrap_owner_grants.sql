-- team_membership_bootstrap_owner_grants
-- Rollback: revoke update (name, avatar_url, updated_at) on public.team_conversations from authenticated;
-- TC-003 (P1, docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md):
-- membership não protege bootstrap nem o último owner, e os REVOKEs de coluna de
-- team_conversations conviviam com um GRANT UPDATE na tabela inteira (letra morta).
--
-- Rollback (completo):
--   grant update on public.team_conversations to authenticated;
--   drop policy if exists tcm_insert_member on public.team_conversation_members;
--   create policy tcm_insert_member on public.team_conversation_members for insert to authenticated
--     with check (exists (select 1 from public.team_conversation_members m2 where m2.conversation_id = team_conversation_members.conversation_id and m2.profile_id = public.current_profile_id()) or exists (select 1 from public.profiles p where p.id = public.current_profile_id() and p.role in ('admin','supervisor')));
--   drop policy if exists tcm_delete_own_or_admin on public.team_conversation_members;
--   create policy tcm_delete_own_or_admin on public.team_conversation_members for delete to authenticated
--     using (profile_id = public.current_profile_id() or exists (select 1 from public.profiles p where p.id = public.current_profile_id() and p.role in ('admin','supervisor')));
--   create or replace function public.set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text) returns void language plpgsql security definer set search_path to 'public' as $f$ begin if p_new_role not in ('owner','admin','member') then raise exception 'invalid role: %', p_new_role; end if; if not is_admin_or_supervisor(auth.uid()) then if not exists (select 1 from public.team_conversation_members where conversation_id = p_conversation_id and profile_id = (select id from public.profiles where user_id = auth.uid()) and member_role = 'owner') then raise exception 'permission denied'; end if; end if; update public.team_conversation_members set member_role = p_new_role where conversation_id = p_conversation_id and profile_id = p_profile_id; end; $f$;
--   drop function if exists public.transfer_team_conversation_ownership(uuid, uuid);
--   drop function if exists public.create_team_group_conversation(text, uuid[], uuid);
--   drop function if exists public.is_last_team_conversation_owner(uuid, uuid);
--   drop function if exists public.is_team_conversation_creator(uuid, uuid);
--
-- Sem BEGIN/COMMIT: a migration aplica numa única transação; qualquer erro desfaz tudo.

-- 1) Helper: o usuário (auth.users.id) é o criador da conversa? SECURITY DEFINER porque a
--    policy de SELECT de team_conversations pode esconder a linha do criador antes do
--    bootstrap (ele ainda não é membro).
CREATE OR REPLACE FUNCTION public.is_team_conversation_creator(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.team_conversations tc
      JOIN public.profiles p ON p.id = tc.created_by
     WHERE tc.id = _conversation_id
       AND p.user_id = _user_id
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_team_conversation_creator(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_conversation_creator(uuid, uuid) TO authenticated, service_role;

-- 2) Helper: a linha (conversation_id, profile_id) é o ÚNICO owner de uma conversa de
--    grupo/departamento? SECURITY DEFINER para a guarda enxergar todos os owners sem RLS.
CREATE OR REPLACE FUNCTION public.is_last_team_conversation_owner(_conversation_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
           SELECT 1
             FROM public.team_conversations tc
             JOIN public.team_conversation_members tcm ON tcm.conversation_id = tc.id
            WHERE tc.id = _conversation_id
              AND tc.type IN ('group', 'department')
              AND tcm.profile_id = _profile_id
              AND tcm.member_role = 'owner'
         )
     AND NOT EXISTS (
           SELECT 1
             FROM public.team_conversation_members tcm2
            WHERE tcm2.conversation_id = _conversation_id
              AND tcm2.member_role = 'owner'
              AND tcm2.profile_id <> _profile_id
         );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_last_team_conversation_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_last_team_conversation_owner(uuid, uuid) TO authenticated, service_role;

-- 3) Criação de grupo/departamento virou UMA operação atômica: conversa + linha de owner
--    do criador + membros. Antes eram duas requests e a policy de INSERT exigia membro
--    prévio (ou admin), então o agente criava a conversa e falhava no membership —
--    conversa órfã. Aqui dentro tudo é uma transação implícita da função: qualquer erro
--    (ex.: profile_id que não existe → FK) desfaz a conversa inteira.
CREATE OR REPLACE FUNCTION public.create_team_group_conversation(
  p_name          text   DEFAULT NULL,
  p_member_ids    uuid[] DEFAULT ARRAY[]::uuid[],
  p_department_id uuid   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_conv_id    uuid;
  v_type       text;
  v_member     uuid;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  v_type := CASE WHEN p_department_id IS NULL THEN 'group' ELSE 'department' END;

  IF v_type = 'group' AND NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'group_name_required';
  END IF;

  IF v_type = 'department' THEN
    -- get-or-create: uma conversa por departamento (idx_team_conversations_dept_unique).
    -- Retorna sem mexer nos membros: quem não é membro continua sem ver a conversa.
    SELECT tc.id INTO v_conv_id
      FROM public.team_conversations tc
     WHERE tc.type = 'department' AND tc.department_id = p_department_id;
    IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  END IF;

  INSERT INTO public.team_conversations (type, name, created_by, department_id)
  VALUES (v_type, NULLIF(btrim(COALESCE(p_name, '')), ''), v_profile_id, p_department_id)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
  VALUES (v_conv_id, v_profile_id, 'owner');

  FOREACH v_member IN ARRAY p_member_ids LOOP
    IF v_member IS NOT NULL AND v_member <> v_profile_id THEN
      INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
      VALUES (v_conv_id, v_member, 'member')
      ON CONFLICT (conversation_id, profile_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_conv_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_team_group_conversation(text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_group_conversation(text, uuid[], uuid) TO authenticated;

-- 4) Transferência de propriedade por RPC (caminho canônico): o grant de tabela não permite
--    mais UPDATE em created_by, então a troca passa a exigir owner atual ou admin/supervisor,
--    alvo membro, e faz created_by + member_role na mesma transação.
CREATE OR REPLACE FUNCTION public.transfer_team_conversation_ownership(p_conversation_id uuid, p_new_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor       uuid := public.current_profile_id();
  v_conv        RECORD;
  v_actor_owner boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_new_owner_id = v_actor THEN RAISE EXCEPTION 'cannot_transfer_to_self'; END IF;

  SELECT tc.id, tc.type, tc.created_by INTO v_conv
    FROM public.team_conversations tc
   WHERE tc.id = p_conversation_id
   FOR UPDATE;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF;
  IF v_conv.type NOT IN ('group', 'department') THEN RAISE EXCEPTION 'not_a_group_conversation'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
     WHERE tcm.conversation_id = p_conversation_id
       AND tcm.profile_id = v_actor
       AND tcm.member_role = 'owner'
  ) INTO v_actor_owner;

  IF NOT v_actor_owner
     AND v_conv.created_by IS DISTINCT FROM v_actor
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
     WHERE tcm.conversation_id = p_conversation_id
       AND tcm.profile_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'target_not_a_member';
  END IF;

  UPDATE public.team_conversations SET created_by = p_new_owner_id WHERE id = p_conversation_id;

  UPDATE public.team_conversation_members SET member_role = 'owner'
   WHERE conversation_id = p_conversation_id AND profile_id = p_new_owner_id;

  IF v_actor_owner THEN
    UPDATE public.team_conversation_members SET member_role = 'member'
     WHERE conversation_id = p_conversation_id AND profile_id = v_actor;
  END IF;

  RETURN jsonb_build_object('ok', true, 'transferred', true,
                            'conversation_id', p_conversation_id, 'new_owner', p_new_owner_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.transfer_team_conversation_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_team_conversation_ownership(uuid, uuid) TO authenticated;

-- 5) Policies de membership reescritas:
--    INSERT — exige member_role='member' (sem injeção de owner/admin por DML direto; papéis
--             altos só nascem via RPC) e autorização canônica: membro da conversa,
--             admin/supervisor (user_roles) ou o criador (fallback de bootstrap).
DROP POLICY IF EXISTS tcm_insert_member ON public.team_conversation_members;
CREATE POLICY tcm_insert_member ON public.team_conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    member_role = 'member'
    AND (
      public.is_team_conversation_member(auth.uid(), team_conversation_members.conversation_id)
      OR public.is_admin_or_supervisor(auth.uid())
      OR public.is_team_conversation_creator(auth.uid(), team_conversation_members.conversation_id)
    )
  );

--    DELETE — mesma autorização de antes (próprio ou admin/supervisor), agora canônica
--             (user_roles), e com guarda de último owner: grupo/departamento não fica órfão.
--             O dono transfere a propriedade antes de sair (item 4) — a saída com promoção
--             automática é da RPC leave_team_group, corrigida em cartão próprio (TC-004).
DROP POLICY IF EXISTS tcm_delete_own_or_admin ON public.team_conversation_members;
CREATE POLICY tcm_delete_own_or_admin ON public.team_conversation_members
  FOR DELETE TO authenticated
  USING (
    (
      profile_id = public.current_profile_id()
      OR public.is_admin_or_supervisor(auth.uid())
    )
    AND NOT public.is_last_team_conversation_owner(
      team_conversation_members.conversation_id,
      team_conversation_members.profile_id
    )
  );

-- 6) Grants efetivos por coluna: o UPDATE de tabela inteira ia por cima dos REVOKEs de
--    coluna de 20260928570000 (type, created_by, department_id). Agora o autenticado só
--    escreve colunas de apresentação; identidade (type, created_by, department_id,
--    direct_member_a/b, id, created_at) não é tocável por DML.
REVOKE UPDATE ON public.team_conversations FROM authenticated;
GRANT UPDATE (name, avatar_url, updated_at) ON public.team_conversations TO authenticated;

-- 7) Mesma invariante do item 5 no caminho da RPC: o último owner não pode ser rebaixado
--    (antes qualquer owner/admin conseguia deixar o grupo sem owner por esta função).
CREATE OR REPLACE FUNCTION public.set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_new_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'invalid role: %', p_new_role;
  END IF;
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_conversation_members
      WHERE conversation_id = p_conversation_id
        AND profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND member_role = 'owner'
    ) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;
  IF p_new_role <> 'owner'
     AND public.is_last_team_conversation_owner(p_conversation_id, p_profile_id) THEN
    RAISE EXCEPTION 'last_owner_must_transfer_ownership';
  END IF;
  UPDATE public.team_conversation_members
  SET    member_role = p_new_role
  WHERE  conversation_id = p_conversation_id
    AND  profile_id      = p_profile_id;
END;
$function$;
