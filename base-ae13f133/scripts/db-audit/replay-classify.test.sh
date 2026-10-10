#!/usr/bin/env bash
# Teste do classificador do replay (replay-classify.py).
#
# Prova o que faz o script servir de gate: falha esperada nao derruba, falha INESPERADA derruba,
# entrada obsoleta e avisada, e lista vazia e limpa. A mutacao do caso 2 e o discriminante - se o
# classificador ignorasse o allowlist, o caso 1 falharia.
set -u
DIR=$(dirname "$0")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ALLOW="$TMP/allow.json"
cat > "$ALLOW" <<'JSON'
{"esperadas": {"a.sql": {"categoria": "x", "motivo": "y"}, "b.sql": {"categoria": "x", "motivo": "y"}}}
JSON

falhou=0
checa() { # <descricao> <esperado> <obtido>
  if [ "$2" = "$3" ]; then echo "  ok  : $1"; else echo "  FALHA: $1 (esperado '$2', obtido '$3')"; falhou=1; fi
}

# 1. somente esperadas -> exit 0 e verde
printf 'a.sql\tERROR: x\nb.sql\tERROR: y\n' > "$TMP/f1.tsv"
SAIDA=$(python3 "$DIR/replay-classify.py" "$TMP/f1.tsv" "$ALLOW"); RC=$?
checa "so esperadas -> exit 0" "0" "$RC"
echo "$SAIDA" | grep -q "REPLAY=verde" && echo "  ok  : so esperadas -> verde" || { echo "  FALHA: deveria ser verde"; falhou=1; }

# 2. MUTACAO: falha fora do allowlist -> exit 1 e VERMELHO, nomeando o arquivo
printf 'a.sql\tERROR: x\nNOVA.sql\tERROR: boom\n' > "$TMP/f2.tsv"
SAIDA=$(python3 "$DIR/replay-classify.py" "$TMP/f2.tsv" "$ALLOW"); RC=$?
checa "inesperada -> exit 1" "1" "$RC"
echo "$SAIDA" | grep -q "REPLAY=VERMELHO" && echo "  ok  : inesperada -> VERMELHO" || { echo "  FALHA: deveria ser VERMELHO"; falhou=1; }
echo "$SAIDA" | grep -q "NOVA.sql" && echo "  ok  : nomeia a inesperada" || { echo "  FALHA: deveria nomear a inesperada"; falhou=1; }

# 3. entrada do allowlist que passou -> aviso de obsoleta (allowlist que so cresce para de proteger)
printf 'a.sql\tERROR: x\n' > "$TMP/f3.tsv"
SAIDA=$(python3 "$DIR/replay-classify.py" "$TMP/f3.tsv" "$ALLOW")
echo "$SAIDA" | grep -q "OBSOLETA" && echo "  ok  : avisa obsoleta" || { echo "  FALHA: deveria avisar obsoleta"; falhou=1; }

# 4. nenhuma falha -> limpo
: > "$TMP/f4.tsv"
SAIDA=$(python3 "$DIR/replay-classify.py" "$TMP/f4.tsv" "$ALLOW")
echo "$SAIDA" | grep -q "limpo" && echo "  ok  : lista vazia -> limpo" || { echo "  FALHA: deveria dizer limpo"; falhou=1; }

[ "$falhou" -eq 0 ] && echo "PASSOU: 4 casos (verde, inesperada, obsoleta, limpo)" || echo "REPROVOU"
exit "$falhou"
