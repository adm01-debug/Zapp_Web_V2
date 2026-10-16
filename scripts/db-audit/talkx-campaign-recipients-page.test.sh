#!/usr/bin/env bash
# N-095 — ensaio da funcao talkx_campaign_recipients_page.
#
# Prova, em PostgreSQL 17 descartavel, que:
#   (1) a funcao retorna rows/next_cursor/total com paginacao por cursor;
#   (2) filtros por status, segmento e busca reduzem o resultado;
#   (3) quem nao e dono da campanha nem admin/supervisor recebe recusa (42501);
#   (4) o retorno nao traz campo de origem/canal.
#
# Red-first: antes da migration a funcao nao existe (a chamada falha); depois
# existe, com ACL correta. Cada chamada usa SET LOCAL ROLE + claims dentro de
# uma unica transacao.
#
# Registrado em .github/workflows/db-guard.yml (N-095).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_file="$repo_root/supabase/migrations/20261010062941_talkx_campaign_recipients_page.sql"
postgres_image="${TALKX_RECIPIENTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-recipients-$RANDOM-$$"
admin_uid='30000000-0000-0000-0000-000000000001'
agent_uid='30000000-0000-0000-0000-000000000002'
creator_uid='30000000-0000-0000-0000-000000000003'
camp='b0000000-0000-0000-0000-000000000001'

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-recipients-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

[[ -f "$migration_file" ]] || fail "migration do N-095 nao existe"

ready=false
for attempt in 1 2 3; do
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="test_only" "$postgres_image" >/dev/null; then
    printf 'WARN: container falhou (%s/3)\n' "$attempt" >&2; continue
  fi
  for _ in $(seq 1 30); do
    if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true; break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] && break
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# Setup: stubs do Supabase e tabelas minimas.
psql_test >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid UNIQUE, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'draft'
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id),
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  segment_id uuid,
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  click_count integer NOT NULL DEFAULT 0,
  replied_at timestamptz,
  read_at timestamptz
);
SQL

# call <papel> <uid> <argumentos SQL da funcao> -> linha como jsonb
call() {
  local role="$1" uid="$2" args="$3"
  psql_test -Atq <<SQL
BEGIN;
SET LOCAL ROLE $role;
SELECT set_config('request.jwt.claim.sub', '$uid', true), set_config('request.jwt.claim.role', '$role', true);
SELECT to_jsonb(t) FROM public.talkx_campaign_recipients_page($args) t;
COMMIT;
SQL
}
# O set_config acima imprime uma linha; a do jsonb e a ultima.
last() { tail -n 1; }
jget() { python3 -I -c "import sys,json; d=json.loads(sys.stdin.read()); print($1)"; }

# === RED: sem a migration a funcao nao existe ===
if call authenticated "$creator_uid" "'$camp', 5" >/dev/null 2>&1; then
  fail 'red-first: a funcao ja existia antes da migration'
fi
printf 'RED ok: funcao inexistente antes da migration\n'

# === Aplica a migration real do repo ===
psql_test >/dev/null < "$migration_file" || fail 'falha ao aplicar a migration'

fn='public.talkx_campaign_recipients_page(uuid,integer,text,text,uuid,text)'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','$fn','EXECUTE')::int + has_function_privilege('service_role','$fn','EXECUTE')::int")" == 2 ]] || fail 'authenticated/service_role devem ter EXECUTE'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon','$fn','EXECUTE')::int")" == 0 ]] || fail 'anon nao deve ter EXECUTE'
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE proname='talkx_campaign_recipients_page' AND prosecdef AND 'search_path=public, pg_temp' = ANY(proconfig)")" == 1 ]] || fail 'SECURITY DEFINER com search_path=public, pg_temp ausente'

psql_test >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, role) VALUES
  ('$admin_uid', '$admin_uid', 'admin'),
  ('$agent_uid', '$agent_uid', 'agent'),
  ('$creator_uid', '$creator_uid', 'agent');
INSERT INTO public.talkx_campaigns (id, created_by, status) VALUES
  ('$camp', '$creator_uid', 'active'),
  ('b0000000-0000-0000-0000-000000000002', '$creator_uid', 'draft');
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, segment_id, created_at)
SELECT '$camp',
       ('30000000-0000-0000-0000-000000000' || lpad((100 + g)::text, 3, '0'))::uuid,
       CASE WHEN g % 2 = 1 THEN 'sent' ELSE 'delivered' END,
       CASE WHEN g % 3 = 0 THEN '30000000-0000-0000-0000-000000000202'::uuid
            ELSE '30000000-0000-0000-0000-000000000201'::uuid END,
       '2026-10-01T10:00:00Z'::timestamptz + (g || ' minutes')::interval
FROM generate_series(1, 15) g;
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status) VALUES
  ('b0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000999', 'pending');
SQL

# === Pagina 1 (5 de 15) ===
p1=$(call authenticated "$creator_uid" "'$camp', 5" | last)
[[ "$(jget "len(d['rows'])" <<<"$p1")" == 5 ]] || fail "pagina 1 deveria ter 5 rows: $p1"
[[ "$(jget "d['total']" <<<"$p1")" == 15 ]] || fail "total deveria ser 15: $p1"
[[ "$(jget "d['next_cursor'] is not None" <<<"$p1")" == True ]] || fail 'next_cursor deveria existir na pagina 1'

# === Percorre as paginas: 15 destinatarios distintos e cursor final nulo ===
seen=0; cursor=""; ids=""
for _ in 1 2 3 4; do
  if [[ -z "$cursor" ]]; then r=$(call authenticated "$creator_uid" "'$camp', 5" | last)
  else r=$(call authenticated "$creator_uid" "'$camp', 5, '$cursor'" | last); fi
  seen=$((seen + $(jget "len(d['rows'])" <<<"$r")))
  ids+=$(jget "' '.join(x['id'] for x in d['rows'])" <<<"$r")$'\n'
  cursor=$(jget "d['next_cursor'] or ''" <<<"$r")
  [[ -n "$cursor" ]] || break
done
[[ "$seen" == 15 ]] || fail "paginacao deveria cobrir 15 rows, cobriu $seen"
[[ "$(tr ' ' '\n' <<<"$ids" | grep -c .)" == "$(tr ' ' '\n' <<<"$ids" | grep . | sort -u | wc -l)" ]] || fail 'paginas repetiram destinatarios'
[[ -z "$cursor" ]] || fail 'ultima pagina deveria ter next_cursor nulo'

# === Filtros ===
r=$(call authenticated "$creator_uid" "'$camp', 20, NULL, 'sent'" | last)
[[ "$(jget "len(d['rows'])" <<<"$r")" == 8 && "$(jget "d['total']" <<<"$r")" == 8 ]] || fail "status=sent deveria dar 8: $r"
r=$(call authenticated "$creator_uid" "'$camp', 20, NULL, NULL, '30000000-0000-0000-0000-000000000202'" | last)
[[ "$(jget "len(d['rows'])" <<<"$r")" == 5 ]] || fail "segmento 202 deveria dar 5: $r"
r=$(call authenticated "$creator_uid" "'$camp', 20, NULL, NULL, NULL, '000000000105'" | last)
[[ "$(jget "len(d['rows'])" <<<"$r")" == 1 && "$(jget "d['total']" <<<"$r")" == 1 ]] || fail "busca 000000000105 deveria dar 1: $r"

# === Sem campo de origem/canal ===
[[ "$(jget "any(k in ('source','origin','channel') for x in d['rows'] for k in x)" <<<"$p1")" == False ]] || fail 'retorno nao pode expor origem/canal'

# === Admin e service_role enxergam ===
r=$(call authenticated "$admin_uid" "'$camp', 5" | last)
[[ "$(jget "d['total']" <<<"$r")" == 15 ]] || fail 'admin deveria ver a campanha'
r=$(call service_role "$admin_uid" "'$camp', 5" | last)
[[ "$(jget "d['total']" <<<"$r")" == 15 ]] || fail 'service_role deveria ver a campanha'

# === Recusas: nao-dono, anon e campanha inexistente ===
out=$(call authenticated "$agent_uid" "'$camp', 5" 2>&1 || true)
grep -q 'acesso negado' <<<"$out" || fail "nao-dono deveria receber acesso negado: $out"
out=$(call anon "$agent_uid" "'$camp', 5" 2>&1 || true)
grep -qi 'permission denied' <<<"$out" || fail "anon deveria ser negado: $out"
out=$(call authenticated "$creator_uid" "'b0000000-0000-0000-0000-0000000000ff', 5" 2>&1 || true)
grep -q 'acesso negado' <<<"$out" || fail "campanha inexistente deveria ser recusada: $out"

printf 'PASS: N-095 talkx_campaign_recipients_page — paginacao, filtros, ACL, recusa, sem origem\n'
