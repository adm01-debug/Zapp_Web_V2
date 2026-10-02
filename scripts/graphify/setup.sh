#!/usr/bin/env bash
# Instala o graphify (grafo de conhecimento do código) e o configura neste clone.
# Uso: bun run graph:setup   (Linux, macOS ou WSL; precisa de uv ou pipx)
set -euo pipefail

GRAPHIFY_VERSION="${GRAPHIFY_VERSION:-0.9.68}"
PKG="graphifyy[sql]==${GRAPHIFY_VERSION}"

cd "$(git rev-parse --show-toplevel)"

if command -v uv >/dev/null 2>&1; then
  uv tool install --force "$PKG"
elif command -v pipx >/dev/null 2>&1; then
  pipx install --force "$PKG"
else
  echo "graphify: instale o uv (curl -LsSf https://astral.sh/uv/install.sh | sh)" >&2
  echo "          ou o pipx (sudo apt install pipx) e rode de novo." >&2
  exit 1
fi

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) echo "graphify: ~/.local/bin fora do PATH; rode uv tool update-shell (ou pipx ensurepath) e abra outro terminal." >&2
     export PATH="$HOME/.local/bin:$PATH" ;;
esac
graphify --version

# O husky (prepare do bun install) aponta core.hooksPath para .husky/_; sem isso o git
# ignora os hooks que o graphify grava em .husky/.
if [ "$(git rev-parse --git-path hooks)" != ".husky/_" ]; then
  if [ -x node_modules/.bin/husky ]; then
    node_modules/.bin/husky
  else
    echo "graphify: rode bun install antes (instala o husky) e depois bun run graph:setup." >&2
    exit 1
  fi
fi

# post-commit/post-checkout em .husky/ (rebuild em background) + merge driver do graph.json.
graphify hook install

PYTHONHASHSEED=0 graphify update .

