#!/usr/bin/env bash
# N-107 Talk X banco: lista de bloqueio guarda trilha e nao apaga linha.
#
# Prova comportamental (banco descartavel PG17, papel real via SET ROLE +
# request.jwt.claim.sub):
#  1. INSERT com blocked_by forjado e clamped pelo trigger para o perfil do
#     chamador (lookup profiles.user_id = auth.uid()); backend sem claim
#     (service_role) mantem o valor informado.
#  2. UPDATE que preenche removed_at com removed_by forjado e clamped para o
#     perfil do chamador; reativacao (removed_at = NULL) mantem NULLs.
#  2b. Linha ja removida que continua removida preserva removed_by/removed_at
#     (edicao de outro admin nao troca o autor); UPDATE autenticado nunca
#     reescreve blocked_by.
#  3. DELETE fisico recusado com a mensagem da trigger para authenticated
#     admin (policy permitiria) E para service_role (fora do RLS).
#  4. Colunas novas import_batch_id/removal_reason gravam e leem.
#  5. REVOKE: nenhuma das funcoes novas e executavel por PUBLIC/anon/
#     authenticated (o trigger dispara mesmo assim — provado pelos itens 1-3).
#  6. Rollback da linha 2 da migration executa e restaura o estado anterior;
#     reaplicar a migration volta a funcionar.
#
# O schema vem das MIGRATIONS REAIS de talkx_blacklist (falha dura se algum
# arquivo sumir — sem pulo condicional silencioso). Harness sintetico existe SO
# para dependencias de outras tabelas (auth mock, papeis, stubs profiles/
# contacts/messages com as PKs referenciadas) e para blocos canonicos que nao
# sao aplicaveis standalone (cada um rotulado HARNESS com a fonte canonica).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG_DIR="$REPO_ROOT/supabase/migrations"

# --- migrations reais de talkx_blacklist (ordem do ledger) --------------------
F_CREATE="$MIG_DIR/20260409013057_7a6fb7ad-d6f8-4517-a461-ef10c0123af1.sql"
F_AUDIT="$MIG_DIR/20260910080000_talkx_blacklist_audit.sql"
F_V2="$MIG_DIR/20260910090000_talkx_blacklist_v2.sql"
F_UPDATE_POL="$MIG_DIR/20260910100000_restrict_talkx_blacklist_update_policy.sql"
F_V05="$MIG_DIR/20260929860000_talkx_blacklist_origin_check_and_phone_active_unique.sql"
F_V07="$MIG_DIR/20260930160000_talkx_blacklist_contact_active_unique.sql"
F_PHONE_AXIS="$MIG_DIR/20260930330000_talkx_suppress_contact_phone_axis.sql"
F_NEW="$MIG_DIR/20261011003007_talkx_blacklist_audit_trilha_guarda.sql"

fail() { echo "[FAIL] $*" >&2; exit 1; }
ok()   { echo "[OK] $*"; }

# Sem pulo silencioso: cada arquivo real precisa existir (falha dura).
for f in "$F_CREATE" "$F_AUDIT" "$F_V2" "$F_UPDATE_POL" "$F_V05" "$F_V07" "$F_PHONE_AXIS" "$F_NEW"; do
  [[ -f "$f" ]] || fail "migration real ausente: $f"
done
# O espelho comentado (--   stmt;) precisa ser identico ao SQL da linha 2.
RB_LINE2=$(sed -n 's/^-- Rollback: //p' "$F_NEW")
[[ -n "$RB_LINE2" ]] || fail "linha 2 da migration nova nao e -- Rollback: com SQL"
grep -q '^-- Rollback (SQL execut' "$F_NEW" || fail "migration nova sem bloco -- Rollback (SQL executavel)"
while IFS= read -r stmt; do
  body="${stmt#--   }"
  [[ "$body" == *";" ]] || fail "linha de rollback sem ponto-e-virgula: $stmt"
  [[ "$RB_LINE2" == *"$body"* ]] || fail "rollback comentado diverge da linha 2: $stmt"
done < <(grep '^--   [^ ]' "$F_NEW")
[[ "$(grep -c '^--   [^ ]' "$F_NEW")" == "7" ]] || fail "espelho do rollback incompleto"
echo "[OK] rollback da linha 2 e espelho comentado conferem (7 comandos)"
ok "migrations reais presentes (create, audit, v2, update-policy, V05, V07, phone-axis, N-107)"

# --- postgres descartavel ------------------------------------------------------
IMAGE="${TALKX_BLACKLIST_AUDIT_TEST_POSTGRES_IMAGE:-pgvector/pgvector:0.8.0-pg17}"
CID="talkx-blacklist-audit-test-$$"
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
# O entrypoint reinicia o postgres apos o setup inicial (pg_isready pode
# acertar o servidor temporario); espera estabilizar antes do primeiro psql.
sleep 5
ready=false
for _ in $(seq 1 60); do
  if docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail "postgres descartavel caiu apos o setup inicial"

PSQL=(docker exec -i "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A)
PSQL_NO_STOP=(docker exec -i "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -q -t -A)
apply() { # apply <arquivo>: aplica migration real, falha em qualquer erro
  "${PSQL[@]}" < "$1" >/dev/null || fail "aplicar migration real: $1"
  echo "[OK] aplicada: $(basename "$1")"
}
run() { # run <sql...>: executa e imprime stdout
  "${PSQL[@]}" -c "$*"
}

# --- harness: auth mock, papeis, stubs de tabelas alheias ----------------------
run "CREATE SCHEMA IF NOT EXISTS auth;"
run "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;"
run "CREATE ROLE anon NOLOGIN;"
run "CREATE ROLE authenticated NOLOGIN;"
run "CREATE ROLE service_role NOLOGIN BYPASSRLS;"
# HARNESS (stubs com as PKs referenciadas pela talkx_blacklist; fora dela o
# banco descartavel nao tem o resto do schema). profiles inclui user_id e role
# para o lookup de autoria e para o is_admin_or_supervisor do harness.
run "CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid UNIQUE, role text);"
run "CREATE TABLE public.contacts (id uuid PRIMARY KEY);"
run "CREATE TABLE public.messages (id uuid PRIMARY KEY);"

apply "$F_CREATE"
apply "$F_AUDIT"
apply "$F_V2"

# HARNESS (replica byte-fiel do bloco de talkx_blacklist de
# 20260908120000, linhas do ADD COLUMN origin: o arquivo inteiro nao e
# aplicavel standalone — cria segmentos/templates/campanhas. O CHECK de origin
# final vem do arquivo real V05 aplicado abaixo.)
run "ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual';"

apply "$F_V05"
apply "$F_V07"

# HARNESS (get_profile_id_for_user canonico de
# 20260401000000_get_profile_id_for_user.sql; necessario a V07 e ao phone-axis)
run "CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(p_uid uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS \$\$ DECLARE v_id uuid; BEGIN SELECT id INTO v_id FROM public.profiles WHERE user_id = p_uid; RETURN v_id; END; \$\$;"

apply "$F_PHONE_AXIS"

# HARNESS (politicas canonicas nao aplicaveis standalone):
# - INSERT/DELETE admin-only: corpo exato de 20260409190343
#   (o arquivo inteiro toca 4 tabelas; aqui so o bloco da blacklist).
# - is_admin_or_supervisor do harness le profiles(role) — o canonico le
#   user_roles+auth.users (20251215025014), indisponivel no descartavel
#   (mesmo padrao do teste talkx-blacklist-policy-forward-only, aceito).
run "CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS \$\$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user AND role IN ('admin','supervisor')) \$\$;"
run "DROP POLICY IF EXISTS \"Authenticated users can add to blacklist\" ON public.talkx_blacklist;"
run "CREATE POLICY \"Admins can add to blacklist\" ON public.talkx_blacklist FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));"
run "DROP POLICY IF EXISTS \"Authenticated users can remove from blacklist\" ON public.talkx_blacklist;"
run "CREATE POLICY \"Admins can remove from blacklist\" ON public.talkx_blacklist FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));"
# HARNESS (bootstrap permissivo para exercitar o arquivo real 20260910100000,
# que faz ALTER POLICY e falharia sem a policy existir — igual ao teste
# forward-only; o corpo final vem do arquivo real).
run "DROP POLICY IF EXISTS talkx_blacklist_update ON public.talkx_blacklist;"
run "CREATE POLICY talkx_blacklist_update ON public.talkx_blacklist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);"
apply "$F_UPDATE_POL"

# HARNESS (grants vivem fora das migrations; sem eles nenhum papel alcanca a
# tabela no descartavel).
run "GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_blacklist TO authenticated;"
run "GRANT ALL ON public.talkx_blacklist TO service_role;"
# HARNESS (a policy de INSERT/UPDATE/DELETE le profiles via
# is_admin_or_supervisor com direitos do chamador).
run "GRANT SELECT ON public.profiles TO authenticated;"

# --- a migration nova (idempotente: aplica 2x) ---------------------------------
apply "$F_NEW"
apply "$F_NEW"

# --- massa: admin A (auth sub A, profile P-admin), admin B e outro perfil (forja) --
ADMIN_SUB="11111111-1111-4111-8111-111111111111"
ADMIN_PROFILE="22222222-2222-4222-8222-222222222222"
ADMIN2_SUB="55555555-5555-4555-8555-555555555555"
ADMIN2_PROFILE="66666666-6666-4666-8666-666666666666"
OTHER_SUB="44444444-4444-4444-8444-444444444444"
OTHER_PROFILE="33333333-3333-4333-8333-333333333333"
C1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
C2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
C3="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
C4="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
C5="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
C6="ffffffff-ffff-4fff-8fff-ffffffffffff"
run "INSERT INTO public.profiles (id, user_id, role) VALUES ('$ADMIN_PROFILE', '$ADMIN_SUB', 'admin'), ('$ADMIN2_PROFILE', '$ADMIN2_SUB', 'admin'), ('$OTHER_PROFILE', '$OTHER_SUB', 'agent');"
run "INSERT INTO public.contacts (id) VALUES ('$C1'), ('$C2'), ('$C3'), ('$C4'), ('$C5'), ('$C6');"

AS_ADMIN="SET ROLE authenticated; SET request.jwt.claim.sub = '$ADMIN_SUB';"
AS_ADMIN2="SET ROLE authenticated; SET request.jwt.claim.sub = '$ADMIN2_SUB';"
AS_SERVICE="SET ROLE service_role;"

# 1. INSERT com blocked_by FORJADO (outro perfil) + phone formatado + origin:
#    blocked_by sai como o perfil do chamador, phone normalizado, reason_code
#    preenchido por origin.
ROW1=$(run "$AS_ADMIN INSERT INTO public.talkx_blacklist (contact_id, reason, blocked_by, phone, origin) VALUES ('$C1', 'opt-out', '$OTHER_PROFILE', '(11) 99000-0001', 'manual') RETURNING id;")
GOT_BLOCKED=$(run "$AS_ADMIN SELECT blocked_by FROM public.talkx_blacklist WHERE id = '$ROW1';")
[[ "$GOT_BLOCKED" == "$ADMIN_PROFILE" ]] \
  || fail "blocked_by forjado passou: ficou $GOT_BLOCKED, esperado $ADMIN_PROFILE"
GOT_PHONE=$(run "$AS_ADMIN SELECT phone FROM public.talkx_blacklist WHERE id = '$ROW1';")
[[ "$GOT_PHONE" == "11990000001" ]] || fail "phone nao normalizado: $GOT_PHONE"
GOT_RC=$(run "$AS_ADMIN SELECT reason_code FROM public.talkx_blacklist WHERE id = '$ROW1';")
[[ "$GOT_RC" == "manual" ]] || fail "reason_code nao preenchido por origin: $GOT_RC"
ok "INSERT: blocked_by forjado clamped para o perfil do chamador ($GOT_BLOCKED), phone normalizado, reason_code=manual"

# 2. Backend sem claim (service_role) MANTEM o valor informado.
ROW2=$(run "$AS_SERVICE INSERT INTO public.talkx_blacklist (contact_id, reason, blocked_by, phone) VALUES ('$C2', 'rpc', '$OTHER_PROFILE', '5511980000002') RETURNING id;")
GOT2=$(run "$AS_SERVICE SELECT blocked_by FROM public.talkx_blacklist WHERE id = '$ROW2';")
[[ "$GOT2" == "$OTHER_PROFILE" ]] || fail "service_role sem claim teve valor trocado: $GOT2"
ok "INSERT service_role sem claim mantem blocked_by informado"

# 3. UPDATE que preenche removed_at com removed_by FORJADO: clamped.
run "$AS_ADMIN UPDATE public.talkx_blacklist SET removed_at = now(), removed_by = '$OTHER_PROFILE' WHERE id = '$ROW1';"
GOT_REMOVED=$(run "$AS_ADMIN SELECT removed_by FROM public.talkx_blacklist WHERE id = '$ROW1';")
[[ "$GOT_REMOVED" == "$ADMIN_PROFILE" ]] \
  || fail "removed_by forjado passou: ficou $GOT_REMOVED, esperado $ADMIN_PROFILE"
ok "UPDATE: removed_by forjado clamped para o perfil do chamador"

# 4. Reativacao (removed_at = NULL) mantem NULLs — sem forca indevida.
run "$AS_ADMIN UPDATE public.talkx_blacklist SET removed_at = NULL, removed_by = NULL WHERE id = '$ROW1';"
GOT_REACT=$(run "$AS_ADMIN SELECT removed_at IS NULL AND removed_by IS NULL FROM public.talkx_blacklist WHERE id = '$ROW1';")
[[ "$GOT_REACT" == "t" ]] || fail "reativacao nao manteve NULLs"
ok "UPDATE reativacao (removed_at NULL) nao forca removed_by"

# 4a. (Ponto 1 da recusa) admin A remove de novo com removed_by FORJADO:
#     transicao NULL -> preenchido forca o autor para o perfil de A.
run "$AS_ADMIN UPDATE public.talkx_blacklist SET removed_at = now(), removed_by = '$OTHER_PROFILE', removal_reason = 'spam' WHERE id = '$ROW1';"
REMOVED_AT_1=$(run "$AS_ADMIN SELECT removed_at::text FROM public.talkx_blacklist WHERE id = '$ROW1';")
GOT_R1=$(run "$AS_ADMIN SELECT removed_by::text || '|' || blocked_by::text FROM public.talkx_blacklist WHERE id = '$ROW1';")
[ "$GOT_R1" = "$ADMIN_PROFILE|$ADMIN_PROFILE" ] || fail "Ponto 1 (remocao): removed_by/blocked_by forjados nao foram grampeados para A (got=$GOT_R1)"
ok "remocao com removed_by forjado e grampeada para o perfil de quem removeu"

# 4b. admin B edita removal_reason da linha removida e tenta trocar a trilha:
#     removed_by/removed_at/blocked_by de A devem ficar intactos.
run "$AS_ADMIN2 UPDATE public.talkx_blacklist SET removal_reason = 'pedido atualizado pelo B', removed_by = '$OTHER_PROFILE', removed_at = now(), blocked_by = '$OTHER_PROFILE' WHERE id = '$ROW1';"
GOT_TRILHA_B=$(run "$AS_ADMIN2 SELECT removed_by::text || '|' || blocked_by::text || '|' || removed_at::text || '|' || removal_reason FROM public.talkx_blacklist WHERE id = '$ROW1';")
WANT_TRILHA_B="$ADMIN_PROFILE|$ADMIN_PROFILE|$REMOVED_AT_1|pedido atualizado pelo B"
[ "$GOT_TRILHA_B" = "$WANT_TRILHA_B" ] || fail "Ponto 1 (trilha): edicao de B trocou removed_by/removed_at/blocked_by (got=$GOT_TRILHA_B want=$WANT_TRILHA_B)"
ok "edicao de linha removida por outro admin preserva removed_by/removed_at/blocked_by de A"

# 4c. (Ponto 2 da recusa) linha ATIVA: admin B tenta reescrever blocked_by de A.
ROW6=$(run "$AS_ADMIN INSERT INTO public.talkx_blacklist (contact_id, blocked_by, origin) VALUES ('$C6', '$OTHER_PROFILE', 'manual') RETURNING id;")
run "$AS_ADMIN2 UPDATE public.talkx_blacklist SET blocked_by = '$OTHER_PROFILE', removal_reason = 'x' WHERE id = '$ROW6';"
GOT_B6=$(run "$AS_ADMIN2 SELECT blocked_by::text FROM public.talkx_blacklist WHERE id = '$ROW6';")
[ "$GOT_B6" = "$ADMIN_PROFILE" ] || fail "Ponto 2 (blocked_by): UPDATE de B reescreveu blocked_by (got=$GOT_B6 want=$ADMIN_PROFILE)"
ok "UPDATE autenticado nao reescreve blocked_by"

# 5. Colunas novas gravam e leem (trilha de lote + motivo do desbloqueio).
BATCH="99999999-9999-4999-8999-999999999999"
run "$AS_ADMIN INSERT INTO public.talkx_blacklist (contact_id, reason, phone, import_batch_id, removal_reason) VALUES ('$C3', 'lote', '5511970000003', '$BATCH', 'pedido do cliente');"
GOT_TRILHA=$(run "$AS_ADMIN SELECT import_batch_id::text || '|' || removal_reason FROM public.talkx_blacklist WHERE contact_id = '$C3';")
[[ "$GOT_TRILHA" == "$BATCH|pedido do cliente" ]] || fail "trilha nao persistiu: $GOT_TRILHA"
ok "colunas import_batch_id/removal_reason gravam e leem"

# 6. Entradas invalidas: phone lixo vira NULL; origin sem enum mantem NULL.
run "$AS_ADMIN INSERT INTO public.talkx_blacklist (contact_id, reason, phone, origin) VALUES ('$C4', 'x', 'abc', 'optout');"
GOT_INV=$(run "$AS_ADMIN SELECT phone IS NULL AND reason_code IS NULL FROM public.talkx_blacklist WHERE contact_id = '$C4';")
[[ "$GOT_INV" == "t" ]] || fail "phone invalido/origin sem enum nao resultou em NULLs"
ok "phone invalido vira NULL e origin sem enum mantem reason_code NULL"

# 7. DELETE como admin (a policy PERMITIRIA) e recusado pela trigger.
DEL_OUT=$("${PSQL_NO_STOP[@]}" -c "$AS_ADMIN DELETE FROM public.talkx_blacklist WHERE id = '$ROW1';" 2>&1 || true)
echo "$DEL_OUT" | grep -q "talkx_blacklist_delete_bloqueado" \
  || fail "DELETE como admin nao foi barrado pela trigger: $DEL_OUT"
STILL=$(run "$AS_ADMIN SELECT count(*) FROM public.talkx_blacklist WHERE id = '$ROW1';")
[[ "$STILL" == "1" ]] || fail "linha sumiu apos DELETE barrado"
ok "DELETE como authenticated admin recusado pela trigger (linha preservada)"

# 8. DELETE como service_role (fora do RLS) e recusado pela trigger.
DEL_OUT2=$("${PSQL_NO_STOP[@]}" -c "$AS_SERVICE DELETE FROM public.talkx_blacklist WHERE id = '$ROW2';" 2>&1 || true)
echo "$DEL_OUT2" | grep -q "talkx_blacklist_delete_bloqueado" \
  || fail "DELETE como service_role nao foi barrado pela trigger: $DEL_OUT2"
STILL2=$(run "$AS_SERVICE SELECT count(*) FROM public.talkx_blacklist WHERE id = '$ROW2';")
[[ "$STILL2" == "1" ]] || fail "linha sumiu apos DELETE service_role barrado"
ok "DELETE como service_role recusado pela trigger (barreira alem do RLS)"

# 9. REVOKE: funcoes novas sem EXECUTE para PUBLIC/anon/authenticated
#    (exclui a linha do dono postgres, que e implicita; zero linhas de
#    outros grantees = ninguem mais executa — PUBLIC incluso).
for fn in talkx_blacklist_audit_trigger talkx_blacklist_no_delete; do
  PRIVS=$(run "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema = 'public' AND routine_name = '$fn' AND grantee <> 'postgres';")
  [[ "$PRIVS" == "0" ]] || fail "REVOKE incompleto em $fn: $PRIVS privilegios restantes"
  for r in authenticated anon; do
    CAN=$(run "SELECT has_function_privilege('$r', 'public.$fn()', 'EXECUTE');")
    [[ "$CAN" == "f" ]] || fail "$r ainda executa $fn"
  done
done
ok "REVOKE ALL nas funcoes novas (PUBLIC/anon/authenticated sem EXECUTE)"

# 10. Rollback da linha 2 da migration executa e restaura; reaplicar volta.
ROLLBACK_SQL=$(sed -n 's/^-- Rollback: //p' "$F_NEW")
[[ -n "$ROLLBACK_SQL" ]] || fail "linha -- Rollback: vazia ou ausente em $(basename "$F_NEW")"
run "RESET ROLE; $ROLLBACK_SQL"
for col in import_batch_id removal_reason; do
  COL_OUT=$("${PSQL_NO_STOP[@]}" -c "SELECT $col FROM public.talkx_blacklist LIMIT 1;" 2>&1 || true)
  echo "$COL_OUT" | grep -qi "does not exist\|nao existe" \
    || fail "rollback nao removeu a coluna $col: $COL_OUT"
done
LEFT_TRG=$(run "SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_talkx_blacklist_audit','trg_talkx_blacklist_no_delete');")
[[ "$LEFT_TRG" == "0" ]] || fail "rollback deixou triggers: $LEFT_TRG"
LEFT_FN=$(run "SELECT count(*) FROM pg_proc WHERE proname IN ('talkx_blacklist_audit_trigger','talkx_blacklist_no_delete');")
[[ "$LEFT_FN" == "0" ]] || fail "rollback deixou funcoes: $LEFT_FN"
LEFT_POL=$(run "SELECT count(*) FROM pg_policy WHERE polname = 'talkx_blacklist_no_delete';")
[[ "$LEFT_POL" == "0" ]] || fail "rollback deixou a policy: $LEFT_POL"
ok "rollback executou e removeu colunas, triggers, funcoes e policy"
apply "$F_NEW"
run "$AS_ADMIN INSERT INTO public.talkx_blacklist (contact_id, reason, phone) VALUES ('$C5', 'pos-rollback', '5511960000005') RETURNING id;" >/dev/null
ok "reaplicacao pos-rollback funciona"

echo "[OK] talkx-blacklist-audit-trigger: trilha guarda, forja clamped, DELETE barrado"
