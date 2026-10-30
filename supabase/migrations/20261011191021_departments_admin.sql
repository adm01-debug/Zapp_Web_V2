-- departments_admin
-- Rollback: dropa as RPCs public.delete_department(uuid, uuid) e public.departments_overview(), restaura a policy departments_admin_write para is_admin_or_supervisor e devolve o GRANT DELETE em public.departments ao authenticated.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.delete_department(uuid, uuid);
--   drop function if exists public.departments_overview();
--   drop policy if exists departments_admin_write on public.departments;
--   create policy departments_admin_write on public.departments for all to authenticated using (public.is_admin_or_supervisor(auth.uid())) with check (public.is_admin_or_supervisor(auth.uid()));
--   grant delete on public.departments to authenticated;
--
-- DEPARTAMENTOS PELO ADMIN (cartao departments-admin-gestao): a tela de departamentos do V3
-- (docs/estado/01-frontend.md, "DepartmentsPage" — admin) precisa criar, renomear e EXCLUIR com
-- seguranca. Em V2 a tabela departments existia so para leitura pelo usuario logado
-- (departments_select USING(true)) com escrita ampla para admin OU supervisor
-- (departments_admin_write, 20260902120000) e DELETE de TABELA concedido ao authenticated —
-- qualquer admin podia apagar a linha direto e disparar o ON DELETE CASCADE de
-- team_conversations (FK de 20260929200000), apagando conversas em cascata sem checagem.
--
-- O que esta migration faz, so nesta area:
--
--   1. RLS: departments_admin_write passa a exigir public.is_admin(auth.uid()) (GATE 16,
--      20260830150000: WRITES -> is_admin(); SELECT mantem departments_select). Supervisores
--      continuam podendo LER e continuam usando as RPCs SECURITY DEFINER de departamento
--      (create_department_invite, set_department_whatsapp_config) — que nao passam pela policy.
--   2. ACL: REVOKE DELETE ON public.departments FROM authenticated. Sem o grant de tabela nao
--      existe DELETE direto via PostgREST: a exclusao passa obrigatoriamente pela RPC abaixo.
--      anon ja nao tem grant nenhum (20260928460000). O SELECT/INSERT/UPDATE por coluna
--      (sem whatsapp_api_key/whatsapp_instance_id) fica como esta (20260930530000).
--   3. public.delete_department(p_department_id uuid, p_move_to uuid DEFAULT NULL) -> jsonb.
--      So admin. Recusa (sem apagar nada) quando ha membros/conversas/filas ligados e
--      p_move_to e nulo, devolvendo as contagens. Com p_move_to, move membros e conversas
--      para o departamento destino, apaga a linha e registra a auditoria — tudo em uma unica
--      transacao (qualquer RAISE desfaz o conjunto).
--   4. public.departments_overview() -> (id, nome, ativo, membros, filas, conversas) por
--      departamento, so admin.
--
-- Filas: no schema V2 nao ha coluna de departamento em queues/queue_members; a unica ligacao
-- real e o membro da fila (queue_members.profile_id -> profiles.department_id). Por isso "fila
-- ligada ao departamento" e definida aqui como fila com ao menos um membro ATIVO cujo profile
-- pertence ao departamento. O comentario fica no SQL para o revisor conferir a definicao.
--
-- Efeitos colaterais conferidos: a FK profiles.department_id e NO ACTION (mover e obrigatorio
-- antes de apagar); team_conversations.department_id e ON DELETE CASCADE (a checagem de contagem
-- impede a cascata acidental); o indice unico (department_id WHERE type='department') admite uma
-- conversa-tipo por departamento, entao mover duas colidiria e a RPC recusa antes de tocar dados;
-- department_audit_logs.department_id e ON DELETE CASCADE (a auditoria por departamento do alvo
-- apagado some junto) — por isso o fato da exclusao tambem vai para public.audit_logs, que nao
-- tem FK para departments e sobrevive. Nenhum telefone/texto entra em detalhe de auditoria.

-- 1 + 2: policy de escrita passa a is_admin(); fecha o DELETE direto.
DROP POLICY IF EXISTS departments_admin_write ON public.departments;
CREATE POLICY departments_admin_write ON public.departments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

REVOKE DELETE ON public.departments FROM authenticated;

-- 3: exclusao segura.
CREATE OR REPLACE FUNCTION public.delete_department(
  p_department_id uuid,
  p_move_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_department_name text;
  v_members integer := 0;
  v_conversations integer := 0;
  v_queues integer := 0;
  v_moved_members integer := 0;
  v_moved_conversations integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT d.name INTO v_department_name
  FROM public.departments d
  WHERE d.id = p_department_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'department_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_move_to IS NOT NULL THEN
    IF p_move_to = p_department_id THEN
      RAISE EXCEPTION 'invalid_move_target' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = p_move_to) THEN
      RAISE EXCEPTION 'move_target_not_found' USING ERRCODE = 'P0002';
    END IF;

    -- O indice unico idx_team_conversations_dept_unique admite UMA conversa de
    -- type='department' por departamento: mover duas colidiria. Recusa antes do DML.
    IF EXISTS (
         SELECT 1 FROM public.team_conversations tc
          WHERE tc.department_id = p_department_id AND tc.type = 'department'
       )
       AND EXISTS (
         SELECT 1 FROM public.team_conversations tc
          WHERE tc.department_id = p_move_to AND tc.type = 'department'
       )
    THEN
      RAISE EXCEPTION 'move_target_already_has_department_conversation' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT count(*) INTO v_members
  FROM public.profiles p
  WHERE p.department_id = p_department_id;

  SELECT count(*) INTO v_conversations
  FROM public.team_conversations tc
  WHERE tc.department_id = p_department_id;

  SELECT count(DISTINCT qm.queue_id) INTO v_queues
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE p.department_id = p_department_id
    AND qm.is_active IS NOT FALSE;

  IF (v_members > 0 OR v_conversations > 0 OR v_queues > 0) AND p_move_to IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'department_in_use',
      'members', v_members,
      'conversations', v_conversations,
      'queues', v_queues
    );
  END IF;

  IF p_move_to IS NOT NULL THEN
    -- O gatilho update_profiles_updated_at regrava updated_at em QUALQUER UPDATE. Uma
    -- movimentacao de vinculo (quem pertence a qual departamento) nao e mudanca de conteudo
    -- do perfil, entao a data nao deve ser reescrita (recusa real de 06/10). Desliga SO esse
    -- gatilho durante o UPDATE e o religa logo depois, na MESMA transacao: erro adiante
    -- aborta tudo e o gatilho volta intacto (DDL e transacional).
    ALTER TABLE public.profiles DISABLE TRIGGER update_profiles_updated_at;
    UPDATE public.profiles
       SET department_id = p_move_to
     WHERE department_id = p_department_id;
    GET DIAGNOSTICS v_moved_members = ROW_COUNT;
    ALTER TABLE public.profiles ENABLE TRIGGER update_profiles_updated_at;

    -- Mesmo motivo para as conversas migradas.
    ALTER TABLE public.team_conversations DISABLE TRIGGER update_team_conversations_updated_at;
    UPDATE public.team_conversations
       SET department_id = p_move_to
     WHERE department_id = p_department_id;
    GET DIAGNOSTICS v_moved_conversations = ROW_COUNT;
    -- A FK de team_conversations e DEFERRABLE: o UPDATE deixa evento pendente e o
    -- ALTER ... ENABLE recusaria com "pending trigger events". Forco as checagens
    -- diferidas agora (SET CONSTRAINTS e do escopo da transacao) e religo o gatilho.
    SET CONSTRAINTS ALL IMMEDIATE;
    ALTER TABLE public.team_conversations ENABLE TRIGGER update_team_conversations_updated_at;
  END IF;

  DELETE FROM public.departments WHERE id = p_department_id;

  IF p_move_to IS NOT NULL THEN
    INSERT INTO public.department_audit_logs (department_id, action, profile_id, details)
    VALUES (
      p_move_to,
      'delete_department',
      public.current_profile_id(),
      jsonb_build_object(
        'deleted_department_id', p_department_id,
        'deleted_department_name', v_department_name,
        'moved_members', v_moved_members,
        'moved_conversations', v_moved_conversations
      )
    );
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'delete_department',
    'department',
    p_department_id,
    jsonb_build_object(
      'department_name', v_department_name,
      'move_to', p_move_to,
      'moved_members', v_moved_members,
      'moved_conversations', v_moved_conversations,
      'had_queue_links', v_queues
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'department_id', p_department_id,
    'name', v_department_name,
    'moved_members', v_moved_members,
    'moved_conversations', v_moved_conversations
  );
END;
$fn$;

-- 4: visao agregada por departamento.
CREATE OR REPLACE FUNCTION public.departments_overview()
RETURNS TABLE (
  department_id uuid,
  name text,
  is_active boolean,
  member_count bigint,
  queue_count bigint,
  conversation_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.name,
    d.is_active,
    (SELECT count(*) FROM public.profiles p WHERE p.department_id = d.id),
    (SELECT count(DISTINCT qm.queue_id)
       FROM public.queue_members qm
       JOIN public.profiles p2 ON p2.id = qm.profile_id
      WHERE p2.department_id = d.id
        AND qm.is_active IS NOT FALSE),
    (SELECT count(*) FROM public.team_conversations tc WHERE tc.department_id = d.id)
  FROM public.departments d
  ORDER BY d.name;
END;
$fn$;

-- ACL: nenhuma das duas e para o publico; authenticated chama e o portao de papel decide.
REVOKE EXECUTE ON FUNCTION public.delete_department(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_department(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.departments_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.departments_overview() TO authenticated;
