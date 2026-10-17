#!/usr/bin/env bash
# SYNC20-23 - prova de rollback no banco local do replay (nao mock).
# Uso: sync20-23-prova-rollback-lote1.sh <container> <dir-com-supabase/migrations>
# Roda DENTRO de um run do replay-local.sh (o container fica de pe) - ver replay-lote1 acima no relato.
# Para cada migration do LOTE 1: (1) confere o objeto presente, (2) executa o rollback,
# (3) confere o objeto ausente, (4) reaplica a migration, (5) confere que voltou.
# A 20261009062323 sai do lote: o rollback dela e executado no fim e o VERMELHO e o ACHADO.
set -u
NOME="$1"
TREE="$2"
MIG="$TREE/supabase/migrations"
RBTMP="$TREE/.tmp-rb-sync20-23.sql"
RC=0

psql_() { docker exec -i "$NOME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -t -A -c "$1" 2>&1; }
roda()  { docker exec -i "$NOME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < "$1" 2>&1; }
conta() { printf '%s' "$(psql_ "$2")" | tr -d '[:space:]'; }

rollback_sql() { # imprime SO o SQL de rollback do arquivo (bloco executavel ou linha unica)
  local f="$1"
  if grep -qi -- "-- Rollback (SQL execut" "$f"; then
    awk '/-- Rollback \(SQL execut/{f=1;next} f && /^--   /{sub(/^--   /,"");print;next} f{exit}' "$f"
  else
    sed -n 's/^-- Rollback:[[:space:]]*//p' "$f" | head -1
  fi
}

prova() { # $1 = arquivo, $2 = consulta de presenca, $3 = rotulo, $4 = contagem esperada na presenca
  local nome presenca aplicado depois reaplicado saida
  nome="$1"; presenca="$2"
  aplicado=$(conta "$nome" "$presenca")
  rollback_sql "$MIG/$nome" > "$RBTMP"
  if [ ! -s "$RBTMP" ]; then
    echo "FALHA  $nome -> nao consegui extrair o rollback"; RC=1; return
  fi
  if ! saida=$(roda "$RBTMP"); then
    echo "FALHA  $nome -> rollback nao executou: $(printf '%s' "$saida" | grep -m1 ERROR:)"; RC=1; return
  fi
  depois=$(conta "$nome" "$presenca")
  if ! saida=$(roda "$MIG/$nome"); then
    echo "FALHA  $nome -> migration nao reaplicou: $(printf '%s' "$saida" | grep -m1 ERROR:)"; RC=1; return
  fi
  reaplicado=$(conta "$nome" "$presenca")
  if [ "$aplicado" = "$4" ] && [ "$depois" = "0" ] && [ "$reaplicado" = "$aplicado" ]; then
    echo "OK     $nome -> $3: presente=$aplicado rollback->0 reaplicado->$reaplicado"
  else
    echo "FALHA  $nome -> $3: presente=$aplicado (esperado $4) rollback->$depois reaplicado->$reaplicado"; RC=1
  fi
}

echo "=== PROVA DE ROLLBACK DO LOTE 1 (container $NOME) ==="
prova 20261010180000_conversation_tasks_owner_status_completed_idx.sql \
      "select count(*) from pg_class where relname='idx_conversation_tasks_owner_status_completed'" \
      "indice idx_conversation_tasks_owner_status_completed" 1
prova 20261010180001_conversation_tasks_owner_status_position_idx.sql \
      "select count(*) from pg_class where relname='idx_conversation_tasks_owner_status_position'" \
      "indice idx_conversation_tasks_owner_status_position" 1
prova 20261011140613_messages_group_sender.sql \
      "select count(*) from information_schema.columns where table_schema='public' and table_name='messages' and column_name in ('sender_display_name','sender_participant_jid')" \
      "2 colunas aditivas de public.messages" 2
prova 20261011003025_fecha_get_profile_role_for_check.sql \
      "select (pg_get_functiondef('public.get_profile_role_for_check(uuid)'::regprocedure) like '%auth.uid()%')::int" \
      "checagem de dono no corpo da funcao" 1
echo "PROVA_LOTE1=$([ $RC -eq 0 ] && echo VERDE || echo VERMELHO)"

echo "=== ACHADO: rollback de 20261009062323_sec_p2_definer_storage.sql ==="
rollback_sql "$MIG/20261009062323_sec_p2_definer_storage.sql" > "$RBTMP"
if saida=$(roda "$RBTMP"); then
  echo "SURPRESA: o rollback executou (esperado: quebrado por 20261014023945 retirar p_email)"
else
  echo "CONFIRMADO QUEBRADO: $(printf '%s' "$saida" | grep -m1 ERROR:)"
fi
exit $RC
