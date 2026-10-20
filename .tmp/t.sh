set -euo pipefail
ESP="$(grep -oE 'EXATAMENTE .Especialista: [a-z]+' .tmp/cartao.md | head -1 | sed 's/.*Especialista: //')"
echo "sobreviveu ESP=[$ESP]"
