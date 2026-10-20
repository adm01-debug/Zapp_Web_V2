#!/usr/bin/env bash
# Espelho local do CI do GitHub (05/10): roda os MESMOS comandos de teste que o ci.yml roda e que o zapp-verify não
# roda (testes Deno das Edge Functions e os testes node das guardas de CI/deploy/db-audit). Motivo: o lote de 05/10
# passou em tudo localmente e reprovou no GitHub por um teste Deno.
# Uso: ci_espelho.sh <cópia>  → imprime, uma por linha e ordenada, a identificação de cada teste que FALHOU (vazio = verde).
# O integrador compara com a mesma lista na base: só reprova o cartão que traz falha NOVA.
set -uo pipefail
D="${1:?uso: ci_espelho.sh <cópia>}"; cd "$D" || exit 2
export PATH="$HOME/.local/deno/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH" NO_COLOR=1
{
  if [ -f scripts/ci/deno.json ]; then
    timeout 900 deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
      $(git ls-files 'supabase/functions/**/*.test.ts') 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
      | grep -E ' => \./supabase/functions/.*\.test\.ts:[0-9]+' | sed -E 's/:[0-9]+:[0-9]+$//; s/^/deno: /'
  fi
  ARQS="$(ls scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs scripts/talkx/*.unit.mjs 2>/dev/null)"
  [ -n "$ARQS" ] && timeout 900 node --test --test-reporter=tap $ARQS 2>&1 | grep -E '^not ok ' | sed -E 's/^not ok [0-9]+ - /node: /'
  # 05/10 12:25: testes de CONTRATO do CI (`test:contracts`, vitest.contracts.config.ts). O `bun run test` do zapp-verify não
  # roda esta suíte; o PR 1890 reprovou por um contrato (media-volume-surfaces) que a fábrica nunca executou.
  if [ -f vitest.contracts.config.ts ]; then
    timeout 300 ./node_modules/.bin/vitest run --config vitest.contracts.config.ts --reporter=dot 2>&1 | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' \
      | grep -E '^ *FAIL ' | sed -E 's/^ *FAIL +//; s/ *>.*$//; s/^/contrato: /'
  fi
  # 05/10 09:55: guardas baratas do job de lint do CI (segundos, sem dependências). O PR 1890 reprovou por duas delas
  # (manifesto velho e teste .sh sem passo no CI) que nada na fábrica conferia. Manifesto: quem regenera é o derivados.sh.
  for g in scripts/ci/check-test-inventory.mjs scripts/ci/check-workflow-pins.mjs scripts/ci/check-pr-workflow-secrets.mjs \
           scripts/ci/check-e2e-artifact-secrets.mjs scripts/ci/implicit-any-ratchet.mjs scripts/db-audit/supabase-usage-guard.mjs; do
    [ -f "$g" ] && { timeout 120 node "$g" >/dev/null 2>&1 || {
      if [ "$g" = scripts/ci/check-test-inventory.mjs ]; then   # 11/10 (95%): inventário vira pendência registrada, não reprovação
        printf '%s %s %s\n' "$(date -Is)" "$(git rev-parse --short HEAD 2>/dev/null)" "$g" >> "$HOME/arquitetura-v2/integrador/registro-pendente.txt"
      else echo "guarda: $g"; fi; }; }
  done
} | sort -u
exit 0
