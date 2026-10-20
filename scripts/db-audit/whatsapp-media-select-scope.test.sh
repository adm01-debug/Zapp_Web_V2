#!/usr/bin/env bash
# Contrato de escopo de posse da midia privada do Storage (auditoria
# docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md, achado 01 P1).
#
# Causa raiz (01): a policy "whatsapp media readable via visible message"
# (20261003142707) liberava o objeto quando QUALQUER linha de public.messages visivel
# ao chamador tinha media_url terminando no caminho do objeto. O media_url e escrito
# pela RPC enqueue_outbound_message a partir de texto do CLIENTE, entao o atendente
# enfileirava no PROPRIO contato uma mensagem com p_media_url apontando para o objeto
# de OUTRA conversa; a mensagem dele carregava aquela URL e a policy liberava a leitura.
#
# BLOCO A (antes): o atendente CARLA enfileira a URL do objeto da DORA e LE o objeto da
#   DORA (defeito: vaza a midia de outro contato).
# BLOCO B (depois): a mesma chamada e recusada com 42501 media_url_out_of_contact_scope; e,
#   mesmo com uma linha de mensagem FORJADA (inserida por service_role, simulando uma edge
#   com bug) apontando para o objeto da DORA, a policy NAO libera a leitura. O fluxo legitimo
#   continua: CARLA le a propria midia recebida (caminho novo <contato>/... e caminho legado
#   <tipo>/...), encaminha e envia midia da propria pasta; DORA nao le a midia da CARLA; e
#   admin/supervisor segue lendo qualquer uma.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_policy="$repo_root/supabase/migrations/20261011010000_fix_whatsapp_media_select_contact_scope.sql"
migration_rpc="$repo_root/supabase/migrations/20261010211000_enqueue_outbound_message_media_url_scope.sql"
postgres_image="${WHATSAPP_MEDIA_SCOPE_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-whatsapp-media-scope-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-whatsapp-media-scope-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration_policy" ]] || fail "migration nao encontrada: $migration_policy"
[[ -f "$migration_rpc" ]] || fail "migration nao encontrada: $migration_rpc"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

-- ---- helpers canonicos (reduzidos ao minimo que as policies/PRCs usam) ----
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.queues (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), queue_id uuid NOT NULL, profile_id uuid NOT NULL,
  is_active boolean DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, name text, status text NOT NULL, instance_id text, is_default boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_connection_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), whatsapp_connection_id uuid NOT NULL, queue_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY, whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  assigned_to uuid, queue_id uuid
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  client_message_id uuid, whatsapp_connection_id uuid, agent_id uuid,
  sender text, content text, message_type text, media_url text, caption text,
  reply_to_id uuid, is_read boolean, status text, external_id text, status_updated_at timestamptz
);
CREATE UNIQUE INDEX messages_contact_client_msg_uq
  ON public.messages (contact_id, client_message_id) WHERE client_message_id IS NOT NULL;

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, description text, category text
);
CREATE TABLE public.role_permissions (
  role text NOT NULL, permission_id uuid NOT NULL REFERENCES public.permissions(id),
  PRIMARY KEY (role, permission_id)
);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role = ur.role
       JOIN public.permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = _user_id AND p.name = _permission_name) $$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT _user_id = '99999999-9999-9999-9999-999999999999'::uuid $$;
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
  RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid)
  RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT profile.id FROM public.profiles profile
        WHERE _user_id = auth.uid() AND profile.user_id = _user_id $$;
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT _user_id = auth.uid() AND EXISTS (
       SELECT 1 FROM public.contacts c
       WHERE c.id = _contact_id
         AND ( public.is_admin_or_supervisor(_user_id)
               OR c.assigned_to IN (SELECT public.get_visible_agent_ids(_user_id))
               OR EXISTS (
                 SELECT 1 FROM public.queue_members qm
                 WHERE qm.queue_id = c.queue_id
                   AND qm.profile_id = public.get_profile_id_for_user(_user_id)
                   AND COALESCE(qm.is_active, true)) )) $$;

-- ---- Storage minimo: buckets/objects + storage.foldername + RLS ----
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
  name text, owner uuid, created_at timestamptz DEFAULT now(), metadata jsonb
);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $$
declare p text[]; begin p := string_to_array(name, '/'); return p[1:array_length(p, 1) - 1]; end $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT ON storage.objects TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.messages, public.contacts, public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_contact_visible_to_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_agent_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated;

-- ---- ESTADO ANTERIOR: policies de midia como estao em producao hoje ----
-- (01) 20261003142707 — libera por qualquer mensagem visivel com media_url no caminho.
CREATE POLICY "whatsapp media readable via visible message"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.media_url IS NOT NULL
      AND (
        right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
          = '/' || objects.bucket_id || '/' || objects.name
        OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
        OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
          = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
        OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
      )
  )
);
-- (02) 20260930700000 — ramos por contato atribuido. O ramo EXISTS com LIKE '%/' || objects.name
-- (achado 02) ja foi corrigido em 20261011003024 (cartao t_1561f524); o estado inicial aqui ja o
-- reflete, para este teste isolar o achado 01 (por isso o vazamento de A2 vem so da policy de -01).
CREATE POLICY "Users can read assigned whatsapp media"
  ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'whatsapp-media'
    AND (
      is_admin_or_supervisor(auth.uid())
      OR (storage.foldername(name))[1] IN (
        SELECT c.id::text FROM public.contacts c
        WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
      )
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
CREATE POLICY "Users can read assigned audio messages"
  ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'audio-messages'
    AND (
      is_admin_or_supervisor(auth.uid())
      OR (storage.foldername(name))[1] IN (
        SELECT c.id::text FROM public.contacts c
        WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
      )
    )
  );

-- ---- RPC enqueue_outbound_message: corpo ATUAL de producao (20260930200000), SEM o escopo
--      de media_url (esse e o defeito do achado 01).
CREATE OR REPLACE FUNCTION public.enqueue_outbound_message(
  p_contact_id uuid,
  p_client_message_id uuid,
  p_content text,
  p_message_type text DEFAULT 'text',
  p_media_url text DEFAULT NULL,
  p_reply_to_id uuid DEFAULT NULL,
  p_whatsapp_connection_id uuid DEFAULT NULL,
  p_caption text DEFAULT NULL
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_profile_id uuid;
  v_connection_id uuid;
  v_assigned_connection_id uuid;
  v_reply_contact_id uuid;
  v_message public.messages%ROWTYPE;
  v_message_type text := COALESCE(NULLIF(p_message_type, ''), 'text');
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN
    RAISE EXCEPTION 'send_messages_permission_required' USING ERRCODE = '42501';
  END IF;
  IF p_contact_id IS NULL OR p_client_message_id IS NULL
     OR p_content IS NULL OR length(p_content) > 65536
     OR v_message_type NOT IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location')
     OR length(COALESCE(p_media_url, '')) > 4096
     OR length(COALESCE(p_caption, '')) > 65536
     OR (p_media_url IS NOT NULL AND p_media_url !~ '^https://')
     OR (v_message_type NOT IN ('text', 'location') AND p_media_url IS NULL)
     OR (v_message_type = 'location' AND p_media_url IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_outbound_message' USING ERRCODE = '22023';
  END IF;
  SELECT contact.whatsapp_connection_id INTO v_assigned_connection_id
  FROM public.contacts AS contact
  WHERE contact.id = p_contact_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_whatsapp_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = p_whatsapp_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL;
    IF v_connection_id IS NULL THEN
      RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
    END IF;
  ELSIF v_assigned_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = v_assigned_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL;
  END IF;
  IF v_connection_id IS NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL
    ORDER BY connection.updated_at DESC, connection.id
    LIMIT 1;
  END IF;
  IF v_connection_id IS NULL THEN
    RAISE EXCEPTION 'no_connected_whatsapp_connection' USING ERRCODE = '22023';
  END IF;
  IF public.is_admin_or_supervisor(auth.uid()) IS NOT TRUE
     AND v_connection_id IS DISTINCT FROM v_assigned_connection_id
     AND EXISTS (
       SELECT 1 FROM public.whatsapp_connection_queues AS link
       WHERE link.whatsapp_connection_id = v_connection_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.whatsapp_connection_queues AS link
       JOIN public.queue_members AS member ON member.queue_id = link.queue_id
       JOIN public.profiles AS caller_profile ON caller_profile.id = member.profile_id
       WHERE link.whatsapp_connection_id = v_connection_id
         AND caller_profile.user_id = auth.uid()
         AND COALESCE(member.is_active, true)
     ) THEN
    RAISE EXCEPTION 'whatsapp_connection_out_of_scope' USING ERRCODE = '42501';
  END IF;
  SELECT profile.id INTO v_profile_id
  FROM public.profiles AS profile
  WHERE profile.user_id = auth.uid() AND profile.is_active = true
  LIMIT 1
  FOR SHARE;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  IF public.is_contact_visible_to_user(p_contact_id, auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_reply_to_id IS NOT NULL THEN
    SELECT reply.contact_id INTO v_reply_contact_id
    FROM public.messages AS reply WHERE reply.id = p_reply_to_id;
    IF NOT FOUND OR v_reply_contact_id IS DISTINCT FROM p_contact_id THEN
      RAISE EXCEPTION 'reply_message_contact_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_contact_id::text || ':' || p_client_message_id::text, 0)
  );
  INSERT INTO public.messages (
    contact_id, client_message_id, whatsapp_connection_id, agent_id,
    sender, content, message_type, media_url, caption, reply_to_id,
    is_read, status, external_id, status_updated_at
  ) VALUES (
    p_contact_id, p_client_message_id, v_connection_id, v_profile_id,
    'agent', p_content, v_message_type, p_media_url, p_caption, p_reply_to_id,
    true, 'sending', NULL, statement_timestamp()
  )
  ON CONFLICT (contact_id, client_message_id)
    WHERE client_message_id IS NOT NULL
  DO NOTHING RETURNING * INTO v_message;
  IF v_message.id IS NULL THEN
    SELECT * INTO v_message
    FROM public.messages AS message
    WHERE message.contact_id = p_contact_id
      AND message.client_message_id = p_client_message_id;
    IF v_message.id IS NULL
       OR v_message.agent_id IS DISTINCT FROM v_profile_id
       OR v_message.sender IS DISTINCT FROM 'agent'
       OR v_message.content IS DISTINCT FROM p_content
       OR v_message.message_type IS DISTINCT FROM v_message_type
       OR v_message.media_url IS DISTINCT FROM p_media_url
       OR v_message.caption IS DISTINCT FROM p_caption
       OR v_message.reply_to_id IS DISTINCT FROM p_reply_to_id
       OR v_message.whatsapp_connection_id IS DISTINCT FROM v_connection_id THEN
      RAISE EXCEPTION 'client_message_id_reused_with_different_payload'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text
) TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM storage.objects;
DELETE FROM storage.buckets;
DELETE FROM public.messages;
DELETE FROM public.queue_members;
DELETE FROM public.whatsapp_connection_queues;
DELETE FROM public.queues;
DELETE FROM public.contacts;
DELETE FROM public.whatsapp_connections;
DELETE FROM public.profiles;
DELETE FROM public.user_roles;
DELETE FROM public.role_permissions;
DELETE FROM public.permissions;

INSERT INTO public.permissions (id, name) VALUES ('f0000000-0000-0000-0000-000000000001', 'send_messages');
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('agent', 'f0000000-0000-0000-0000-000000000001'),
  ('admin', 'f0000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'agent'),
  ('22222222-2222-2222-2222-222222222222', 'agent'),
  ('99999999-9999-9999-9999-999999999999', 'admin');
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('aa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true),
  ('bb000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true),
  ('cc000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', true);
INSERT INTO public.whatsapp_connections (id, name, status, instance_id, is_default) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Conexao unica', 'connected', 'inst-1', true);
INSERT INTO public.contacts (id, whatsapp_connection_id, assigned_to) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001');

INSERT INTO storage.buckets (id, name, public) VALUES
  ('whatsapp-media', 'whatsapp-media', false),
  ('audio-messages', 'audio-messages', false);
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('whatsapp-media', 'c0000000-0000-0000-0000-000000000001/image/carla-recebida.jpg'),
  ('whatsapp-media', 'c0000000-0000-0000-0000-000000000002/image/dora-recebida.jpg'),
  ('whatsapp-media', 'image/legacy-recebida.jpg');

-- Mensagens RECEBIDAS (sender='contact'), cada uma apontando para a propria midia.
INSERT INTO public.messages (contact_id, sender, message_type, media_url, external_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'contact', 'image',
   'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/c0000000-0000-0000-0000-000000000001/image/carla-recebida.jpg', 'ext-carla'),
  ('c0000000-0000-0000-0000-000000000002', 'contact', 'image',
   'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/c0000000-0000-0000-0000-000000000002/image/dora-recebida.jpg', 'ext-dora'),
  ('c0000000-0000-0000-0000-000000000001', 'contact', 'image',
   'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/image/legacy-recebida.jpg', 'ext-legacy');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

CARLA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
ADM='{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}'

contact_carla='c0000000-0000-0000-0000-000000000001'
contact_dora='c0000000-0000-0000-0000-000000000002'

base='https://proj.supabase.co/storage/v1/object/public'
carla_url="$base/whatsapp-media/c0000000-0000-0000-0000-000000000001/image/carla-recebida.jpg"
dora_url="$base/whatsapp-media/c0000000-0000-0000-0000-000000000002/image/dora-recebida.jpg"
carla_obj='c0000000-0000-0000-0000-000000000001/image/carla-recebida.jpg'
dora_obj='c0000000-0000-0000-0000-000000000002/image/dora-recebida.jpg'
legacy_obj='image/legacy-recebida.jpg'

# envia midia: $1=contato $2=client_message_id $3=media_url
enq_media() {
  printf "SELECT public.enqueue_outbound_message('%s'::uuid,'%s'::uuid,'midia','image','%s',NULL,NULL,NULL)" "$1" "$2" "$3"
}
# leitura do objeto como o chamador: $1=jwt $2=bucket $3=name
leitura() {
  printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims','%s',false); SELECT count(*) FROM storage.objects WHERE bucket_id='%s' AND name='%s'" "$1" "$2" "$3"
}

echo '-- BLOCO A: ANTES da correcao (o defeito) -------------------------------------------'

expect_value 'A1 CARLA enfileira no PROPRIO contato a URL do objeto da DORA -- defeito do achado 01' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enq_media "$contact_carla" a0000000-0000-0000-0000-00000000000a "$dora_url")) q;"
expect_value 'A2 CARLA LE o objeto da DORA -- vazamento de midia de outro contato' '1' \
  "$(leitura "$CARLA" whatsapp-media "$dora_obj")"

echo
echo '-- Aplicando as migrations ---------------------------------------------------------'
psql_file "$migration_policy"
psql_file "$migration_rpc"
psql_file "$tmp_dir/seed.sql"

echo
echo '-- BLOCO B: DEPOIS da correcao -----------------------------------------------------'

expect_error 'B1 CARLA enfileirando a URL da pasta da DORA e recusada (42501 media_url_out_of_contact_scope)' \
  'media_url_out_of_contact_scope' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); $(enq_media "$contact_carla" a0000000-0000-0000-0000-00000000000b "$dora_url");"
bypass_url="https://proj.supabase.co/storage/v1/object/download/whatsapp-media/$dora_obj"
expect_error 'B1b URL fora do formato canonico citando bucket interno e recusada (22023 invalid_outbound_media_url)' \
  'invalid_outbound_media_url' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); $(enq_media "$contact_carla" a0000000-0000-0000-0000-00000000000d "$bypass_url");"
expect_value 'B2 nada foi gravado pela tentativa recusada (3 mensagens do seed)' '3' \
  "SELECT count(*) FROM public.messages"

echo
echo '-- B3-B4: fluxo legitimo preservado (leitura da propria midia recebida) --'
expect_value 'B3 CARLA LE a propria midia recebida (caminho novo <contato>/...)' '1' \
  "$(leitura "$CARLA" whatsapp-media "$carla_obj")"
expect_value 'B4 CARLA LE a midia recebida no caminho LEGADO <tipo>/... (nao quebrou o #1419)' '1' \
  "$(leitura "$CARLA" whatsapp-media "$legacy_obj")"
expect_value 'B5 CARLA envia midia da propria pasta -- permitido' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enq_media "$contact_carla" a0000000-0000-0000-0000-00000000000c "$carla_url")) q;"
expect_value 'B6 DORA NAO le a midia da CARLA (a recusa vale nas duas direcoes)' '0' \
  "$(leitura "$DORA" whatsapp-media "$carla_obj")"
expect_value 'B7 admin/supervisor continua lendo a midia de qualquer contato' '1' \
  "$(leitura "$ADM" whatsapp-media "$dora_obj")"

echo
echo '-- B8: defesa em profundidade da POLICY (linha forjada por service_role/edge com bug) --'
psql_sql "INSERT INTO public.messages (contact_id, sender, message_type, media_url, external_id) VALUES ('$contact_carla','agent','image','$dora_url','ext-forjada')" >/dev/null
expect_value 'B8 mesmo com mensagem forjada da CARLA apontando para a DORA, a policy NAO libera a leitura' '0' \
  "$(leitura "$CARLA" whatsapp-media "$dora_obj")"
expect_value 'B9 a mensagem forjada com media_url existe (a negacao e da policy, nao da ausencia da linha)' '1' \
  "SELECT count(*) FROM public.messages WHERE external_id = 'ext-forjada'"

echo
echo '-- B10: ramo legado exige mensagem RECEBIDA (sender=contact) --'
legacy_url="$base/whatsapp-media/$legacy_obj"
psql_sql "INSERT INTO public.messages (contact_id, sender, message_type, media_url, external_id) VALUES ('$contact_dora','agent','image','$legacy_url','ext-forjada-legado')" >/dev/null
expect_value 'B10 mensagem de SAIDA (agent) com message_type igual a pasta legada NAO libera a leitura' '0' \
  "$(leitura "$DORA" whatsapp-media "$legacy_obj")"
expect_value 'B11 a mensagem forjada de saida existe (a negacao e da policy, nao da ausencia da linha)' '1' \
  "SELECT count(*) FROM public.messages WHERE external_id = 'ext-forjada-legado'"

printf '\n[OK] contrato de escopo de posse da midia privada do Storage verificado\n'
