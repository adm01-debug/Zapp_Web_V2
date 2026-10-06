#!/usr/bin/env bash
# R2-DB-022 B1 — ACL de LEITURA dos buckets privados de mídia do WhatsApp.
#
# Prova o contrato VIGENTE da ACL com roles/JWT/RLS REAIS (SET ROLE
# authenticated/anon + request.jwt.claim.sub, SEM BYPASSRLS) em PostgreSQL 17
# DESCARTÁVEL: a leitura de storage.objects nos buckets whatsapp-media e
# audio-messages é autorizada SÓ pela propriedade canônica do objeto (1º
# segmento do path = contact_id visível via is_contact_visible_to_user) ou por
# admin/supervisor — NUNCA por referência em public.messages.media_url nem por
# join em public.messages.
#
# Substitui a prova antiga supabase/tests/rls_whatsapp_media_select_via_messages.sql,
# que exigia a policy removida "whatsapp media readable via visible message" e o
# predicado consultando messages (contrato revogado por R2-DB-022 B1).
#
# ── O que este script faz ────────────────────────────────────────────────────
#   pre.sql      schema mínimo de plataforma (roles, auth.uid/role, storage.*) +
#                tabelas stub + HELPERS extraídos VERBATIM das migrations reais
#                (is_admin_or_supervisor, get_profile_id_for_user,
#                get_visible_agent_ids, is_contact_visible_to_user) com guarda de
#                vigência: falha se alguma migration posterior ao arquivo de
#                origem redefinir o objeto.
#   BLOCO A      aplica as MIGRATIONS REAIS que criaram o defeito
#                (20260930700000 + 20261003142707), forja a referência como
#                usuário real e prova que a leitura do objeto de outro contato
#                ABRE — é o estado ANTERIOR (defeito reproduzido).
#   BLOCO B      aplica a MIGRATION REAL da ACL (`*_r2_db_022_storage_acl.sql`) e
#                prova o contrato: A negado em todos os objetos de B, negado
#                mesmo depois de forjar INSERT/UPDATE em messages (que seguem
#                aceitos: fronteira de escrita aberta nesta base), '%' não vira
#                curinga; B lê só os próprios no locator canônico; sem-vínculo e
#                anon negados; supervisor mantém o acesso; e nenhuma policy
#                SELECT residual autoriza por media_url/pattern-match/messages.
#
# ── Uso ──────────────────────────────────────────────────────────────────────
#   bash scripts/db-audit/rls-whatsapp-media-storage-acl.test.sh
#       → VERDE exige a migration da ACL presente em supabase/migrations/
#         (glob `*_r2_db_022_storage_acl.sql`). Sem ela o script FALHA de
#         propósito: o contrato não está instalado no repositório.
#   bash scripts/db-audit/rls-whatsapp-media-storage-acl.test.sh --sem-acl
#       → roda SÓ as migrations antigas e o MESMO contrato: tem de ficar VERMELHO
#         (é a prova de que o teste é sensível à migration).
#   R2_DB_022_ACL_MIGRATION=/caminho/para/<versao>_r2_db_022_storage_acl.sql \
#     bash scripts/db-audit/rls-whatsapp-media-storage-acl.test.sh
#       → aponta a migration da ACL fora do diretório do repositório (útil quando
#         ela ainda não foi integrada na branch do dia).
#
# Nenhum acesso é criado ou afrouxado por este arquivo: ele só lê o estado que as
# migrations reais deixam. Tudo local; nenhum banco real é tocado.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="${R2_DB_022_MIGRATIONS_DIR:-$repo_root/supabase/migrations}"
postgres_image="${R2_DB_022_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-storage-acl-test-$$"

SEM_ACL=0
for arg in "$@"; do
  [[ "$arg" == '--sem-acl' ]] && SEM_ACL=1
done

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-storage-acl-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok() { printf '[PASS] %s\n' "$1"; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

# ── Localiza a migration da ACL (R2-DB-022 B1) ───────────────────────────────
acl_migration=""
if [[ "$SEM_ACL" == '1' ]]; then
  printf '== modo --sem-acl: contrato SEM a migration da ACL (resultado esperado: VERMELHO) ==\n'
else
  if [[ -n "${R2_DB_022_ACL_MIGRATION:-}" ]]; then
    acl_migration="$R2_DB_022_ACL_MIGRATION"
  else
    acl_migration="$(ls -1 "$migrations_dir"/*_r2_db_022_storage_acl.sql 2>/dev/null | sort | tail -1 || true)"
  fi
  [[ -n "$acl_migration" && -f "$acl_migration" ]] || fail \
    "migration da ACL ausente em $migrations_dir (*_r2_db_022_storage_acl.sql). Sem ela o contrato nao esta instalado: o teste fica VERMELHO de proposito. Aponte R2_DB_022_ACL_MIGRATION=<arquivo> para rodar contra a migration ainda nao integrada."
  printf '== migration da ACL: %s (sha256 %s) ==\n' "$(basename "$acl_migration")" \
    "$(sha256sum "$acl_migration" | cut -c1-16)"
fi

# ── Migrations reais que criaram o contrato antigo (defeito) ──────────────────
hist_policies="$migrations_dir/20260930700000_fix_whatsapp_storage_policies.sql"
hist_media="$migrations_dir/20261003142707_whatsapp_media_recebida_select_via_messages.sql"
for f in "$hist_policies" "$hist_media"; do
  [[ -f "$f" ]] || fail "migration historica nao encontrada: $f"
done

# ── Guarda de vigência dos helpers extraidos verbatim ─────────────────────────
# A extracao verbatim so prova fidelidade se nenhuma migration posterior
# redefinir o objeto. Roda antes de subir o container — falha rapido.
migrations_sorted="$(cd "$migrations_dir" && ls -1 *.sql | sort)"

assert_last_definer() { # $1=rotulo $2=basename de origem $3=regex ERE do objeto
  local label="$1" origin="$2" pattern="$3" rel later=''
  grep -qxF "$origin" <<< "$migrations_sorted" \
    || fail "guarda de vigencia: origem de $label nao esta em $migrations_dir ($origin)"
  while IFS= read -r rel; do
    if grep -qiE "$pattern" "$migrations_dir/$rel"; then
      later+="$rel "
    fi
  done < <(awk -v o="$origin" '$0==o{seen=1; next} seen{print}' <<< "$migrations_sorted")
  [[ -z "$later" ]] \
    || fail "guarda de vigencia: $label redefinido depois de $origin em: $later"
  ok "vigencia $label: nenhum arquivo posterior a $origin redefine o objeto"
}

assert_last_definer 'helper is_admin_or_supervisor' \
  '20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.is_admin_or_supervisor|ALTER FUNCTION[^;]*public\.is_admin_or_supervisor|DROP FUNCTION[^;]*public\.is_admin_or_supervisor)'
assert_last_definer 'helper get_profile_id_for_user' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.get_profile_id_for_user|ALTER FUNCTION[^;]*public\.get_profile_id_for_user|DROP FUNCTION[^;]*public\.get_profile_id_for_user)'
assert_last_definer 'helper get_visible_agent_ids' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.get_visible_agent_ids|ALTER FUNCTION[^;]*public\.get_visible_agent_ids|DROP FUNCTION[^;]*public\.get_visible_agent_ids)'
assert_last_definer 'helper is_contact_visible_to_user' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.is_contact_visible_to_user|ALTER FUNCTION[^;]*public\.is_contact_visible_to_user|DROP FUNCTION[^;]*public\.is_contact_visible_to_user)'

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── Schema mínimo: roles, auth.*, storage.*, tabelas stub ─────────────────────
# As TABELAS sao stubs com as colunas minimas que helpers/policies usam — nao sao
# o contrato testado. O contrato (helpers SECURITY DEFINER + as policies de
# storage.objects) vem dos arquivos de migration reais, aplicados em cadeia.
#
# public.messages fica SEM RLS de proposito, fiel ao estado da base: a fronteira
# de escrita de messages esta ABERTA (a policy de INSERT nao restringe
# sender/external_id/media_url), entao `authenticated` consegue gravar a
# referencia inteira e a forja e reproduzivel — e por isso nenhum ramo por
# media_url pode ser confiavel dentro da policy de leitura.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, anon, service_role;

-- Supabase Storage: schema + foldername() com a definicao REAL (path sem o nome
-- do arquivo; o 1o elemento e o 1o segmento do path).
CREATE SCHEMA storage;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $function$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END
$function$;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;
GRANT SELECT ON storage.objects TO authenticated, anon, service_role;

-- pg_trgm: a migration 20260930700000 cria indice gin com extensions.gin_trgm_ops.
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'special_agent');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id),
  can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id),
  UNIQUE (agent_id, can_see_agent_id)
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT false,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id)
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  sender text,
  content text,
  message_type text,
  media_url text,
  external_id text
);

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT ON public.profiles, public.user_roles, public.agent_visibility_grants,
  public.queues, public.queue_members, public.contacts TO authenticated, anon, service_role;
-- `authenticated` escreve em messages (fronteira aberta, como na base real).
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

# ── Helpers SECURITY DEFINER extraídos VERBATIM das migrations reais ──────────
# Nada de copia manual: cada objeto sai do arquivo de migration que guarda a
# definicao final — garantido pela guarda de vigencia acima.
extract_between() { # $1=linha inicial $2=trecho da linha final $3=arquivo $4=saida
  awk -v s="$1" -v e="$2" 'index($0, s) {on=1} on {print} on && index($0, e) {exit}' "$3" > "$4"
  [[ -s "$4" ]] || fail "extracao vazia em $3 a partir de '$1'"
}

mig_admin="$migrations_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql"
mig_inbox="$migrations_dir/20260909200000_harden_inbox_contact_authorization.sql"
for f in "$mig_admin" "$mig_inbox"; do
  [[ -f "$f" ]] || fail "migration de autorizacao nao encontrada: $(basename "$f")"
done

extract_between 'CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor' '$$;' \
  "$mig_admin" "$tmp_dir/helpers.sql"
for fn in get_profile_id_for_user get_visible_agent_ids is_contact_visible_to_user; do
  extract_between "CREATE OR REPLACE FUNCTION public.$fn" 'TO authenticated, service_role;' \
    "$mig_inbox" "$tmp_dir/h.sql"
  grep -q "CREATE OR REPLACE FUNCTION public.$fn" "$tmp_dir/h.sql" \
    || fail "extracao de $fn veio vazia"
  cat "$tmp_dir/h.sql" >> "$tmp_dir/helpers.sql"
done
psql_file "$tmp_dir/helpers.sql" >/dev/null
ok 'helpers de visibilidade aplicados (extraidos verbatim das migrations)'

# ── Fixtures determinísticas ──────────────────────────────────────────────────
#   user_A / perfil pA -> agente A (atacante), atribuido ao contact_A
#   user_B / perfil pB -> agente B (dono legitimo), atribuido ao contact_B
#   user_U / perfil pU -> perfil sem contato atribuido
#   user_S / perfil pS -> supervisor
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id) VALUES
  ('a0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-000000000004');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'agent'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'agent'),
  ('cccccccc-0000-0000-0000-000000000003', 'agent'),
  ('eeeeeeee-0000-0000-0000-000000000004', 'supervisor');

INSERT INTO public.contacts (id, assigned_to) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000111', 'a0000000-0000-0000-0000-0000000000a1'),
  ('bbbbbbbb-0000-0000-0000-000000000222', 'b0000000-0000-0000-0000-0000000000b1');

INSERT INTO storage.objects (bucket_id, name) VALUES
  -- objetos privados de B
  ('whatsapp-media', 'bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg'),
  ('whatsapp-media', 'bbbbbbbb-0000-0000-0000-000000000222/image/20261006-recebida.jpg'),
  ('whatsapp-media', 'image/r2db022-b-legacy.jpg'),
  ('whatsapp-media', 'document/r2db022-b-doc.pdf'),
  ('audio-messages', 'audio/r2db022-b-legacy.ogg'),
  ('audio-messages', 'bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm'),
  ('whatsapp-media', 'image/r2db022%evil.jpg'),
  -- objetos proprios de A, nos caminhos reais que o app grava
  ('whatsapp-media', 'aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg'),
  ('audio-messages', 'aaaaaaaa-0000-0000-0000-000000000111/1759700000000.webm');

-- mensagem PROPRIA de A (alvo do UPDATE-forja)
INSERT INTO public.messages (id, contact_id, sender, content, message_type, media_url) VALUES
  ('dddddddd-0000-0000-0000-000000000444', 'aaaaaaaa-0000-0000-0000-000000000111',
   'agent', 'texto', 'text', NULL);
SQL

# ── Bloco A: estado ANTERIOR — a forja ABRE a leitura (defeito reproduzido) ────
cat > "$tmp_dir/forja.sql" <<'SQL'
-- Como QUALQUER usuario real (sem BYPASSRLS): A forja em messages (proprio
-- contato, que ele enxerga) uma referencia para objetos de B. Se a fronteira de
-- escrita fechar no futuro, o erro e capturado e o INSERT forjado simplesmente
-- nao existe — as assercoes de LEITURA abaixo continuam valendo nos dois casos.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET request.jwt.claim.role = 'authenticated';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000111', 'contact', '[Imagem]', 'image',
            'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg',
            'r2db022-forja-canonico');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'INFO: INSERT forjado (canonico) recusado: %', SQLERRM;
  END;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000111', 'contact', '[Imagem]', 'image',
            'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-legacy.jpg',
            'r2db022-forja-legado');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'INFO: INSERT forjado (legado) recusado: %', SQLERRM;
  END;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000111', 'contact', '[Audio]', 'audio',
            'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-b-legacy.ogg',
            'r2db022-forja-audio-legado');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'INFO: INSERT forjado (audio legado) recusado: %', SQLERRM;
  END;
  BEGIN
    UPDATE public.messages
       SET media_url = 'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg'
     WHERE id = 'dddddddd-0000-0000-0000-000000000444';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'INFO: UPDATE forjado recusado: %', SQLERRM;
  END;
END $$;
RESET ROLE;
SQL

cat > "$tmp_dir/assert_defeito.sql" <<'SQL'
\set ON_ERROR_STOP on
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname='whatsapp media readable via visible message' AND cmd='SELECT';
  IF c <> 1 THEN
    RAISE EXCEPTION 'estado ANTERIOR nao reproduzido: policy baseada em media_url ausente (count=%)', c;
  END IF;

  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND qual ~* 'media_url';
  IF c = 0 THEN
    RAISE EXCEPTION 'estado ANTERIOR nao reproduzido: nenhuma policy SELECT cita media_url';
  END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media'
     AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 1 THEN
    RAISE EXCEPTION 'estado ANTERIOR nao reproduzido: A nao leu o objeto canonico de B (count=%)', c;
  END IF;
  RAISE NOTICE 'DEFEITO: A le o objeto canonico de B por referencia forjada (count=1)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 1 THEN
    RAISE EXCEPTION 'estado ANTERIOR nao reproduzido: A nao leu o objeto legado de B (count=%)', c;
  END IF;
  RAISE NOTICE 'DEFEITO: A le o objeto legado de B por referencia forjada (count=1)';
END $$;
RESET ROLE;
SQL

cat > "$tmp_dir/assert_contrato.sql" <<'SQL'
\set ON_ERROR_STOP on

-- (1) A (agente) e NEGADO nos objetos de B — em todas as variantes — mesmo com a
--     referencia forjada gravada; e ENXERGA os proprios nos caminhos reais.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o objeto canonico de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto canonico de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/20261006-recebida.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga a midia recebida de B no path do contato (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado na midia recebida de B (path do contato B)';

  -- objeto apontado APENAS por messages.media_url (forja) nao abre acesso
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu o objeto legado de B apos forjar referencia (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto legado de B (apontado so por messages.media_url forjado)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='document/r2db022-b-doc.pdf';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o documento legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no documento legado de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-legacy.ogg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o audio legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no audio legado de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o audio canonico de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no audio canonico de B';

  -- '%' no nome do objeto nao vira curinga
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022%evil.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu objeto com %% no nome (curinga) count=%', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto com %% no nome';

  -- o chamador continua lendo o PROPRIO objeto (locator canonico do contato dele)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A nao enxerga o proprio objeto (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A enxerga o proprio objeto no locator canonico';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/1759700000000.webm';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A nao enxerga o proprio audio (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A enxerga o proprio audio no locator canonico';
END $$;
RESET ROLE;

-- (2) B (dono legitimo) enxerga os proprios no path do contato...
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B nao enxerga o proprio objeto canonico (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga o proprio objeto canonico';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B nao enxerga o proprio audio canonico (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga o proprio audio canonico';

  -- ...e NAO enxerga nem o legado sem prefixo (fail-closed: indistinguivel de
  -- forja dentro da policy) nem o objeto do contato de A.
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B leu o legado por referencia em media_url (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no legado sem prefixo (fail-closed)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B enxergou objeto do contato de A (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no objeto do contato de A';
END $$;
RESET ROLE;

-- (3) usuario sem vinculo (perfil sem contato) e NEGADO
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: usuario sem vinculo enxergou objeto de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: usuario sem vinculo negado';
END $$;
RESET ROLE;

-- (4) anon e NEGADO (nenhuma policy SELECT TO public/anon nestes buckets)
SET ROLE anon;
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
DO $$
DECLARE c integer;
BEGIN
  BEGIN
    SELECT count(*) INTO c FROM storage.objects o
     WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  EXCEPTION WHEN insufficient_privilege THEN
    c := 0; -- sem GRANT/ POLICY aplicavel tambem e negado (fail-closed)
  END;
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: anon enxergou objeto privado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: anon negado';
END $$;
RESET ROLE;

-- (5) supervisor mantem o acesso JA previsto — inclusive nos paths legados
SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000004';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: supervisor nao enxerga objeto de B (count=%)', c; END IF;

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: supervisor nao enxerga legado de B (count=%)', c; END IF;

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-legacy.ogg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: supervisor nao enxerga audio legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: supervisor mantem o acesso previsto (inclusive paths legados)';
END $$;
RESET ROLE;

-- (6) ESTRUTURA: nenhuma policy SELECT de storage.objects autoriza por
--     messages.media_url nem por join em public.messages (o vetor forjavel), e
--     nenhuma policy permissiva residual se soma por OR.
DO $$
DECLARE c integer; v_pred text;
BEGIN
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname='whatsapp media readable via visible message';
  IF c <> 0 THEN
    RAISE EXCEPTION 'FALHOU: policy baseada em media_url ainda existe (count=%)', c;
  END IF;
  RAISE NOTICE 'PASS: policy baseada em media_url removida';

  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND policyname IN ('Users can read assigned whatsapp media',
                        'Users can read assigned audio messages');
  IF c <> 2 THEN RAISE EXCEPTION 'FALHOU: esperava 2 policies de locator canonico, achei %', c; END IF;
  RAISE NOTICE 'PASS: 2 policies de locator canonico presentes';

  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND qual ~ 'whatsapp-media';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: % policies SELECT mencionam whatsapp-media (esperava 1)', c; END IF;
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND qual ~ 'audio-messages';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: % policies SELECT mencionam audio-messages (esperava 1)', c; END IF;
  RAISE NOTICE 'PASS: exatamente 1 policy SELECT por bucket (sem residual combinada por OR)';

  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND (qual ~ 'whatsapp-media' OR qual ~ 'audio-messages')
     AND (qual ~* 'media_url' OR qual ~ '~~' OR qual ~* 'position\(' OR qual ~* 'substring\('
          OR qual ~* 'replace\(' OR qual ~* 'right\(' OR qual ~ 'public\.messages');
  IF c <> 0 THEN
    RAISE EXCEPTION 'FALHOU: % policy(s) SELECT residual(is) por media_url/pattern-match/public.messages', c;
  END IF;
  RAISE NOTICE 'PASS: nenhuma policy SELECT residual por media_url, pattern-match ou join em public.messages';

  -- as duas policies usam o locator canonico (foldername[1] + visibilidade + admin)
  FOR v_pred IN
    SELECT qual FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
       AND policyname IN ('Users can read assigned whatsapp media',
                          'Users can read assigned audio messages')
  LOOP
    IF position('foldername' IN v_pred) = 0
       OR position('is_contact_visible_to_user' IN v_pred) = 0
       OR position('is_admin_or_supervisor' IN v_pred) = 0 THEN
      RAISE EXCEPTION 'FALHOU: policy de locator sem o predicado canonico: %', v_pred;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: as 2 policies usam foldername + is_contact_visible_to_user + is_admin_or_supervisor';
END $$;
SQL

apply_hist() {
  psql_file "$hist_policies" >/dev/null || fail "falha ao aplicar $(basename "$hist_policies")"
  psql_file "$hist_media" >/dev/null || fail "falha ao aplicar $(basename "$hist_media")"
}

apply_acl() {
  psql_file "$acl_migration" >/dev/null || fail "falha ao aplicar $(basename "$acl_migration")"
}

if [[ "$SEM_ACL" == '1' ]]; then
  printf '\n===== CONTRATO SEM A MIGRATION DA ACL (esperado: VERMELHO) =====\n'
  apply_hist
  psql_file "$tmp_dir/seed.sql" >/dev/null
  psql_file "$tmp_dir/forja.sql" >/dev/null
  if psql_file "$tmp_dir/assert_contrato.sql" > "$tmp_dir/out.log" 2>&1; then
    printf '[FAIL] o contrato passou SEM a migration da ACL — o teste nao e sensivel\n' >&2
    exit 1
  fi
  printf '[OK] VERMELHO esperado: sem a migration da ACL o contrato falha\n'
  grep -E 'ERROR|FALHOU' "$tmp_dir/out.log" | head -3
  exit 0
fi

printf '\n===== BLOCO A — estado ANTERIOR (defeito) =====\n'
apply_hist
psql_file "$tmp_dir/seed.sql" >/dev/null
psql_file "$tmp_dir/forja.sql" >/dev/null
psql_file "$tmp_dir/assert_defeito.sql" || fail 'BLOCO A: o estado anterior nao reproduziu o defeito'

printf '\n===== BLOCO B — migration da ACL aplicada (contrato vigente) =====\n'
apply_acl
psql_file "$tmp_dir/assert_contrato.sql" || fail 'BLOCO B: o contrato falhou com a migration aplicada'

printf '\n[OK] R2-DB-022 B1: leitura dos buckets privados so pelo locator canonico (contact_id visivel) ou admin/supervisor — nunca por messages.media_url.\n'
