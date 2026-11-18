CREATE OR REPLACE FUNCTION public.prevent_contact_assignee_hijack()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Espelha trg_prevent_contact_queue_hijack (20260924133700): a policy
  -- "Users can update their assigned contacts" tem USING (queue-membership
  -- ou ser o assigned_to atual) mas nenhum WITH CHECK simetrico -- um agente
  -- de fila compartilhada podia setar assigned_to para QUALQUER profiles.id
  -- do sistema (inclusive perfil de cliente, inativo ou UUID aleatorio), nao
  -- so um colega de verdade. Decisao de produto (2026-09-24): escopo e
  -- "qualquer colega ativo do time", nao restrito a fila especifica -- nao
  -- ha tabela de "time" no schema, entao o proxy e profiles.is_active +
  -- user_roles.role IN ('agent','supervisor','admin'), mesmo universo de
  -- roles operacionais ja usado em auto_assign_to_queue_agent/is_admin_or_supervisor.
  -- Mesmo guard de service_role do trigger irmao: Edge Functions (ex.
  -- reassign_absent_agents) continuam livres para rotear.
  --
  -- `OLD.assigned_to IS DISTINCT FROM NEW.assigned_to`: os guards so valem para
  -- reatribuicao de verdade. Sem isso, um update que nao toca em assigned_to
  -- (nota, telefone, deleted_at) era recusado com mensagem de atribuicao.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     AND NEW.assigned_to IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.user_id
        WHERE p.id = NEW.assigned_to
          AND p.is_active = true
          AND ur.role IN ('agent', 'supervisor', 'admin')
      ) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
      END IF;
    ELSIF NEW.assigned_to <> get_profile_id_for_user(auth.uid()) THEN
      -- Sem fila (queue_id nulo): so pode reivindicar para si mesmo.
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.prevent_contact_queue_hijack()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Guard: chamadas via service_role (Edge Functions, ex. ai-auto-tag) nao tem
  -- auth.uid() de usuario e devem poder rotear contatos livremente; so
  -- usuarios autenticados comuns sao restritos por este trigger (mesmo padrao
  -- de reassign_absent_agents/reassign_overloaded_agents).
  --
  -- `OLD.queue_id IS DISTINCT FROM NEW.queue_id`: o guard existe para impedir
  -- MOVER o contato para uma fila que o chamador nao habilito -- nao para punir
  -- update que mantem a fila (soft-delete, edicao de campos, mudanca de status).
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND OLD.queue_id IS DISTINCT FROM NEW.queue_id
     AND NEW.queue_id IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
     AND NOT EXISTS (
       SELECT 1
       FROM queue_members qm
       WHERE qm.queue_id = NEW.queue_id
         AND qm.profile_id = get_profile_id_for_user(auth.uid())
         AND qm.is_active = true
     )
  THEN
    RAISE EXCEPTION 'Sem permissao para mover contato para esta fila';
  END IF;

  RETURN NEW;
END;
$function$
