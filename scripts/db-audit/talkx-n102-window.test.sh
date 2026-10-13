#!/usr/bin/env bash
set -Eeuo pipefail

# N-102 — janela de envio das campanhas TalkX: prova REAL, em PostgreSQL 17 descartavel,
# do contrato de public.talkx_campaign_window_open(uuid,timestamptz) e da validacao de
# send_weekdays nas RPCs de limites, sob PApeis reais (anon / authenticated / service_role).
#
# BLOCO A (estado da BASE 20261009203548 = o defeito):
#   (1) a RPC avalia p_at no fuso da SESSAO (UTC), nao no fuso da campanha (schedule_timezone);
#   (2) qualquer `authenticated` executa a RPC da campanha alheia (EXECUTE concedido na base);
#   (3) send_weekdays fora de 0..6 vaza o cast cru jsonb->smallint[] (42846) em vez do erro
#       de contrato 22023;
#   (4) o upsert de dnd_hours sobrescreve a linha de outro dono (operacao irreversivel).
# BLOCO B (estado com a leva *_talkx_n102_window_fixes.sql): os 4 defeitos viram contrato
#   valido (disposicao de fuso, 22023, ACL so service_role, upsert guardado) e o rollback da
#   fatia e EXECUTAVEL, reversivel e preserva a linha de dnd_hours de outro dono.
#
# RED sem a correcao: `TALKX_N102_SKIP_FIX=1` nao aplica a leva e o BLOCO B falha (sai 1).
# GREEN: a leva e aplicada e o script sai 0.
#
# Roda em banco DESCARTavel (docker): nada de producao, nenhuma credencial, nenhum dado real.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
base_migration="$migrations_dir/20261009203548_talkx_campaigns_send_weekdays_dnd.sql"
postgres_image="${TALKX_N102_WINDOW_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-n102-window-test-$$"
test_password="n102_window_test_only"
skip_fix="${TALKX_N102_SKIP_FIX:-}"

cleanup() {
  if [[ "$container_name" =~ ^zapp-n102-window-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_quiet() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@" >/dev/null; }

shopt -s nullglob
fix_files=("$migrations_dir"/*_talkx_n102_window_fixes.sql)
shopt -u nullglob

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$base_migration" ]] || fail "migration base ausente no workspace: $base_migration"
if [[ -z "$skip_fix" && "${#fix_files[@]}" -eq 0 ]]; then
  fail "nenhuma migration *_talkx_n102_window_fixes.sql no workspace ($migrations_dir) e TALKX_N102_SKIP_FIX nao foi ligado"
fi

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

pronto=0
for _ in $(seq 1 90); do
  if psql_test 'SELECT 1' >/dev/null 2>&1; then pronto=$((pronto + 1)); else pronto=0; fi
  (( pronto >= 2 )) && break
  sleep 1
done
(( pronto >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# ---- fixture minimo: papeis reais + helpers (auth.uid/role) + colunas que as RPCs leem ----
P1='10000000-0000-0000-0000-0000000000a1'
P2='10000000-0000-0000-0000-0000000000a2'
U1='aaaaaaaa-0000-0000-0000-0000000000a1'
U2='aaaaaaaa-0000-0000-0000-0000000000a2'
C1='30000000-0000-0000-0000-0000000000c1'   # dono P1: usada na validacao de send_weekdays
C2='30000000-0000-0000-0000-0000000000c2'   # fuso: send_weekdays {1} (segunda)
C3='30000000-0000-0000-0000-0000000000c3'   # fuso: respect_dnd=true (DND 22:00-08:00)

default_dnd='{"start":"22:00","end":"08:00","sundays":true,"holidays":[]}'
foreign_dnd='{"start":"21:00","end":"07:00","sundays":false,"holidays":[]}'

psql_quiet <<SQL
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
\$\$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS \$\$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
\$\$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE,
  role text NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS \$\$ SELECT EXISTS (
  SELECT 1 FROM public.profiles WHERE user_id = p_user AND role IN ('admin','supervisor')
) \$\$;

-- Helper real (20260911200000): a fatia de fuso depende dele em tempo de execucao.
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(p_timezone text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog
AS \$\$
  SELECT p_timezone IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_timezone_names AS timezone WHERE timezone.name = p_timezone);
\$\$;

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  created_by uuid,
  status text NOT NULL DEFAULT 'draft',
  revision bigint NOT NULL DEFAULT 1,
  schedule_timezone text,
  speed_profile text,
  send_interval_min integer,
  send_interval_max integer,
  typing_delay_min integer,
  typing_delay_max integer,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- CHECK real da tabela (20260911200000): enviada ao fixture para nao mascarar vazamento.
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_send_window_valid CHECK (
    (send_window_start IS NULL AND send_window_end IS NULL)
    OR (send_window_start IS NOT NULL AND send_window_end IS NOT NULL AND send_window_start < send_window_end)
  );

CREATE TABLE public.talkx_campaign_events (
  id bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.profiles(id, user_id, role, is_active) VALUES
  ('$P1', '$U1', 'agent', true),
  ('$P2', '$U2', 'agent', true);
SQL

# dnd_hours de OUTRO dono entra ANTES da base: o upsert da base tem que ser o alvo do teste.
psql_quiet <<SQL
INSERT INTO public.talkx_settings(key, value, description)
VALUES ('dnd_hours', '$foreign_dnd'::jsonb, 'janela do dono B');
SQL

# ---- BASE real 20261009203548 (o defeito) ----
psql_test < "$base_migration" >/dev/null || fail 'migration base 20261009203548 nao aplicou'

psql_quiet <<SQL
INSERT INTO public.talkx_campaigns(id, created_by, revision, schedule_timezone, respect_dnd) VALUES
  ('$C1', '$P1', 1, 'America/Sao_Paulo', false),
  ('$C2', '$P1', 1, 'America/Sao_Paulo', false),
  ('$C3', '$P1', 1, 'America/Sao_Paulo', true);
SQL
psql_quiet <<SQL
UPDATE public.talkx_campaigns SET send_weekdays = '{1}'::smallint[] WHERE id = '$C2';
SQL

# =============================== BLOCO A (defeito) ===============================
claims_auth_own="SET LOCAL request.jwt.claim.role = 'authenticated'; SET LOCAL request.jwt.claim.sub = '$U1';"

acl_authenticated="$(psql_test -c "SELECT has_function_privilege('authenticated','public.talkx_campaign_window_open(uuid,timestamptz)','EXECUTE')")"
[[ "$acl_authenticated" == 't' ]] || fail "BLOCO A: a base deveria conceder EXECUTE a authenticated, obtive '$acl_authenticated'"
acl_anon="$(psql_test -c "SELECT has_function_privilege('anon','public.talkx_campaign_window_open(uuid,timestamptz)','EXECUTE')")"
[[ "$acl_anon" == 'f' ]] || fail "BLOCO A: a base ja negava EXECUTE a anon, obtive '$acl_anon'"
printf '[PASS] A1 (defeito de acesso): authenticated TEM EXECUTE na RPC (vaza a janela de campanha alheia)\n'

call_window() { # role claims campaign at
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
BEGIN;
SET LOCAL ROLE $1;
$2
SELECT public.talkx_campaign_window_open('$3'::uuid, '$4'::timestamptz);
COMMIT;
SQL
}

got="$(call_window authenticated "$claims_auth_own" "$C2" '2026-10-12 01:00:00+00')"
[[ "$got" == 't' ]] || fail "BLOCO A2: a base avalia em UTC e abriria (segunda UTC); esperava 't', obtive '$got'"
printf '[PASS] A2 (defeito de fuso): p_at de 2026-10-12 01:00Z e avaliado como segunda UTC (local SP e domingo 22:00)\n'

got="$(call_window authenticated "$claims_auth_own" "$C3" '2026-10-13 00:30:00+00')"
[[ "$got" == 'f' ]] || fail "BLOCO A3: a base avalia o DND em UTC e fecharia (00:30Z dentro de 22:00-08:00); esperava 'f', obtive '$got'"
printf '[PASS] A3 (defeito de fuso no DND): 2026-10-13 00:30Z e lido como dentro do DND, mas em SP sao 21:30 (fora)\n'

probe() { # label role claims sql expected_state
  local label="$1" role="$2" claims="$3" sql="$4" expected="$5" got
  got="$(docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=0 -U postgres -d postgres 2>&1 <<SQL | sed -n 's/.*SQLSTATE=\([0-9A-Z]*\).*/\1/p' | head -1
BEGIN;
SET LOCAL ROLE $role;
$claims
DO \$do\$ BEGIN $sql; RAISE EXCEPTION 'aceito_sem_erro'; EXCEPTION WHEN others THEN RAISE NOTICE 'SQLSTATE=%', SQLSTATE; END \$do\$;
COMMIT;
SQL
)"
  [[ "$got" == "$expected" ]] || fail "$label: esperava SQLSTATE=$expected, obtive '${got:-<vazio>}'"
  printf '[PASS] %s (SQLSTATE=%s)\n' "$label" "$got"
}

probe 'A4 (defeito de cast): send_weekdays [7] vaza 42846 na base' authenticated "$claims_auth_own" \
  "PERFORM public.update_talkx_campaign_limits('$C1'::uuid, 1, '{\"send_weekdays\":[7]}'::jsonb)" '42846'

clobbered="$(psql_test -c "SELECT value = '$default_dnd'::jsonb FROM public.talkx_settings WHERE key = 'dnd_hours'")"
[[ "$clobbered" == 't' ]] || fail "BLOCO A5: o upsert da base deveria SOBRESCREVER o dnd_hours alheio; obtive '$clobbered'"
printf '[PASS] A5 (defeito de rollback): o upsert da base sobrescreveu o dnd_hours do dono B\n'

# =============================== BLOCO B (correcao) ===============================
if [[ -n "$skip_fix" ]]; then
  printf '[INFO] TALKX_N102_SKIP_FIX ligado: leva de correcao NAO aplicada (estado vermelho)\n'
else
  for f in "${fix_files[@]}"; do
    psql_test < "$f" >/dev/null || fail "migration de correcao nao aplicou: ${f##*/}"
  done
  printf '[INFO] leva aplicada (%s): %s\n' "${#fix_files[@]}" "${fix_files[*]##*/}"
fi

for role in anon authenticated; do
  got="$(psql_test -c "SELECT has_function_privilege('$role','public.talkx_campaign_window_open(uuid,timestamptz)','EXECUTE')")"
  [[ "$got" == 'f' ]] || fail "BLOCO B1: $role NAO deveria ter EXECUTE na RPC, obtive '$got'"
done
got="$(psql_test -c "SELECT has_function_privilege('service_role','public.talkx_campaign_window_open(uuid,timestamptz)','EXECUTE')")"
[[ "$got" == 't' ]] || fail "BLOCO B1: service_role deveria manter EXECUTE, obtive '$got'"
probe 'B1 (acesso): authenticated chamando a RPC de campanha alheia e negado' authenticated "$claims_auth_own" \
  "PERFORM public.talkx_campaign_window_open('$C2'::uuid, now())" '42501'
got="$(call_window service_role '' "$C2" '2026-10-12 13:00:00+00')"
[[ "$got" == 't' ]] || fail "BLOCO B1: service_role deveria continuar executando a RPC; obtive '$got'"
printf '[PASS] B1 (acesso): so service_role executa; authenticated/anon recebem 42501\n'

got="$(call_window service_role '' "$C2" '2026-10-12 01:00:00+00')"
[[ "$got" == 'f' ]] || fail "BLOCO B2: {1}=segunda; 2026-10-12 01:00Z e domingo 22:00 em SP e deveria FECHAR; obtive '$got'"
printf '[PASS] B2 (fuso): o dia da semana passa a ser o dia LOCAL da campanha (America/Sao_Paulo)\n'

got="$(call_window service_role '' "$C3" '2026-10-13 00:30:00+00')"
[[ "$got" == 't' ]] || fail "BLOCO B3: 2026-10-13 00:30Z sao 21:30 em SP, FORA do DND 22:00-08:00; deveria ABRIR; obtive '$got'"
printf '[PASS] B3 (fuso no DND): a janela de nao perturbe e avaliada na hora local (21:30 fora de 22:00-08:00)\n'

probe 'B4a (contrato): send_weekdays [7] e recusado com 22023' authenticated "$claims_auth_own" \
  "PERFORM public.update_talkx_campaign_limits('$C1'::uuid, 1, '{\"send_weekdays\":[7]}'::jsonb)" '22023'
probe 'B4b (contrato): send_weekdays nao-inteiro e recusado com 22023' authenticated "$claims_auth_own" \
  "PERFORM public.update_talkx_campaign_limits('$C1'::uuid, 1, '{\"send_weekdays\":[\"1\",\"x\"]}'::jsonb)" '22023'
probe 'B4c (contrato): send_weekdays escalar (nao-array) e recusado com 22023' authenticated "$claims_auth_own" \
  "PERFORM public.update_talkx_campaign_limits('$C1'::uuid, 1, '{\"send_weekdays\":5}'::jsonb)" '22023'
psql_quiet <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$U1';
SELECT count(*) FROM public.update_talkx_campaign_limits('$C1'::uuid, 1, '{"send_weekdays":[0,1,2,3,4,5,6]}'::jsonb);
COMMIT;
SQL
rev="$(psql_test -c "SELECT revision || '|' || send_weekdays::text FROM public.talkx_campaigns WHERE id = '$C1'")"
[[ "$rev" == '2|{0,1,2,3,4,5,6}' ]] || fail "BLOCO B4d: send_weekdays valido deveria gravar e avancar a revision; obtive '$rev'"
printf '[PASS] B4d (contrato): send_weekdays valido [0..6] e aceito e a revision avanca (2)\n'

cfg="$(psql_test -c "SELECT p.prosecdef || '|' || array_to_string(p.proconfig,',') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='talkx_campaign_window_open'")"
[[ "$cfg" == 'true|search_path=public, pg_temp' ]] || fail "BLOCO B5: SECURITY DEFINER + search_path fixo deveriam seguir; obtive '$cfg'"
printf '[PASS] B5: a RPC segue SECURITY DEFINER com search_path=public, pg_temp\n'

# ---- B6: a fatia de rollback preserva o dnd_hours de OUTRO dono ----
rollback_slice=''
for f in "${fix_files[@]}"; do
  if grep -q 'WHERE public.talkx_settings.value = EXCLUDED.value' "$f"; then rollback_slice="$f"; break; fi
done
[[ -n "$rollback_slice" ]] || fail 'BLOCO B6: nenhuma migration da leva traz o upsert guardado de dnd_hours'

psql_quiet -c "DELETE FROM public.talkx_settings WHERE key = 'dnd_hours'"
psql_quiet <<SQL
INSERT INTO public.talkx_settings(key, value, description)
VALUES ('dnd_hours', '$foreign_dnd'::jsonb, 'janela do dono B');
SQL
sed -n '/^INSERT INTO public.talkx_settings/,$p' "$rollback_slice" | psql_quiet \
  || fail 'BLOCO B6: o upsert guardado da fatia de rollback nao executou'
kept="$(psql_test -c "SELECT CASE WHEN value = '$foreign_dnd'::jsonb THEN 't' ELSE 'f' END || '|' || description FROM public.talkx_settings WHERE key = 'dnd_hours'")"
[[ "$kept" == 't|janela do dono B' ]] || fail "BLOCO B6: o upsert guardado deveria preservar a linha do dono B; obtive '$kept'"
printf '[PASS] B6: o upsert guardado da fatia nao toca o dnd_hours de outro dono\n'

# ---- B7: as linhas de rollback da fatia sao EXECUTAVEIS, reversiveis e preservam o dono B ----
sed -n 's/^--   //p' "$rollback_slice" | psql_quiet \
  || fail 'BLOCO B7: as linhas de rollback da fatia nao executam (delimitador/ordem quebrados?)'
regafter="$(psql_test -c "SELECT to_regprocedure('public.talkx_campaign_window_open(uuid,timestamptz)') IS NOT NULL")"
[[ "$regafter" == 'f' ]] || fail 'BLOCO B7: o rollback deveria remover public.talkx_campaign_window_open'
kept="$(psql_test -c "SELECT CASE WHEN value = '$foreign_dnd'::jsonb THEN 't' ELSE 'f' END || '|' || coalesce(description,'') FROM public.talkx_settings WHERE key = 'dnd_hours'")"
[[ "$kept" == 't|janela do dono B' ]] || fail "BLOCO B7: o rollback deveria preservar o dnd_hours do dono B; obtive '$kept'"
# Reversivel: reaplica a base + a leva (o rollback tambem derrubou as colunas) e a RPC volta.
psql_test < "$base_migration" >/dev/null || fail 'BLOCO B7: reaplicar a base apos o rollback falhou'
for f in "${fix_files[@]}"; do psql_test < "$f" >/dev/null || fail "BLOCO B7: reaplicar ${f##*/} apos o rollback falhou"; done
regafter="$(psql_test -c "SELECT to_regprocedure('public.talkx_campaign_window_open(uuid,timestamptz)') IS NOT NULL")"
[[ "$regafter" == 't' ]] || fail 'BLOCO B7: reaplicar a leva deveria recriar public.talkx_campaign_window_open'
printf '[PASS] B7: rollback executavel, reversivel e preservando o dnd_hours do dono B\n'

printf '[OK] Talk X N-102: window_open respeita o fuso da campanha, ACL so service_role, send_weekdays validado (22023) e rollback guardado.\n'
