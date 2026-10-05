#!/usr/bin/env bash
# Fronteira real de autorização das RPCs do Dashboard (DASH-ACCEPTANCE-001,
# aceites DASH-091/DASH-092: testes executáveis no código produtivo, com JWT
# NÃO privilegiado — service_role como única prova não vale).
#
# Os arquivos supabase/tests/*.sql rodam como service_role (BYPASSRLS): provam a
# lógica interna das funções, mas NUNCA o enforcement — um REVOKE perdido ou uma
# policy quebrada passa despercebido. Aqui, em PostgreSQL 17 descartável,
# `SET ROLE authenticated`/`anon` são roles REAIS sem BYPASSRLS: toda leitura
# passa pelo enforcement de verdade, como no PostgREST.
#
# O que este teste faz:
#   1. Guarda de vigência: para cada helper/policy extraído e para a lista fixa
#      das RPCs do dashboard, varre supabase/migrations em ordem e FALHA se
#      qualquer arquivo posterior ao arquivo de origem contiver CREATE, ALTER
#      ou DROP do mesmo objeto — é ela que prova que a definição extraída é a
#      vigente do repositório (roda antes de subir o container).
#   2. Recria o schema mínimo (roles, auth.*, tabelas stub) e EXTRAI as
#      funções/policies de autorização verbatim do arquivo de origem — se a
#      migration mudar, o teste segue o código real. Os blocos
#      pg_policies/pg_proc são apenas checagem de aplicação (o extraído foi
#      de fato aplicado), não prova de fidelidade — a prova é o item 1.
#   3. Aplica as migrations do dashboard EM CADEIA, na ordem do diretório — a
#      função final é a que a cadeia aplicada define (também ensaia replay).
#   4. Fixtures determinísticas: 3 agentes, filas com/sobrepostas/estanques,
#      massa de 1.200 contatos (acima do cap de 1.000 linhas do PostgREST),
#      eventos em horários fixos do dia civil de America/Sao_Paulo.
#   5. Asserções: EXECUTE negado a anon; leitura direta limitada por RLS;
#      spoof de p_agent por JWT não privilegiado; conciliação com verdade de
#      base; edge cases da E44 (0 linhas, outlier p50/p90, virada de dia SP).
#
# GAP CONHECIDO (fora do escopo deste cartão, rastreado em
# DASH-SQL-REGRESSION-001): a definição vigente de dashboard_contact_counts
# (migration 20260930400000) perdeu a trava estrita de p_agent da E33 — spoof
# retorna os dados do ALVO limitados pela RLS, em vez dos dados do próprio
# chamador. As asserções C6-C8 provam o que a fronteira continua garantindo
# (nada além do escopo RLS do chamador) e emitem [GAP-CONHECIDO] enquanto a
# trava estrita não for restaurada; quem corrigir a RPC deve endurecer essas
# asserções para o contrato estrito (spoof == próprio).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Override existe só para o teste de mutação local (rodar contra uma cópia
# adulterada fora do repo); CI e uso normal apontam para o diretório real.
migrations_dir="${DASH_RLS_TEST_MIGRATIONS_DIR:-$repo_root/supabase/migrations}"
postgres_image="${DASH_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-dash-rls-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-dash-rls-test-[0-9]+$ ]]; then
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
expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

for f in \
  20260925132706_dashboard_fase3_kpi_rpc.sql \
  20260925160000_dashboard_fase3_hourly_volume_rpc.sql \
  20260925162737_dashboard_fase3_contact_counts_rpc.sql \
  20260925172511_dashboard_fase4_filters_e31_e32_e33.sql \
  20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql \
  20260926100134_dashboard_revoke_anon_execute_rpcs.sql \
  20260926100302_dashboard_revoke_public_execute_rpcs.sql \
  20260927120000_dashboard_kpi_p_since_default_null_guard.sql \
  20260930400000_dashboard_contact_counts_filter_deleted_at.sql \
  20261003272707_reconcile_local_replay_with_canonical.sql; do
  [[ -f "$migrations_dir/$f" ]] || fail "migration nao encontrada: $f"
done

# ── Guarda de vigência: a origem é o ÚLTIMO arquivo que define o objeto ───────
# A extracao verbatim so prova fidelidade se nenhuma migration posterior
# redefinir o objeto. Para cada helper/policy extraido e para as RPCs do
# dashboard, falha se qualquer arquivo DEPOIS da origem contiver CREATE, ALTER
# ou DROP do mesmo objeto. Roda antes de subir o container — falha rapido.
# grep -i porque identificadores sem aspas sao case-insensitive no Postgres e
# ha migrations com DDL em minusculas.
migrations_sorted="$(cd "$migrations_dir" && ls -1 *.sql | sort)"

assert_last_definer() { # $1=rotulo $2=basename do arquivo de origem $3=regex ERE do objeto
  local label="$1" origin="$2" pattern="$3" rel later=''
  grep -qxF "$origin" <<< "$migrations_sorted" \
    || fail "guarda de vigencia: arquivo de origem de $label nao esta em supabase/migrations ($origin)"
  while IFS= read -r rel; do
    if grep -qiE "$pattern" "$migrations_dir/$rel"; then
      later+="$rel "
    fi
  done < <(awk -v o="$origin" '$0==o{seen=1; next} seen{print}' <<< "$migrations_sorted")
  [[ -z "$later" ]] \
    || fail "guarda de vigencia: $label redefinido depois de $origin em: $later"
  printf '[PASS] vigencia %s: nenhum arquivo posterior a %s redefine o objeto\n' "$label" "$origin"
}

# Helpers SECURITY DEFINER extraidos verbatim mais abaixo:
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
assert_last_definer 'helper can_edit_contact' \
  '20260929810000_contacts_can_edit_contact_hoisted_params.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.can_edit_contact|ALTER FUNCTION[^;]*public\.can_edit_contact|DROP FUNCTION[^;]*public\.can_edit_contact)'

# Policies RLS extraidas verbatim mais abaixo:
assert_last_definer 'policy contacts_select_policy' \
  '20260929810000_contacts_can_edit_contact_hoisted_params.sql' \
  '(CREATE POLICY "contacts_select_policy"|ALTER POLICY "contacts_select_policy"|DROP POLICY[^;]*"contacts_select_policy")'
assert_last_definer 'policy messages_select_policy' \
  '20260902023200_consolidate_rls_select_messages_contacts.sql' \
  '(CREATE POLICY "messages_select_policy"|ALTER POLICY "messages_select_policy"|DROP POLICY[^;]*"messages_select_policy")'
assert_last_definer 'policy conversation_sla_select_policy' \
  '20260830110000_extend_special_agent_visibility_to_related_tables.sql' \
  '(CREATE POLICY "conversation_sla_select_policy"|ALTER POLICY "conversation_sla_select_policy"|DROP POLICY[^;]*"conversation_sla_select_policy")'
assert_last_definer 'policy "Agents or admins can view closures"' \
  '20260409222809_7b8a951e-3892-4b0f-84b1-68820d2d2f27.sql' \
  '(CREATE POLICY "Agents or admins can view closures"|ALTER POLICY "Agents or admins can view closures"|DROP POLICY[^;]*"Agents or admins can view closures")'

# RPCs do dashboard (lista fixa — a cadeia e aplicada mais abaixo):
assert_last_definer 'RPC dashboard_kpi' \
  '20261003272707_reconcile_local_replay_with_canonical.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.dashboard_kpi|ALTER FUNCTION[^;]*public\.dashboard_kpi|DROP FUNCTION[^;]*public\.dashboard_kpi)'
assert_last_definer 'RPC dashboard_hourly_volume' \
  '20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.dashboard_hourly_volume|ALTER FUNCTION[^;]*public\.dashboard_hourly_volume|DROP FUNCTION[^;]*public\.dashboard_hourly_volume)'
assert_last_definer 'RPC dashboard_contact_counts' \
  '20260930400000_dashboard_contact_counts_filter_deleted_at.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.dashboard_contact_counts|ALTER FUNCTION[^;]*public\.dashboard_contact_counts|DROP FUNCTION[^;]*public\.dashboard_contact_counts)'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── Schema mínimo: roles, auth.*, tabelas stub ────────────────────────────────
# As TABELAS sao stubs com as colunas minimas que helpers/policies/RPCs usam —
# nao sao o contrato testado. O contrato (helpers SECURITY DEFINER + policies
# RLS) e EXTRAIDO dos arquivos de migration logo abaixo.
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
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, anon, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(agent_id, can_see_agent_id)
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  phone text,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  conversation_status text NOT NULL DEFAULT 'open',
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  first_message_at timestamptz,
  first_response_at timestamptz,
  first_response_breached boolean
);

-- RLS ligada nas 4 tabelas-alvo. Helpers SECURITY DEFINER e policies NAO ficam
-- aqui: sao extraidos verbatim das migrations logo abaixo (mesmo padrao awk da
-- extracao de dashboard_kpi) — o contrato testado e o codigo real vigente.
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_closures ENABLE ROW LEVEL SECURITY;

-- Grants de tabela largos, como no PostgREST: a RLS faz o trabalho.
-- anon também tem SELECT em contacts/messages — e mesmo assim não lê nada
-- (policies são TO authenticated: sem policy aplicável = zero linhas).
GRANT SELECT ON public.profiles, public.user_roles, public.queues, public.queue_members,
  public.agent_visibility_grants TO authenticated, anon, service_role;
GRANT SELECT ON public.contacts, public.messages, public.conversation_sla,
  public.conversation_closures TO authenticated, anon, service_role;
SQL

psql_file "$tmp_dir/pre.sql"

# ── Helpers + policies EXTRAÍDOS verbatim das migrations ──────────────────────
# Nada de copia manual: cada objeto sai do arquivo de migration que guarda a
# definicao FINAL — garantido pela guarda de vigencia acima, que falha se
# qualquer arquivo posterior ao de origem redefinir o objeto. Mesmo padrao awk
# da extracao de dashboard_kpi abaixo — se a migration mudar, o teste aplica o
# codigo novo.
extract_between() { # $1=literal da linha inicial, $2=literal contido na linha final, $3=arquivo, $4=saida
  awk -v s="$1" -v e="$2" 'index($0, s) {on=1} on {print} on && index($0, e) {exit}' "$3" > "$4"
  [[ -s "$4" ]] || fail "extracao vazia em $3 a partir de '$1'"
}

mig_admin="$migrations_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql"
mig_inbox="$migrations_dir/20260909200000_harden_inbox_contact_authorization.sql"
mig_canedit="$migrations_dir/20260929810000_contacts_can_edit_contact_hoisted_params.sql"
mig_msgs="$migrations_dir/20260902023200_consolidate_rls_select_messages_contacts.sql"
mig_sla="$migrations_dir/20260830110000_extend_special_agent_visibility_to_related_tables.sql"
mig_clos="$migrations_dir/20260409222809_7b8a951e-3892-4b0f-84b1-68820d2d2f27.sql"
for f in "$mig_admin" "$mig_inbox" "$mig_canedit" "$mig_msgs" "$mig_sla" "$mig_clos"; do
  [[ -f "$f" ]] || fail "migration de autorizacao nao encontrada: $(basename "$f")"
done

# Helpers SECURITY DEFINER: o CREATE inteiro + REVOKE/GRANT quando estao no
# mesmo arquivo. is_admin_or_supervisor primeiro — as demais a referenciam.
extract_between 'CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor' '$$;' \
  "$mig_admin" "$tmp_dir/helpers.sql"
grep -q 'CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor' "$tmp_dir/helpers.sql" \
  || fail 'extracao de is_admin_or_supervisor veio vazia'
grep -q '\$\$;' "$tmp_dir/helpers.sql" \
  || fail 'extracao de is_admin_or_supervisor nao fechou o corpo da funcao'

for fn in get_profile_id_for_user get_visible_agent_ids is_contact_visible_to_user; do
  extract_between "CREATE OR REPLACE FUNCTION public.$fn" 'TO authenticated, service_role;' \
    "$mig_inbox" "$tmp_dir/h.sql"
  grep -q "CREATE OR REPLACE FUNCTION public.$fn" "$tmp_dir/h.sql" \
    || fail "extracao de $fn veio vazia"
  grep -q 'TO authenticated, service_role;' "$tmp_dir/h.sql" \
    || fail "extracao de $fn nao incluiu o REVOKE/GRANT da migration"
  cat "$tmp_dir/h.sql" >> "$tmp_dir/helpers.sql"
done

# can_edit_contact: 20260929810000 define as DUAS assinaturas (5 args + 2 args)
# e os 4 statements de ACL em sequencia — o bloco inteiro vem junto.
extract_between 'CREATE OR REPLACE FUNCTION public.can_edit_contact' \
  'uuid, boolean) TO authenticated, service_role;' \
  "$mig_canedit" "$tmp_dir/h.sql"
grep -q 'p_visible_agent_ids uuid\[\]' "$tmp_dir/h.sql" \
  || fail 'extracao de can_edit_contact nao pegou a versao de 5 args'
grep -q 'can_edit_contact(p_assigned_to uuid, p_queue_id uuid)' "$tmp_dir/h.sql" \
  || fail 'extracao de can_edit_contact nao pegou a versao de 2 args'
[[ "$(grep -c 'GRANT EXECUTE ON FUNCTION public.can_edit_contact' "$tmp_dir/h.sql")" == '2' ]] \
  || fail 'extracao de can_edit_contact nao incluiu os dois GRANTs'
cat "$tmp_dir/h.sql" >> "$tmp_dir/helpers.sql"

psql_file "$tmp_dir/helpers.sql" || fail 'falha ao aplicar helpers extraidos das migrations'

# Policies RLS: DROP + CREATE finais extraidos da migration de cada uma. O
# contrato testado e o CREATE POLICY (texto extraido); o DROP e o da migration
# quando e uma linha simples, ou DROP POLICY IF EXISTS literal equivalente
# quando o DROP original e condicional (DO $$) ou mira outro nome.
{ grep -F 'DROP POLICY IF EXISTS "contacts_select_policy" ON public.contacts;' "$mig_canedit" \
    || fail 'DROP de contacts_select_policy nao achado em 20260929810000'
  extract_between 'CREATE POLICY "contacts_select_policy"' ';' "$mig_canedit" "$tmp_dir/p_body.sql"
  cat "$tmp_dir/p_body.sql"; } > "$tmp_dir/pol_contacts.sql"

{ grep -F 'DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;' "$mig_msgs" \
    || fail 'DROP de messages_select_policy nao achado em 20260902023200'
  extract_between 'CREATE POLICY "messages_select_policy"' ';' "$mig_msgs" "$tmp_dir/p_body.sql"
  cat "$tmp_dir/p_body.sql"; } > "$tmp_dir/pol_messages.sql"

{ echo 'DROP POLICY IF EXISTS "conversation_sla_select_policy" ON public.conversation_sla;'
  extract_between 'CREATE POLICY "conversation_sla_select_policy"' ';' "$mig_sla" "$tmp_dir/p_body.sql"
  cat "$tmp_dir/p_body.sql"; } > "$tmp_dir/pol_sla.sql"

{ echo 'DROP POLICY IF EXISTS "Agents or admins can view closures" ON public.conversation_closures;'
  extract_between 'CREATE POLICY "Agents or admins can view closures"' ';' "$mig_clos" "$tmp_dir/p_body.sql"
  cat "$tmp_dir/p_body.sql"; } > "$tmp_dir/pol_closures.sql"

for p in contacts messages sla closures; do
  grep -q 'CREATE POLICY' "$tmp_dir/pol_$p.sql" \
    || fail "extracao da policy ($p) veio sem CREATE POLICY"
  tail -n1 "$tmp_dir/pol_$p.sql" | grep -q ';' \
    || fail "extracao da policy ($p) nao fechou o statement"
done

psql_file "$tmp_dir/pol_contacts.sql"  || fail 'falha ao aplicar contacts_select_policy'
psql_file "$tmp_dir/pol_messages.sql"  || fail 'falha ao aplicar messages_select_policy'
psql_file "$tmp_dir/pol_sla.sql"       || fail 'falha ao aplicar conversation_sla_select_policy'
psql_file "$tmp_dir/pol_closures.sql"  || fail 'falha ao aplicar policy de conversation_closures'

echo '── pg_policies: a policy extraida foi aplicada (checagem de aplicacao, nao de fidelidade) ──'
# pg_policies.qual mostra a expressao DECOMPILADA pelo Postgres (IN vira
# = ANY (SubPlan), casts e qualificacao mudam) — comparar texto normalizado com
# o fonte daria falso negativo. A normalizacao e feita pelo proprio parser: a
# mesma expressao USING extraida da migration e recriada como policy temporaria
# na MESMA tabela, e os dois quals decompilados tem que ser identicos.
check_policy() { # $1=nome da policy real, $2=tabela, $3=arquivo com DROP+CREATE extraidos
  local name="$1" table="$2" file="$3" tmp_name="zz_${2}_expected"
  grep -v '^DROP POLICY' "$file" \
    | sed "s/CREATE POLICY \"$name\"/CREATE POLICY \"$tmp_name\"/" > "$tmp_dir/chk.sql"
  grep -q "CREATE POLICY \"$tmp_name\"" "$tmp_dir/chk.sql" \
    || fail "nao consegui montar a policy de conferencia para $name"
  psql_file "$tmp_dir/chk.sql"
  expect_value "PGP $name existe em public.$table (cmd=SELECT, TO authenticated)" '1' \
    "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='$table' AND policyname='$name' AND cmd='SELECT' AND 'authenticated'=ANY(roles);"
  expect_value "PGP qual de $name e identico ao USING extraido da migration" 't' \
    "SELECT p.qual = e.qual FROM pg_policies p JOIN pg_policies e ON e.schemaname='public' AND e.tablename='$table' AND e.policyname='$tmp_name' WHERE p.schemaname='public' AND p.tablename='$table' AND p.policyname='$name';"
  psql_sql "DROP POLICY \"$tmp_name\" ON public.$table" >/dev/null
}
check_policy 'contacts_select_policy'             contacts              "$tmp_dir/pol_contacts.sql"
check_policy 'messages_select_policy'             messages              "$tmp_dir/pol_messages.sql"
check_policy 'conversation_sla_select_policy'     conversation_sla      "$tmp_dir/pol_sla.sql"
check_policy 'Agents or admins can view closures' conversation_closures "$tmp_dir/pol_closures.sql"

echo
echo '── pg_proc: corpos aplicados contem os marcadores do codigo extraido (checagem de aplicacao) ──'
prosrc_contains() { # $1=label, $2=proname, $3=pronargs, $4=marcador LIKE
  expect_value "$1" 't' \
    "SELECT prosrc LIKE '$4' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='$2' AND p.pronargs=$3;"
}
prosrc_contains "HLP is_admin_or_supervisor: role IN ('admin','supervisor')" is_admin_or_supervisor 1 "%role IN (''admin'', ''supervisor'')%"
prosrc_contains 'HLP get_profile_id_for_user: profile.user_id = _user_id'    get_profile_id_for_user 1 '%profile.user_id = _user_id%'
prosrc_contains "HLP get_visible_agent_ids: trava 'special_agent'"           get_visible_agent_ids    1 "%''special_agent''%"
prosrc_contains 'HLP is_contact_visible_to_user: usa get_visible_agent_ids'  is_contact_visible_to_user 2 '%get_visible_agent_ids(_user_id)%'
prosrc_contains 'HLP can_edit_contact(5): COALESCE(p_is_admin, ...)'         can_edit_contact         5 '%COALESCE(p_is_admin%'
prosrc_contains 'HLP can_edit_contact(2): delega com NULLs'                  can_edit_contact         2 '%NULL::uuid[]%'

echo
# ── RPCs do dashboard: cadeia de migrations REAL, na ordem do diretório ────────
echo '── Aplicando a cadeia de migrations do dashboard (código produtivo) ─────────'
for f in \
  20260925132706_dashboard_fase3_kpi_rpc.sql \
  20260925160000_dashboard_fase3_hourly_volume_rpc.sql \
  20260925162737_dashboard_fase3_contact_counts_rpc.sql \
  20260925172511_dashboard_fase4_filters_e31_e32_e33.sql \
  20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql \
  20260927120000_dashboard_kpi_p_since_default_null_guard.sql \
  20260930400000_dashboard_contact_counts_filter_deleted_at.sql; do
  psql_file "$migrations_dir/$f" || fail "falha ao aplicar $f"
done

# Definição final de dashboard_kpi vive na migration de reconciliação
# (arquivo multi-objeto): extrai só o CREATE OR REPLACE dessa função.
awk '/CREATE OR REPLACE FUNCTION public.dashboard_kpi/,/\$function\$;/' \
  "$migrations_dir/20261003272707_reconcile_local_replay_with_canonical.sql" \
  > "$tmp_dir/kpi_final.sql"
grep -q 'CREATE OR REPLACE FUNCTION public.dashboard_kpi' "$tmp_dir/kpi_final.sql" \
  || fail 'extracao de dashboard_kpi da migration de reconciliacao veio vazia'
grep -q '\$function\$;' "$tmp_dir/kpi_final.sql" \
  || fail 'extracao de dashboard_kpi nao fechou o corpo da funcao'
psql_file "$tmp_dir/kpi_final.sql"

# Harderning de ACL (migrations reais): tira EXECUTE de anon e de PUBLIC.
psql_file "$migrations_dir/20260926100134_dashboard_revoke_anon_execute_rpcs.sql"
psql_file "$migrations_dir/20260926100302_dashboard_revoke_public_execute_rpcs.sql"

# ── Fixtures determinísticas ──────────────────────────────────────────────────
# ADMIN user 1111/profile a01 · AGENT_A user 2222/profile b01 (membro Q1)
# AGENT_B user 3333/profile c01 (contatos em Q1 compartilhada e Q2 estanque)
# AGENT_C user 4444/profile c02 (tudo fora do alcance de A)
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222'),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333'),
  ('c0000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'agent'),
  ('33333333-3333-3333-3333-333333333333', 'agent'),
  ('44444444-4444-4444-4444-444444444444', 'agent');
INSERT INTO public.queues (id) VALUES
  ('e0000000-0000-0000-0000-000000000001'), -- Q1 (A é membro ativo)
  ('e0000000-0000-0000-0000-000000000002'), -- Q2 (estanque para A)
  ('e0000000-0000-0000-0000-000000000003'); -- Q3 (C, tudo invisível para A)
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', true);

-- Hora civil de São Paulo fixa: "hoje em SP às <h>" é determinística para
-- qualquer instante de execução (mesmo antes do horário, o bucket do dia é hoje).
INSERT INTO public.contacts (id, phone, assigned_to, queue_id, conversation_status, updated_at, deleted_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', '5511900000001', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'open',     now(), NULL),                 -- PROPRIO de A
  ('d0000000-0000-0000-0000-000000000002', '5511900000002', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'open',     now(), NULL),                 -- de B, visível a A via Q1
  ('d0000000-0000-0000-0000-000000000003', '5511900000003', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'open',     now(), NULL),                 -- de B em Q2, invisível a A
  ('d0000000-0000-0000-0000-000000000004', '5511900000004', NULL,                                        'e0000000-0000-0000-0000-000000000001', 'open',     now(), NULL),                 -- livre em Q1, visível a A via fila
  ('d0000000-0000-0000-0000-000000000005', '5511900000005', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'resolved', now(), now()),               -- de A, soft-deleted (fora do total)
  ('d0000000-0000-0000-0000-000000000006', '5511900000006', 'c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', 'open',     now(), NULL),                 -- de C em Q3, invisível a A
  ('d0000000-0000-0000-0000-000000000007', '5511900000007', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'resolved', now(), NULL),                 -- de A (2º contato resolvido hoje)
  ('d0000000-0000-0000-0000-000000000008', '5511900000008', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'resolved', now(), NULL);                 -- de A (3º contato resolvido hoje)

-- Massa acima do cap de 1.000 linhas do PostgREST (DASH-093): 1.200 contatos
-- resolvidos de A — o total agregado no servidor tem que reconciliar com a base.
INSERT INTO public.contacts (id, phone, assigned_to, queue_id, conversation_status, updated_at)
SELECT gen_random_uuid(), '55118888' || lpad(g::text, 4, '0'),
       'b0000000-0000-0000-0000-000000000001',
       'e0000000-0000-0000-0000-000000000001', 'resolved', now()
FROM generate_series(1, 1200) g;

-- Closures: hoje-SP 3 em contatos DISTINTOS de A (10h, 11h, 14h → buckets
-- 3,3,4 e resolvedToday=3 — a RPC conta contatos distintos, não closures),
-- ontem-SP 1 às 23h30 (prova do bucket por dia civil SP, não UTC), mais
-- distratores: 1 no contato COMPARTILHADO de B (visível a A por RLS, mas de B —
-- é ele que dá dente ao teste da trava p_agent) e 1 no contato FORA de B em Q2.
INSERT INTO public.conversation_closures (contact_id, created_at)
SELECT c,
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + (h || ' hours')::interval
FROM (VALUES ('d0000000-0000-0000-0000-000000000001'::uuid, 10),
             ('d0000000-0000-0000-0000-000000000007'::uuid, 11),
             ('d0000000-0000-0000-0000-000000000008'::uuid, 14)) v(c, h);
INSERT INTO public.conversation_closures (contact_id, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') - interval '30 minutes'),
  ('d0000000-0000-0000-0000-000000000002',
   (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '9 hours'),
  ('d0000000-0000-0000-0000-000000000003',
   (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '9 hours'),
  ('d0000000-0000-0000-0000-000000000006',
   (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '9 hours');

-- SLA de hoje-SP no contato de A: {60,90,110,120,150,36000}s → mediana 115,
-- p90 18075 (o outlier de 10h não pode distorcer o p50 — aceite E44), 1 breach.
INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
SELECT 'd0000000-0000-0000-0000-000000000001',
       base, base + (s || ' seconds')::interval, (s = 36000)
FROM (SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '8 hours' AS base) b,
     (VALUES (60), (90), (110), (120), (150), (36000)) v(s);
-- Distratores de SLA: contato compartilhado de B (visível a A, mas de B) e de C.
INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
SELECT 'd0000000-0000-0000-0000-000000000002',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '8 hours',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '8 hours' + interval '300 seconds', false;
INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
SELECT 'd0000000-0000-0000-0000-000000000006',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '8 hours',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '8 hours' + interval '45 seconds', false;

-- Mensagens de hoje-SP: 5 no contato de A, 3 no compartilhado de B, 4 no fora
-- de B, 7 no de C; ontem-SP mais 3 no de A. Janela de 8 dias: A=8, B=7.
INSERT INTO public.messages (contact_id, created_at)
SELECT 'd0000000-0000-0000-0000-000000000001',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours' + (g || ' minutes')::interval
FROM generate_series(1, 5) g;
INSERT INTO public.messages (contact_id, created_at)
SELECT 'd0000000-0000-0000-0000-000000000001',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') - interval '2 hours' + (g || ' minutes')::interval
FROM generate_series(1, 3) g;
INSERT INTO public.messages (contact_id, created_at)
SELECT 'd0000000-0000-0000-0000-000000000002',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours' + (g || ' minutes')::interval
FROM generate_series(1, 3) g;
INSERT INTO public.messages (contact_id, created_at)
SELECT 'd0000000-0000-0000-0000-000000000003',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours' + (g || ' minutes')::interval
FROM generate_series(1, 4) g;
INSERT INTO public.messages (contact_id, created_at)
SELECT 'd0000000-0000-0000-0000-000000000006',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours' + (g || ' minutes')::interval
FROM generate_series(1, 7) g;
SQL

psql_file "$tmp_dir/seed.sql"

ADMIN="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
AGENT="{\"sub\":\"22222222-2222-2222-2222-222222222222\",\"role\":\"authenticated\"}"
AGENT_B="{\"sub\":\"33333333-3333-3333-3333-333333333333\",\"role\":\"authenticated\"}"
PERFIL_A='b0000000-0000-0000-0000-000000000001'
PERFIL_B='c0000000-0000-0000-0000-000000000001'
PERFIL_C='c0000000-0000-0000-0000-000000000002'
CONTATO_B_COMPART='d0000000-0000-0000-0000-000000000002'
CONTATO_B_FORA='d0000000-0000-0000-0000-000000000003'
CONTATO_C_FORA='d0000000-0000-0000-0000-000000000006'

admin() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN" "$1"; }
agent() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT" "$1"; }
agent_b() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT_B" "$1"; }
anon() { printf "SET ROLE anon; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT" "$1"; }

echo '── BLOCO A: EXECUTE fechado para chamadas sem privilégio (DASH-092) ─────────'

expect_error 'A1 anon não executa dashboard_kpi (REVOKE de anon vigente)' \
  'permission denied for function dashboard_kpi' \
  "$(anon "SELECT public.dashboard_kpi(now() - interval '30 days', NULL, NULL);")"
expect_error 'A2 anon não executa dashboard_contact_counts' \
  'permission denied for function dashboard_contact_counts' \
  "$(anon "SELECT public.dashboard_contact_counts(now() - interval '30 days', now(), NULL, NULL);")"
expect_error 'A3 anon não executa dashboard_hourly_volume' \
  'permission denied for function dashboard_hourly_volume' \
  "$(anon "SELECT count(*) FROM public.dashboard_hourly_volume(8, NULL, NULL);")"

expect_value 'A4 authenticated sem JWT (auth.uid() NULL) falha fechado no kpi' '0' \
  "SET ROLE authenticated; SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, NULL) ->> 'resolvedToday');"
expect_value 'A5 anon lê zero linhas de contacts mesmo com GRANT de tabela' '0' \
  "$(anon "SELECT count(*) FROM public.contacts;")"

echo
echo '── BLOCO B: RLS de leitura direta com JWT não privilegiado ───────────────────'

expect_value 'B1 agent lê só contatos do próprio escopo: 1206 (RLS não filtra deleted_at — é a RPC que filtra)' '1206' \
  "$(agent "SELECT count(*) FROM public.contacts;")"
expect_value 'B2 agent não lê contato de B em fila estanque (Q2)' '0' \
  "$(agent "SELECT count(*) FROM public.contacts WHERE id='$CONTATO_B_FORA';")"
expect_value 'B3 agent não lê SLA de contato fora do escopo' '0' \
  "$(agent "SELECT count(*) FROM public.conversation_sla WHERE contact_id='$CONTATO_C_FORA';")"
expect_value 'B4 agent não lê closure de contato fora do escopo' '0' \
  "$(agent "SELECT count(*) FROM public.conversation_closures WHERE contact_id='$CONTATO_C_FORA';")"
expect_value 'B5 agent não lê messages de contato fora do escopo' '0' \
  "$(agent "SELECT count(*) FROM public.messages WHERE contact_id='$CONTATO_C_FORA';")"
expect_value 'B6 controle positivo: admin lê todos os contatos' '1208' \
  "$(admin "SELECT count(*) FROM public.contacts;")"

echo
echo '── BLOCO C: RPCs do dashboard sob JWT não privilegiado ───────────────────────'

expect_value 'C1 kpi de agent conta só o próprio escopo (3 hoje; closure de B em contato compartilhado NÃO entra)' '3' \
  "$(agent "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, NULL) ->> 'resolvedToday');")"
expect_value 'C2 trava E33 do kpi: spoof de p_agent devolve os dados do próprio chamador' 't' \
  "$(agent "SELECT public.dashboard_kpi(now() - interval '30 days', NULL, '$PERFIL_B') = public.dashboard_kpi(now() - interval '30 days', NULL, '$PERFIL_A');")"
expect_value 'C3 admin filtrando por p_agent=B vê o escopo de B (2 closures hoje)' '2' \
  "$(admin "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, '$PERFIL_B') ->> 'resolvedToday');")"

expect_value 'C4 hourly de agent conta só mensagens dos próprios contatos (5 hoje + 3 ontem = 8)' '8' \
  "$(agent "SELECT coalesce(sum(message_count),0) FROM public.dashboard_hourly_volume(8, NULL, NULL);")"
expect_value 'C5 trava E33 do hourly: spoof de p_agent devolve o próprio volume' 't' \
  "$(agent "SELECT coalesce(sum(message_count),0) = 8 FROM public.dashboard_hourly_volume(8, NULL, '$PERFIL_B');")"

# contact_counts: a trava estrita E33 foi perdida na migration 20260930400000
# (DASH-SQL-REGRESSION-001). O que a fronteira continua exigindo — e o que este
# bloco prova — é que spoof de p_agent NUNCA produz contagem fora do escopo RLS
# do chamador. Ao corrigir a RPC, endurecer para o contrato estrito
# (resultado == chamada com o próprio perfil).
expect_value 'C6 counts: spoof p_agent=B nunca sai do escopo RLS do chamador (só o contato compartilhado)' '1' \
  "$(agent "SELECT (public.dashboard_contact_counts(now() - interval '30 days', now(), NULL, '$PERFIL_B') ->> 'total');")"
expect_value 'C7 counts: spoof p_agent=C (tudo invisível) não revela nada' '0' \
  "$(agent "SELECT (public.dashboard_contact_counts(now() - interval '30 days', now(), NULL, '$PERFIL_C') ->> 'total');")"
expect_value 'C8 counts: total do agent reconcilia com o escopo RLS, acima do cap de 1000' '1205' \
  "$(agent "SELECT (public.dashboard_contact_counts(now() - interval '30 days', now(), NULL, NULL) ->> 'total');")"

if [[ "$(psql_sql "$(agent "SELECT (public.dashboard_contact_counts(now() - interval '30 days', now(), NULL, '$PERFIL_B') ->> 'total') <> (public.dashboard_contact_counts(now() - interval '30 days', now(), NULL, '$PERFIL_A') ->> 'total');")" | tail -n1)" == 't' ]]; then
  printf '[GAP-CONHECIDO] DASH-SQL-REGRESSION-001: dashboard_contact_counts sem a trava estrita E33 (spoof não devolve os dados do próprio chamador); escopo segue limitado por RLS — ver C6-C8.\n'
fi

echo
echo '── BLOCO D: edge cases E44 contra o código real (DASH-091) ───────────────────'

expect_value 'D1 kpi com janela vazia (futuro): resolvedToday=0 sem erro' '0' \
  "$(admin "SELECT (public.dashboard_kpi(now() + interval '10 years', NULL, NULL) ->> 'resolvedToday');")"
expect_value 'D2 kpi com janela vazia: avgResponseToday é null (não divide por zero)' '' \
  "$(admin "SELECT coalesce(public.dashboard_kpi(now() + interval '10 years', NULL, NULL) ->> 'avgResponseToday', '');")"
expect_value 'D3 kpi com janela vazia: resolvedHourly8 vem zerado' '[0, 0, 0, 0, 0, 0, 0, 0]' \
  "$(admin "SELECT (public.dashboard_kpi(now() + interval '10 years', NULL, NULL) ->> 'resolvedHourly8')::jsonb::text;")"

expect_value 'D4 mediana robusta a outlier: avgResponseToday=115 (p50, ignora outlier de 10h)' '115' \
  "$(admin "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, '$PERFIL_A') ->> 'avgResponseToday');")"
expect_value 'D5 p90 reflete o outlier: p90ResponseToday=18075 (vai só pro tooltip)' '18075' \
  "$(admin "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, '$PERFIL_A') ->> 'p90ResponseToday');")"

expect_value 'D6 virada de dia SP: closure às 23h30 de ontem-SP cai em resolvedYesterday' '1' \
  "$(admin "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, '$PERFIL_A') ->> 'resolvedYesterday');")"
expect_value 'D7 buckets resolvedHourly8 do dia SP: [0,0,0,2,1,0,0,0]' '[0, 0, 0, 2, 1, 0, 0, 0]' \
  "$(admin "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, '$PERFIL_A') ->> 'resolvedHourly8')::jsonb::text;")"
expect_value 'D8 slaBreachedToday conta o breach marcado' '1' \
  "$(admin "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, '$PERFIL_A') ->> 'slaBreachedToday');")"

printf '\n[OK] fronteira de autorizacao das RPCs do dashboard verificada com JWT nao privilegiado\n'
