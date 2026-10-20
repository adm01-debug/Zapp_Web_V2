#!/usr/bin/env bash
# N-069 — comando único das provas de banco do chat interno (Team Chat).
#
# POR QUE EXISTE: as provas de banco do chat interno vivem soltas em
# `scripts/db-audit/team-*.test.sh` e o `db-guard.yml` as executa uma por vez,
# em passos separados. Não havia como rodar o conjunto com um comando só antes
# de mexer no módulo (defeito E07/F21-F26: `scripts/ci/team-chat-local-gates.sh`
# não existia). Aqui elas rodam TODAS e o resultado é fail-closed:
#
#   * basta UMA prova falhar para o comando sair 1;
#   * "nenhuma prova encontrada" também é falha (exit 1) — o comando nunca passa
#     por não ter medido nada.
#
# USO:
#   bash scripts/ci/team-chat-local-gates.sh
#
# Cada prova sobe um PostgreSQL 17 descartável (Docker) e nunca toca banco real.
# A invocação é `bash <prova>`, a mesma do `db-guard.yml`; o que o workflow
# acrescenta é o wrapper de repetição de bootstrap
# (`retry-disposable-postgres-test.sh`), que aqui não entra de propósito: se o
# container não subir, o comando diz isso na cara em vez de mascarar.
#
# TEAM_CHAT_GATES_DIR aponta para outro diretório de provas — é o que
# `scripts/ci/team-chat-local-gates.unit.mjs` usa para exercitar este comando com
# provas falsas. Sem a variável, o diretório é `scripts/db-audit` do repositório.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
gates_dir="${TEAM_CHAT_GATES_DIR:-$repo_root/scripts/db-audit}"

if [[ ! -d "$gates_dir" ]]; then
  printf 'ERRO: diretorio de provas inexistente: %s\n' "$gates_dir" >&2
  exit 1
fi

# `nullglob` impede que "nenhuma prova" vire o padrão literal do glob; `-f`
# descarta diretório cujo nome case com o glob (o glob não distingue arquivo de
# diretório e `bash <diretorio>` falharia por motivo alheio ao módulo).
shopt -s nullglob
provas=()
for candidato in "$gates_dir"/team-*.test.sh; do
  if [[ -f "$candidato" ]]; then
    provas+=("$candidato")
  fi
done

if (( ${#provas[@]} == 0 )); then
  printf 'ERRO: nenhuma prova de banco do chat interno em %s (team-*.test.sh)\n' "$gates_dir" >&2
  printf 'ERRO: sem prova nao ha aprovacao -- o comando sai 1.\n' >&2
  exit 1
fi

printf 'Provas de banco do chat interno: %d\n' "${#provas[@]}"
for prova in "${provas[@]}"; do
  printf '  - %s\n' "${prova##*/}"
done

# Roda TODAS, mesmo depois de uma falhar: o objetivo é conferir o conjunto
# inteiro de uma vez, não parar na primeira que quebrou.
falhas=()
for prova in "${provas[@]}"; do
  nome="${prova##*/}"
  log="$(mktemp)"
  printf '\n── %s ──\n' "$nome"
  if bash "$prova" >"$log" 2>&1; then
    cat "$log"
    printf '[PASSOU] %s\n' "$nome"
  else
    status=$?
    cat "$log" >&2
    printf '[FALHOU] %s (exit %s)\n' "$nome" "$status" >&2
    falhas+=("$nome")
  fi
  rm -f "$log"
done

if (( ${#falhas[@]} > 0 )); then
  printf '\nRESULTADO: %d de %d prova(s) de banco do chat interno FALHARAM:\n' \
    "${#falhas[@]}" "${#provas[@]}" >&2
  for nome in "${falhas[@]}"; do
    printf '  [FALHOU] %s\n' "$nome" >&2
  done
  exit 1
fi

printf '\nRESULTADO: %d prova(s) de banco do chat interno passaram\n' "${#provas[@]}"
