#!/usr/bin/env bash
# 20261112160000_talkx_blacklist_reconcilia_e_higiene: reconcilia a talkx_blacklist com a
# 20261011003007 (no ledger de producao, objetos ausentes no banco) e higieniza ACLs.
#
# Prova comportamental (PostgreSQL 17 descartavel, papeis reais via SET ROLE +
# request.jwt.claim.sub, default ACL de producao do Supabase reproduzido):
#  A. ESTADO DE PRODUCAO (antes): migrations reais ate a 20261108100000, SEM a
#     20261011003007 aplicada (exatamente a deriva medida): sem gatilho de auditoria,
#     admin APAGA linha, service_role executa mark_pause_investigated, PUBLIC/anon
#     executam talkx_campaign_recipients_page, authenticated tem escrita na view.
#  B. Migration nova aplicada 2x (idempotente) e:
#     1. gatilho preenche blocked_by (anti-forja), normaliza phone e preenche
#        reason_code pelo catalogo (optout->opt_out, list->manual, system->NULL);
#        service_role sem claim mantem o valor informado; removed_by grampeado.
#     2. ordem dos gatilhos: audit antes de reason_active (reason_code ja preenchido
#        quando o guarda de motivo inativo roda); motivo inativo segue recusado.
#     3. DELETE barrado para TODO papel: service_role e postgres recebem a excecao;
#        authenticated (admin, agente) e anon nao apagam nada (sem policy de DELETE).
#     4. anon/authenticated sem EXECUTE nas funcoes do gatilho.
#     5. service_role sem EXECUTE em mark_pause_investigated (chamada real recusada);
#        authenticated mantem.
#     6. anon sem EXECUTE na talkx_campaign_recipients_page; authenticated mantem.
#     7. authenticated sem INSERT/UPDATE/DELETE na view talkx_campaign_optouts (SELECT fica).
#     8. indices das 3 FKs existem.
#  C. Pre-condicao falha fechada quando a funcao de auditoria nao e a da X070.
#  D. Rollback do cabecalho executa e devolve o estado A; reaplicar volta a B.
#
# Schema vem das MIGRATIONS REAIS (falha dura se algum arquivo sumir). Harness sintetico
# so para dependencias de outras tabelas e blocos canonicos nao aplicaveis standalone,
# cada um rotulado HARNESS com a fonte canonica.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG_DIR="$REPO_ROOT/supabase/migrations"

F_CREATE="$MIG_DIR/20260409013057_7a6fb7ad-d6f8-4517-a461-ef10c0123af1.sql"
F_AUDIT="$MIG_DIR/20260910080000_talkx_blacklist_audit.sql"
F_V2="$MIG_DIR/20260910090000_talkx_blacklist_v2.sql"
F_UPDATE_POL="$MIG_DIR/20260910100000_restrict_talkx_blacklist_update_policy.sql"
F_V05="$MIG_DIR/20260929860000_talkx_blacklist_origin_check_and_phone_active_unique.sql"
F_V07="$MIG_DIR/20260930160000_talkx_blacklist_contact_active_unique.sql"
F_PHONE_AXIS="$MIG_DIR/20260930330000_talkx_suppress_contact_phone_axis.sql"
F_PAUSES="$MIG_DIR/20261011183812_instance_pauses.sql"
F_X070="$MIG_DIR/20261108100000_talkx_suppression_reasons.sql"
F_RECIPIENTS_PAGE="$MIG_DIR/20261107180000_talkx_campaign_recipients_page_add_segment.sql"
F_PAUSE_INV="$MIG_DIR/20261111181000_instance_pause_investigation.sql"
F_NEW="$MIG_DIR/20261112160000_talkx_blacklist_reconcilia_e_higiene.sql"

fail() { echo "[FAIL] $*" >&2; exit 1; }
ok()   { echo "[OK] $*"; }

for f in "$F_CREATE" "$F_AUDIT" "$F_V2" "$F_UPDATE_POL" "$F_V05" "$F_V07" "$F_PHONE_AXIS" \
         "$F_PAUSES" "$F_X070" "$F_RECIPIENTS_PAGE" "$F_PAUSE_INV" "$F_NEW"; do
  [[ -f "$f" ]] || fail "migration real ausente: $f"
done
ROLLBACK_SQL=$(sed -n '/^-- Rollback (SQL/,/^-- Fim do rollback/p' "$F_NEW" | sed -n 's/^--   //p')
[[ -n "$ROLLBACK_SQL" ]] || fail "bloco -- Rollback (SQL executavel) vazio em $(basename "$F_NEW")"
ok "migrations reais presentes e rollback extraido"

# --- postgres descartavel ------------------------------------------------------
IMAGE="${TALKX_BLACKLIST_RECONCILIA_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
CID="talkx-blacklist-reconcilia-test-$$"
docker rm -f "$CID" >/dev/null 2>&1 || true
docker run -d --name "$CID" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null \
  || fail "subir postgres descartavel ($IMAGE)"
trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
ready=false
for _ in $(seq 1 120); do
  if docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  docker logs "$CID" 2>&1 | tail -n 20 >&2 || true
  fail "postgres descartavel nao ficou pronto"
fi
sleep 5
ready=false
for _ in $(seq 1 60); do
  if docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail "postgres descartavel caiu apos o setup inicial"

PSQL=(docker exec -i "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A)
PSQL_NO_STOP=(docker exec -i "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -q -t -A)
apply() {
  "${PSQL[@]}" < "$1" >/dev/null || fail "aplicar migration real: $1"
  echo "[OK] aplicada: $(basename "$1")"
}
run() { "${PSQL[@]}" -c "$*"; }
expect_error() { # expect_error <padrao> <sql>
  local out
  out=$("${PSQL_NO_STOP[@]}" -c "$2" 2>&1 || true)
  echo "$out" | grep -q "$1" || fail "esperava erro '$1', veio: $out"
}

# --- harness: auth mock, papeis, default ACL do Supabase, stubs -----------------
run "CREATE SCHEMA IF NOT EXISTS auth;"
run "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;"
run "CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS \$\$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') \$\$;"
run "CREATE TABLE auth.users (id uuid PRIMARY KEY);"
run "CREATE ROLE anon NOLOGIN;"
run "CREATE ROLE authenticated NOLOGIN;"
run "CREATE ROLE service_role NOLOGIN BYPASSRLS;"
run "GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;"
run "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;"
# HARNESS (default ACL de producao do Supabase para objetos criados pelo postgres em
# public: tabelas/views/funcoes nascem com ALL para anon, authenticated e service_role).
# E isso que deixava service_role com EXECUTE na mark_pause_investigated e o
# authenticated com escrita na view talkx_campaign_optouts.
run "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;"
run "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;"
# HARNESS (stubs com as colunas usadas pelas migrations e corpos testados).
run "CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid UNIQUE, role text, is_active boolean NOT NULL DEFAULT true);"
run "CREATE TABLE public.contacts (id uuid PRIMARY KEY, consent_status text, updated_at timestamptz);"
run "CREATE TABLE public.messages (id uuid PRIMARY KEY);"
run "CREATE TABLE public.talkx_campaigns (id uuid PRIMARY KEY);"
run "CREATE TABLE public.audit_logs (id bigserial PRIMARY KEY, user_id uuid, action text, entity_type text, entity_id uuid, details jsonb);"
# HARNESS (is_admin_or_supervisor le profiles(role); o canonico le user_roles,
# indisponivel no descartavel — mesmo padrao de talkx-blacklist-audit-trigger.test.sh).
run "CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user AND role IN ('admin','supervisor')) \$\$;"
# HARNESS (get_profile_id_for_user canonico de 20260401000000_get_profile_id_for_user.sql)
run "CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(p_uid uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS \$\$ DECLARE v_id uuid; BEGIN SELECT id INTO v_id FROM public.profiles WHERE user_id = p_uid; RETURN v_id; END; \$\$;"

apply "$F_CREATE"
apply "$F_AUDIT"
apply "$F_V2"
# HARNESS (bloco da talkx_blacklist de 20260908120000: origin e campaign_id; o arquivo
# inteiro cria segmentos/templates/campanhas e nao e aplicavel standalone).
run "ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual';"
run "ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE SET NULL;"
apply "$F_V05"
apply "$F_V07"
apply "$F_PHONE_AXIS"
# HARNESS (politicas de 20260409190343, so o bloco da talkx_blacklist).
run "DROP POLICY IF EXISTS \"Authenticated users can add to blacklist\" ON public.talkx_blacklist;"
run "CREATE POLICY \"Admins can add to blacklist\" ON public.talkx_blacklist FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));"
run "DROP POLICY IF EXISTS \"Authenticated users can remove from blacklist\" ON public.talkx_blacklist;"
run "CREATE POLICY \"Admins can remove from blacklist\" ON public.talkx_blacklist FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));"
run "DROP POLICY IF EXISTS talkx_blacklist_update ON public.talkx_blacklist;"
run "CREATE POLICY talkx_blacklist_update ON public.talkx_blacklist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);"
apply "$F_UPDATE_POL"
# HARNESS (20261003232707 troca a assinatura de 6 argumentos da phone-axis pela de 7;
# a X070 so derruba a de 7. Sem isto o DROP TYPE da X070 falharia no descartavel.)
run "DROP FUNCTION IF EXISTS public.talkx_suppress_contact(uuid, text, text, public.talkx_blacklist_reason, text, uuid);"
# HARNESS (view de 20261002581230 — a X070 a derruba e recria; o arquivo inteiro
# depende de talkx_recipients/eventos e nao e aplicavel standalone).
run "CREATE VIEW public.talkx_campaign_optouts WITH (security_invoker = true) AS SELECT b.campaign_id, count(*)::bigint AS optout_count FROM public.talkx_blacklist AS b WHERE b.campaign_id IS NOT NULL GROUP BY b.campaign_id;"
apply "$F_X070"
apply "$F_RECIPIENTS_PAGE"
apply "$F_PAUSES"
apply "$F_PAUSE_INV"

# --- massa ---------------------------------------------------------------------
ADMIN_SUB="11111111-1111-4111-8111-111111111111"
ADMIN_PROFILE="22222222-2222-4222-8222-222222222222"
AGENT_SUB="44444444-4444-4444-8444-444444444444"
AGENT_PROFILE="33333333-3333-4333-8333-333333333333"
C1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
C2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
C3="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
C4="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
C5="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
C6="ffffffff-ffff-4fff-8fff-ffffffffffff"
C7="77777777-7777-4777-8777-777777777777"
PAUSE_ID="88888888-8888-4888-8888-888888888888"
run "INSERT INTO auth.users (id) VALUES ('$ADMIN_SUB'), ('$AGENT_SUB');"
run "INSERT INTO public.profiles (id, user_id, role) VALUES ('$ADMIN_PROFILE', '$ADMIN_SUB', 'admin'), ('$AGENT_PROFILE', '$AGENT_SUB', 'agent');"
run "INSERT INTO public.contacts (id) VALUES ('$C1'), ('$C2'), ('$C3'), ('$C4'), ('$C5'), ('$C6'), ('$C7');"

AS_ADMIN="SET ROLE authenticated; SET request.jwt.claim.sub = '$ADMIN_SUB';"
AS_AGENT="SET ROLE authenticated; SET request.jwt.claim.sub = '$AGENT_SUB';"
AS_SERVICE="SET ROLE service_role; SET request.jwt.claim.role = 'service_role';"
AS_ANON="SET ROLE anon;"
RP_SIG="public.talkx_campaign_recipients_page(uuid, integer, text, text, text, uuid)"
MP_SIG="public.mark_pause_investigated(uuid, text)"

# ================================================================== A. estado de producao
N_TRG=$(run "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.talkx_blacklist'::regclass AND tgname IN ('trg_talkx_blacklist_audit','trg_talkx_blacklist_no_delete');")
[[ "$N_TRG" == "0" ]] || fail "A: harness nao reproduz a deriva (gatilhos ja existem: $N_TRG)"
RED_ROW=$(run "$AS_SERVICE INSERT INTO public.talkx_blacklist (contact_id, reason, phone) VALUES ('$C7', 'red', '(11) 99000-0007') RETURNING id;")
RED_PHONE=$(run "SELECT phone FROM public.talkx_blacklist WHERE id = '$RED_ROW';")
[[ "$RED_PHONE" == "(11) 99000-0007" ]] || fail "A: sem gatilho o phone nao deveria ser normalizado ($RED_PHONE)"
run "$AS_ADMIN DELETE FROM public.talkx_blacklist WHERE id = '$RED_ROW';" >/dev/null
[[ "$(run "SELECT count(*) FROM public.talkx_blacklist WHERE id = '$RED_ROW';")" == "0" ]] \
  || fail "A: harness nao reproduz o defeito (admin deveria conseguir apagar)"
[[ "$(run "SELECT has_function_privilege('service_role', '$MP_SIG', 'EXECUTE');")" == "t" ]] \
  || fail "A: harness nao reproduz service_role com EXECUTE em mark_pause_investigated"
[[ "$(run "SELECT has_function_privilege('anon', '$RP_SIG', 'EXECUTE');")" == "t" ]] \
  || fail "A: harness nao reproduz anon com EXECUTE em talkx_campaign_recipients_page"
[[ "$(run "SELECT has_table_privilege('authenticated', 'public.talkx_campaign_optouts', 'INSERT');")" == "t" ]] \
  || fail "A: harness nao reproduz INSERT do authenticated na view"
ok "A: estado de producao reproduzido (sem gatilhos, admin apaga, ACLs largas)"

# ================================================================== C. pre-condicao fecha
# Corpo que nao e o da X070 no lugar da funcao: a migration tem de abortar sem mudar
# nada. Feito num banco espelho (copia do estado A), para nao sujar o principal.
run "CREATE DATABASE precond_mirror TEMPLATE postgres;"
docker exec -i "$CID" psql -U postgres -d precond_mirror -v ON_ERROR_STOP=1 -q -c "CREATE OR REPLACE FUNCTION public.talkx_blacklist_audit_trigger() RETURNS trigger LANGUAGE plpgsql AS \$f\$ BEGIN RETURN NEW; END; \$f\$;" >/dev/null
MIRROR_OUT=$(docker exec -i "$CID" psql -U postgres -d precond_mirror -v ON_ERROR_STOP=1 -q < "$F_NEW" 2>&1 || true)
echo "$MIRROR_OUT" | grep -q "corpo de talkx_blacklist_audit_trigger() nao e o de 20261108100000" \
  || fail "C: pre-condicao nao barrou corpo errado: $MIRROR_OUT"
[[ "$(docker exec -i "$CID" psql -U postgres -d precond_mirror -t -A -c "SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_talkx_blacklist_audit';")" == "0" ]] \
  || fail "C: migration abortada deixou gatilho"
run "DROP DATABASE precond_mirror;"
ok "C: pre-condicao falha fechada com corpo de auditoria que nao e o da X070"

# ================================================================== B. migration nova (2x)
apply "$F_NEW"
apply "$F_NEW"

# B1. gatilho de auditoria
ROW1=$(run "$AS_ADMIN INSERT INTO public.talkx_blacklist (contact_id, reason, blocked_by, phone, origin) VALUES ('$C1', 'opt-out', '$AGENT_PROFILE', '(11) 99000-0001', 'optout') RETURNING id;")
GOT=$(run "SELECT blocked_by::text || '|' || phone || '|' || reason_code FROM public.talkx_blacklist WHERE id = '$ROW1';")
[[ "$GOT" == "$ADMIN_PROFILE|11990000001|opt_out" ]] \
  || fail "B1: esperado blocked_by do chamador, phone normalizado e reason_code opt_out; veio $GOT"
ok "B1: INSERT autenticado: blocked_by forjado grampeado, phone normalizado, optout->opt_out"
ROW2=$(run "$AS_ADMIN INSERT INTO public.talkx_blacklist (contact_id, origin, phone) VALUES ('$C2', 'list', 'abc') RETURNING id;")
[[ "$(run "SELECT coalesce(phone,'NULL') || '|' || reason_code FROM public.talkx_blacklist WHERE id = '$ROW2';")" == "NULL|manual" ]] \
  || fail "B1: list->manual / phone invalido->NULL falhou"
ROW3=$(run "$AS_SERVICE INSERT INTO public.talkx_blacklist (contact_id, origin, blocked_by) VALUES ('$C3', 'system', '$AGENT_PROFILE') RETURNING id;")
[[ "$(run "SELECT blocked_by::text || '|' || coalesce(reason_code,'NULL') FROM public.talkx_blacklist WHERE id = '$ROW3';")" == "$AGENT_PROFILE|NULL" ]] \
  || fail "B1: service_role sem claim deveria manter blocked_by e system->NULL"
ok "B1: list->manual, phone invalido->NULL, system->NULL, service_role mantem blocked_by"
run "$AS_ADMIN UPDATE public.talkx_blacklist SET removed_at = now(), removed_by = '$AGENT_PROFILE', removal_reason = 'pedido' WHERE id = '$ROW2';"
[[ "$(run "SELECT removed_by::text || '|' || removal_reason FROM public.talkx_blacklist WHERE id = '$ROW2';")" == "$ADMIN_PROFILE|pedido" ]] \
  || fail "B1: removed_by forjado nao grampeado / removal_reason nao gravou"
ok "B1: remocao logica grampeia removed_by e grava removal_reason"

# B2. ordem dos gatilhos + motivo inativo
ORDEM=$(run "SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.talkx_blacklist'::regclass AND NOT tgisinternal;")
[[ "$ORDEM" == "trg_talkx_blacklist_audit,trg_talkx_blacklist_no_delete,trg_talkx_blacklist_reason_active" ]] \
  || fail "B2: gatilhos inesperados: $ORDEM"
TIMING=$(run "SELECT string_agg(tgname || ':' || tgtype, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.talkx_blacklist'::regclass AND tgname IN ('trg_talkx_blacklist_audit','trg_talkx_blacklist_no_delete');")
# tgtype: ROW(1)+BEFORE(2)+INSERT(4)+UPDATE(16)=23; ROW(1)+BEFORE(2)+DELETE(8)=11
[[ "$TIMING" == "trg_talkx_blacklist_audit:23,trg_talkx_blacklist_no_delete:11" ]] \
  || fail "B2: timing/eventos dos gatilhos inesperados: $TIMING"
run "INSERT INTO public.talkx_suppression_reasons (code, label, active) VALUES ('teste_inativo', 'Teste inativo', false);"
expect_error "talkx_suppression_reason_inactive" "$AS_SERVICE INSERT INTO public.talkx_blacklist (contact_id, reason_code) VALUES ('$C4', 'teste_inativo');"
ok "B2: audit (BEFORE INS/UPD) < no_delete (BEFORE DEL) < reason_active; motivo inativo recusado"

# B3. DELETE barrado para todo papel
TOTAL_ANTES=$(run "SELECT count(*) FROM public.talkx_blacklist;")
expect_error "talkx_blacklist_delete_bloqueado" "$AS_SERVICE DELETE FROM public.talkx_blacklist WHERE id = '$ROW1';"
expect_error "talkx_blacklist_delete_bloqueado" "DELETE FROM public.talkx_blacklist WHERE id = '$ROW1';"
expect_error "talkx_blacklist_delete_bloqueado" "DELETE FROM public.contacts WHERE id = '$C1';"
for who in "$AS_ADMIN" "$AS_AGENT" "$AS_ANON"; do
  run "$who DELETE FROM public.talkx_blacklist;" >/dev/null 2>&1 || true
done
[[ "$(run "SELECT count(*) FROM public.talkx_blacklist;")" == "$TOTAL_ANTES" ]] \
  || fail "B3: alguma linha foi apagada"
[[ "$(run "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='talkx_blacklist' AND policyname='Admins can remove from blacklist';")" == "0" ]] \
  || fail "B3: policy de DELETE do admin continua"
[[ "$(run "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='talkx_blacklist' AND cmd='DELETE' AND qual='false';")" == "1" ]] \
  || fail "B3: policy talkx_blacklist_no_delete ausente"
ok "B3: DELETE barrado (service_role, postgres e cascata de contato: excecao; admin/agente/anon: 0 linhas)"

# B4. funcoes do gatilho fora do alcance de anon/authenticated
for fn in talkx_blacklist_audit_trigger talkx_blacklist_no_delete; do
  for r in anon authenticated; do
    [[ "$(run "SELECT has_function_privilege('$r', 'public.$fn()', 'EXECUTE');")" == "f" ]] \
      || fail "B4: $r executa $fn"
  done
  [[ "$(run "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name='$fn' AND grantee IN ('PUBLIC','anon','authenticated');")" == "0" ]] \
    || fail "B4: grant residual em $fn"
done
ok "B4: anon/authenticated sem EXECUTE nas funcoes do gatilho"

# B5. mark_pause_investigated: service_role fora, authenticated dentro
[[ "$(run "SELECT has_function_privilege('service_role', '$MP_SIG', 'EXECUTE');")" == "f" ]] \
  || fail "B5: service_role ainda executa mark_pause_investigated"
[[ "$(run "SELECT has_function_privilege('authenticated', '$MP_SIG', 'EXECUTE');")" == "t" ]] \
  || fail "B5: authenticated perdeu EXECUTE em mark_pause_investigated"
run "INSERT INTO public.instance_pauses (id, instance, paused_until, reason, auto) VALUES ('$PAUSE_ID', 'inst-1', now() + interval '1 hour', 'teste', true);" >/dev/null
expect_error "permission denied for function mark_pause_investigated" "$AS_SERVICE SELECT public.mark_pause_investigated('$PAUSE_ID', NULL);"
INV=$(run "$AS_ADMIN SELECT (public.mark_pause_investigated('$PAUSE_ID', 'ok'))->>'investigated_by';")
[[ "$INV" == "$ADMIN_PROFILE" ]] || fail "B5: admin autenticado nao investigou ($INV)"
ok "B5: service_role recusado por permissao; admin autenticado investiga"

# B6. talkx_campaign_recipients_page: anon/PUBLIC fora
[[ "$(run "SELECT has_function_privilege('anon', '$RP_SIG', 'EXECUTE');")" == "f" ]] \
  || fail "B6: anon ainda executa talkx_campaign_recipients_page"
[[ "$(run "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name='talkx_campaign_recipients_page' AND grantee IN ('PUBLIC','anon');")" == "0" ]] \
  || fail "B6: grant residual de PUBLIC/anon"
[[ "$(run "SELECT has_function_privilege('authenticated', '$RP_SIG', 'EXECUTE');")" == "t" ]] \
  || fail "B6: authenticated perdeu EXECUTE"
ok "B6: PUBLIC/anon sem EXECUTE na paginacao; authenticated mantem"

# B7. view de opt-outs so leitura para authenticated
for p in INSERT UPDATE DELETE; do
  [[ "$(run "SELECT has_table_privilege('authenticated', 'public.talkx_campaign_optouts', '$p');")" == "f" ]] \
    || fail "B7: authenticated ainda tem $p na view"
done
[[ "$(run "SELECT has_table_privilege('authenticated', 'public.talkx_campaign_optouts', 'SELECT');")" == "t" ]] \
  || fail "B7: authenticated perdeu SELECT na view"
ok "B7: talkx_campaign_optouts so leitura para authenticated"

# B8. indices das FKs
for spec in "talkx_blacklist:reason_code" "instance_pauses:investigated_by" "talkx_suppression_reasons:created_by"; do
  tbl="${spec%%:*}"; col="${spec##*:}"
  N=$(run "SELECT count(*) FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0] WHERE i.indrelid = 'public.$tbl'::regclass AND a.attname = '$col';")
  [[ "$N" -ge 1 ]] || fail "B8: sem indice em $tbl($col)"
done
ok "B8: indices em talkx_blacklist(reason_code), instance_pauses(investigated_by), talkx_suppression_reasons(created_by)"

# ================================================================== D. rollback + reaplicar
# O rollback devolve a policy do admin e tira os gatilhos: aplica numa tabela sem as
# linhas de teste para provar o estado A (o DELETE volta a ser possivel).
run "RESET ROLE; $ROLLBACK_SQL"
[[ "$(run "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.talkx_blacklist'::regclass AND tgname IN ('trg_talkx_blacklist_audit','trg_talkx_blacklist_no_delete');")" == "0" ]] \
  || fail "D: rollback deixou gatilhos"
[[ "$(run "SELECT to_regprocedure('public.talkx_blacklist_audit_trigger()') IS NOT NULL;")" == "t" ]] \
  || fail "D: rollback apagou a funcao pre-existente talkx_blacklist_audit_trigger()"
[[ "$(run "SELECT has_function_privilege('service_role', '$MP_SIG', 'EXECUTE') AND has_function_privilege('anon', '$RP_SIG', 'EXECUTE') AND has_table_privilege('authenticated', 'public.talkx_campaign_optouts', 'INSERT');")" == "t" ]] \
  || fail "D: rollback nao devolveu os privilegios"
[[ "$(run "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='talkx_blacklist' AND policyname='Admins can remove from blacklist';")" == "1" ]] \
  || fail "D: rollback nao devolveu a policy do admin"
COL_OUT=$("${PSQL_NO_STOP[@]}" -c "SELECT import_batch_id FROM public.talkx_blacklist LIMIT 1;" 2>&1 || true)
echo "$COL_OUT" | grep -qi "does not exist" || fail "D: rollback nao removeu import_batch_id"
run "$AS_ADMIN DELETE FROM public.talkx_blacklist WHERE id = '$ROW3';" >/dev/null
[[ "$(run "SELECT count(*) FROM public.talkx_blacklist WHERE id = '$ROW3';")" == "0" ]] \
  || fail "D: apos rollback o admin deveria voltar a apagar (estado A)"
ok "D: rollback devolve o estado A"
apply "$F_NEW"
expect_error "talkx_blacklist_delete_bloqueado" "$AS_SERVICE DELETE FROM public.talkx_blacklist WHERE id = '$ROW1';"
[[ "$(run "SELECT has_function_privilege('service_role', '$MP_SIG', 'EXECUTE');")" == "f" ]] \
  || fail "D: reaplicacao nao revogou service_role"
ok "D: reaplicacao pos-rollback volta ao estado B"

echo "[OK] talkx-blacklist-reconcilia: deriva da 20261011003007 reconciliada, DELETE barrado, ACLs higienizadas"
