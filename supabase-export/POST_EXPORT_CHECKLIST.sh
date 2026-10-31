#!/usr/bin/env bash
# ============================================================
# POST_EXPORT_CHECKLIST.sh
# Valida a existência e integridade dos BLOCOS 01..15 em supabase-export/
#
# Uso:
#   bash supabase-export/POST_EXPORT_CHECKLIST.sh
# ============================================================
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"

# Pares: "<numero>|<padrao_glob>|<descricao>"
BLOCKS=(
  "01|BLOCO_01_schema_completo.sql|Schema completo (consolidado)"
  "02|BLOCO_02_types_enums_domains.sql|Types / Enums / Domains"
  "03|BLOCO_03_rls_policies.sql|RLS Policies (v1)"
  "04|BLOCO_04_functions.sql|Functions (v1)"
  "05|BLOCO_05_triggers.sql|Triggers (v1)"
  "06|BLOCO_06_indexes.sql|Indexes"
  "07|BLOCO_07_foreign_keys.sql|Foreign Keys"
  "08|BLOCO_08_views.sql|Views"
  "09|BLOCO_09_rls_policies.sql|RLS Policies (v2)"
  "10|BLOCO_10_functions.sql|Functions (v2)"
  "11|BLOCO_11_extensions.sql|Database Extensions"
  "12|BLOCO_12_tables_and_types.sql|Tables + Types"
  "13|BLOCO_13_constraints_indexes.sql|Constraints + Indexes + FKs"
  "14|BLOCO_14_rls_policies.sql|RLS Policies (final)"
  "15|BLOCO_15_triggers.sql|Triggers + Trigger Functions"
)

OK=0
MISSING=0
EMPTY=0
TOTAL_LINES=0
TOTAL_BYTES=0

printf "\n=============================================================\n"
printf " POST EXPORT CHECKLIST — supabase-export/\n"
printf "=============================================================\n"
printf " %-4s %-42s %-10s %-8s  %s\n" "BLK" "ARQUIVO" "TAMANHO" "LINHAS" "STATUS"
printf -- "-------------------------------------------------------------\n"

for entry in "${BLOCKS[@]}"; do
  num="${entry%%|*}"
  rest="${entry#*|}"
  file="${rest%%|*}"
  desc="${rest#*|}"
  path="$DIR/$file"

  if [[ ! -f "$path" ]]; then
    printf " %-4s %-42s %-10s %-8s  %s\n" "$num" "$file" "-" "-" "❌ FALTANDO"
    MISSING=$((MISSING+1))
    continue
  fi

  bytes=$(wc -c < "$path" | tr -d ' ')
  lines=$(wc -l < "$path" | tr -d ' ')
  TOTAL_BYTES=$((TOTAL_BYTES + bytes))
  TOTAL_LINES=$((TOTAL_LINES + lines))

  if [[ "$bytes" -lt 50 ]]; then
    printf " %-4s %-42s %-10s %-8s  %s\n" "$num" "$file" "${bytes}B" "$lines" "⚠️  VAZIO/SUSPEITO"
    EMPTY=$((EMPTY+1))
  else
    if [[ "$bytes" -ge 1024 ]]; then
      hsize="$(( bytes / 1024 ))K"
    else
      hsize="${bytes}B"
    fi
    printf " %-4s %-42s %-10s %-8s  %s  (%s)\n" "$num" "$file" "$hsize" "$lines" "✅ OK" "$desc"
    OK=$((OK+1))
  fi
done

printf -- "-------------------------------------------------------------\n"
printf " RESUMO: %d OK  |  %d FALTANDO  |  %d SUSPEITOS\n" "$OK" "$MISSING" "$EMPTY"
printf " TOTAL: %d linhas / %d bytes\n" "$TOTAL_LINES" "$TOTAL_BYTES"
printf "=============================================================\n\n"

# Arquivos auxiliares (informativos)
for aux in POST_IMPORT_CHECKLIST.sql; do
  if [[ -f "$DIR/$aux" ]]; then
    printf " ℹ️  Auxiliar presente: %s\n" "$aux"
  fi
done

if [[ "$MISSING" -gt 0 || "$EMPTY" -gt 0 ]]; then
  printf "\n❌ Checklist FALHOU. Regenere os blocos faltantes/suspeitos.\n\n"
  exit 1
fi

printf "\n✅ Checklist OK. Todos os 15 blocos estão presentes e populados.\n\n"
exit 0