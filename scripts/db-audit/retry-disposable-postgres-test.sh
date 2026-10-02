#!/usr/bin/env bash
set -euo pipefail

# GitHub-hosted runners can sporadically terminate a brand-new disposable
# PostgreSQL container before its first readiness probe. Retry only that exact
# bootstrap signature; every SQL, ACL, contract, or assertion failure remains
# fail-fast and keeps its original exit code.
#
# Second known bootstrap signature: the official postgres image restarts the
# server once (temporary instance for initdb scripts, then the real one) —
# a readiness probe can land in that gap, pass, and the very next psql call
# then hits a socket that momentarily doesn't exist or is mid-shutdown. That
# error comes straight from psql (unguarded, non-"FAIL: ..." text) and its
# suffix varies by exact timing ("No such file or directory", "FATAL:  the
# database system is shutting down", ...), so match the whole class by its
# common "connection to server on socket ... failed:" prefix instead of one
# exact suffix — confirmed both suffixes on the same branch within minutes.
BOOTSTRAP_FAILURE_PATTERN='FAIL: PostgreSQL de teste não iniciou|connection to server on socket .* failed:|Error response from daemon: toomanyrequests|registro de imagens indisponivel'
# A última alternativa é a mensagem que o proprio teste do Talk X emite quando o
# pre-pull esgota as tentativas: sem ela o wrapper nao reconheceria o flake (a
# mensagem do teste substitui o texto original do docker) e nao repetiria o
# bootstrap -- foi exatamente o que o log do CI mostrou na 1a versao deste fix.
# Terceira assinatura de bootstrap (29/09/2026): o registro público do ECR da AWS
# (public.ecr.aws, de onde vem postgrest:v14.5) limita pull anônimo por IP e devolve
# "Error response from daemon: toomanyrequests: Data limit exceeded". Em runner do
# GitHub isso derruba o passo por motivo alheio ao diff -- medido: 7 de 40 runs
# recentes do job obrigatório "Contrato DB offline" falharam, 7/7 com essa
# assinatura. Repetir o bootstrap ajuda quando o limite é momentâneo; o teste que
# puxa imagem também faz pré-pull com espera (talkx-transition-overload-postgrest).
if [[ "$#" -eq 0 ]]; then
  printf 'usage: %s <test command> [args...]\n' "${0##*/}" >&2
  exit 64
fi

# Terceira assinatura de infra (não é falha do teste): o registry responde
# `toomanyrequests: Data limit exceeded`/HTTP 429 e o `docker run` morre com exit 125 —
# derruba o job inteiro por rate limit, não por contrato. Baixar as imagens aqui, com
# backoff, tira essa variável da conta. Não esconde falha real: se todas as tentativas
# falharem (ou a imagem não existir), o job falha com a mensagem certa.
# Qualquer variável de ambiente terminada em _IMAGE é pré-baixada (o workflow injeta
# TALKX_TRANSITION_POSTGREST_IMAGE, TALKX_TRANSITION_POSTGREST_PG_IMAGE, ...).
PRE_PULL_ATTEMPTS="${PRE_PULL_ATTEMPTS:-5}"
PRE_PULL_BASE_WAIT="${PRE_PULL_BASE_WAIT:-15}"

# O registro publico do ECR (public.ecr.aws) limita pull anonimo por IP e responde
# `toomanyrequests: Rate exceeded` de forma SUSTENTADA -- nao e flake: medido em 30/09/2026,
# 5 tentativas com backoff (~4 min) falharam seguidas e o job obrigatorio ficou vermelho por
# motivo alheio ao diff. O mesmo projeto publica as imagens equivalentes no GHCR
# (ghcr.io/supabase/<imagem>), que nao limita igual -- e o caminho que
# .github/workflows/types-sync.yml ja usa. O espelho vem PRIMEIRO; o pull original continua
# como reserva, com backoff, e o erro continua aparecendo se nada funcionar.
espelho_do_ecr() {
  case "$1" in
    public.ecr.aws/supabase/*) printf 'ghcr.io/supabase/%s' "${1#public.ecr.aws/supabase/}" ;;
    *) printf '' ;;
  esac
}

pre_pull_images() {
  if ! command -v docker >/dev/null 2>&1; then
    printf 'INFO: docker ausente; pulando o pré-pull das imagens\n' >&2
    return 0
  fi

  local var imagem tentativa espera espelho espelho_tag
  while read -r var; do
    imagem="${!var}"
    [[ -n "$imagem" ]] || continue
    espera="$PRE_PULL_BASE_WAIT"
    for tentativa in $(seq 1 "$PRE_PULL_ATTEMPTS"); do
      if docker image inspect "$imagem" >/dev/null 2>&1; then
        printf 'INFO: imagem já local: %s\n' "$imagem"
        break
      fi
      espelho="$(espelho_do_ecr "$imagem")"
      espelho_tag="${espelho%%@*}"
      if [[ -n "$espelho_tag" ]] && docker pull "$espelho_tag" >/dev/null 2>&1; then
        docker tag "$espelho_tag" "${imagem%%@*}"
        printf 'INFO: imagem obtida do espelho %s (o ECR limita pull anonimo)\n' "$espelho_tag"
        break
      fi
      if docker pull "$imagem" >/dev/null 2>&1; then
        printf 'INFO: imagem baixada: %s\n' "$imagem"
        break
      fi
      if [[ "$tentativa" -eq "$PRE_PULL_ATTEMPTS" ]]; then
        printf 'ERRO: registry não entregou %s em %s tentativas (rate limit ou imagem inexistente)\n' \
          "$imagem" "$PRE_PULL_ATTEMPTS" >&2
        return 1
      fi
      printf 'WARN: pull de %s falhou (%s/%s); nova tentativa em %ss\n' \
        "$imagem" "$tentativa" "$PRE_PULL_ATTEMPTS" "$espera" >&2
      sleep "$espera"
      espera=$((espera * 2))
    done
  done < <(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*_IMAGE\)=.*/\1/p')
}

pre_pull_images

attempts=3
for attempt in $(seq 1 "$attempts"); do
  log_file=$(mktemp)
  if "$@" >"$log_file" 2>&1; then
    cat "$log_file"
    rm -f "$log_file"
    exit 0
  else
    status=$?
  fi
  if ! grep -Eq "$BOOTSTRAP_FAILURE_PATTERN" "$log_file" || [[ "$attempt" -eq "$attempts" ]]; then
    cat "$log_file" >&2
    rm -f "$log_file"
    exit "$status"
  fi

  cat "$log_file" >&2
  rm -f "$log_file"
  printf 'WARN: PostgreSQL descartável não estabilizou; repetindo bootstrap (%s/%s)\n' "$attempt" "$attempts" >&2
done
