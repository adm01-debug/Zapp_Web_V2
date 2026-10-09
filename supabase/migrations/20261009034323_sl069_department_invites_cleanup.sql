-- sl069_department_invites_cleanup
-- Rollback: DROP FUNCTION IF EXISTS public.set_profile_department(uuid, uuid); CREATE TABLE IF NOT EXISTS public.department_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE, code text NOT NULL UNIQUE, created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_dept_invites_dept_id ON public.department_invites(department_id); CREATE INDEX IF NOT EXISTS idx_dept_invites_code ON public.department_invites(code); CREATE INDEX IF NOT EXISTS idx_dept_invites_created_by ON public.department_invites(created_by); ALTER TABLE public.department_invites ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS dept_invites_select_authenticated ON public.department_invites; CREATE POLICY dept_invites_select_authenticated ON public.department_invites FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS dept_invites_insert_authenticated ON public.department_invites; CREATE POLICY dept_invites_insert_authenticated ON public.department_invites FOR INSERT TO authenticated WITH CHECK (true); DROP POLICY IF EXISTS dept_invites_delete_authenticated ON public.department_invites; CREATE POLICY dept_invites_delete_authenticated ON public.department_invites FOR DELETE TO authenticated USING (true); GRANT ALL ON TABLE public.department_invites TO anon, authenticated, service_role; REVOKE ALL ON TABLE public.department_invites FROM anon; REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.department_invites FROM anon, authenticated;
--
-- ATENCAO sobre o rollback: ele recria public.department_invites VAZIA — o DROP nao devolve o
-- conteudo; as linhas que estavam na tabela se perdem (o formato, os 3 indices, a RLS, as 3
-- policies e a ACL final canonica voltam; o dado, nao). O GRANT ALL do bloco reproduz o
-- ALTER DEFAULT PRIVILEGES do Supabase sobre a tabela recriada; os dois REVOKEs em seguida
-- devolvem a ACL final canonica (20260928460000 e 20260928450000, nesta ordem).
--
-- SL-069 (t_6536c5a0) — sobra de banco do Team Chat: a tabela legada department_invites
-- (20260927400000) ficou aposentada depois que o front migrou para department_invitations +
-- RPCs atuais (t_aafdba3e); faltava a migration versionada que a remove e a RPC de troca de
-- departamento do plano (TC-40, docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md:225).
--
-- 1) public.set_profile_department(p_profile_id uuid, p_department_id uuid) RETURNS void,
--    SECURITY DEFINER, admin-only pela mesma guarda de create_department_invite /
--    set_department_whatsapp_config (SELECT (role IN ('admin','supervisor')) ... FROM
--    public.profiles WHERE id = current_profile_id()): autenticado sem perfil -> not_authenticated
--    (42501); chamador sem papel admin/supervisor -> not_authorized (42501); departamento de
--    destino inexistente ou inativo -> department_not_found (22023); perfil alvo inexistente ->
--    profile_not_found (22023). UPDATE + auditoria na MESMA transacao: 'join_department' quando
--    entra em departamento, 'remove_member' quando sai (p_department_id NULL) e havia
--    departamento anterior; se o perfil nao tinha departamento e esta sendo "removido", nada
--    mudou de fato e NENHUMA auditoria e gravada (department_audit_logs.department_id e NOT NULL
--    e nao ha origem). profile_id da auditoria = o membro movido (p_profile_id); o ator fica em
--    details.actor_profile_id. O vocabulario do CHECK department_audit_logs_action_check NAO e
--    alterado (join_department/remove_member ja sao aceitos).
-- 2) DROP TABLE IF EXISTS public.department_invites — sem call-site de producao em src/
--    (.from('department_invites')): o contrato vivo e department_invitations.
--
-- Prova: scripts/db-audit/sl069-set-profile-department.test.sh (Postgres descartavel, papel real).

CREATE OR REPLACE FUNCTION public.set_profile_department(p_profile_id uuid, p_department_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_profile_id        uuid;
  v_is_admin          boolean;
  v_old_department_id uuid;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Guarda de admin: mesmo padrao de create_department_invite / set_department_whatsapp_config.
  SELECT (role IN ('admin','supervisor')) INTO v_is_admin
  FROM public.profiles WHERE id = v_profile_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Destino: so departamento que existe E esta ativo (trava a linha).
  IF p_department_id IS NOT NULL THEN
    PERFORM 1 FROM public.departments
     WHERE id = p_department_id AND is_active
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'department_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Alvo: le o departamento ANTERIOR ja travando a linha do perfil.
  SELECT department_id INTO v_old_department_id
  FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET department_id = p_department_id WHERE id = p_profile_id;

  -- Auditoria na mesma transacao, so com verbos do CHECK vigente.
  IF p_department_id IS NOT NULL THEN
    INSERT INTO public.department_audit_logs (department_id, action, profile_id, details)
    VALUES (
      p_department_id,
      'join_department',
      p_profile_id,
      jsonb_build_object(
        'actor_profile_id', v_profile_id,
        'previous_department_id', v_old_department_id
      )
    );
  ELSIF v_old_department_id IS NOT NULL THEN
    INSERT INTO public.department_audit_logs (department_id, action, profile_id, details)
    VALUES (
      v_old_department_id,
      'remove_member',
      p_profile_id,
      jsonb_build_object('actor_profile_id', v_profile_id)
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_profile_department(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_department(uuid, uuid) TO authenticated;

-- Tabela legada aposentada pelo contrato department_invitations + RPCs atuais.
DROP TABLE IF EXISTS public.department_invites;
