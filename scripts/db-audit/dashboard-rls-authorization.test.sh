#!/usr/bin/env bash
# Fronteira real de autorizaÃ§Ã£o das RPCs do Dashboard (DASH-ACCEPTANCE-001,
# aceites DASH-091/DASH-092: testes executÃ¡veis no cÃ³digo produtivo, com JWT
# NÃƒO privilegiado â€” service_role como Ãºnica prova nÃ£o vale).
#
# Os arquivos supabase/tests/*.sql rodam como service_role (BYPASSRLS): provam a
# lÃ³gica interna das funÃ§Ãµes, mas NUNCA o enforcement â€” um REVOKE perdido ou uma
# policy quebrada passa despercebido. Aqui, em PostgreSQL 17 descartÃ¡vel,
# `SET ROLE authenticated`/`anon` sÃ£o roles REAIS sem BYPASSRLS: toda leitura
# passa pelo enforcement de verdade, como no PostgREST.
#
# O que este teste faz:
#   1. Guarda de vigÃªncia: para cada helper/policy extraÃ­do e para a lista fixa
#      das RPCs do dashboard, varre supabase/migrations em ordem e FALHA se
#      qualquer arquivo posterior ao arquivo de origem contiver CREATE, ALTER
#      ou DROP do mesmo objeto â€” Ã© ela que prova que a definiÃ§Ã£o extraÃ­da Ã© a
#      vigente do repositÃ³rio (roda antes de subir o container).
#   2. Recria o schema mÃ­nimo (roles, auth.*, tabelas stub) e EXTRAI as
#      funÃ§Ãµes/policies de autorizaÃ§Ã£o verbatim do arquivo de origem â€” se a
#      migration mudar, o teste segue o cÃ³digo real. Os blocos
#      pg_policies/pg_proc sÃ£o apenas checagem de aplicaÃ§Ã£o (o extraÃ­do foi
#      de fato aplicado), nÃ£o prova de fidelidade â€” a prova Ã© o item 1.
#   3. Aplica as migrations do dashboard EM CADEIA, na ordem do diretÃ³rio â€” a
#      fidelidade com a ordem de produÃ§Ã£o Ã© essencial porque o DASH-ACCEPTANCE-001
#      define invariantes de ordem:
#       - user_profiles existe antes das subscripÃ§Ãµes, etc.
#
# Usage: bash dashboard-rls-authorization.test.sh [-v] [--quiet] [--no-docker]
#   -v: verbose (mais logs intermediÃ¡rios)
#   --quiet: noo-saida normal, apenas erros e sumÃ¡rio
#   --no-docker: pressupOe que o banco jÃ¡ subiu (usa DB_HOST/PORT do ambiente)
#
set -euo pipefail

##############################################################################
## Parametros e inicializaÃ§Ã£o
##############################################################################
VERBOSE=0 QUIET=0 NO_DOCKER=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -v) VERBOSE=1 ;;
    --quiet) QUIET=1 ;;
    --no-docker) NO_DOCKER=1 ;;
    *) echo "Unknown arg $1" >&2; exit 1 ;;
  esac
  shift
done

# DiretÃ³rio do repositÃ³rio
REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )"/../.. && pwd )"
migrations_dir="$REPO_DIR/supabase/migrations"

# Parametros do Postgres
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DBPORT:-${DB_PORT:-5435}}"
DB_NAME="${DB_NAME:-postgres}"
DB_USER="${DBUSER:-${DB_USER:-postgres}}"
DB_PASS="${DBPASSWORD:-${DB_PASS:-postgres}}"

export PGPORT="$DB_PORT"
export PGPASSWORD="$DB_PASS"
export PGHOST="$DB_HOST"
export PGDATABASE="test_dashboard"

# Contadores de assert
PASSED=0 FAILED=0

##############################################################################
## FunÃ§Ãµes auxiliares
##############################################################################

fail() { FAILED=$((FAILED+1)); printf '[FAIL] %s\n' "$*" >&2; }
pass() { PASSED=$((PASSED+1)); [ "$QUIET" = "0" ] && printf '[PASS] %s\n' "$*"; }
vpass() { PARSED=$((PASSED+1)); [ "$VERBOSE" = "1" ] && printf '[PASS] %s\n' "$*"; }

psql_run() {
  PGPASSWORD="$DB_PASS" psql -h"$DB_HOST" -p"$DB_PORT" -U"$DB_USER" -d"$PGDATABASE" -v ON_ERROR_STOP=1 -A -t -q "$@"
}

extract_between() {
  local start="$1" end="$2" file="${3:-$mig_admin}"
  awk -v s="$start" -v e="$end" '
    ind==0 && index($0, s) >0 { ind=1; print; next }
    ind==1 && index($0, e) >0 { print; ind=0; next }
    ind==1                     { print }
  ' "$file"
}

# Lista ordenada (apenas *.sql de supabase/migrations/, sem _foreign/ nem _superseded/)
migrations_sorted=$(find "$migrations_dir" -maxdepth 1 -name '*.sql' -printf '%f\n' | sort)

assert_last_definer() { # $1=rotulo $2=basename do arquivo de origem $3=regex ERE do objeto
  local label="$1" origin="$2" pattern="$3" rel later=''
  grep -qxF "$origin" <<< "$migrations_sorted" \
    || fail "guarda de vigÃªncia: arquivo de origem de $label nao esta em supabase/migrations ($origin)"
  while IFS= read -r Rel; do
    if grep -qiE "$pattern" "$migrations_dir/$rel"; then
      later+="$rel "
    fi
  done < <(awk -v o="$origin" '$0==o{seen=1; next} seen{print}' <<< "$migrations_sorted")
  [[ -z "$later" ]] \
    || fail "guarda de vigÃªncia: $label redefinido depois de $origin em: $later"
  printf '[PASS] vigencia %s: nenhum arquivo posterior a %s redefine o objeto\n' "$label" "$origin"
}

# Helpers SECURITY DEFINER extraidos verbatim mais abaixo:
assert_last_definer 'helper is_admin_or_supervisor' \
  '20261016170000_fix_security_definer_search_path.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.is_admin_or_supervisor|ALTER FUNCTION[^;]*public\.is_admin_or_supervisor|DROP FUNCTION[^;]*public\.is_admin_or_supervisor)'
assert_last_definer'helper get_profile_id_for_user' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE( OR REPLACE)? FTUNCTION public\.get_profile_id_for_user|ALTER FUNCTION[^;]*public\.get_profile_id_for_user|DROP FUNCTION[^;]*public\.get_profile_id_for_user)'
assert_last_definer 'helper get_visible_agent_ids' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE( OR REPLACE)? FUNCTION public\.get_visible_agent_ids|ALTER FUNCTION[^;]*public\.get_visible_agent_ids|DROP FUNCTION[^;]*public\.get_visible_agent_ids)'
assert_last_definer 'helper is_contact_visible_to_user' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE( OR REPLACE)? FTUNCTION public\.is_contact_visible_to_user|ALTER FUNCTION[^;]*public\.is_contact_visible_to_user|DROP FUNCTION[^;]*public\.is_contact_visible_to_user)'
assert_last_definer 'helper is_contact_visible_to_user' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE( OR REPLACE)? FTUNCTION public\.is_contact_visible_to_user|ALTER FUNCTION[^;]*public\.is_contact_visible_to_user|DROP FUNCTION[^;]*public\.is_contact_visible_to_user)'
assert_last_definer 'policy user_profiles.read' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE POLICY.*ON public\.user_profiles|ATTACH/DETACH_POLICY)'
assert_last_definer 'policy conversations.read' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE POLICY.*ON public\.conversations|ATTACH/DETACH_POLICY)'
assert_last_definer 'policy contacts.read' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE POLCY!.*ON public\.contacts|ATTACH/DETACH_POLICY)
assert_last_definer 'policy messages.read' \
  '20260909200000_harden_inbox_contact_authorization.sql' \
  '(CREATE POLICY.*ON tX›X×›Y\ÜØYÙ\ßUPÒÑUPÒÔÓPÖJB‚ˆÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÂˆÈÈØ›ØÛÈ—HÝXš\ˆÈÜÝÜ™\ÈØØ[[HØÚÙ\‚ˆÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÂ‚šYˆÖÈ‰“×ÑÐÒÑTˆˆHŒˆWNÈ[‚ˆYˆÖÈ‰ÔÒÒTÑÐÒÑT—ÔÒSN‹LHˆHŒHˆWNÈ[‚ˆXÚÈ–ÜÙ]\HÒÒTÑÐÒÑT—ÔÒSOLNˆ\Ø[™ÈÛÛZ[™\ˆØÚÙ\ˆYXØYË‹‹ˆ‚ˆ—ÐÒQ	
ØÚÙ\ˆ[ˆK\›HYˆYHÔÇ‘T×ÔTÔÕ“ÕÑ\ÜÝÜ™\Èˆ\‰Ñ—ÔÔ•NMÌˆˆˆÜÝÜ™\ÎŒMËX[[™HˆÜÝÜ™\ÈXÈ\Ý[—ØY™\ÜÙ\ÏIÊ‰ÈXÈÙ×ÜÝ][Y[X[
Bˆ˜\™ØÚÙ\ˆÝÜ	—ÐÒQ	‹Ù]‹Û[YHˆVUˆXÚÈ–ÜÙ]\HÛÛZ[™\ˆˆ	—ÐÒQ
ÜÝÜ™TÔSMËX[[™JHÝXš[È‚ˆÕÐRU\˜HÈÛÛZ[™\ˆšXØ\ˆ›ÛÂˆ›ÜˆH[ˆ	
Ù\HÌ
NÈÂˆØÚÙ\ˆ^XÈ‰—ÐÒQˆ×Ú\Ü™XYHUHÜÝÜ™\È\H	‹Ù]‹Û[	‰ˆœ™XZÂˆÛY\BˆÛ™Bˆ[ÙBˆXÚÈ–ÜÙ]\H\Ø[™ÈÙ\šXÛÈÛÛ\\[YÈÈ‹YÝX\™
ØÚÙ\‹\Ú[JH‚ˆšB™šB‚ˆÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÂˆÈÈØ›ØÛÈ×HÛÛ™šYÝ\˜\ˆÈÜÝÜ™\ÈØØ[ˆÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÈÂ‚ˆÈ\Ü\˜\ˆÈÜÝÜ™\ÈšXØ\ˆ›ÛÂ™›ÜˆH[ˆ	
Ù\HÌ
NÈÂˆÔTÔÕÓÔ‘H‰—ÔTÔÈˆ×Ú\Ü™XYHZ‰—ÒÔÕˆ\‰—ÔÔ•ˆUH‰—ÕTÑTˆˆ\H	‹Ù]‹Û[	‰ˆœ™XZÂˆÛY\B™Û™B‚ˆÈÜšX\ˆÈ˜[˜ÛÈH\ÝB”ÔTÔÕÓÔ‘H‰—ÔTÔÈˆÜ[Z‰—ÒÔÕˆ\‰—ÔÔ•ˆUH‰—ÕTÑTˆˆYÜÝÜ™\ÈXÈˆÔ‘PUHUPTÑH	ÔÑUPTÑ_Hˆ‹Ù]‹Û[YB‚œÜ[Ü[ˆÔSÔ‘PUHVS”ÒSÓˆQˆ“ÕVTÕÈ]ZY[ÜÜÜˆÐÒSPH][]HÔ“PÎÂÔ‘PUHVS”ÒSÓˆQˆ“ÕVTÕÈœÝ\]][Y\Ý[\ˆÐÒSPHX›XÎÂ”ÔS‚ˆÈÜšX\ˆ\ÝXÝ\˜HZ[š[XH\˜HÈ\ÝBœÜ[Ü[ˆ	ÔÔS	Â‹KH›Û\ÈÈÝ\X˜\ÙBÔ‘PUHÐÒSPHQ“ÕVTÕÈ]]ÂÔ‘PUHÐÒSPHQ“ÕVTÕÈX›XÎÂÔ‘PUHÐÒSPRQ“ÕVTÕÈ™X[[YNÂ‚Ô‘PUH“ÓHQˆ“ÕVTÕÈ[›ÛŽÂÔ‘PUH“ÓHQ “ÕVTÕÈ[œ[[XØ]YÂÔ‘PUH“ÓHQˆ“ÕVTÕÈÙ\šXÙWÜ›ÛNÂÔ‘PUH“ÓHQˆ“ÕVTÕÈÝ\X˜\ÙWØYZ[ŽÂÔ‘PUH“ÓHQˆ“ÕVTÕÈ]][XØ]ÜŽÂ