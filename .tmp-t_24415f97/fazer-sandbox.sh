#!/usr/bin/env bash
# t_24415f97 — sandbox da verificação independente. TUDO dentro de $SB; a fábrica só é LIDA.
# Sem git init/clone (a guarda proíbe): o REF é a cópia de referência, usada só em consultas (diff/rev-parse).
set -euo pipefail
SB="/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_24415f97"
H="$SB/home"
FILA="$H/hermes-workspaces/.v2-fila"
INT="$H/hermes-workspaces/Zapp_Web_V2/.integrador"
DIRLOG="$H/arquitetura-v2/integrador"
OUT="$SB/out"; BIN="$H/.local/bin"
rm -rf "$H" "$OUT"
mkdir -p "$FILA" "$INT" "$DIRLOG" "$OUT" "$BIN" "$SB/tmp" \
         "$H/.local/share/zapp-local/stacks/v2-integrador/estado"

# cartões reais da cópia de referência (somente leitura)
SHA_COM=689345d7fdc097fb284cdf2f1290498b00388327   # traz supabase/migrations/20261004172554_fecha_record_incoming_call_event.sql
SHA_SEM=05859cedfd480031cc0b072e492ca8abadb860e3   # não traz migration
SHA_ZERO=$(printf 'c%.0s' {1..40})                  # sha inexistente/inválido

fila() { # $1 id  $2 branch  $3 base_dia  $4 sha  $5 titulo
  python3 - "$FILA/$1.json" "$1" "$2" "$3" "$4" "$5" <<'PY'
import json,sys
p,*v=sys.argv[1:7]
json.dump({"id":v[0],"branch":v[1],"base_dia":v[2],"sha":v[3],"titulo":v[4],
           "quando":"2026-10-07T06:00:00-03:00","estado":"pronto"},
          open(p,"w"),ensure_ascii=False,indent=1)
PY
}
fila aaa111aaa222 v2/prova-com-aaa111aaa222 dia/2026-10-04 "$SHA_COM" "cartao COM migration"
fila bbb111bbb222 v2/prova-sem-bbb111bbb222 dia/2026-10-04 "$SHA_SEM" "cartao SEM migration"
fila ccc111ccc222 v2/prova-sha-ruim-ccc111ccc222 dia/2026-10-04 "$SHA_ZERO" "cartao com sha ruim"
fila ddd111ddd222 v2/prova-base-ruim-ddd111ddd222 "nao-e-um-dia" "$SHA_COM" "cartao com base ruim"

# Stubs: registram o argv efetivo. O texto do zapp-verify é o do real (~/.local/bin/zapp-verify l.35-37 e l.178).
cat > "$BIN/zapp-verify" <<'EOS'
#!/usr/bin/env bash
printf 'zapp-verify   argc=%d argv=<%s>\n' "$#" "$*" >> "${STUB_LOG:?}"
case "${1:-}" in fast|full) shift;; esac
NOME="${2:-}"; [ "${NOME#--}" != "$NOME" ] && NOME=""
if [ -z "$NOME" ]; then
  printf 'AVISO   %-12s NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)\n' banco_local
  echo "VERIFY: VERDE SEM BANCO — o banco NÃO foi verificado"
else
  printf 'OK      %-12s\n' banco_local
  echo "VERIFY: VERDE — conjunto $NOME"
fi
exit 0
EOS
cat > "$BIN/zapp-db-local" <<'EOS'
#!/usr/bin/env bash
printf 'zapp-db-local argc=%d argv=<%s>\n' "$#" "$*" >> "${STUB_LOG:?}"
if [ "${1:-}" = list ]; then echo '[{"name":"v2-integrador","reachable":true}]'; fi
exit 0
EOS
cat > "$BIN/zapp-db-guard" <<'EOS'
#!/usr/bin/env bash
printf 'zapp-db-guard argc=%d argv=<%s>\n' "$#" "$*" >> "${STUB_LOG:?}"
exit 0
EOS
chmod +x "$BIN"/*
printf 'SHA_COM=%s\nSHA_SEM=%s\nSHA_ZERO=%s\n' "$SHA_COM" "$SHA_SEM" "$SHA_ZERO" > "$OUT/shas.txt"
echo "sandbox pronto: $SB"; cat "$OUT/shas.txt"
