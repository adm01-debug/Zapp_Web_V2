    BOK="$DIRLOG/.base-verde-$BASE_SHA"; BRED="$DIRLOG/.base-vermelha-$BASE_SHA"
    find "$DIRLOG" -maxdepth 1 -name '.base-vermelha-*' -mmin +15 -delete 2>/dev/null   # vermelho vale 15 min: nunca trava para sempre
    if [ ! -e "$BOK" ] && [ ! -e "$BRED" ]; then
      if conferir_base "$ID (base após cartão vermelho)" "$BASE_SHA|$NOVO"; then : > "$BOK"; else : > "$BRED"; fi
      ls -t "$DIRLOG"/.base-verde-* "$DIRLOG"/.base-vermelha-* 2>/dev/null | tail -n +10 | xargs -r rm -f
    fi
