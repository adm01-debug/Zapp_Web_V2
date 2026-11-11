#!/usr/bin/env bash
# X070 — talkx_suppression_reasons: conferência PÓS-DEPLOY (não é teste de CI:
# exige um banco com a migration aplicada; o CI prova a aplicação no replay).
# Uso, depois do db-migrate: PGURL="postgres://..." bash scripts/db-audit/talkx-suppression-reasons.smoke.sh
set -euo pipefail

migration="supabase/migrations/20261108100000_talkx_suppression_reasons.sql"

if [[ ! -f "$migration" ]]; then
  echo "ERRO: arquivo de migration não encontrado: $migration" >&2
  exit 1
fi

pq() { psql "${PGURL:?PGURL não definido}" -At -c "$1"; }

echo "=== X070 smoke-test ==="

# 1. Tabela existe
echo -n "[1] talkx_suppression_reasons existe ... "
result=$(pq "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='talkx_suppression_reasons';")
[[ "$result" == "1" ]] && echo "OK" || { echo "FALHOU (got: $result)"; exit 1; }

# 2. 6 motivos seed
echo -n "[2] 6 motivos do sistema ... "
result=$(pq "SELECT count(*) FROM talkx_suppression_reasons WHERE is_system = true;")
[[ "$result" == "6" ]] && echo "OK" || { echo "FALHOU (got: $result, esperado 6)"; exit 1; }

# 3. reason_code é text (não enum)
echo -n "[3] reason_code é text ... "
result=$(pq "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_blacklist' AND column_name='reason_code';")
[[ "$result" == "text" ]] && echo "OK" || { echo "FALHOU (got: $result, esperado text)"; exit 1; }

# 4. FK existe
echo -n "[4] FK talkx_blacklist_reason_code_fk existe ... "
result=$(pq "SELECT count(*) FROM information_schema.table_constraints WHERE constraint_name='talkx_blacklist_reason_code_fk' AND table_schema='public';")
[[ "$result" == "1" ]] && echo "OK" || { echo "FALHOU (got: $result)"; exit 1; }

# 5. Enum antigo removido
echo -n "[5] enum talkx_blacklist_reason removido ... "
result=$(pq "SELECT count(*) FROM pg_type WHERE typname='talkx_blacklist_reason';")
[[ "$result" == "0" ]] && echo "OK" || { echo "FALHOU (enum ainda existe)"; exit 1; }

# 6. View recriada
echo -n "[6] view talkx_campaign_optouts existe ... "
result=$(pq "SELECT count(*) FROM information_schema.views WHERE table_schema='public' AND table_name='talkx_campaign_optouts';")
[[ "$result" == "1" ]] && echo "OK" || { echo "FALHOU (got: $result)"; exit 1; }

# 7. RLS habilitado
echo -n "[7] RLS habilitado em talkx_suppression_reasons ... "
result=$(pq "SELECT relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace WHERE relname='talkx_suppression_reasons' AND nspname='public';")
[[ "$result" == "t" ]] && echo "OK" || { echo "FALHOU (got: $result)"; exit 1; }

# 8. talkx_suppress_contact existe e é SECURITY DEFINER
echo -n "[8] talkx_suppress_contact SECURITY DEFINER ... "
result=$(pq "SELECT prosecdef FROM pg_proc JOIN pg_namespace ON pg_namespace.oid=pg_proc.pronamespace WHERE proname='talkx_suppress_contact' AND nspname='public';")
[[ "$result" == "t" ]] && echo "OK" || { echo "FALHOU (got: $result)"; exit 1; }

# 9. Gatilho de motivo ativo em talkx_blacklist
echo -n "[9] trg_talkx_blacklist_reason_active existe ... "
result=$(pq "SELECT count(*) FROM pg_trigger WHERE tgname='trg_talkx_blacklist_reason_active' AND tgrelid='public.talkx_blacklist'::regclass;")
[[ "$result" == "1" ]] && echo "OK" || { echo "FALHOU (got: $result)"; exit 1; }

# 10. authenticated nao escreve is_system (GRANT so de colunas editaveis)
echo -n "[10] authenticated sem INSERT/UPDATE em is_system ... "
result=$(pq "SELECT has_column_privilege('authenticated','public.talkx_suppression_reasons','is_system','INSERT') OR has_column_privilege('authenticated','public.talkx_suppression_reasons','is_system','UPDATE');")
[[ "$result" == "f" ]] && echo "OK" || { echo "FALHOU (got: $result)"; exit 1; }

echo ""
echo "=== TODOS OS TESTES PASSARAM ==="
