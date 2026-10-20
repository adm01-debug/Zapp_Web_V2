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
        if docker image inspect "$imagem" >/dev/null 2>&1; then
          printf 'INFO: imagem obtida do espelho %s (o ECR limita pull anonimo)\n' "$espelho_tag"
          break
        fi
        printf 'WARN: espelho %s tem digest diferente do esperado; tentando ECR direto\n' "$espelho_tag" >&2
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

# Espera crescente entre tentativas de bootstrap. O container do Postgres leva
# alguns segundos para comecar a aceitar conexao, e sondar o socket antes disso
# gasta todas as tentativas em segundos. Medido em 02/10/2026 no job "Contrato DB
# offline": 3 tentativas em 2,9 segundos, todas com
# "connection to server on socket ... failed: No such file or directory" -- o
# servidor nunca teve janela para subir. O contrato de RLS NAO e afrouxado: so
# falhas com a assinatura de bootstrap repetem (ver o bloco no fim do laco).
attempts="${DISPOSABLE_PG_ATTEMPTS:-6}"
espera="${DISPOSABLE_PG_BASE_WAIT:-5}"
for attempt in $(seq 1 "$attempts"); do
  log_file=$(mktemp)
  if "$@" >"$log_file" 2>&1; then
    cat "$log_file"
    rm -f "$log_file"
    exit 0
  else
    status=$?
  fi
  if ! grep -Eq "$BOOTSTRAP_FAILURE_PATTERN" "$log_file"; then
    # Falha que NAO e de bootstrap (SQL, ACL, policy ou assercao do contrato):
    # nao repetir. Repetir aqui mascararia defeito real de RLS.
    cat "$log_file" >&2
    rm -f "$log_file"
    exit "$status"
  fi

  if [[ "$attempt" -eq "$attempts" ]]; then
    causa=$(grep -Eo "$BOOTSTRAP_FAILURE_PATTERN" "$log_file" | head -1)
    ultima=$(grep -E 'No such file or directory|connection to server|server closed|shutting down|FATAL' \
      "$log_file" | tail -1)
    cat "$log_file" >&2
    rm -f "$log_file"
    printf '\nERRO: o PostgreSQL descartavel nao subiu em %s tentativas.\n' "$attempt" >&2
    printf 'ERRO: assinatura de bootstrap casada: %s\n' "${causa:-<nao capturada>}" >&2
    printf 'ERRO: ultima linha do servidor: %s\n' "${ultima:-<nenhuma>}" >&2
    printf 'ERRO: isto NAO e falha do contrato de RLS -- o servidor descartavel nao ficou pronto.\n' >&2
    exit "$status"
  fi

  cat "$log_file" >&2
  rm -f "$log_file"
  printf 'WARN: PostgreSQL descartável não estabilizou; nova tentativa em %ss (%s/%s)\n' \
    "$espera" "$attempt" "$attempts" >&2
  sleep "$espera"
  if [[ "$espera" -lt 60 ]]; then
    espera=$(( espera * 2 ))
  else
    espera=60
  fi
done
