#!/usr/bin/env bash
# t_24415f97 — roda a matriz inteira e guarda o relatório.
SB="/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_24415f97"
REF=/home/joaquim_ataides/projetos/Zapp_Web_V2
cd "$SB"
SEM="$(git -C "$REF" rev-parse 05859cedf)"
HOJE="$(git -C "$REF" rev-parse dia/2026-10-07)"
COM="$(git -C "$REF" rev-parse 689345d7f)"
{
echo "### matriz da prova controlada — t_24415f97 — $(date -Is)"
echo "REF=$REF (somente leitura)  COM=${COM:0:9} SEM=${SEM:0:9} BASE_04=$(git -C "$REF" rev-parse dia/2026-10-04 | cut -c1-9) BASE_07=${HOJE:0:9}"
for args in \
  "pristino A p1-pontoA-COM aaa111aaa222" \
  "novo     A p2-pontoA-COM aaa111aaa222" \
  "pristino A p3-pontoA-SEM bbb111bbb222" \
  "novo     A p4-pontoA-SEM bbb111bbb222" \
  "novo     A p5-pontoA-MISTO aaa111aaa222 bbb111bbb222" \
  "novo     A p6-pontoA-SHA-RUIM ccc111ccc222" \
  "novo     A p7-pontoA-BASE-RUIM ddd111ddd222" \
  "pristino B p8-pontoB-COM" "novo B p9-pontoB-COM" \
  "pristino B p10-pontoB-SEM" "novo B p11-pontoB-SEM" ; do
  set -- $args; impl=$1; modo=$2; nome=$3; shift 3
  novo=""
  case "$nome" in *-SEM) novo="$SEM";; esac
  NOVO="$novo" bash cen.sh "$impl" "$modo" "$nome" "$@"
  echo
done
BASE_SHA="$HOJE" bash cen.sh novo B p12-pontoB-COM-base-de-hoje
echo
echo "### comandos efetivos (resumo)"
for f in "$SB"/out/p*-cmd.log; do printf '%-24s %s\n' "$(basename "$f" -cmd.log)" "$(sed 's/^/ | /;s/$//' "$f" | tr '\n' ' ')"; done
} 2>&1 | tee "$SB/out/relatorio.txt"
