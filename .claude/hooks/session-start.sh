#!/bin/bash
# Sessão na nuvem: instala o graphify e gera/atualiza o grafo do código em graphify-out/.
# graphify-out/ fica fora do Git (~110 MB), então cada clone precisa gerar o seu; sem isso
# os agentes da nuvem não têm graph.json nem GRAPH_REPORT.md e buscam por texto às cegas.
# Assíncrono: o build leva ~3 min e não segura o início da sessão.
# Log: graphify-out/.session-start.log. Fora da nuvem não faz nada (local usa scripts/graphify/setup.sh).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 900000}'

cd "${CLAUDE_PROJECT_DIR:-.}"
export PATH="$HOME/.local/bin:$PATH"

# Mesma versão do setup local (fonte única: scripts/graphify/setup.sh).
versao="$(sed -n 's/^GRAPHIFY_VERSION="\${GRAPHIFY_VERSION:-\([0-9.]*\)}"$/\1/p' scripts/graphify/setup.sh)"
versao="${versao:-0.9.68}"

if [ "$(graphify --version 2>/dev/null | awk '{print $2}')" != "$versao" ]; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install --force "graphifyy[sql]==${versao}" >/dev/null 2>&1
  else
    pipx install --force "graphifyy[sql]==${versao}" >/dev/null 2>&1
  fi
fi

# Grafo já no commit atual (resume/clear/compact): nada a fazer.
head="$(git rev-parse --short=8 HEAD)"
if [ -f graphify-out/graph.json ] && grep -q "Built from commit: \`${head}" graphify-out/GRAPH_REPORT.md 2>/dev/null; then
  exit 0
fi

mkdir -p graphify-out
PYTHONHASHSEED=0 graphify update . > graphify-out/.session-start.log 2>&1
