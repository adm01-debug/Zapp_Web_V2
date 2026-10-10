#!/usr/bin/env bash
# t_24415f97 — extrai, por NÚMERO DE LINHA, os trechos usados na prova. Nada é redigitado.
set -euo pipefail
SB="/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_24415f97"
FAB="/home/joaquim_ataides/arquitetura-v2"
LIVE="$FAB/integrador/integrar.sh"
EX="$SB/extraido"; mkdir -p "$EX"
MD5_LIVE_ESPERADO="19d60d07a0a7f4cad38d3a6500896e09"

MD5_LIVE="$(md5sum "$LIVE" | cut -d' ' -f1)"
if [ "$MD5_LIVE" != "$MD5_LIVE_ESPERADO" ]; then
  echo "ABORTA: md5 do arquivo vivo mudou (esperado $MD5_LIVE_ESPERADO, achei $MD5_LIVE)" >&2; exit 3
fi
L="$(wc -l < "$LIVE")"; [ "$L" = 510 ] || { echo "ABORTA: $L linhas (esperado 510)" >&2; exit 3; }

# --- arquivo de referência (versão ANTERIOR, sem a correção) -------------------
git -C "$FAB" show HEAD:integrador/integrar.sh > "$SB/pristine.sh"
MD5_PRI="$(md5sum "$SB/pristine.sh" | cut -d' ' -f1)"; LP="$(wc -l < "$SB/pristine.sh")"

sed -n '43,46p'   "$LIVE" > "$EX/cabecalho.sh"      # log() e campo()
sed -n '103,133p' "$LIVE" > "$EX/reteste.sh"        # reteste_isolado()
sed -n '144,171p' "$LIVE" > "$EX/conferencia.sh"    # CONJUNTO_BASE, ponta_tem_migration(), conferir_base()
sed -n '289,306p' "$LIVE" > "$EX/pontoA.sh"         # ponto A (base do dia a reverificar)
sed -n '476,481p' "$LIVE" > "$EX/pontoB.sh"         # ponto B (base após cartão vermelho)

# linhas do arquivo ANTERIOR (referência) — achadas por padrão, sem redigitar
LN_A="$(grep -n 'verificacao-da-base\.log" 2>&1 9>&- || reteste_isolado' "$SB/pristine.sh" | grep -v 'BOK' | head -1 | cut -d: -f1)"
LN_B="$(grep -n 'BOK' "$SB/pristine.sh" | grep 'verificacao-da-base\.log' | head -1 | cut -d: -f1)"
[ -n "$LN_A" ] && [ -n "$LN_B" ] || { echo "ABORTA: não achei as linhas antigas ($LN_A/$LN_B)" >&2; exit 3; }
sed -n "${LN_A}p" "$SB/pristine.sh" | sed 's/^ *//; s/^if //; s/; then$//' > "$EX/pristino-pontoA.cmd"
sed -n "${LN_B}p" "$SB/pristine.sh" > "$EX/pristino-pontoB.linha"

{
  echo "arquivo vivo : $LIVE"
  echo "  md5=$MD5_LIVE linhas=$L"
  echo "  cabecalho.sh   <- linhas 43-46     (log, campo)"
  echo "  reteste.sh     <- linhas 103-133   (reteste_isolado)"
  echo "  conferencia.sh <- linhas 144-171   (CONJUNTO_BASE/ponta_tem_migration/conferir_base)"
  echo "  pontoA.sh      <- linhas 289-306   (ponto A: base do dia a reverificar)"
  echo "  pontoB.sh      <- linhas 476-481   (ponto B: base após cartão vermelho)"
  echo "referencia (sem a correção): $SB/pristine.sh"
  echo "  md5=$MD5_PRI linhas=$LP"
  echo "  pristino-pontoA.cmd <- linha $LN_A do pristine"
  echo "  pristino-pontoB.linha <- linha $LN_B do pristine"
} | tee "$EX/MANIFESTO.txt"

echo "--- pristino-pontoA.cmd ---"; cat "$EX/pristino-pontoA.cmd"
echo "--- pristino-pontoB.linha ---"; sed 's/^/    /' "$EX/pristino-pontoB.linha"
