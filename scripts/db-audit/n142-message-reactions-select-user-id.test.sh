#!/usr/bin/env bash
# N-142 (P3) — "Banco: leitura de reações compara o id certo do usuário"
# (docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md SEC-RLS_CONTATOS_MENSAGENS-08).
#
# A policy message_reactions_select_policy (criada em
# 20260830110000_extend_special_agent_visibility_to_related_tables.sql) comparava
# `user_id = auth.uid()`, mas message_reactions.user_id guarda public.profiles.id
# (perfil) e auth.uid() devolve auth.users.id (login): para todo usuário não-admin
# a comparação nunca casava e o autor nunca via a própria reação pelo ramo user_id.
# A migration deste cartão troca por `user_id = get_profile_id_for_user(auth.uid())`.
#
# N142_PRESTATE=1 roda o roteiro SEM aplicar a migration — é assim que se prova o
# vermelho (A1 falha: o autor não vê a própria reação). Sem a variável, o roteiro
# é o normal: verde, incluindo a execução do -- Rollback: extraído do próprio
# arquivo da migration e a reaplicação (A5-A7).
#
# Pré-estado fiel ao canônico: tabela message_reactions com user_id REFERENCES
# public.profiles(id), as 3 funções auxiliares com o corpo canônico (fontes
# citadas no pre.sql) e a policy COM O BUG, verbatim da migration de origem.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261013133412_fix_message_reactions_select_policy_user_id_type.sql"
postgres_image="${N142_REACTIONS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-n142-reactions-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-n142-reactions-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

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

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Tabelas mínimas, fiéis ao canônico (colunas que o roteiro usa):
-- profiles (20251215024517: id PK, user_id UNIQUE REFERENCES auth.users),
-- contacts (idem: assigned_to REFERENCES profiles), messages (20251215163158),
-- message_reactions (20251220181300: user_id REFERENCES profiles).
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  role text DEFAULT 'agent'
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.agent_visibility_grants (
  agent_id uuid NOT NULL,
  can_see_agent_id uuid NOT NULL,
  PRIMARY KEY (agent_id, can_see_agent_id)
);
CREATE TABLE public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  sender text NOT NULL,
  content text NOT NULL
);
CREATE TABLE public.message_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reaction_author_check CHECK (user_id IS NOT NULL OR contact_id IS NOT NULL),
  UNIQUE(message_id, user_id, emoji),
  UNIQUE(message_id, contact_id, emoji)
);

-- Funções auxiliares com o corpo canônico:
-- is_admin_or_supervisor: 20251215025014_fcc5bc79 (lê user_roles);
-- get_profile_id_for_user + get_visible_agent_ids: 20260909200000_harden_inbox_contact_authorization.
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor')) $$;
CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT profile.id FROM public.profiles AS profile
  WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.get_profile_id_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT profile.id FROM public.profiles AS profile
  WHERE _user_id = auth.uid() AND profile.user_id = _user_id
  UNION SELECT visibility.can_see_agent_id FROM public.agent_visibility_grants AS visibility
  JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
  WHERE _user_id = auth.uid() AND viewer.user_id = _user_id
  AND EXISTS (SELECT 1 FROM public.user_roles AS role_assignment
    WHERE role_assignment.user_id = _user_id AND role_assignment.role = 'special_agent') $$;
REVOKE ALL ON FUNCTION public.get_visible_agent_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_agent_ids(uuid) TO authenticated, service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
-- Policy COM O BUG, verbatim de 20260830110000 (..._related_tables.sql:69-78).
CREATE POLICY "message_reactions_select_policy" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR user_id = auth.uid()
    OR contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    )
  );
GRANT SELECT ON public.message_reactions TO authenticated;
GRANT SELECT ON public.contacts TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id, name, role) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Autor', 'agent'),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Estranho', 'agent'),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'Admin', 'admin');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('55555555-5555-5555-5555-555555555555', 'admin');
INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('77777777-7777-7777-7777-777777777777', 'Sem dono', '+550000000001', NULL),
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Do autor', '+550000000002', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.messages (id, contact_id, sender, content) VALUES
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'contact', 'oi'),
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'contact', 'ola');
INSERT INTO public.message_reactions (id, message_id, user_id, contact_id, emoji) VALUES
  ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', NULL, '👍'),
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', NULL, 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', '❤️');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

if [[ "${N142_PRESTATE:-0}" != "1" ]]; then
  psql_file "$migration" >/dev/null
  printf '[INFO] migration aplicada: %s\n' "$(basename "$migration")"
else
  printf '[INFO] N142_PRESTATE=1: migration NAO aplicada (estado com o bug)\n'
fi

JWT_AUTHOR='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
JWT_STRANGER='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
JWT_ADMIN='{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}'
SEL_OWN="SELECT count(*) FROM public.message_reactions WHERE id = '99999999-9999-9999-9999-999999999999'"
SEL_VIA_CONTACT="SELECT count(*) FROM public.message_reactions WHERE id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0'"
SEL_ALL="SELECT count(*) FROM public.message_reactions"

# A1 (o cartão): o autor vê a própria reação pelo ramo user_id.
expect_value_as 'A1 autor ve a propria reacao (ramo user_id)' '1' "$JWT_AUTHOR" "$SEL_OWN"
# A2: outro usuário sem vínculo não vê a reação alheia (sem oráculo: nega).
expect_value_as 'A2 estranho sem vinculo nao ve' '0' "$JWT_STRANGER" "$SEL_OWN"
# A3: admin segue vendo tudo (ramo admin intacto).
expect_value_as 'A3 admin ve tudo' '2' "$JWT_ADMIN" "$SEL_ALL"
# A4: ramo contact_id intacto (reação do contato do autor continua visível ao autor).
expect_value_as 'A4 ramo contact_id intacto' '1' "$JWT_AUTHOR" "$SEL_VIA_CONTACT"

if [[ "${N142_PRESTATE:-0}" == "1" ]]; then
  fail 'modo prestate: A1 passou SEM a migration — o teste nao detecta o bug'
fi

# A5: o -- Rollback: extraído do PRÓPRIO arquivo da migration executa e devolve
# a policy ao corpo anterior (TO/roles e predicado com o bug).
rollback_sql="$(sed -n 's/^-- Rollback: //p' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'A5: linha -- Rollback: vazia ou ausente na migration'
psql_sql "$rollback_sql" >/dev/null || fail 'A5: rollback nao executou'
pred="$(psql_sql "SELECT regexp_replace(qual, '\s+', ' ', 'g') FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='message_reactions_select_policy'" | tail -n1)"
[[ "$pred" == *'user_id = auth.uid()'* ]] || fail "A5: rollback nao restaurou o predicado antigo (qual=$pred)"
[[ "$pred" != *'get_profile_id_for_user'* ]] || fail "A5: rollback manteve a correcao (qual=$pred)"
roles="$(psql_sql "SELECT coalesce(array_to_string(roles, ','), '') FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='message_reactions_select_policy'" | tail -n1)"
[[ "$roles" == *'authenticated'* ]] || fail "A5: rollback mudou os roles (roles=$roles)"
printf '[PASS] A5 rollback executa e restaura o corpo anterior (TO/roles intactos)\n'

# A5b: o bloco '-- Rollback (SQL executável, na ordem):' (--   ...) também executa
# e restaura o corpo anterior. Reaplica a migration antes para partir do estado fix.
psql_file "$migration" >/dev/null || fail 'A5b: reaplicacao antes do bloco falhou'
rollback_block="$(sed -n 's/^--   //p' "$migration" | tr '\n' ' ')"
[[ -n "$rollback_block" ]] || fail 'A5b: bloco -- Rollback (SQL executável) ausente na migration'
psql_sql "$rollback_block" >/dev/null || fail 'A5b: bloco -- Rollback (SQL executável) nao executou'
pred_block="$(psql_sql "SELECT regexp_replace(qual, '\s+', ' ', 'g') FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='message_reactions_select_policy'" | tail -n1)"
[[ "$pred_block" == *'user_id = auth.uid()'* ]] || fail "A5b: bloco de rollback nao restaurou o predicado antigo (qual=$pred_block)"
[[ "$pred_block" != *'get_profile_id_for_user'* ]] || fail "A5b: bloco de rollback manteve a correcao (qual=$pred_block)"
printf '[PASS] A5b bloco -- Rollback (SQL executável) executa e restaura o corpo anterior\n'

# A6: sem a migration (pós-rollback) o autor volta a NÃO ver — o teste é sensível à correção.
expect_value_as 'A6 pos-rollback autor nao ve (bug de volta)' '0' "$JWT_AUTHOR" "$SEL_OWN"

# A7: reaplicação idempotente — migration de novo, verde de novo.
psql_file "$migration" >/dev/null
expect_value_as 'A7 reaplicada: autor ve de novo' '1' "$JWT_AUTHOR" "$SEL_OWN"
printf 'N142: TODOS OS TESTES PASSARAM (A1-A7+A5b)\n'
