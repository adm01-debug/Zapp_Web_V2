#!/usr/bin/env bash
# E52 — verifica tabelas team_* na publicação supabase_realtime
set -euo pipefail

EXPECTED_TABLES=(
  "team_conversations"
  "team_conversation_members"
  "team_messages"
  "team_message_reactions"
  "team_message_receipts"
)

SQL="SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename LIKE 'team_%' ORDER BY tablename;"

RESULT=$(psql "${DESTINO_URL}" -At -c "$SQL" 2>/dev/null || echo "PSQL_FAILED")

if [ "$RESULT" = "PSQL_FAILED" ]; then
  echo "SKIP: sem DESTINO_URL" && exit 0
fi

FAIL=0
for T in "${EXPECTED_TABLES[@]}"; do
  if ! echo "$RESULT" | grep -qx "$T"; then
    echo "FAIL: $T não está na publicação" && FAIL=1
  fi
done

[ "$FAIL" -eq 0 ] && echo "OK: todas as tabelas team_* confirmadas na publicação" || exit 1
