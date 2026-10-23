#!/bin/sh
# V076: Ignora build do Vercel quando apenas arquivos não-front mudaram.
# Contrato: exit 1 = buildar, exit 0 = pular.
# Ref: https://vercel.com/docs/projects/project-configuration#ignorecommand

# Produção sempre builda.
if [ "$VERCEL_ENV" = "production" ]; then
  echo "ignore-build: production deploy — building."
  exit 1
fi

# Caminhos que afetam o bundle do front-end.
FRONT_PATHS="src public index.html package.json bun.lock vite.config.ts vercel.json tailwind.config.ts postcss.config.js tsconfig.json tsconfig.app.json tsconfig.node.json components.json scripts/vercel"

# Determina o commit base.
BASE="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$BASE" ]; then
  BASE=$(git log --format="%H" -n 2 2>/dev/null | tail -1)
fi
if [ -z "$BASE" ]; then
  echo "ignore-build: no base commit found — building (fail-open)."
  exit 1
fi

# Verifica se algum arquivo de front foi alterado.
# shellcheck disable=SC2086
changed=$(git diff --name-only "$BASE" HEAD -- $FRONT_PATHS 2>/dev/null)

if [ -n "$changed" ]; then
  echo "ignore-build: front files changed — building."
  exit 1
fi

echo "ignore-build: no front files changed — skipping build."
exit 0
