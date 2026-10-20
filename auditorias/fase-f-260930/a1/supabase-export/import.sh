#!/bin/bash
set -e

# Script para importar os blocos do Supabase Export no banco de destino.
# Requer a variável de ambiente DESTINO_URL (formato postgresql://user:pass@host:port/dbname)

if [ -z "$DESTINO_URL" ]; then
  echo "❌ Erro: Variável DESTINO_URL não definida."
  echo "Uso: DESTINO_URL=postgresql://user:pass@host:port/dbname bash supabase-export/import.sh"
  exit 1
fi
export DESTINO_URL

EXPORT_DIR="supabase-export"

echo "🚀 Iniciando importação para o banco de destino..."

# Ordem definida no manifest.json / README.md
BLOCKS=(
  "BLOCO_11_extensions.sql"
  "BLOCO_02_types_enums_domains.sql"
  "BLOCO_12_tables_and_types.sql"
  "BLOCO_13_constraints_indexes.sql"
  "BLOCO_10_functions.sql"
  "BLOCO_14_rls_policies.sql"
  "BLOCO_08_views.sql"
  "BLOCO_15_triggers.sql"
)

for block in "${BLOCKS[@]}"; do
  file="$EXPORT_DIR/$block"
  if [ -f "$file" ]; then
    echo "📦 Aplicando $block..."
    node scripts/db-audit/psql-safe.mjs -v ON_ERROR_STOP=1 -f "$file" > /dev/null
  else
    echo "⚠️  Aviso: Bloco $block não encontrado, pulando..."
  fi
done

echo "✅ Importação concluída!"

echo "🔍 Iniciando validação pós-importação..."
bash "$EXPORT_DIR/validate_destino.sh"
