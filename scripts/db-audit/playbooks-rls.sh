#!/usr/bin/env bash
# PG-08 / t_05734e4e [refazer 1] (perfil semisenior, area-front-hooks).
#
# Prova, em PostgreSQL 17 descartavel, a RLS de public.playbooks que o hook
# src/hooks/admin/usePlaybooksData.ts depende: a policy de UPDATE filtra por
# public.is_admin_or_supervisor(auth.uid()) SEM levantar erro, entao a escrita de
# um agente comum volta como { error: null } com ZERO linhas afetadas. Era esse o
# caminho que a tela lia como sucesso ("Playbook atualizado") sem nada ter mudado;
# o hook passou a conferir as linhas afetadas.
#
# Red-first: a tabela nasce com RLS ligada e SO a policy de SELECT. Nesse estado o
# UPDATE do admin tambem e descartado em silencio (0 linhas, sem erro) — o bug
# reproduzido. As tres policies de escrita entram depois, com o MESMO texto da
# migration 20260409014536 (o script confere o texto contra o arquivo da migration,
# entao DDL copiada nao vira copia divergente).
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_file="$repo_root/supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql"
postgres_image="${PLAYBOOKS_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-playbooks-rls-$RANDOM-$$"
test_password="playbooks_rls_test_only"
admin_uid='50000000-0000-0000-0000-000000000001'
agent_uid='50000000-0000-0000-0000-000000000002'
playbook_id='50000000-0000-0000-0000-0000000000aa'

cleanup() {
  if [[ "$container_name" =~ ^zapp-playbooks-rls-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

[[ -f "$migration_file" ]] || fail 'migration 20260409014536 (playbooks) nao existe'

# --- a DDL do red-first tem de ser a da migration (senao o teste prova outra coisa) ---
grep -q 'CREATE TABLE public.playbooks (' "$migration_file" || fail 'migration nao cria public.playbooks'
grep -q 'ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;' "$migration_file" \
  || fail 'migration nao liga RLS em public.playbooks'
grep -q 'is_active BOOLEAN NOT NULL DEFAULT true' "$migration_file" \
  || fail 'migration nao tem a coluna is_active com default true'

for attempt in 1 2 3; do
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
    printf 'WARN: container falhou (%s/3)\n' "$attempt" >&2; continue
  fi
  ready=false
  for _ in $(seq 1 30); do
    if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true; break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] && break
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid UNIQUE, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role IN ('admin','supervisor'))
$$;

-- estado do red-first: a tabela como a migration cria, RLS ligada, GRANT para
-- authenticated e SO a policy de SELECT (as de escrita entram no passo seguinte).
CREATE TABLE public.playbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.playbooks TO authenticated;
CREATE POLICY "Authenticated can view playbooks" ON public.playbooks FOR SELECT TO authenticated USING (true);

INSERT INTO public.profiles(id, user_id, role) VALUES
  ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'admin'),
  ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'agent');
INSERT INTO public.playbooks(id, name, category, is_active)
  VALUES ('50000000-0000-0000-0000-0000000000aa', 'Abertura de conversa', 'sales', true);
SQL

ativo() { psql_test -Atqc "SELECT is_active FROM public.playbooks WHERE id = '$playbook_id'"; }

# Escrita como papel: devolve o numero de linhas afetadas (RETURNING + count).
desativar_como() { # $1 = uid
  psql_test -Atq <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$1';
WITH upd AS (
  UPDATE public.playbooks SET is_active = false WHERE id = '$playbook_id' RETURNING 1
)
SELECT count(*) FROM upd;
COMMIT;
SQL
}

# --- red-first: sem policy de UPDATE, a escrita e descartada em silencio ---
antes="$(ativo)"
linhas="$(desativar_como "$admin_uid" | tr -d '[:space:]')"
[[ "$antes" == 't' ]] || fail 'harness invalido: o playbook deveria nascer ativo'
[[ "$linhas" == '0' ]] || fail "harness invalido: sem policy de UPDATE deveria afetar 0 linhas (afetou $linhas)"
[[ "$(ativo)" == 't' ]] || fail 'harness invalido: sem policy de UPDATE o valor nao deveria mudar'
printf '[OK] red-first: sem a policy de UPDATE a escrita nao afeta linha nenhuma e NAO levanta erro (o bug que a tela lia como sucesso).\n'

# --- as tres policies de escrita entram com o MESMO texto da migration ---
admin_insert='CREATE POLICY "Admins can manage playbooks" ON public.playbooks FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));'
admin_update='CREATE POLICY "Admins can update playbooks" ON public.playbooks FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));'
admin_delete='CREATE POLICY "Admins can delete playbooks" ON public.playbooks FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));'
for policy in "$admin_insert" "$admin_update" "$admin_delete"; do
  grep -qF "$policy" "$migration_file" \
    || fail "a migration mudou o texto da policy: ${policy:0:60}..."
done
psql_test >/dev/null <<SQL
CREATE POLICY "Admins can manage playbooks" ON public.playbooks FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can update playbooks" ON public.playbooks FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can delete playbooks" ON public.playbooks FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
SQL
printf '[OK] as tres policies de escrita em teste sao as da migration 20260409014536 (texto conferido).\n'

# --- admin/supervisor persiste ---
linhas="$(desativar_como "$admin_uid" | tr -d '[:space:]')"
[[ "$linhas" == '1' ]] || fail "admin deveria afetar 1 linha (afetou $linhas)"
[[ "$(ativo)" == 'f' ]] || fail 'admin nao persistiu a desativacao'
printf '[OK] admin desativa: 1 linha afetada e o valor persiste (f).\n'

# --- agente comum NAO persiste (e nao recebe erro: e o caso que o hook converte) ---
linhas="$(desativar_como "$agent_uid" | tr -d '[:space:]')"
[[ "$linhas" == '0' ]] || fail "agente comum deveria afetar 0 linhas (afetou $linhas)"
[[ "$(ativo)" == 'f' ]] || fail 'agente comum conseguiu escrever em public.playbooks'
printf '[OK] agente comum: 0 linhas afetadas, sem erro, valor inalterado — escrita negada pela RLS.\n'

# --- leitura segue liberada para authenticated ---
lidas="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$agent_uid';
SELECT count(*) FROM public.playbooks;
COMMIT;
SQL
)"
[[ "$(printf '%s' "$lidas" | tr -d '[:space:]')" == '1' ]] || fail 'agente perdeu a leitura de public.playbooks'
printf '[OK] agente comum le public.playbooks (policy de SELECT aberta para authenticated).\n'

printf '[OK] PG-08: public.playbooks le para authenticated e so admin/supervisor escreve; 0 linhas sem erro e o caso do hook.\n'
