#!/usr/bin/env bash
# t_2fd6ed9f - caso NEGATIVO: drift novo (criado pela migration do cartao) continua falhando.
# Nada aqui fala com banco, producao, docker ou rede: fixture sintetico + dublês dentro da minha pasta.
set -u
EV="$(cd "$(dirname "$0")" && pwd)"
FIX="$EV/fixture"; STB="$EV/stubs"; OUT="$EV/saida"
HOJE=/home/joaquim_ataides/.local/bin/zapp-verify
NOVO=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_feadd752/ENTREGA/zapp-verify.novo
W="$FIX/copia"
mkdir -p "$OUT"

{
  echo "== 0. alvos (sha256) =="
  sha256sum "$HOJE" "$NOVO"
  if cmp -s "$HOJE" "$(dirname "$NOVO")/zapp-verify.original"; then
    echo "instalado == artefato/zapp-verify.original : IDENTICO (cmp)"
  else
    echo "instalado == artefato/zapp-verify.original : DIFERENTE"
  fi
  echo "linhas: instalado=$(wc -l < "$HOJE")  artefato=$(wc -l < "$NOVO")"
} | tee "$OUT/00-alvos.txt"

# ---- nivel 0: o COMPARADOR REAL (o mesmo que o zapp-db-local usa no 'check') ---------------
for s in neg ctrl misto; do
  mkdir -p "$OUT/comparador-$s"
  python3 "$FIX/comparador-real.py" "$FIX/local-$s.json" "$W/supabase/schema-manifest.json" \
      "$OUT/comparador-$s/check-diferencas.txt" "" > "$OUT/comparador-$s.out" 2> "$OUT/comparador-$s.err"
  echo "$?" > "$OUT/comparador-$s.rc"
done

run() { # run <cenario> <local-manifest> <ledger> <rotulo> <script>
  cen="$1"; lm="$2"; led="$3"; rot="$4"; scr="$5"
  NOME="v2-fixt2fd6-$cen"
  H="$EV/home/$cen-$rot"
  ST="$H/.local/share/zapp-local/stacks/$NOME/estado"
  mkdir -p "$ST"
  printf '%s\n' "$W" > "$ST/copia.txt"
  : > "$ST/falhas.tsv"
  ( HOME="$H" PATH="$STB:$PATH" \
      FIXTURE_LOCAL_MANIFEST="$FIX/$lm" FIXTURE_COMPARADOR="$FIX/comparador-real.py" \
      FIXTURE_LEDGER_JSON="$FIX/$led" \
      bash "$scr" "$W" "$NOME" --rapido ) > "$OUT/motor-$cen-$rot.out" 2> "$OUT/motor-$cen-$rot.err"
  echo "$?" > "$OUT/motor-$cen-$rot.rc"
  cp "$ST/check-diferencas.txt" "$OUT/diferencas-$cen-$rot.txt" 2>/dev/null || :
  LOG="$H/.local/state/zapp-verify/$(printf '%s' "$W" | md5sum | cut -c1-12)"
  cp "$LOG/banco_local.log" "$OUT/banco_local-$cen-$rot.log" 2>/dev/null || :
  cp "$LOG/resultado.txt"    "$OUT/resultado-$cen-$rot.txt" 2>/dev/null || :
}

# cenarios ---------------------------------------------------------------
# neg             : so o drift NOVO do cartao                 -> tem de FALHAR nos dois
# ctrl            : so drift pre-existente (ja no retrato)    -> HOJE falha, NOVO avisa
# misto           : drift novo + pre-existente                -> FALHA citando SO o do cartao
# neg-sem-pendente: drift novo, sem migration pendente        -> caminho estrito intacto: FALHA
for rot in HOJE NOVO; do
  if [ "$rot" = HOJE ]; then SCR="$HOJE"; else SCR="$NOVO"; fi
  run neg            local-neg.json  ledger-com-pendente.json  "$rot" "$SCR"
  run ctrl           local-ctrl.json ledger-com-pendente.json  "$rot" "$SCR"
  run misto          local-misto.json ledger-com-pendente.json "$rot" "$SCR"
  run neg-sem-pendente local-neg.json ledger-sem-pendente.json "$rot" "$SCR"
done

{
  echo
  echo "== 1. veredito por cenario (rc do script inteiro) =="
  printf '%-18s %-6s %-6s %s\n' CENARIO HOJE NOVO "passo banco_local (NOVO)"
  for cen in neg ctrl misto neg-sem-pendente; do
    h="$(cat "$OUT/motor-$cen-HOJE.rc")"; n="$(cat "$OUT/motor-$cen-NOVO.rc")"
    v="$(grep -m1 -E '^(OK|AVISO|FALHOU)[[:space:]]+banco_local' "$OUT/motor-$cen-NOVO.out" | cut -c1-120)"
    printf '%-18s %-6s %-6s %s\n' "$cen" "$h" "$n" "$v"
  done
  echo
  echo "== 2. linhas de diferenca (comparador REAL, por cenario) =="
  for s in neg ctrl misto; do
    echo "-- $s (rc=$(cat "$OUT/comparador-$s.rc"))"
    cat "$OUT/comparador-$s/check-diferencas.txt"
  done
  echo
  echo "== 3. mensagem do passo banco_local =="
  for cen in neg ctrl misto neg-sem-pendente; do
    echo "-- $cen HOJE:"; grep -E 'banco_local|VERIFY:' "$OUT/motor-$cen-HOJE.out" | sed 's/^/     /'
    echo "-- $cen NOVO:"; grep -E 'banco_local|VERIFY:' "$OUT/motor-$cen-NOVO.out" | sed 's/^/     /'
  done
} | tee "$OUT/RESUMO.txt"
