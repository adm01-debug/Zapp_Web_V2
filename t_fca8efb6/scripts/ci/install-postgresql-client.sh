#!/usr/bin/env bash

set -Eeuo pipefail

if command -v psql >/dev/null 2>&1; then
  psql --version
  exit 0
fi

# GitHub-hosted runners incluem repositorios de terceiros (Chrome, Microsoft,
# etc.). Um espelho inconsistente nesses repositorios nao pode impedir jobs que
# precisam exclusivamente dos pacotes oficiais do Ubuntu.
if [[ -f /etc/apt/sources.list.d/ubuntu.sources ]]; then
  ubuntu_source='sources.list.d/ubuntu.sources'
elif [[ -f /etc/apt/sources.list ]]; then
  ubuntu_source='sources.list'
else
  printf 'ERRO: fonte oficial do Ubuntu nao encontrada.\n' >&2
  exit 1
fi

apt_options=(
  -o "Dir::Etc::sourcelist=${ubuntu_source}"
  -o 'Dir::Etc::sourceparts=-'
  -o 'APT::Get::List-Cleanup=0'
  -o 'Acquire::Retries=3'
)

sudo apt-get "${apt_options[@]}" update -qq
sudo apt-get "${apt_options[@]}" install -y -qq --no-install-recommends postgresql-client

command -v psql >/dev/null 2>&1 || {
  printf 'ERRO: psql continuou ausente apos a instalacao.\n' >&2
  exit 1
}
psql --version
