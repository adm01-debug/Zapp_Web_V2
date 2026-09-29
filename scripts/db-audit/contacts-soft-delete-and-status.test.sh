#!/usr/bin/env bash
# Contrato de comportamento do modulo Contatos (plano de 100 etapas, F1):
#   7/8/10 - delete_contact/delete_contacts (soft-delete) e filtro de excluidos nas leituras
#   11     - desligamento da Sicoob Bridge (trigger + funcao)
#   14     - contacts.conversation_status canonico (um CHECK + FSM alinhado)
#   15     - grants de public.contacts (sem TRUNCATE/REFERENCES; anon sem SELECT)
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
  local label="$1" sql="$2" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
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

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
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
  longitude double precision
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

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009');
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
  ('30000000-0000-0000-0000-000000000004','Contato da fila do agente','5511900000004','cliente','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','open'),
  ('30000000-0000-0000-0000-000000000005','Contato de fila alheia','5511900000005','cliente','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','open');
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

AGENTE='20000000-0000-0000-0000-000000000001'
ADMIN='20000000-0000-0000-0000-000000000009'
ALHEIO='20000000-0000-0000-0000-000000000002'

# ── RED: o P0 da auditoria, antes das migrations ──────────────────────────────────────────
expect_value 'RLS de contacts ligada' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid='public.contacts'::regclass"
expect_value 'nenhuma policy de DELETE em contacts (causa do P0)' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND cmd IN ('DELETE','ALL')"
expect_failure 'RED: gravacao de pending falha antes da migration 14 (CHECKs conflitantes)' \
  "UPDATE public.contacts SET conversation_status='pending' WHERE id='30000000-0000-0000-0000-000000000001'"
expect_failure 'RED: transicao open->closed falha antes da migration 14' \
  "UPDATE public.contacts SET conversation_status='closed' WHERE id='30000000-0000-0000-0000-000000000001'"

# ── Aplica as migrations da F1 ────────────────────────────────────────────────────────────
psql_file "$migration_soft_delete" >/dev/null
psql_file "$migration_sicoob" >/dev/null
psql_file "$migration_status" >/dev/null
psql_file "$migration_delete_align" >/dev/null

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
  "UPDATE public.contacts SET conversation_status='resolved' WHERE id='30000000-0000-0000-0000-000000000001'; UPDATE public.contacts SET conversation_status='waiting' WHERE id='30000000-0000-0000-0000-000000000001'"
expect_failure 'CHECK continua barrando valor fora do conjunto canonico' \
  "UPDATE public.contacts SET conversation_status='banana' WHERE id='30000000-0000-0000-0000-000000000001'"
expect_value 'volta para open para o resto do teste' 'open' \
  "UPDATE public.contacts SET conversation_status='open' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"

# ── GREEN: etapas 7/9 (delete_contact/delete_contacts) ────────────────────────────────────
expect_value 'anon nao tem EXECUTE em delete_contact' 'f' \
  "SELECT has_function_privilege('anon','public.delete_contact(uuid)','EXECUTE')"
expect_value 'authenticated tem EXECUTE em delete_contact' 't' \
  "SELECT has_function_privilege('authenticated','public.delete_contact(uuid)','EXECUTE')"
expect_value 'admin exclui contato alheio e recebe o id' '30000000-0000-0000-0000-000000000002' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000002')"
expect_value 'contato excluido tem deleted_at preenchido' 't' \
  "SELECT (deleted_at IS NOT NULL) FROM public.contacts WHERE id='30000000-0000-0000-0000-000000000002'"
expect_value 'dono exclui o proprio contato' '30000000-0000-0000-0000-000000000001' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000001')"
expect_failure 'agente sem vinculo (nem dono, nem fila) nao exclui contato' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000003')"
expect_value 'agente membro ATIVO da fila exclui contato da fila (regra de edicao)' '30000000-0000-0000-0000-000000000004' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000004')"
expect_failure 'agente de outra fila nao exclui contato de fila alheia' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000005')"
expect_value 'admin exclui o contato de fila alheia (fecha o estado para as contagens)' '30000000-0000-0000-0000-000000000005' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000005')"
expect_failure 'excluir duas vezes falha em vez de fingir sucesso' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000002')"
expect_failure 'delete_contacts sem nenhuma linha permitida falha' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ALHEIO'; SELECT public.delete_contacts(ARRAY['30000000-0000-0000-0000-000000000003']::uuid[])"
expect_value 'delete_contacts em lote devolve a contagem' '1' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT public.delete_contacts(ARRAY['30000000-0000-0000-0000-000000000003']::uuid[])"

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

# ── Idempotencia (as migrations sao reaplicaveis) ─────────────────────────────────────────
psql_file "$migration_soft_delete" >/dev/null
psql_file "$migration_sicoob" >/dev/null
psql_file "$migration_status" >/dev/null
psql_file "$migration_delete_align" >/dev/null
expect_value 'reaplicacao nao duplica a coluna deleted_at' '1' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='deleted_at'"
expect_value 'reaplicacao mantem um unico CHECK de status' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.contacts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%conversation_status%'"

printf 'Contacts F1 (soft-delete, Sicoob, status, grants) PostgreSQL 17 behavioral contract: PASS\n'
