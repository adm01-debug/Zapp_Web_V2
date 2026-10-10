if [ $DRY != 1 ] && [ $SO_PORTAO != 1 ] && [ ${#PRONTOS[@]} -gt 0 ]; then
  DIAV="$($GIT -C "$REF" for-each-ref --format='%(refname:short)' 'refs/heads/dia/*' | sort | tail -1)"; TIPV="$($GIT -C "$REF" rev-parse "$DIAV" 2>/dev/null)"
  MKV="$DIRLOG/.base-vermelha-$TIPV"
  if [ -n "$TIPV" ] && [ -e "$MKV" ]; then
    if [ -n "$(find "$MKV" -mmin -15 2>/dev/null)" ]; then echo "base $DIAV @ ${TIPV:0:9} vermelha (marcador recente); nada a fazer nesta rodada"; exit 0; fi
    $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null; $GIT -C "$INT" checkout --quiet --detach "$TIPV"
    PARES_BASE=(); for FB in "${PRONTOS[@]}"; do PARES_BASE+=("$(campo "$FB" base_dia)|$(campo "$FB" sha)"); done
    if conferir_base "base $DIAV @ ${TIPV:0:9} (ponta da fila)" "${PARES_BASE[@]}"; then
      rm -f "$MKV"; : > "$DIRLOG/.base-verde-$TIPV"; log "a BASE ($DIAV @ ${TIPV:0:9}) voltou a ficar verde; integração retomada"
    else
      touch "$MKV"; NV="$(( $(cat "$MKV" 2>/dev/null || echo 0) + 1 ))"; echo "$NV" > "$MKV"
      log "a BASE ($DIAV @ ${TIPV:0:9}) continua VERMELHA (${NV}ª reverificação); ${#PRONTOS[@]} cartões aguardando — $(grep -E '^FALHOU' "$DIRLOG/.verificacao-da-base.log" | head -2 | tr '\n' ' ' | cut -c1-200)"
      [ "$NV" = 2 ] && printf '\n## %s — BASE DO DIA VERMELHA há mais de 30 min\n%s cartões prontos não integram enquanto %s (%s) falhar na verificação completa. Ver %s\n' \
        "$(date '+%d/%m %H:%M')" "${#PRONTOS[@]}" "$DIAV" "${TIPV:0:9}" "$DIRLOG/.verificacao-da-base.log" >> "/mnt/c/Users/Joaquim Ataides/Desktop/V2_ALERTAS.md" 2>/dev/null
      exit 0
    fi
  fi
fi
