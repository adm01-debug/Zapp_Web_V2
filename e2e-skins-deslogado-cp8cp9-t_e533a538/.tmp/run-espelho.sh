#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
export PATH="$HOME/.local/deno/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
bash "$HOME/arquitetura-v2/integrador/ci_espelho.sh" . > .tmp/espelho.log 2>&1
echo "ESPELHO_RC=$?" >> .tmp/espelho.log
