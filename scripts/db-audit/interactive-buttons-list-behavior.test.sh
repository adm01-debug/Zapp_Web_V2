#!/usr/bin/env bash
set -Eeuo pipefail

# R2-INB-003 (t_bbb7e130): transporte canônico de mensagens interativas.
# Prova no mesmo padrão de message-delivery-phase1-behavior.test.sh: um
# PostgreSQL descartável recebe as migrations da fila atômica + a migration
# nova, e o teste enfileira botões/lista/CTA URL, confirma idempotência e a
# recusa dos payloads inválidos (os mesmos limites que a edge valida).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${MESSAGE_DELIVERY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-interactive-$RANDOM-$$"
test_password="interactive_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-interactive-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" = true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test >/dev/null <<'SQL'
CREATE EXTENSION pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, user_id uuid UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'agent', is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid REFERENCES public.queues(id),
  profile_id uuid REFERENCES public.profiles(id), is_active boolean NOT NULL,
  PRIMARY KEY(queue_id, profile_id)
);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, instance_id text, status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY, phone text NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  conversation_status text NOT NULL DEFAULT 'open',
  conversation_status_changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  sender text NOT NULL, content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text', media_url text,
  caption text, media_filename text, media_mimetype text,
  media_type text, media_size integer, ptt boolean NOT NULL DEFAULT false,
  is_read boolean DEFAULT false, agent_id uuid REFERENCES public.profiles(id),
  external_id text, status text DEFAULT 'sent',
  status_updated_at timestamptz DEFAULT now(),
  reply_to_id uuid REFERENCES public.messages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender IN ('agent','contact')),
  media_meta jsonb DEFAULT '{}'::jsonb,
  -- Constraint nomeada como no banco canônico e SEM 'buttons': a migration
  -- nova precisa recriá-la (DROP IF EXISTS + ADD) para o tipo entrar.
  CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('text','image','audio','video','document','sticker','location','contact','poll','button','list','reaction','vcard','ptt','link','template','interactive','order','product','catalog'))
);
CREATE TABLE public.conversation_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  closed_by uuid REFERENCES public.profiles(id), close_reason text NOT NULL,
  outcome text, classification text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL, performed_by uuid REFERENCES public.profiles(id),
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles
    WHERE user_id=p_user_id AND is_active AND role IN ('admin','supervisor'))
$$;
CREATE FUNCTION public.get_profile_id_for_user(p_user_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT id FROM public.profiles WHERE user_id=p_user_id LIMIT 1
$$;
CREATE FUNCTION public.is_contact_visible_to_user(p_contact_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT p_user_id=auth.uid() AND EXISTS(
    SELECT 1 FROM public.contacts c WHERE c.id=p_contact_id AND (
      public.is_admin_or_supervisor(p_user_id)
      OR c.assigned_to=public.get_profile_id_for_user(p_user_id)
      OR EXISTS(SELECT 1 FROM public.queue_members qm
        WHERE qm.queue_id=c.queue_id
          AND qm.profile_id=public.get_profile_id_for_user(p_user_id)
          AND qm.is_active)
    )
  )
$$;

CREATE FUNCTION public.enforce_conversation_status_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.conversation_status = NEW.conversation_status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.conversation_status='open' AND NEW.conversation_status IN ('waiting','resolved','archived'))
    OR (OLD.conversation_status='waiting' AND NEW.conversation_status IN ('open','resolved'))
    OR (OLD.conversation_status='resolved' AND NEW.conversation_status IN ('open','archived'))
    OR (OLD.conversation_status='archived' AND NEW.conversation_status='open')
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %',
      OLD.conversation_status, NEW.conversation_status USING ERRCODE='23514';
  END IF;
  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_contacts_fsm_transition
BEFORE UPDATE ON public.contacts FOR EACH ROW
WHEN (OLD.conversation_status IS DISTINCT FROM NEW.conversation_status)
EXECUTE FUNCTION public.enforce_conversation_status_transition();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages,
  public.conversation_closures, public.conversation_events TO authenticated;
GRANT SELECT, UPDATE ON public.contacts TO authenticated;
GRANT SELECT ON public.profiles, public.queue_members,
  public.whatsapp_connections TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

INSERT INTO public.profiles(id,user_id,role,is_active) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','agent',true);
INSERT INTO public.whatsapp_connections(id,instance_id,status) VALUES
 ('40000000-0000-0000-0000-000000000001','canonical-one','connected');
INSERT INTO public.contacts(id,phone,assigned_to,queue_id,whatsapp_connection_id) VALUES
 ('50000000-0000-0000-0000-000000000001','5511999990001','10000000-0000-0000-0000-000000000001',NULL,'40000000-0000-0000-0000-000000000001');
SQL

psql_test < "$repo_root/supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql" >/dev/null
psql_test < "$repo_root/supabase/migrations/20260909240000_revoke_service_role_message_enqueue_and_guards.sql" >/dev/null
psql_test < "$repo_root/supabase/migrations/20260909250000_allow_location_in_atomic_outbound_delivery.sql" >/dev/null
psql_test < "$repo_root/supabase/migrations/20260909260000_add_atomic_rich_outbound_messages.sql" >/dev/null
psql_test < "$repo_root/supabase/migrations/20260909270000_normalize_atomic_delivery_phone.sql" >/dev/null
psql_test < "$repo_root/supabase/migrations/20261005130925_interactive_buttons_list_rich_outbound.sql" >/dev/null

expect_failure() {
  local expected="$1" sql="$2" output status
  set +e
  output="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "$expected deveria falhar"
  grep -q "$expected" <<<"$output" || fail "erro esperado ausente: $expected"
}
agent_one="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',true); SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);"
service_role="BEGIN; SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true);"

# A constraint antiga não tinha 'buttons': enfileirar botões prova a recriação
# do CHECK e a gravação do payload imutável em media_meta.
buttons_output="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
CREATE TEMP TABLE first_buttons_enqueue AS SELECT (public.enqueue_rich_outbound_message(
  '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000020',
  '🔘 *Botões:* Escolha','buttons',
  '{"body":"Escolha","footer":"Promo","buttons":[{"type":"reply","displayText":"Atendimento","id":"b1"}]}'::jsonb,NULL,NULL
)).id AS id;
CREATE TEMP TABLE retry_buttons_enqueue AS SELECT (public.enqueue_rich_outbound_message(
  '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000020',
  '🔘 *Botões:* Escolha','buttons',
  '{"body":"Escolha","footer":"Promo","buttons":[{"type":"reply","displayText":"Atendimento","id":"b1"}]}'::jsonb,NULL,NULL
)).id AS id;
RESET ROLE;
SELECT CASE WHEN (SELECT id FROM first_buttons_enqueue) = (SELECT id FROM retry_buttons_enqueue)
  AND (SELECT count(*) FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000020') = 1
  AND (SELECT message_type='buttons'
    AND media_meta->'outbound_delivery_payload' = '{"body":"Escolha","footer":"Promo","buttons":[{"type":"reply","displayText":"Atendimento","id":"b1"}]}'::jsonb
    FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000020')
THEN 'buttons-enqueue=ok' ELSE 'buttons-enqueue=fail' END;
COMMIT;
SQL
)"
grep -Fx 'buttons-enqueue=ok' <<<"$buttons_output" >/dev/null || fail 'enqueue de botoes/idempotencia/payload imutavel'

cta_output="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT public.enqueue_rich_outbound_message(
  '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000021',
  '🔘 *Botões:* Oferta','buttons',
  '{"body":"Confira a oferta","buttons":[{"type":"url","displayText":"Ver oferta","url":"https://loja.example/oferta"}]}'::jsonb,NULL,NULL
);
RESET ROLE;
SELECT CASE WHEN message_type='buttons' THEN 'cta-url=ok' ELSE 'cta-url=fail' END
FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000021';
COMMIT;
SQL
)"
grep -Fx 'cta-url=ok' <<<"$cta_output" >/dev/null || fail 'enqueue de botao CTA URL'

list_output="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT public.enqueue_rich_outbound_message(
  '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000022',
  '📋 *Lista:* Escolha','list',
  '{"body":"Selecione","buttonText":"Ver opções","sections":[{"title":"Produtos","rows":[{"id":"r1","title":"Smartphones","description":"Linha completa"}]}]}'::jsonb,NULL,NULL
);
RESET ROLE;
SELECT CASE WHEN message_type='list'
  AND media_meta->'outbound_delivery_payload' = '{"body":"Selecione","buttonText":"Ver opções","sections":[{"title":"Produtos","rows":[{"id":"r1","title":"Smartphones","description":"Linha completa"}]}]}'::jsonb
  THEN 'list-enqueue=ok' ELSE 'list-enqueue=fail' END
FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000022';
COMMIT;
SQL
)"
grep -Fx 'list-enqueue=ok' <<<"$list_output" >/dev/null || fail 'enqueue de lista/payload imutavel'

# O claim (service_role) precisa devolver os tipos novos para a edge montar o POST.
claim_output="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
CREATE TEMP TABLE interactive_lease AS SELECT * FROM public.claim_outbound_message(
  (SELECT id FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000020'),
  '10000000-0000-0000-0000-000000000001','edge-interactive',90
);
SELECT CASE WHEN (SELECT count(*) FROM interactive_lease)=1
  AND (SELECT message_type='buttons'
    AND whatsapp_instance_name='canonical-one'
    AND contact_phone='5511999990001' FROM interactive_lease)
THEN 'interactive-claim=ok' ELSE 'interactive-claim=fail' END;
COMMIT;
SQL
)"
grep -Fx 'interactive-claim=ok' <<<"$claim_output" >/dev/null || fail 'claim nao devolveu mensagem interativa'

expect_failure 'invalid_buttons_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','buttons','{\"body\":\"\",\"buttons\":[{\"type\":\"reply\",\"displayText\":\"Ok\"}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_buttons_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','buttons','{\"body\":\"b\",\"buttons\":[{\"type\":\"reply\",\"displayText\":\"1\"},{\"type\":\"reply\",\"displayText\":\"2\"},{\"type\":\"reply\",\"displayText\":\"3\"},{\"type\":\"reply\",\"displayText\":\"4\"}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_buttons_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','buttons','{\"body\":\"b\",\"buttons\":[{\"type\":\"url\",\"displayText\":\"Abrir\",\"url\":\"javascript:alert(1)\"}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_buttons_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','buttons','{\"body\":\"b\",\"buttons\":[{\"type\":\"reply\"}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_buttons_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','buttons','{\"body\":\"b\",\"buttons\":[{\"type\":\"url\",\"displayText\":\"Abrir\"}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_buttons_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','buttons','{\"body\":\"b\",\"buttons\":[{\"type\":\"phone\",\"displayText\":\"Ligar\",\"phoneNumber\":\"123\"}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_list_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','list','{\"body\":\"b\",\"buttonText\":\"Ver\",\"sections\":[]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_list_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','list','{\"body\":\"b\",\"sections\":[{\"title\":\"S\",\"rows\":[{\"id\":\"r1\",\"title\":\"T\"}]}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_list_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','list','{\"body\":\"b\",\"buttonText\":\"Ver\",\"sections\":[{\"title\":\"S\",\"rows\":[{\"title\":\"T\"}]}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_list_payload' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','list','{\"body\":\"b\",\"buttonText\":\"Ver\",\"sections\":[{\"title\":\"S\",\"rows\":\"nao-array\"}]}'::jsonb,NULL,NULL); COMMIT;"
expect_failure 'invalid_rich_outbound_message' "$agent_one SELECT public.enqueue_rich_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','interactive','{\"body\":\"b\"}'::jsonb,NULL,NULL); COMMIT;"

printf '[OK] Transporte canônico interativo: enqueue buttons/list/CTA URL, idempotência, payload imutável, claim e recusa de payloads inválidos validados no PostgreSQL 17.\n'
