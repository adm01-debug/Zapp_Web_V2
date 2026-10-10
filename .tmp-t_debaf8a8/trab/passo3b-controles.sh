#!/usr/bin/env bash
# t_debaf8a8 - passo 3b: controles do ENSAIO do script inteiro.
#   S-B POSITIVO ....... diferenca que JA esta no retrato da copia -> NOVO tem de AVISAR (rc=0)
#   S-C FAIL-CLOSED .... registro de versoes ilegivel -> regra estrita (rc=1) mesmo com so drift canonico
# O dublê do banco local repete a saida real capturada nos dois casos de hoje.
set -u
SB=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_debaf8a8
E="$SB/entradas"; OUT="$SB/saida"
HOJE=/home/joaquim_ataides/.local/bin/zapp-verify
NOVO=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA/zapp-verify.novo
NOME=v2-verif-t_debaf8a8
W="$SB/copia"
HOME_SB="$SB/home"
st="$HOME_SB/.local/share/zapp-local/stacks/$NOME/estado"

# retrato da copia realmente tem a chave escolhida?
python3 - <<'PY'
import json
m=json.load(open('/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/indeterminate-optout-outbox-migration-re-26100709037ed9/supabase/schema-manifest.json',encoding='utf-8'))
k='f:accept_department_invite(p_code text)'
print('chave no retrato da copia: %s -> %s' % (k, k in m['functions']))
PY
printf 'functions|f:accept_department_invite(p_code text)\n' > "$E/check-canonico.txt"
cat > "$E/check-canonico.txt.saida" <<'TXT'
[functions] só produção=0 só local=0 diferentes=1
    diferente: f:accept_department_invite(p_code text)
ESTRUTURA: 1 diferença(s) em relação ao retrato da produção
TXT
[ -f "$st/copia.txt" ] || { echo "rode primeiro trab/passo3-shell.sh"; exit 2; }

run() { # run <rotulo> <script> <fixture-check-diferencas> <fixture-saida-check> <ledger-le>
  local rot="$1" script="$2" fx="$3" mostra="$4" ledger="$5"
  cp "$fx" "$st/check-diferencas.txt"
  echo "================ $rot (ledger $ledger) : $(basename "$script")"
  ( HOME="$HOME_SB" PATH="$SB/stubs:$PATH" FIXTURE_CHECK_TXT="$mostra" FIXTURE_LEDGER_LE="$ledger" \
      FIXTURE_LEDGER_JSON="$SB/stubs/ledger.json" \
      bash "$script" "$W" "$NOME" --rapido ) > "$OUT/ctrl-$rot.out" 2>&1
  local rc=$?
  echo "$rc" > "$OUT/ctrl-$rot.rc"
  grep -E 'banco_local|VERIFY:' "$OUT/ctrl-$rot.out"
  echo "exit code = $rc"
}

# o dublê do registro de versoes passa a respeitar FIXTURE_LEDGER_LE (ilegivel = sai 1)
cat > "$SB/stubs/zapp-db-ler" <<'SH'
#!/bin/sh
[ "${FIXTURE_LEDGER_LE:-ok}" = ok ] || exit 1
cat "$FIXTURE_LEDGER_JSON"
SH
chmod +x "$SB/stubs/zapp-db-ler"

run S-B-positivo-NOVO "$NOVO" "$E/check-canonico.txt" "$E/check-canonico.txt.saida" ok
run S-B-positivo-HOJE "$HOJE" "$E/check-canonico.txt" "$E/check-canonico.txt.saida" ok
run S-C-failclosed-NOVO "$NOVO" "$E/check-canonico.txt" "$E/check-canonico.txt.saida" ilegivel
run S-C-failclosed-HOJE "$HOJE" "$E/check-canonico.txt" "$E/check-canonico.txt.saida" ilegivel

# S-D: caso MISTO (uma linha canonica + uma linha nova do cartao) -> NAO pode virar AVISO
printf 'functions|f:accept_department_invite(p_code text)\nindexes|sonda_cartao.sonda_cartao_pkey\n' > "$E/check-misto.txt"
cat > "$E/check-misto.txt.saida" <<'TXT'
[functions] só produção=0 só local=0 diferentes=1
    diferente: f:accept_department_invite(p_code text)
[indexes] só produção=0 só local=1 diferentes=0
    só local: sonda_cartao.sonda_cartao_pkey
ESTRUTURA: 2 diferença(s) em relação ao retrato da produção
TXT
run S-D-misto-NOVO "$NOVO" "$E/check-misto.txt" "$E/check-misto.txt.saida" ok
run S-D-misto-HOJE "$HOJE" "$E/check-misto.txt" "$E/check-misto.txt.saida" ok

# volta o estado real (47 linhas) ao lugar
cp "$E/check-diferencas-live.txt" "$st/check-diferencas.txt"
echo
echo "=== resumo dos controles ==="
for r in S-B-positivo-NOVO S-B-positivo-HOJE S-C-failclosed-NOVO S-C-failclosed-HOJE S-D-misto-NOVO S-D-misto-HOJE; do
  printf '%-24s rc=%s  %s\n' "$r" "$(cat "$OUT/ctrl-$r.rc")" "$(grep -m1 -E 'AVISO|FALHOU|OK      banco' "$OUT/ctrl-$r.out" | cut -c1-120)"
done
