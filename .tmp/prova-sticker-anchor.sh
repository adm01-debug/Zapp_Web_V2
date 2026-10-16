#!/usr/bin/env bash
# Prova do drift de espelho ESTADO.md:70 (edge classify-sticker).
# Espelha o teste scripts/ci/docs-estado-registry-convention.unit.mjs
# (cada ancora contem a propria edge), restrito a linha classify-sticker:
# para cada ancora arquivo:linha da linha, exige que a linha citada do
# codigo contenha o nome da edge. VERMELHO (exit 1) sem a correcao,
# VERDE (exit 0) com a correcao. So le arquivos reais, sem rede.
set -u
cd "$(dirname "$0")/.." || exit 1
EDGE='classify-sticker'
linha=$(grep -E "^[|] .${EDGE}. [|]" ESTADO.md)
if [ -z "$linha" ]; then
  echo 'VERMELHO: linha classify-sticker ausente em ESTADO.md'
  echo 'RESULTADO: VERMELHO'; exit 1
fi
ok=1
for ancora in $(echo "$linha" | grep -oE '[a-zA-Z0-9_./-]+\.[a-z]+:[0-9]+'); do
  arquivo=${ancora%:*}; numero=${ancora##*:}
  if [ ! -f "$arquivo" ]; then
    echo "VERMELHO: $ancora - arquivo nao existe"; ok=0; continue
  fi
  conteudo=$(sed -n "${numero}p" "$arquivo")
  if echo "$conteudo" | grep -q "$EDGE"; then
    echo "VERDE: $ancora cita $EDGE"
  else
    echo "VERMELHO: $ancora NAO cita $EDGE (linha diz: $(echo "$conteudo" | head -c 100))"
    ok=0
  fi
done
if [ "$ok" = 1 ]; then echo 'RESULTADO: VERDE'; exit 0
else echo 'RESULTADO: VERMELHO'; exit 1; fi
