#!/usr/bin/env bash
# F64 do Bloco H (docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md).
#
# Prova, em PostgreSQL descartavel, a migration 20261003132707_f64_voz_assets_e_grants.sql:
#
#   RED   — as tabelas e o bucket NAO existem antes (a migration e que os cria);
#   GREEN — a migration aplica com ON_ERROR_STOP=1 e o contrato fica de pe:
#             * as duas tabelas existem, com RLS e FORCE RLS;
#             * `anon` fora do modulo (0 grants) e `authenticated` so com SELECT;
#             * o UNIQUE(hash) e o CHECK de alvo obrigatorio do grant funcionam;
#             * bucket `multiplix-voice` existe e e PRIVADO (public = false), e o
#               INSERT e idempotente (ON CONFLICT DO NOTHING);
#             * o COMPORTAMENTO das policies: quem tem grant vivo enxerga o ativo,
#               quem tem grant revogado nao enxerga (revogacao corta uso E recuperacao),
#               grant por PERFIL e por PAPEL funcionam, o criador ve o proprio ativo,
#               e quem nao tem grant nenhum nao ve nada.
#
# Como nos harnesses irmaos, o pre-estado do Supabase e recriado a mao (schema auth, papeis,
# default privilege do Supabase) porque a regra testada e justamente a que a migration aperta.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations_dir="$repo_root/supabase/migrations"
migration_file="20261003132707_f64_voz_assets_e_grants.sql"
postgres_image="${F64_VOZ_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="f64-voz-assets-grants-$$"
test_password="f64_voz_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ── infraestrutura que o Supabase fornece (auth, papeis, storage) ───────────────
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE SCHEMA storage;

CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
-- No Supabase o service_role tem BYPASSRLS: e assim que a edge (service key) escreve direto
-- nas tabelas do modulo sem policy para ele.
ALTER ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;

-- `has_role` (20251215025014) e o caminho da casa para ler o papel do chamador dentro de policy:
-- SECURITY DEFINER, porque `authenticated` NAO tem SELECT em `public.user_roles` (a tabela existe
-- separada de `profiles` justamente por seguranca). Mesma assinatura real.
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Buckets do Supabase Storage: a migration insere a linha do bucket novo.
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);

-- Default privilege do Supabase: tabela NOVA do schema public nasce com TUDO para anon/authenticated.
-- Declarado AQUI, ANTES da migration, para que sejam os REVOKE da propria migration que fecham a
-- porta — sem isso a assercao de grants passaria pelo motivo errado (tabela que ja nasceu fechada).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- Atores: A = admin (dono dos ativos); B e C = agent (dois operadores distintos).
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-00000000000c');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-00000000000a', 'admin'),
  ('20000000-0000-0000-0000-00000000000b', 'agent'),
  ('20000000-0000-0000-0000-00000000000c', 'agent');

-- Em producao `authenticated` LE `profiles` (a policy de multiplix_blocks usa exatamente a mesma
-- subconsulta `profiles.id ... WHERE user_id = auth.uid()`), mas NAO le `user_roles` — dai o
-- `has_role` SECURITY DEFINER logo acima.
GRANT SELECT ON public.profiles TO authenticated;
SQL

# ── RED: antes da migration, nada disso existe ─────────────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('multiplix_voice_assets','multiplix_voice_grants')")" == '0' ]] \
  || fail 'RED: as tabelas de voz ja existiam antes da migration (a prova perdeu o sentido)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.buckets WHERE id='multiplix-voice'")" == '0' ]] \
  || fail 'RED: o bucket multiplix-voice ja existia antes da migration'

# ── GREEN: aplica a migration de verdade (ON_ERROR_STOP=1) ─────────────────────
[[ -f "$migrations_dir/$migration_file" ]] || fail "migration ausente: $migration_file"
printf '  · aplicando %s\n' "$migration_file" >&2
psql_test < "$migrations_dir/$migration_file" >/dev/null

# O default privilege do Supabase ja foi declarado no bloco de infraestrutura, entao a tabela nasceu
# aberta e quem fecha a porta sao os REVOKE/GRANT da propria migration. Nada a repor aqui: as
# assercoes abaixo leem o estado REAL que a migration deixou.

# ── GREEN 1: as duas tabelas existem, com RLS + FORCE ─────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('multiplix_voice_assets','multiplix_voice_grants') AND c.relrowsecurity AND c.relforcerowsecurity")" == '2' ]] \
  || fail 'tabelas de voz sem RLS/FORCE ROW LEVEL SECURITY (F64)'

# ── GREEN 2: anon fora; authenticated so com SELECT ───────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'multiplix_voice%' AND grantee='anon'")" == '0' ]] \
  || fail 'anon ainda tem grant em tabela de voz (F64)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'multiplix_voice%' AND grantee='authenticated' AND privilege_type <> 'SELECT'")" == '0' ]] \
  || fail 'authenticated tem privilegio alem de SELECT em tabela de voz (F64)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'multiplix_voice%' AND grantee='authenticated' AND privilege_type='SELECT'")" == '2' ]] \
  || fail 'authenticated sem SELECT nas tabelas de voz (F64)'

# ── GREEN 3: policies declaradas TO authenticated (nenhuma TO public) ──────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_policies WHERE tablename IN ('multiplix_voice_assets','multiplix_voice_grants')")" == '3' ]] \
  || fail 'esperadas 3 policies (1 no ativo, 2 no grant)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_policies WHERE tablename IN ('multiplix_voice_assets','multiplix_voice_grants') AND 'public' = ANY(roles)")" == '0' ]] \
  || fail 'policy de voz ainda TO public'
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_policies WHERE tablename IN ('multiplix_voice_assets','multiplix_voice_grants') AND roles = ARRAY['authenticated']::name[]")" == '3' ]] \
  || fail 'policy de voz nao esta TO authenticated'

# ── GREEN 4: UNIQUE(hash) e CHECK de alvo obrigatorio ─────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_constraint WHERE conname='multiplix_voice_assets_hash_key' AND contype='u'")" == '1' ]] \
  || fail 'sem UNIQUE(hash) no ativo (a deduplicacao do F65 depende dele)'
hash_dup="$(psql_test -Atqc "INSERT INTO public.multiplix_voice_assets (hash, caminho, voice_id) VALUES ('h-repetido','a.mp3','v1'), ('h-repetido','b.mp3','v1');" 2>&1 || true)"
[[ "$hash_dup" == *duplicate*key* || "$hash_dup" == *unique* ]] || fail 'UNIQUE(hash) nao rejeitou hash repetido'
alvo_vazio="$(psql_test -Atqc "INSERT INTO public.multiplix_voice_grants (voice_id, titular) VALUES ('v1','Fulano');" 2>&1 || true)"
[[ "$alvo_vazio" == *alvo_obrigatorio* ]] || fail 'grant sem roles e sem perfis foi aceito (grant "para todos" por omissao)'

# ── GREEN 5: bucket privado, idempotente ──────────────────────────────────────
[[ "$(psql_test -Atqc "SELECT public FROM storage.buckets WHERE id='multiplix-voice'")" == 'f' ]] \
  || fail 'bucket multiplix-voice ausente ou PUBLICO (tem de ser privado)'
psql_test >/dev/null <<'SQL'
INSERT INTO storage.buckets (id, name, public) VALUES ('multiplix-voice', 'multiplix-voice', false)
  ON CONFLICT (id) DO NOTHING;
SQL
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.buckets WHERE id='multiplix-voice'")" == '1' ]] \
  || fail 'INSERT do bucket nao e idempotente'

# ── GREEN 6: comportamento das policies ───────────────────────────────────────
psql_test >/dev/null <<'SQL'
-- Ativos: h-role (grant por PAPEL agent), h-perfil (grant por PERFIL do C), h-revogado
-- (grant revogado), h-sem-grant (nenhum grant), h-do-b (criado pelo B, sem grant).
INSERT INTO public.multiplix_voice_assets (hash, caminho, voice_id, caracteres, modelo, created_by) VALUES
  ('h-role',      'multiplix-voice/comercial/h-role.mp3',   'voice-role',     100, 'eleven_multilingual_v2', '10000000-0000-0000-0000-00000000000a'),
  ('h-perfil',    'multiplix-voice/comercial/h-perfil.mp3', 'voice-perfil',   200, 'eleven_multilingual_v2', '10000000-0000-0000-0000-00000000000a'),
  ('h-revogado',  'multiplix-voice/comercial/h-revog.mp3',  'voice-revogada', 300, 'eleven_multilingual_v2', '10000000-0000-0000-0000-00000000000a'),
  ('h-sem-grant', 'multiplix-voice/comercial/h-sem.mp3',    'voice-sem-grant',400, 'eleven_multilingual_v2', '10000000-0000-0000-0000-00000000000a'),
  ('h-do-b',      'multiplix-voice/comercial/h-b.mp3',      'voice-do-b',     500, 'eleven_multilingual_v2', '10000000-0000-0000-0000-00000000000b');

INSERT INTO public.multiplix_voice_grants (voice_id, titular, roles, origem) VALUES
  ('voice-role', 'Titular A', ARRAY['agent']::public.app_role[], 'contrato-2026-01');
INSERT INTO public.multiplix_voice_grants (voice_id, titular, perfis, origem) VALUES
  ('voice-perfil', 'Titular C', ARRAY['10000000-0000-0000-0000-00000000000c']::uuid[], 'contrato-2026-02');
INSERT INTO public.multiplix_voice_grants (voice_id, titular, roles, origem, revoked_at) VALUES
  ('voice-revogada', 'Titular X', ARRAY['agent']::public.app_role[], 'contrato-2026-03', now());
SQL

admin_a="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000a';"
agent_b="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000b';"
agent_c="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000c';"
service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
anon_session="SET ROLE anon; SET request.jwt.claim.role='anon';"

# agent B: grant por PAPEL (voice-role) + o proprio ativo (dono do h-do-b). Nao ve o grant por
# perfil do C, nao ve o revogado, nao ve o sem-grant.
#
# NOTA DE COBERTURA (medida): a revogacao e filtrada DUAS vezes (na policy do ativo e na policy dos
# grants). A copia na policy do ativo fica MASCARADA pela RLS da tabela de grants — mutar so ela nao
# derruba nenhum caso. O mutante que mata o teste e o da policy dos grants (onde o chamador ve a
# propria linha): com `revoked_at IS NULL` trocado por `true`, o B passa a ver 2 grants e o caso
# morre por assercao. As duas checagens ficam por desenho (defesa em profundidade).
[[ "$(psql_test -Atqc "$agent_b SELECT count(*) FROM public.multiplix_voice_assets;")" == '2' ]] \
  || fail "agent com grant por papel deveria ver 2 ativos (voice-role + o proprio): $(psql_test -Atqc "$agent_b SELECT count(*) FROM public.multiplix_voice_assets;")"
[[ "$(psql_test -Atqc "$agent_b SELECT count(*) FROM public.multiplix_voice_grants;")" == '1' ]] \
  || fail "agent deveria ver 1 grant proprio: $(psql_test -Atqc "$agent_b SELECT count(*) FROM public.multiplix_voice_grants;")"
[[ "$(psql_test -Atqc "$agent_b SELECT count(*) FROM public.multiplix_voice_assets WHERE voice_id='voice-revogada';")" == '0' ]] \
  || fail 'grant REVOGADO ainda deu acesso ao ativo (revogacao nao cortou a recuperacao)'
[[ "$(psql_test -Atqc "$agent_b SELECT count(*) FROM public.multiplix_voice_assets WHERE voice_id='voice-perfil';")" == '0' ]] \
  || fail 'agent leu ativo concedido por PERFIL de outro usuario'

# agent C: so o grant por PERFIL. Nao ve o voice-role (grant e por papel `agent`, e o C TAMBEM e
# agent — entao este caso prova o caminho do perfil, nao a negacao) + o h-role tambem casa pelo papel.
[[ "$(psql_test -Atqc "$agent_c SELECT count(*) FROM public.multiplix_voice_assets WHERE voice_id='voice-perfil';")" == '1' ]] \
  || fail 'grant por PERFIL nao deu acesso ao ativo'
[[ "$(psql_test -Atqc "$agent_c SELECT count(*) FROM public.multiplix_voice_grants;")" == '2' ]] \
  || fail "agent C deveria ver 2 grants (papel agent + perfil proprio): $(psql_test -Atqc "$agent_c SELECT count(*) FROM public.multiplix_voice_grants;")"

# admin A: ve todos os ativos e todos os grants, inclusive o revogado (gestao).
[[ "$(psql_test -Atqc "$admin_a SELECT count(*) FROM public.multiplix_voice_assets;")" == '5' ]] \
  || fail "admin deveria ver os 5 ativos: $(psql_test -Atqc "$admin_a SELECT count(*) FROM public.multiplix_voice_assets;")"
[[ "$(psql_test -Atqc "$admin_a SELECT count(*) FROM public.multiplix_voice_grants;")" == '3' ]] \
  || fail "admin deveria ver os 3 grants (incluindo o revogado): $(psql_test -Atqc "$admin_a SELECT count(*) FROM public.multiplix_voice_grants;")"

# Quem tem grant (agent) NAO escreve: nao ha policy de INSERT para authenticated.
agent_insert="$(psql_test -Atqc "$agent_b INSERT INTO public.multiplix_voice_assets (hash, caminho, voice_id) VALUES ('h-invasao','x.mp3','voice-role') RETURNING 1;" 2>&1 || true)"
[[ "$agent_insert" != '1' ]] || fail 'agent inseriu ativo de voz (a escrita tem de ser da edge/service_role)'

# service_role (edge) escreve normalmente: e o caminho de gravacao do F65.
service_insert="$(psql_test -Atqc "$service_session INSERT INTO public.multiplix_voice_assets (hash, caminho, voice_id) VALUES ('h-edge','multiplix-voice/comercial/h-edge.mp3','voice-edge') RETURNING 1;" 2>&1 || true)"
[[ "$service_insert" == '1' ]] || fail "service_role nao conseguiu gravar o ativo (caminho da edge): $service_insert"

# anon: nada.
anon_read="$(psql_test -Atqc "$anon_session SELECT count(*) FROM public.multiplix_voice_grants;" 2>&1 || true)"
[[ "$anon_read" == *permission*denied* || "$anon_read" == '0' ]] || fail "anon leu os grants de voz: $anon_read"

printf '[OK] F64: tabelas de voz (RLS+FORCE, anon fora, authenticated so SELECT), UNIQUE(hash),\n' >&2
printf '     CHECK de alvo obrigatorio, bucket privado idempotente e o comportamento dos grants\n' >&2
printf '     (papel, perfil, revogado, criador, admin, escrita so por service_role) provados.\n' >&2
