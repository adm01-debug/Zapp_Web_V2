#!/usr/bin/env bash
# t_debaf8a8 - passo 3: roda o SCRIPT INTEIRO (zapp-verify) com as dependencias externas
# substituidas por dublês que REPETEM a saida real capturada do conjunto vivo de hoje.
# O codigo sob prova (o bloco banco_local) e o do artefato, sem alteracao.
# Nada aqui fala com banco, producao ou rede; tudo vive dentro do meu workspace.
set -u
SB=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_debaf8a8
E="$SB/entradas"; OUT="$SB/saida"; T="$SB/trab"
HOJE=/home/joaquim_ataides/.local/bin/zapp-verify
NOVO=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA/zapp-verify.novo
REAL=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/indeterminate-optout-outbox-migration-re-26100709037ed9
NOME=v2-verif-t_debaf8a8
W="$SB/copia"
HOME_SB="$SB/home"
st="$HOME_SB/.local/share/zapp-local/stacks/$NOME/estado"

rm -rf "$W" "$HOME_SB" "$SB/stubs"; mkdir -p "$W/supabase" "$W/scripts" "$W/node_modules" "$st" "$SB/stubs"
ln -s "$REAL/supabase/migrations"            "$W/supabase/migrations"
ln -s "$REAL/supabase/schema-manifest.json"  "$W/supabase/schema-manifest.json"
printf '%s\n' "$W" > "$st/copia.txt"
cp "$E/check-diferencas-live.txt" "$st/check-diferencas.txt"
cp "$E/falhas-live.tsv"           "$st/falhas.tsv"

# --- dublês: repetem o que o conjunto vivo devolveu hoje -------------------------
cat > "$SB/stubs/zapp-db-guard" <<'SH'
#!/bin/sh
exit 0
SH
cat > "$SB/stubs/node" <<'SH'
#!/bin/sh
exit 0
SH
cat > "$SB/stubs/bun" <<'SH'
#!/bin/sh
exit 0
SH
cat > "$SB/stubs/zapp-db-ler" <<'SH'
#!/bin/sh
# repeticao da consulta real ao registro de versoes aplicadas (fixture medida na tarefa 0)
cat "$FIXTURE_LEDGER_JSON"
SH
python3 - "$E/ledger-fixture-versoes.txt" > "$SB/stubs/ledger.json" <<'PY'
import json,sys
v=','.join(x for x in open(sys.argv[1],encoding='utf-8').read().split() if x)
print(json.dumps({"rows":[{"v":v}]}))
PY
cat > "$SB/stubs/zapp-db-local" <<'SH'
#!/bin/sh
# dublê do banco local: 'travas' passa; 'check' REPETE a saida real do conjunto vivo
# (check.txt capturado as 09:07) e devolve o MESMO codigo de saida (1 = diferencas nao aceitas).
case "${1:-}" in
  travas) exit 0 ;;
  check)  cat "$FIXTURE_CHECK_TXT"; exit 1 ;;
  *)      exit 0 ;;
esac
SH
chmod +x "$SB/stubs"/*
export FIXTURE_LEDGER_JSON="$SB/stubs/ledger.json"
export FIXTURE_CHECK_TXT="$E/check-live.txt"

run() { # run <rotulo> <script>
  local rot="$1" script="$2"
  echo "================ $rot : $script"
  ( HOME="$HOME_SB" PATH="$SB/stubs:$PATH" bash "$script" "$W" "$NOME" --rapido ) \
      > "$OUT/shell-$rot.out" 2> "$OUT/shell-$rot.err"
  local rc=$?
  echo "$rc" > "$OUT/shell-$rot.rc"
  cat "$OUT/shell-$rot.out"
  [ -s "$OUT/shell-$rot.err" ] && { echo "--- stderr"; cat "$OUT/shell-$rot.err"; }
  echo "exit code = $rc   (gravado em saida/shell-$rot.rc)"
}

run HOJE "$HOJE"
run NOVO "$NOVO"

echo
echo "=== veredito (passo banco_local) ==="
grep -E 'banco_local|VERIFY:' "$OUT/shell-HOJE.out" | sed 's/^/[HOJE] /'
grep -E 'banco_local|VERIFY:' "$OUT/shell-NOVO.out" | sed 's/^/[NOVO] /'
