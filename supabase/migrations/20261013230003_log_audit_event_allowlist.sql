-- log_audit_event_allowlist
-- Rollback: recria public.log_audit_event com o corpo ANTERIOR (SQL executavel na linha abaixo); so a funcao muda, nada em tabela/policy/GRANT.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.log_audit_event(p_action text, p_entity_type text default null::text, p_entity_id text default null::text, p_details jsonb default null::jsonb, p_user_agent text default null::text) returns void language plpgsql security definer set search_path to 'public' as $$ declare v_user_id uuid; v_entity_id_uuid uuid; begin v_user_id := auth.uid(); if v_user_id is null then return; end if; if p_entity_id is not null and p_entity_id <> '' then begin v_entity_id_uuid := p_entity_id::uuid; exception when invalid_text_representation then v_entity_id_uuid := null; end; end if; insert into public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent) values (v_user_id, p_action, p_entity_type, v_entity_id_uuid, p_details, p_user_agent); end; $$;
--
-- t_e2d34fee — o cliente só grava ação PERMITIDA em public.audit_logs.
--
-- Antes: public.log_audit_event(p_action text, ...) aceitava QUALQUER texto e
-- gravava direto em audit_logs.action. Um agente autenticado forjava a trilha
-- com action='role_granted' / 'settings_changed' / '' e a RPC registrava. O único
-- filtro da coluna era 'não vazio'.
--
-- Agora a RPC só grava as ações que a ponta REALMENTE envia hoje
-- (levantadas em src: src/lib/audit.ts, src/lib/errorReporter.ts,
-- src/components/calls/CallDialog.tsx, src/components/auth/ProtectedRoute.tsx,
-- src/components/contacts/LocationPicker.tsx, src/components/compliance/LGPDComplianceView.tsx
-- e os módulos de searchbox). Ação fora da allowlist devolve neutro (void, sem
-- erro) — não vira linha e não revela se algo existia (sem oráculo).
--
-- Ações sensíveis (papéis, configurações, rede, contas) NÃO entram aqui: só por
-- gatilho (dono da tabela, ignora RLS) ou service_role. O INSERT direto do
-- cliente em audit_logs já é negado pela política "Block direct audit log inserts".
--
-- Guardas acrescentadas, todas neutras (sem erro na ponta):
--   1) allowlist de ação;
--   2) teto de 4096 bytes em p_details;
--   3) rate limit de 60 eventos/min por usuário;
--   4) 'login' no máximo 1x por dia por usuário;
--   5) advisory lock por usuário em volta do "checa-e-grava" (corrida entre
--      chamadas simultâneas não fura o rate limit nem o login).
-- O restante do comportamento é preservado: auth.uid() nulo não grava (anon e
-- service_role continuam fora) e p_entity_id inválido vira entity_id nulo.
--
-- Não muda RLS, policy, tabela nem ACL: só o corpo da função. O CREATE OR REPLACE
-- preserva os GRANTs vigentes; as linhas de ACL logo abaixo só os reafirmam.

CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_entity_id_uuid uuid;
  -- Ações que o CLIENTE (papel authenticated) pode registrar.
  c_acoes constant text[] := ARRAY[
    'login', 'logout', 'client_error', 'unauthorized_access',
    'searchbox_session', 'searchbox_cost_guard', 'searchbox_budget_warning', 'searchbox_selected',
    'location_sent', 'call_started', 'call_ended', 'gdpr_deletion_request'
  ];
  c_max_details constant integer := 4096;
  c_max_minuto  constant integer := 60;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 1) allowlist: fora dela, retorno neutro (nem grava, nem erra).
  IF p_action IS NULL OR NOT (p_action = ANY (c_acoes)) THEN
    RETURN;
  END IF;

  -- 2) teto de p_details (4 KB) — evita trilha inflada por payload grande.
  IF p_details IS NOT NULL AND octet_length(p_details::text) > c_max_details THEN
    RETURN;
  END IF;

  -- serializa o "checa-e-grava" por usuário: sem isto duas chamadas simultâneas
  -- poderiam passar juntas pelo rate limit / pelo login do dia.
  PERFORM pg_advisory_xact_lock(hashtext('log_audit_event:' || v_user_id::text));

  -- 3) rate limit: 60 eventos por minuto por usuário.
  IF (SELECT count(*) FROM public.audit_logs
        WHERE user_id = v_user_id AND created_at > now() - interval '1 minute') >= c_max_minuto THEN
    RETURN;
  END IF;

  -- 4) 'login' no máximo 1x por dia por usuário.
  IF p_action = 'login' AND EXISTS (
       SELECT 1 FROM public.audit_logs
        WHERE user_id = v_user_id AND action = 'login'
          AND created_at > now() - interval '1 day') THEN
    RETURN;
  END IF;

  -- 5) p_entity_id (text) -> uuid, com valor inválido virando NULL (preservado).
  IF p_entity_id IS NOT NULL AND p_entity_id <> '' THEN
    BEGIN
      v_entity_id_uuid := p_entity_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_entity_id_uuid := NULL;
    END;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, v_entity_id_uuid, p_details, p_user_agent);
END;
$function$;

-- ACL explícita pela assinatura exata, IGUAL à vigente (CREATE OR REPLACE
-- preserva; reafirmada para o contrato ficar visível): sem PUBLIC, sem anon.
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, jsonb, text) TO authenticated, service_role;
