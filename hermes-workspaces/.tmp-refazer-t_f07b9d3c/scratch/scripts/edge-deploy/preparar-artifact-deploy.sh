#!/usr/bin/env bash
# R2-INF-002: monta o diretorio PUBLICAVEL do artifact do deploy de Edge Functions
# SEM o log bruto. O `deploy-output.log` carrega a URL com `access_token=` embutido
# e o artifact vai para o storage do GitHub: publicar o bruto e' publicar credencial.
#
# Contrato (fail-closed): o log bruto so' entra no diretorio publicavel DEPOIS de
# passar pelo redator E de a conferencia de residuo (pelo VALOR do segredo, nunca
# pela chave -- o redator reescreve `access_token` como `token`) passar. Qualquer
# falha (redator ausente/erro de gravacao/residuo) aborta com codigo != 0 e deixa o
# diretorio publicavel SEM o log: o passo do workflow so' publica o artifact quando
# este script termina com 0.
#
# Entradas por ambiente (o passo do workflow define):
#   RUNNER_TEMP           base do runner (obrigatoria)
#   EVIDENCE_DIR          opcional; padrao $RUNNER_TEMP/edge-deployment-evidence
#   PUBLIC_DIR            opcional; padrao $RUNNER_TEMP/edge-deployment-evidence-public
#   STAGING_LOG           opcional; padrao $RUNNER_TEMP/deploy-output-staging.log
#   REDATOR_LOG           opcional; padrao o redigir-log.mjs ao lado deste script
#   SUPABASE_ACCESS_TOKEN o valor conferido no residuo (nunca impresso)
set -euo pipefail

BASE="${RUNNER_TEMP:?RUNNER_TEMP nao definido}"
ORIGEM="${EVIDENCE_DIR:-$BASE/edge-deployment-evidence}"
DESTINO="${PUBLIC_DIR:-$BASE/edge-deployment-evidence-public}"
STAGING="${STAGING_LOG:-$BASE/deploy-output-staging.log}"
REDATOR="${REDATOR_LOG:-$(cd "$(dirname "$0")" && pwd)/redigir-log.mjs}"

mkdir -p "$DESTINO"

# Copia em massa: TUDO, menos o log bruto. Ele so' chega ao destino redigido.
if [ -d "$ORIGEM" ]; then
  find "$ORIGEM" -mindepth 1 -maxdepth 1 ! -name 'deploy-output.log' -exec cp -a {} "$DESTINO/" \;
fi

if [ -f "$ORIGEM/deploy-output.log" ]; then
  cp "$ORIGEM/deploy-output.log" "$STAGING"
  node "$REDATOR" "$STAGING" --segredo-env=SUPABASE_ACCESS_TOKEN
  if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && grep -qF -- "$SUPABASE_ACCESS_TOKEN" "$STAGING"; then
    echo "::error::valor do token ainda presente no log sanitizado; artifact bloqueado." >&2
    exit 1
  fi
  mv "$STAGING" "$DESTINO/deploy-output.log"
fi

echo "evidencia publicavel pronta em $DESTINO" >&2
