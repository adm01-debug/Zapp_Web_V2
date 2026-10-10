reteste_isolado() {   # $1 = resumo do zapp-verify; $2 = commit de referência (opcional): arquivos mudados desde ele NÃO podem ser "resgatados"
  local VL="$1" REFB="${2:-}" PL LIMPO ARQS NARQ NFAIL NERR NORIG PROPRIOS
  [ -f "$VL" ] && [ "$(grep -c '^FALHOU' "$VL")" = 1 ] && grep -qE '^FALHOU +testes' "$VL" || return 1
  PL="$(grep -oE '\(ver [^)]+\.log\)' "$VL" | sed 's/^(ver //; s/)$//' | head -1)"; [ -f "$PL" ] || return 1
  LIMPO="$(sed 's/\x1b\[[0-9;]*[A-Za-z]//g' "$PL")"
  # (1) a suíte tem de ter chegado ao FIM: sem a linha de resumo o processo morreu no meio e os outros arquivos nem rodaram
  printf '%s\n' "$LIMPO" | grep -qE '^ *Test Files +' || return 1
  NFAIL="$(printf '%s\n' "$LIMPO" | sed -nE 's/^ *Test Files +([0-9]+) failed.*/\1/p' | tail -1)"; NFAIL="${NFAIL:-0}"
  NERR="$(printf '%s\n' "$LIMPO" | sed -nE 's/^ *Errors +([0-9]+) errors?.*/\1/p' | tail -1)"; NERR="${NERR:-0}"
  # (2) arquivos: só a linha "FAIL <arquivo> >" e a origem dos erros não tratados (linha de pilha ❯ não é falha)
  ARQS="$( { printf '%s\n' "$LIMPO" | sed -nE 's/^ *FAIL +([^ ]+\.(test|spec)\.[a-z]+)( .*)?$/\1/p'
             printf '%s\n' "$LIMPO" | sed -nE 's/^This error originated in "([^"]+)" test file.*/\1/p'; } | sort -u)"
  NORIG="$(printf '%s\n' "$LIMPO" | grep -cE '^This error originated in "[^"]+" test file')"
  NARQ="$(printf '%s\n' "$ARQS" | grep -c . || true)"
  # (3) TODA falha tem de estar identificada: nº de arquivos FAIL = resumo; todo erro não tratado tem origem; nada de corte
  [ "$NARQ" -ge 1 ] && [ "$NARQ" -le 15 ] || return 1
  [ "$(printf '%s\n' "$LIMPO" | sed -nE 's/^ *FAIL +([^ ]+\.(test|spec)\.[a-z]+)( .*)?$/\1/p' | sort -u | grep -c . || true)" = "$NFAIL" ] || return 1
  [ "$NORIG" -ge "$NERR" ] || return 1
  printf '%s\n' "$ARQS" | grep -qvE '^src/[A-Za-z0-9_./@-]+\.(test|spec)\.tsx?$' && return 1      # só o que o vitest roda
  # (4) teste que o próprio cartão/lote criou ou mexeu não é "instável alheio": quem decide é a suíte inteira
  if [ -n "$REFB" ]; then
    PROPRIOS="$(comm -12 <(printf '%s\n' "$ARQS") <($GIT -C "$INT" diff --name-only "$REFB" HEAD 2>/dev/null | sort -u))"
    [ -z "$PROPRIOS" ] || return 1
  fi
  ( cd "$INT" && timeout -k 10 900 zapp-db-guard run -- bun run test -- $ARQS ) > "$DIRLOG/.reteste-isolado.log" 2>&1 9>&- || return 1
  # (5) o zapp-verify para no primeiro vermelho: o BUILD nunca rodou nesta árvore — roda agora
  ( cd "$INT" && timeout -k 10 900 zapp-db-guard run -- bun run build ) > "$DIRLOG/.reteste-build.log" 2>&1 9>&- || return 1
  echo "$(date -Is) reteste isolado VERDE (+build): $(echo $ARQS)" >> "$LOG"
  printf '%s\t%s\n' "$(date -Is)" "$(echo $ARQS)" >> "$DIRLOG/instaveis.tsv"     # para o sensor: mesmo arquivo resgatado ≥ 3×/dia = cartão de conserto
  return 0
}
