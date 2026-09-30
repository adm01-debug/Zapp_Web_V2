#!/usr/bin/env bash
# Contrato de comportamento do modulo Contatos (plano de 100 etapas, F1):
#   7/8/10 - delete_contact/delete_contacts (soft-delete) e filtro de excluidos nas leituras
#   11     - desligamento da Sicoob Bridge (trigger + funcao)
#   14     - contacts.conversation_status canonico (um CHECK + FSM alinhado)
#   15     - grants de public.contacts (sem TRUNCATE/REFERENCES; anon sem SELECT)
#
# (item 8, endurecimento do contrato) O que este arquivo NAO provava antes, e agora prova:
#   a) `expect_failure` aceitava QUALQUER erro nao-zero (inclusive
#      'function does not exist' ou erro de sintaxe) -- agora a MENSAGEM e conferida;
#   b) nao existia NENHUM `SELECT ... FROM public.contacts` rodando como `authenticated`:
#      a policy `contacts_select_policy` so era exercitada de lado, pelo RETURNING dos
#      UPDATE das RPCs (que sao SECURITY DEFINER e nao passam por RLS);
#   c) 20260929770000 e 20260929810000 so eram 'pegas' por CRASH de aplicacao, sem assercao
#      nomeada; o ACL de `service_role` e a revogacao de PUBLIC nunca eram conferidos;
#   d) as chamadas de delete_contact setavam so `request.jwt.claim.sub`, entao os guards de
#      atribuicao/fila (que decidem por `request.jwt.claims->>'role'`) ficavam INATIVOS
#      nesse caminho;
#   e) varias assercoes eram puro TEXTO (`pg_get_functiondef LIKE '%can_edit_contact%'`) --
#      cada uma delas ganhou a CONTRAPROVA COMPORTAMENTAL correspondente (somada, nao trocada).
#
# Roda em PostgreSQL 17 descartavel, com o estado ANTERIOR as migrations reproduzido fiel
# (os dois CHECKs conflitantes de status, o FSM antigo de 4 estados, o trigger da Sicoob e
# os grants default do Supabase). A prova do P0 da auditoria de 29/09 e o passo "RED":
# antes da migration 14/15, gravar conversation_status='pending' tem de FALHAR; depois, tem
# de passar. Nenhuma credencial de producao entra aqui.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_soft_delete="$repo_root/supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql"
migration_sicoob="$repo_root/supabase/migrations/20260929380000_disable_sicoob_bridge_trigger.sql"
migration_status="$repo_root/supabase/migrations/20260929560000_contacts_conversation_status_and_grants.sql"
migration_delete_align="$repo_root/supabase/migrations/20260929720000_contacts_delete_align_edit_policy.sql"
migration_helper="$repo_root/supabase/migrations/20260929770000_contacts_can_edit_contact_helper.sql"
migration_single_predicate="$repo_root/supabase/migrations/20260929780000_contacts_single_permission_predicate.sql"
migration_guards="$repo_root/supabase/migrations/20260929790000_contacts_hijack_guards_only_on_change.sql"
migration_hoisted="$repo_root/supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql"
migration_can_delete_hoisted="$repo_root/supabase/migrations/20260929820000_contacts_can_delete_contacts_hoisted_params.sql"
postgres_image="${CONTACTS_F1_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-contacts-f1-test-$$"
tmp_dir="$(mktemp -d /tmp/zapp-v2-contacts-f1-test.XXXXXX)"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-contacts-f1-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    /tmp/zapp-v2-contacts-f1-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_failure() {
  # $3 (opcional, mas usado em TODAS as chamadas) e uma ERE que a mensagem de erro tem de
  # casar. Exit != 0 sozinho nao e prova: 'function does not exist', erro de sintaxe e
  # 'permission denied' tambem saem com status != 0 e fariam a assercao passar por motivo
  # errado -- foi assim que as migrations 20260929770000/20260929810000 quase ficaram sem
  # contrato (o teste morria no meio de outra assercao, sem nome e sem contagem).
  local label="$1" sql="$2" expected_re="${3:-}" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
  fi
  if [[ -n "$expected_re" ]] && ! grep -qE -- "$expected_re" <<<"$output"; then
    printf '%s\n' "$output" >&2
    fail "$label: falhou, mas nao com o erro esperado (esperava /$expected_re/)"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# ── Estado ANTERIOR as migrations (fiel ao banco de 29/09) ────────────────────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  nickname text,
  surname text,
  job_title text,
  company text,
  phone text NOT NULL,
  email text,
  avatar_url text,
  tags text[],
  notes text,
  contact_type text,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  conversation_status text DEFAULT 'open',
  conversation_status_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  address text,
  address_number text,
  neighborhood text,
  city text,
  state text,
  postal_code text
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_select_policy ON public.contacts FOR SELECT TO authenticated USING (true);

-- Os DOIS CHECKs conflitantes que a auditoria de 29/09 encontrou ativos ao mesmo tempo.
ALTER TABLE public.contacts ADD CONSTRAINT contacts_conversation_status_check
  CHECK (conversation_status IN ('open', 'waiting', 'resolved', 'archived'));
ALTER TABLE public.contacts ADD CONSTRAINT chk_conversation_status_values
  CHECK (conversation_status IS NULL OR conversation_status IN ('open', 'resolved', 'pending', 'closed'));

-- FSM anterior (4 estados) + trigger, exatamente como estavam em producao.
CREATE FUNCTION public.enforce_conversation_status_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.conversation_status = NEW.conversation_status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open', 'resolved')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open', 'archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status = 'open')
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %',
      OLD.conversation_status, NEW.conversation_status
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_contacts_fsm_transition BEFORE UPDATE ON public.contacts FOR EACH ROW
  WHEN (old.conversation_status IS DISTINCT FROM new.conversation_status)
  EXECUTE FUNCTION public.enforce_conversation_status_transition();

-- Sicoob Bridge: trigger em messages + funcao que a alimentava.
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  is_read boolean DEFAULT false
);
CREATE FUNCTION public.notify_sicoob_on_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN RETURN NEW; END; $function$;
CREATE TRIGGER trg_sicoob_reply AFTER INSERT ON public.messages FOR EACH ROW
  EXECUTE FUNCTION public.notify_sicoob_on_reply();

-- Helpers de visibilidade (mesmo contrato dos reais).
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT _user_id = '20000000-0000-0000-0000-000000000009'::uuid $$;

-- Policy de UPDATE vigente (pre-20260929780000): precisa existir para o RLS deixar algum
-- UPDATE passar -- sem ela o teste mediria "RLS negou", nao o guard de atribuicao.
CREATE POLICY "Users can update their assigned contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    OR (queue_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.queue_members qm
         WHERE qm.queue_id = public.contacts.queue_id
           AND qm.profile_id = get_profile_id_for_user(auth.uid())
           AND qm.is_active = true
       ))
  );

-- Guards de atribuicao/fila no estado ANTERIOR ao 20260929790000, fieis aos que
-- estao em producao: decidem apenas por NEW, sem comparar com OLD. E esse detalhe
-- que faz um UPDATE que nao toca em assigned_to/queue_id (soft-delete, nota,
-- telefone) ser recusado com mensagem de atribuicao.
CREATE FUNCTION public.prevent_contact_assignee_hijack() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NEW.assigned_to IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM profiles p JOIN user_roles ur ON ur.user_id = p.user_id
        WHERE p.id = NEW.assigned_to AND p.is_active = true
          AND ur.role IN ('agent','supervisor','admin')
      ) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
      END IF;
    ELSIF NEW.assigned_to <> get_profile_id_for_user(auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.prevent_contact_queue_hijack() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NEW.queue_id IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM queue_members qm
       WHERE qm.queue_id = NEW.queue_id
         AND qm.profile_id = get_profile_id_for_user(auth.uid())
         AND qm.is_active = true
     )
  THEN
    RAISE EXCEPTION 'Sem permissao para mover contato para esta fila';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_prevent_contact_assignee_hijack BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_contact_assignee_hijack();
CREATE TRIGGER trg_prevent_contact_queue_hijack BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_contact_queue_hijack();

-- search_contacts/contacts_count_by_type no estado anterior (sem deleted_at).
CREATE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_search text; BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  RETURN QUERY
  SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
         c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
         c.created_at, c.updated_at, c.latitude, c.longitude,
         COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE (v_search IS NULL OR c.name ILIKE '%' || v_search || '%')
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from)
    AND (is_admin_or_supervisor(auth.uid()) OR c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid())))
  ORDER BY c.name ASC NULLS LAST, c.id ASC
  LIMIT page_size OFFSET page_offset;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer) TO authenticated, service_role;

CREATE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$;

-- Grants default do Supabase em public.contacts.
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.contacts TO authenticated;
GRANT SELECT ON public.contacts TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',true),
  ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003',false),
  -- (item 8) ATIVO mas SEM linha em user_roles: e o alvo que o guard de atribuicao recusa
  -- *por role* (o perfil 1000...003 e recusado por is_active). Sem este perfil nao daria para
  -- separar "guard inativo (sem claims)" de "guard ativo (com claims)".
  ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004',true),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009',true);
INSERT INTO public.user_roles VALUES
  ('20000000-0000-0000-0000-000000000001','agent'),
  ('20000000-0000-0000-0000-000000000002','agent'),
  ('20000000-0000-0000-0000-000000000009','admin');
INSERT INTO public.queues VALUES ('50000000-0000-0000-0000-000000000001');
INSERT INTO public.queues VALUES ('50000000-0000-0000-0000-000000000002');
INSERT INTO public.queue_members VALUES ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true);

-- 3 contatos: um do agente comum, um de outro dono, um sem dono (invisivel para o comum).
INSERT INTO public.contacts (id, name, phone, contact_type, assigned_to, conversation_status) VALUES
  ('30000000-0000-0000-0000-000000000001','Contato do agente','5511900000001','cliente','10000000-0000-0000-0000-000000000001','open'),
  ('30000000-0000-0000-0000-000000000002','Contato de outro','5511900000002','cliente','10000000-0000-0000-0000-000000000002','open'),
  ('30000000-0000-0000-0000-000000000003','Contato sem dono','5511900000003','fornecedor',NULL,'open');
-- 2 contatos COM fila, para a regra de exclusao alinhada a de edicao (policy de UPDATE):
--   ...0004 na fila do agente (ele e membro ativo) e atribuido a OUTRO perfil  -> pode excluir
--   ...0005 em fila alheia e atribuido a OUTRO perfil                         -> nao pode excluir
INSERT INTO public.contacts (id, name, phone, contact_type, assigned_to, queue_id, conversation_status) VALUES
  ('30000000-0000-0000-0000-000000000004','Contato da fila do agente','5511900000004','cliente','10000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','open'),
  ('30000000-0000-0000-0000-000000000005','Contato de fila alheia','5511900000005','cliente','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','open');
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

AGENTE='20000000-0000-0000-0000-000000000001'
ADMIN='20000000-0000-0000-0000-000000000009'
ALHEIO='20000000-0000-0000-0000-000000000002'
SEM_VINCULO='20000000-0000-0000-0000-000000000077'

# (item 8) `request.jwt.claims` COMPLETO (json com sub E role) alem de
# `request.jwt.claim.sub`. Os guards de atribuicao/fila decidem por
# `current_setting('request.jwt.claims')->>'role'`; com apenas o claim de sub eles ficam
# INATIVOS e o teste mede um caminho que o PostgREST nunca produz (ele manda os dois).
claims_agente="SET ROLE authenticated; SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$AGENTE\"}'; SET request.jwt.claim.sub='$AGENTE';"
claims_admin="SET ROLE authenticated; SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$ADMIN\"}'; SET request.jwt.claim.sub='$ADMIN';"
claims_alheio="SET ROLE authenticated; SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$ALHEIO\"}'; SET request.jwt.claim.sub='$ALHEIO';"
claims_sem_vinculo="SET ROLE authenticated; SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$SEM_VINCULO\"}'; SET request.jwt.claim.sub='$SEM_VINCULO';"

# ── RED: o P0 da auditoria, antes das migrations ──────────────────────────────────────────
expect_value 'RLS de contacts ligada' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid='public.contacts'::regclass"
expect_value 'nenhuma policy de DELETE em contacts (causa do P0)' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND cmd IN ('DELETE','ALL')"
expect_failure 'RED: gravacao de pending falha antes da migration 14 (CHECKs conflitantes)' \
  "UPDATE public.contacts SET conversation_status='pending' WHERE id='30000000-0000-0000-0000-000000000001'" \
  'Invalid conversation_status transition: open -> pending|violates check constraint "(contacts_conversation_status_check|chk_conversation_status_values)"'
expect_failure 'RED: transicao open->closed falha antes da migration 14' \
  "UPDATE public.contacts SET conversation_status='closed' WHERE id='30000000-0000-0000-0000-000000000001'" \
  'Invalid conversation_status transition: open -> closed|violates check constraint "(contacts_conversation_status_check|chk_conversation_status_values)"'

# ── Aplica as migrations da F1 ────────────────────────────────────────────────────────────
psql_file "$migration_soft_delete" >/dev/null
psql_file "$migration_sicoob" >/dev/null
psql_file "$migration_status" >/dev/null
psql_file "$migration_delete_align" >/dev/null
psql_file "$migration_helper" >/dev/null

# Producao tem search_contacts com as 6 colunas de endereco, mas o ARQUIVO de 20260929370000
# ficou com 17 colunas: o SQL realmente aplicado (ledger) tem 23 e o par arquivo<->ledger foi
# reconciliado por hash em scripts/db-audit/migration-evidence.json (safer-replay). O harness
# reproduz o estado REAL de producao aqui -- senao o proximo CREATE OR REPLACE seria recusado
# por mudanca de RETURNS (42P13) por um motivo que nao existe no banco.
cat > "$tmp_dir/search_contacts_producao.sql" <<'SQL'
DROP FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer);
CREATE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_search text; BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at, c.latitude, c.longitude,
    c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code,
    COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE
    c.deleted_at IS NULL
    AND (v_search IS NULL OR (
      c.name      ILIKE '%' || v_search || '%' OR
      c.nickname  ILIKE '%' || v_search || '%' OR
      c.surname   ILIKE '%' || v_search || '%' OR
      c.phone     ILIKE '%' || v_search || '%' OR
      c.email     ILIKE '%' || v_search || '%' OR
      c.company   ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter       IS NULL OR c.company      = company_filter)
    AND (job_title_filter     IS NULL OR c.job_title    = job_title_filter)
    AND (tag_filter           IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from            IS NULL OR c.created_at  >= date_from)
    AND (
      is_admin_or_supervisor(auth.uid())
      OR c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.queue_members qm
        WHERE qm.queue_id   = c.queue_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active  = true
      )
    )
  ORDER BY c.name ASC NULLS LAST, c.id ASC
  LIMIT page_size OFFSET page_offset;
END;
$function$;
SQL
psql_file "$tmp_dir/search_contacts_producao.sql" >/dev/null

psql_file "$migration_single_predicate" >/dev/null
psql_file "$migration_guards" >/dev/null
psql_file "$migration_hoisted" >/dev/null
psql_file "$migration_can_delete_hoisted" >/dev/null
# ═══════════════════════════════════════════════════════════════════════════════════════════
# (item 8) ASSERCOES NOVAS -- fecham os buracos apontados pela auditoria adversarial.
# Cada uma tem prova de mutacao (mutacao -> assercao que falhou) registrada no RESUMO.md.
# ═══════════════════════════════════════════════════════════════════════════════════════════

# Le assinatura + ACL de UMA funcao do public por pg_proc + aclexplode. Nao usa
# has_function_privilege de proposito: ela ESTOURA com erro de catalogo quando a funcao nao
# existe -- era exatamente assim ("ERROR: function public.can_edit_contact(uuid, uuid) does not
# exist" no meio de outra assercao) que a ausencia de 20260929770000/20260929810000 aparecia:
# sem nome, sem contagem. Devolve 'existe|auth=|svc=|anon=|public='.
fn_acl_tuple() {
  local fname="$1" sig="$2"
  cat <<FNSQL
WITH f AS (
  SELECT p.oid, p.proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '$fname'
    AND (SELECT string_agg(format_type(u.t, NULL), ', ' ORDER BY u.ord)
           FROM unnest(p.proargtypes) WITH ORDINALITY u(t, ord)) = '$sig'
)
SELECT
  CASE WHEN (SELECT count(*) FROM f) = 1 THEN 'existe' ELSE 'AUSENTE' END
  || '|auth='   || coalesce((SELECT EXISTS (SELECT 1 FROM aclexplode(f.proacl) a
        WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
          AND a.privilege_type = 'EXECUTE')::text FROM f), 'AUSENTE')
  || '|svc='    || coalesce((SELECT EXISTS (SELECT 1 FROM aclexplode(f.proacl) a
        WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
          AND a.privilege_type = 'EXECUTE')::text FROM f), 'AUSENTE')
  || '|anon='   || coalesce((SELECT EXISTS (SELECT 1 FROM aclexplode(f.proacl) a
        WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
          AND a.privilege_type = 'EXECUTE')::text FROM f), 'AUSENTE')
  || '|public=' || coalesce((SELECT (f.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(f.proacl) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))::text FROM f), 'AUSENTE')
FNSQL
}

# ── (b) as DUAS assinaturas de can_edit_contact: existencia + assinatura EXATA + ACL ──────────
# Assinatura exata pelos TIPOS dos argumentos (format_type sobre proargtypes): a versao de 2
# argumentos nao pode "engolir" a de 5 por default, e vice-versa (a de 5 e sem defaults
# justamente para nao criar ambiguidade -- 'function can_edit_contact is not unique').
expect_value '[b] can_edit_contact(uuid,uuid) existe, assinatura exata e ACL (auth+service_role; sem anon/PUBLIC)' \
  'existe|auth=true|svc=true|anon=false|public=false' \
  "$(fn_acl_tuple can_edit_contact 'uuid, uuid')"
expect_value '[b] can_edit_contact(uuid,uuid,uuid[],uuid,boolean) existe, assinatura exata e ACL (auth+service_role; sem anon/PUBLIC)' \
  'existe|auth=true|svc=true|anon=false|public=false' \
  "$(fn_acl_tuple can_edit_contact 'uuid, uuid, uuid[], uuid, boolean')"

# ── (d) ACL de service_role e revogacao de PUBLIC ─────────────────────────────────────────────
fns_chave="('public.delete_contact(uuid)'),('public.delete_contacts(uuid[])'),('public.can_edit_contact(uuid,uuid)'),('public.can_edit_contact(uuid,uuid,uuid[],uuid,boolean)'),('public.can_delete_contacts(uuid[])'),('public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer)')"
expect_value '[d] service_role tem EXECUTE nas 6 funcoes-chave do modulo' 'true,true,true,true,true,true' \
  "SELECT string_agg(has_function_privilege('service_role', v.f, 'EXECUTE')::text, ',') FROM (VALUES $fns_chave) v(f)"
# PUBLIC = grantee 0 em aclexplode; proacl NULL tambem significa EXECUTE para PUBLIC (ACL default).
# `search_contacts` fica FORA de proposito: o harness a recria com DROP + CREATE (para reproduzir
# o corpo de 23 colunas do ledger) e o DROP apaga o ACL manual, deixando proacl NULL -- artefato
# do harness, nao regressao. Limitacao registrada no RESUMO.md.
expect_value '[d] PUBLIC NAO tem EXECUTE nas 5 funcoes criadas pelas migrations' '0' \
  "SELECT count(*) FROM (VALUES ('public.delete_contact(uuid)'),('public.delete_contacts(uuid[])'),('public.can_edit_contact(uuid,uuid)'),('public.can_edit_contact(uuid,uuid,uuid[],uuid,boolean)'),('public.can_delete_contacts(uuid[])')) v(f) JOIN pg_proc p ON p.oid = v.f::regprocedure WHERE p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')"

# ── (c) A POLICY DE SELECT SOZINHA: leitura REAL de public.contacts sob RLS ───────────────────
# Ate aqui nao havia nenhum `SELECT ... FROM public.contacts` rodando como `authenticated`; a
# policy de SELECT so era tocada de lado (o RETURNING dos UPDATE das RPCs, que sao SECURITY
# DEFINER e nem passam por RLS). A leitura direta e o unico jeito de provar que
# `contacts_select_policy` filtra de verdade. Neste ponto da execucao ha 5 contatos vivos:
#   0001 dono = agente | 0002 dono = ALHEIO | 0003 sem dono/fila | 0004 fila do agente | 0005 fila alheia
# Este bloco vem ANTES das sondas de claims (e) de proposito: o PostgreSQL aplica tambem as
# policies de SELECT a UPDATE/DELETE, entao uma mutacao SO na policy de SELECT tem de ser
# detectada aqui -- se as sondas de UPDATE viessem primeiro, elas mascarariam a mutacao.
expect_value '[c] RLS de SELECT: usuario SEM VINCULO ve 0 dos 5 contatos' '0' \
  "$claims_sem_vinculo SELECT count(*) FROM public.contacts"
expect_value '[c] RLS de SELECT: agente ve exatamente os 2 contatos que pode editar' '2' \
  "$claims_agente SELECT count(*) FROM public.contacts"
expect_value '[c] RLS de SELECT: admin ve os 5 contatos vivos' '5' \
  "$claims_admin SELECT count(*) FROM public.contacts"

# ── (e) os guards de atribuicao/fila so disparam com `request.jwt.claims` COMPLETO ────────────
# Prova em dois tempos, no MESMO caminho que o teste de delete_contact passou a usar:
#   COM claims -> guard ATIVO   : reatribuir o contato da fila do agente para um perfil ATIVO
#                                 sem role operacional (1000...004) e recusado;
#   SEM claims -> guard INATIVO : a MESMA reatribuicao passa -- e o caminho que o teste media
#                                 antes do item 8, e o motivo de todas as chamadas de
#                                 delete_contact agora carregarem o claim completo.
# A ordem importa: a assercao COM claims falha sem mexer no estado; a SEM claims e a que
# efetiva a mudanca (0004 fica com assigned_to = 1000...004, ativo e SEM role -- o que mantem
# as assercoes do bloco dos guards sensiveis a regressao "guard olha so NEW").
expect_failure '[e] COM request.jwt.claims completo o guard de atribuicao fica ATIVO (reatribuicao para perfil sem role e recusada)' \
  "$claims_agente WITH u AS (UPDATE public.contacts SET assigned_to='10000000-0000-0000-0000-000000000004' WHERE id='30000000-0000-0000-0000-000000000004' RETURNING 1) SELECT count(*) FROM u" \
  'Sem permissao para atribuir contato a este agente'
expect_value '[e] SEM request.jwt.claims o guard fica INATIVO (a mesma reatribuicao passa)' '1' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; WITH u AS (UPDATE public.contacts SET assigned_to='10000000-0000-0000-0000-000000000004' WHERE id='30000000-0000-0000-0000-000000000004' RETURNING 1) SELECT count(*) FROM u"

# ── (f) CONTRAPROVAS COMPORTAMENTAIS das assercoes de TEXTO do bloco do helper ────────────────
# As assercoes de texto (`pg_get_functiondef LIKE '%can_edit_contact%'`, `qual LIKE ...`)
# continuam onde estao; o que faltava era medir o COMPORTAMENTO que elas tentam implicar.
# (f.1) contraprova de 'search_contacts usa o helper'
expect_value '[f] search_contacts do agente so devolve contatos que ele pode editar (2 de 5)' '2' \
  "$claims_agente SELECT count(*) FROM public.search_contacts()"
expect_value '[f] search_contacts de quem NAO tem vinculo devolve 0 dos 5' '0' \
  "$claims_sem_vinculo SELECT count(*) FROM public.search_contacts()"
# (f.2) contraprova de 'policy de UPDATE usa o helper' -- e do caminho que as RPCs SECURITY
# DEFINER existem para driblar (o admin edita o que a policy negaria ao agente).
# ATENCAO: o Postgres aplica as policies de SELECT tambem a UPDATE/DELETE, e as duas policies
# tem o MESMO predicado (e o proposito do helper) -- entao o caso 'agente NAO edita' tambem
# ficaria 0 linhas com a policy de UPDATE liberada. Quem separa os dois e o caso do admin
# (mutacao 'is_admin forcado a false' na policy de UPDATE: o admin continua VENDO o contato
# pela policy de SELECT e mesmo assim a edicao da 0 linhas).
expect_value '[f] policy de UPDATE: agente NAO edita contato alheio (0 linhas)' '0' \
  "$claims_agente WITH u AS (UPDATE public.contacts SET notes='item8-probe' WHERE id='30000000-0000-0000-0000-000000000002' RETURNING 1) SELECT count(*) FROM u"
expect_value '[f] policy de UPDATE: admin edita o mesmo contato alheio (1 linha)' '1' \
  "$claims_admin WITH u AS (UPDATE public.contacts SET notes='item8-probe-admin' WHERE id='30000000-0000-0000-0000-000000000002' RETURNING 1) SELECT count(*) FROM u"
# (f.3) contraprova de 'a versao de 2 argumentos delega para a de 5' e de 'policy passa os
# lookups por parametro': as duas assinaturas TEM de concordar nos 4 casos de borda (dono,
# alheio, fila propria, fila alheia) -- se a de 5 divergir da de 2, a delegacao quebrou.
expect_value '[f] can_edit_contact de 2 argumentos concorda com a de 5 nos 4 casos de borda' 'true,true,true,true' \
  "$claims_agente SELECT string_agg(eq, ',') FROM (SELECT (public.can_edit_contact(v.a, v.q) = public.can_edit_contact(v.a, v.q, (SELECT array_agg(x) FROM public.get_visible_agent_ids(auth.uid()) x), (SELECT public.get_profile_id_for_user(auth.uid())), (SELECT public.is_admin_or_supervisor(auth.uid()))))::text AS eq FROM (VALUES ('10000000-0000-0000-0000-000000000001'::uuid, NULL::uuid), ('10000000-0000-0000-0000-000000000002'::uuid, NULL::uuid), ('10000000-0000-0000-0000-000000000003'::uuid, '50000000-0000-0000-0000-000000000001'::uuid), (NULL::uuid, '50000000-0000-0000-0000-000000000002'::uuid)) v(a,q)) t"

# `can_delete_contacts` ignora contato ja excluido de proposito (a lista nao mostra excluidos).
expect_value 'can_delete_contacts: dono e membro de fila true, fila alheia false' 'true,true,false' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT string_agg(can_delete::text, ',' ORDER BY contact_id) FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000005']::uuid[])"
expect_value 'can_delete_contacts: sem vinculo nenhum devolve false' 'false,false,false' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000077'; SELECT string_agg(can_delete::text, ',' ORDER BY contact_id) FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000005']::uuid[])"
expect_value 'admin recebe can_delete true em contato alheio' 'true' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT string_agg(can_delete::text, ',') FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000005']::uuid[])"

# ── GREEN: etapa 14 (status canonico + FSM) ───────────────────────────────────────────────
expect_value 'so existe UM CHECK de conversation_status' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.contacts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%conversation_status%'"
expect_value 'GREEN: open -> pending passa' 'pending' \
  "UPDATE public.contacts SET conversation_status='pending' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"
expect_value 'GREEN: pending -> closed passa' 'closed' \
  "UPDATE public.contacts SET conversation_status='closed' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"
expect_value 'GREEN: closed -> archived passa' 'archived' \
  "UPDATE public.contacts SET conversation_status='archived' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"
expect_value 'GREEN: archived -> open (desarquivar) passa' 'open' \
  "UPDATE public.contacts SET conversation_status='open' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"
expect_value 'timestamps de transicao gravados' 't' \
  "SELECT (conversation_status_changed_at IS NOT NULL) FROM public.contacts WHERE id='30000000-0000-0000-0000-000000000001'"
expect_failure 'FSM ainda barra resolved -> waiting' \
  "UPDATE public.contacts SET conversation_status='resolved' WHERE id='30000000-0000-0000-0000-000000000001'; UPDATE public.contacts SET conversation_status='waiting' WHERE id='30000000-0000-0000-0000-000000000001'" \
  'Invalid conversation_status transition: resolved -> waiting'
expect_failure 'CHECK continua barrando valor fora do conjunto canonico' \
  "UPDATE public.contacts SET conversation_status='banana' WHERE id='30000000-0000-0000-0000-000000000001'" \
  'Invalid conversation_status transition: open -> banana|violates check constraint "chk_conversation_status_values"'
expect_value 'volta para open para o resto do teste' 'open' \
  "UPDATE public.contacts SET conversation_status='open' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"

# ── GREEN: etapas 7/9 (delete_contact/delete_contacts) ────────────────────────────────────
# (item 8) TODAS as chamadas usam `$claims_*` (json com sub E role): com apenas
# `request.jwt.claim.sub` os guards de atribuicao/fila ficam inativos nesse caminho e o teste
# media um caminho que o PostgREST nunca produz.
expect_value 'anon nao tem EXECUTE em delete_contact' 'f' \
  "SELECT has_function_privilege('anon','public.delete_contact(uuid)','EXECUTE')"
expect_value 'authenticated tem EXECUTE em delete_contact' 't' \
  "SELECT has_function_privilege('authenticated','public.delete_contact(uuid)','EXECUTE')"
expect_value 'admin exclui contato alheio e recebe o id' '30000000-0000-0000-0000-000000000002' \
  "$claims_admin SELECT public.delete_contact('30000000-0000-0000-0000-000000000002')"
expect_value 'contato excluido tem deleted_at preenchido' 't' \
  "SELECT (deleted_at IS NOT NULL) FROM public.contacts WHERE id='30000000-0000-0000-0000-000000000002'"
expect_value 'dono exclui o proprio contato' '30000000-0000-0000-0000-000000000001' \
  "$claims_agente SELECT public.delete_contact('30000000-0000-0000-0000-000000000001')"
expect_failure 'agente sem vinculo (nem dono, nem fila) nao exclui contato' \
  "$claims_agente SELECT public.delete_contact('30000000-0000-0000-0000-000000000003')" \
  'Contato nao encontrado ou sem permissao para excluir'
# (item 8) O contato 0004 tem fila E responsavel que o guard de atribuicao recusaria se ele
# olhasse so NEW (1000...004 e ativo, mas sem role operacional). Com o claim completo este
# delete_contact so passa porque os guards comparam OLD x NEW -- assercao de (e).
expect_value '[e] agente membro ATIVO da fila exclui contato de fila (claims completos; guard olha OLD x NEW)' '30000000-0000-0000-0000-000000000004' \
  "$claims_agente SELECT public.delete_contact('30000000-0000-0000-0000-000000000004')"
expect_failure 'agente de outra fila nao exclui contato de fila alheia' \
  "$claims_agente SELECT public.delete_contact('30000000-0000-0000-0000-000000000005')" \
  'Contato nao encontrado ou sem permissao para excluir'
expect_value 'admin exclui o contato de fila alheia (fecha o estado para as contagens)' '30000000-0000-0000-0000-000000000005' \
  "$claims_admin SELECT public.delete_contact('30000000-0000-0000-0000-000000000005')"
expect_failure 'excluir duas vezes falha em vez de fingir sucesso' \
  "$claims_admin SELECT public.delete_contact('30000000-0000-0000-0000-000000000002')" \
  'Contato nao encontrado ou sem permissao para excluir'
expect_failure 'delete_contacts sem nenhuma linha permitida falha' \
  "$claims_alheio SELECT public.delete_contacts(ARRAY['30000000-0000-0000-0000-000000000003']::uuid[])" \
  'Nenhum contato excluido: sem permissao ou ja excluido'
expect_value 'delete_contacts em lote devolve a contagem' '1' \
  "$claims_admin SELECT public.delete_contacts(ARRAY['30000000-0000-0000-0000-000000000003']::uuid[])"

# ── GREEN: etapas 8/10 (excluidos somem de search_contacts e contacts_count_by_type) ──────
expect_value 'search_contacts do admin nao devolve excluidos' '0' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT count(*) FROM public.search_contacts()"
expect_value 'contacts_count_by_type nao conta excluidos' '0' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT COALESCE(sum(count),0) FROM public.contacts_count_by_type()"
expect_value 'restaurar o soft-delete traz o contato de volta' '1' \
  "UPDATE public.contacts SET deleted_at=NULL WHERE id='30000000-0000-0000-0000-000000000001' RETURNING 1"
expect_value 'apos restaurar, search_contacts volta a enxergar' '1' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT count(*) FROM public.search_contacts()"
expect_value 'indice parcial de deleted_at existe' '1' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_contacts_deleted_at'"

# ── GREEN: etapa 11 (Sicoob Bridge desligada) ─────────────────────────────────────────────
expect_value 'trigger trg_sicoob_reply removido de messages' '0' \
  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.messages'::regclass AND tgname='trg_sicoob_reply'"
expect_value 'funcao notify_sicoob_on_reply removida' '0' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='notify_sicoob_on_reply'"

# ── GREEN: etapa 15 (grants) ──────────────────────────────────────────────────────────────
expect_value 'authenticated sem TRUNCATE/REFERENCES' 'f' \
  "SELECT has_table_privilege('authenticated','public.contacts','TRUNCATE,REFERENCES')"
expect_value 'anon sem SELECT' 'f' \
  "SELECT has_table_privilege('anon','public.contacts','SELECT')"
expect_value 'anon sem TRUNCATE/REFERENCES' 'f' \
  "SELECT has_table_privilege('anon','public.contacts','TRUNCATE,REFERENCES')"
expect_value 'authenticated preserva CRUD do front' 't' \
  "SELECT has_table_privilege('authenticated','public.contacts','SELECT,INSERT,UPDATE,DELETE')"
expect_value 'service_role preserva CRUD' 't' \
  "SELECT has_table_privilege('service_role','public.contacts','SELECT,INSERT,UPDATE,DELETE')"

# ── GREEN: debito pos-#1187 item 2 (um predicado so: ver/editar/excluir) ──────────────────
# As assercoes ABAIXO sao de TEXTO (`pg_get_functiondef LIKE '%can_edit_contact%'`,
# `qual LIKE '%get_visible_agent_ids%'`): provam que o helper foi CITADO, nao que ele
# GOVERNA. As contraprovas comportamentais correspondentes (item 8) estao no bloco
# '[f] CONTRAPROVAS COMPORTAMENTAIS' logo apos as migrations -- leitura real sob RLS,
# UPDATE negado/permitido pela policy e concordancia entre as duas assinaturas do helper.
expect_value 'helper can_edit_contact existe (2 args compat + 5 args policies)' '2' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='can_edit_contact'"
expect_value 'delete_contact usa o helper (sem predicado inline)' '1' \
  "SELECT (pg_get_functiondef('public.delete_contact(uuid)'::regprocedure) LIKE '%can_edit_contact%')::int"
expect_value 'delete_contacts usa o helper' '1' \
  "SELECT (pg_get_functiondef('public.delete_contacts(uuid[])'::regprocedure) LIKE '%can_edit_contact%')::int"
expect_value 'search_contacts usa o helper' '1' \
  "SELECT (pg_get_functiondef('public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer)'::regprocedure) LIKE '%can_edit_contact%')::int"
expect_value 'policy de UPDATE usa o helper' '1' \
  "SELECT (qual LIKE '%can_edit_contact%')::int FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='Users can update their assigned contacts'"
expect_value 'policy de SELECT usa o helper' '1' \
  "SELECT (qual LIKE '%can_edit_contact%')::int FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_select_policy'"
# (os casos de can_delete_contacts ficam no bloco logo apos as migrations, com os contatos vivos)
expect_failure 'anon nao pode chamar can_delete_contacts' \
  "SET ROLE anon; SELECT * FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])" \
  'permission denied for function can_delete_contacts'
# Expressao de policy roda como o CHAMADOR: sem EXECUTE para authenticated, todo SELECT
# em contacts passa a falhar com "permission denied for function can_edit_contact".
expect_value 'authenticated executa can_edit_contact (policy roda como chamador)' 't' \
  "SELECT has_function_privilege('authenticated','public.can_edit_contact(uuid,uuid)','EXECUTE')"
expect_value 'anon NAO executa can_edit_contact' 'f' \
  "SELECT has_function_privilege('anon','public.can_edit_contact(uuid, uuid)','EXECUTE')"
# 20260929795000: a versao de 5 argumentos e a que as policies chamam, e os lookups caros
# vao por parametro -- se alguem voltar a chamar a de 2 argumentos dentro da policy, o custo
# por linha volta (medido: 3,2s contra 128ms para varrer os 3.104 contatos de producao).
expect_value 'authenticated executa can_edit_contact de 5 argumentos' 't' \
  "SELECT has_function_privilege('authenticated','public.can_edit_contact(uuid, uuid, uuid[], uuid, boolean)','EXECUTE')"
expect_value 'anon NAO executa a versao de 5 argumentos' 'f' \
  "SELECT has_function_privilege('anon','public.can_edit_contact(uuid, uuid, uuid[], uuid, boolean)','EXECUTE')"
expect_value 'policy de UPDATE passa os lookups por parametro' '1' \
  "SELECT (qual LIKE '%get_visible_agent_ids%')::int FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='Users can update their assigned contacts'"
expect_value 'policy de SELECT passa os lookups por parametro' '1' \
  "SELECT (qual LIKE '%get_visible_agent_ids%')::int FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_select_policy'"
# 20260929820000: ultimo ponto de chamada da assinatura de 2 argumentos (o caro por linha).
expect_value 'can_delete_contacts passa os lookups por parametro' 'true' \
  "SELECT (pg_get_functiondef('public.can_delete_contacts(uuid[])'::regprocedure) LIKE '%array_agg%')::text"
expect_value 'nenhuma funcao do public usa a assinatura de 2 argumentos do helper' '0' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND regexp_replace(pg_get_functiondef(p.oid), E'\\\\s+', ' ', 'g') ~ 'can_edit_contact\\( *[a-z_.]+assigned_to, *[a-z_.]+queue_id *\\)'"
expect_value 'a versao de 2 argumentos delega para a de 5' 'true' \
  "SELECT (pg_get_functiondef('public.can_edit_contact(uuid, uuid)'::regprocedure) LIKE '%can_edit_contact(p_assigned_to, p_queue_id, NULL%')::text"
expect_value 'authenticated executa can_delete_contacts' 't' \
  "SELECT has_function_privilege('authenticated','public.can_delete_contacts(uuid[])','EXECUTE')"

# ── GREEN: debito pos-#1187 item 3 (guards de atribuicao so quando o campo muda) ──────────
# No estado anterior, qualquer UPDATE em contato com `queue_id` nulo e dono alheio era
# recusado com "Sem permissao para atribuir contato a este agente" -- mesmo sem ninguem
# ser reatribuido. As duas primeiras assercoes sao o que muda; as duas ultimas garantem
# que a protecao de verdade (reatribuir/trocar de fila) continua valendo.
# --1187 item 3 + item 8: contato COM fila cujo responsavel NAO tem role operacional (o
# guard o recusaria se olhasse so NEW). Antes, qualquer UPDATE nesse contato (nota, status,
# soft-delete) era recusado pelo guard do responsavel, mesmo sem ninguem ser reatribuido; agora
# o guard so olha reatribuicao de verdade e o membro da fila edita. As duas assercoes seguintes
# garantem que a protecao real continua valendo.
# (item 8) `$claims_agente` (json com sub E role) e definido no TOPO do arquivo, junto de
# `$claims_admin`/`$claims_alheio`/`$claims_sem_vinculo` -- um unico formato no arquivo.
expect_value 'contato de fila com responsavel sem role: membro da fila edita' '1' \
  "$claims_agente UPDATE public.contacts SET notes='ok' WHERE id='30000000-0000-0000-0000-000000000004' RETURNING 1"
expect_value 'soft-delete direto nao esbarra nos guards de atribuicao/fila' '1' \
  "$claims_agente UPDATE public.contacts SET deleted_at=now() WHERE id='30000000-0000-0000-0000-000000000004' RETURNING 1"
expect_failure 'reatribuir contato para outro agente continua proibido' \
  "$claims_agente UPDATE public.contacts SET assigned_to='10000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001'" \
  'Sem permissao para atribuir contato a este agente'
expect_failure 'mover contato para fila alheia continua proibido' \
  "$claims_agente UPDATE public.contacts SET queue_id='50000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000004'" \
  'Sem permissao para mover contato para esta fila'

# ── Idempotencia (as migrations sao reaplicaveis) ─────────────────────────────────────────
# `migration_soft_delete` fica FORA deste bloco de proposito: o arquivo de 20260929370000
# declara search_contacts com 17 colunas enquanto o SQL aplicado em producao tem 23 (o par
# arquivo<->ledger foi reconciliado por hash em scripts/db-audit/migration-evidence.json,
# safer-replay). Reaplicar o arquivo byte-a-byte nao e o comportamento esperado -- o que
# precisa ser reaplicavel sao as migrations seguintes, incluindo as deste PR.
psql_file "$migration_sicoob" >/dev/null
psql_file "$migration_status" >/dev/null
psql_file "$migration_delete_align" >/dev/null
psql_file "$migration_helper" >/dev/null
psql_file "$migration_single_predicate" >/dev/null
psql_file "$migration_guards" >/dev/null
psql_file "$migration_hoisted" >/dev/null
psql_file "$migration_can_delete_hoisted" >/dev/null
expect_value 'reaplicacao nao duplica a coluna deleted_at' '1' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='deleted_at'"
expect_value 'reaplicacao mantem um unico CHECK de status' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.contacts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%conversation_status%'"

printf 'Contacts F1 (soft-delete, Sicoob, status, grants) PostgreSQL 17 behavioral contract: PASS\n'
