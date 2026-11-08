#!/usr/bin/env bash
# shellcheck disable=SC2317  # funções job_* são chamadas por nome dinâmico
# scripts/ci-local.sh — Zapp_Web_V2
# Gerado em 2026-11-07 a partir de .github/workflows/{ci.yml, db-guard.yml}
# Checks obrigatórios na main em 07/11/2026: 🏗️ Build, 🔎 TypeCheck, ✅ CI Gate (required check)
# LEMBRETE: ao mudar um workflow obrigatório, atualize este script (steps literais abaixo).
#
# Reproduz localmente (WSL) os jobs que rodam em pull_request: cada step roda o `run:` literal do
# workflow com o env do job+step, o shell do CI (defaults.run.shell) e o timeout do job; actions sem
# equivalente local viram SKIP com motivo e deixam o job INCONCLUSIVO. GITHUB_* são emuladas como um PR
# contra origin/main (CI_BASE_SHA = merge-base; --base/--all-changed para outros casos). Nada é instalado
# globalmente (npm ci/bun install/playwright install usam os caches de usuário; --with-deps é removido).
# Hash dos workflows na geração: 1c3ab3e90443241d (o script avisa em runtime se eles mudarem).
# '✅ CI Gate (required check)' (job ci-gate) agrega typecheck, unit-tests, node-scripts, edge-contracts, build,
# security e workflow-lint — emulado aqui com a lógica do workflow. db-guard (Contrato DB offline / replay) não é obrigatório.
# db-guard: o docker-shim (E47) é instalado em $CI_TMP/shim-bin (não em ~/.local/bin) e os jobs usam
# PATH=/usr/bin:... para que o docker real seja encontrado antes do shim que já existe em ~/.local/bin.
# workflow-lint: zizmor não está no WSL — o step fica SKIP (inconclusivo) até `python3 -m pip install --user zizmor==1.30.1`.

set -euo pipefail

CI_REPO='Zapp_Web_V2'
CI_GERADO_EM='07/11/2026'
CI_WF_HASH='1c3ab3e90443241d'
CI_WF_FILES='.github/workflows/ci.yml .github/workflows/db-guard.yml'
CI_WORKFLOWS='ci.yml, db-guard.yml'
CI_REQUIRED_CHECKS='🏗️ Build, 🔎 TypeCheck, ✅ CI Gate (required check)'
CI_LIST_NOTAS='db-guard (offline-contract/replay-migrations) não é obrigatório: rode com --only.'

# ───────────────────────── runtime comum (idêntico nos 9 repos) ─────────────────────────
usage() {
  cat <<'EOF'
Uso: scripts/ci-local.sh [--list] [--fast] [--only <job>[,<job>]] [--skip <job>] [--no-docker] [--keep-going]
                         [--strict] [--verbose] [--base <ref>] [--all-changed]

  --list         lista os jobs: id, se é obrigatório na main ([REQ]), classe e o que cada um pula
  (sem flags)    roda todos os jobs obrigatórios reproduzíveis, na ordem dos needs, parando no 1º erro
  --fast         pula jobs/steps opcional-pesado (E2E/browsers/lighthouse/mutação) e os que precisam de docker
  --only a,b     roda só esses jobs (coluna "job" do --list) + os jobs provedores de outputs de que dependem
  --skip a,b     pula esses jobs
  --no-docker    pula só os steps que sobem Postgres/containers
  --keep-going   não para no primeiro erro; resume tudo no fim
  --strict       exit 3 quando algum check obrigatório ficou INCONCLUSIVO (pulado por segredo/docker/--fast/cloud)
  --verbose      mostra o stdout de todos os steps (padrão: só dos que falham) e cada SKIP na hora
  --base <ref>   base do "PR" emulado (padrão: merge-base de origin/main com HEAD)
  --all-changed  trata todos os arquivos como alterados (útil na própria main, onde a base == HEAD)
  --no-reuse     não reaproveita node_modules entre jobs (padrão: pula `npm ci`/`bun install` repetidos
                 quando o lockfile não mudou desde o último install feito por este script)

Detecção de mudanças (paths-filter, docs-only etc.) considera commits desde a base + working tree + arquivos novos.
Segredos: exporte-os no ambiente (ex.: `SUPABASE_ACCESS_TOKEN=... scripts/ci-local.sh`); sem eles o step
é pulado com "segredo X ausente" e o job fica INCONCLUSIVO. Saída: 0 = nenhum check obrigatório falhou
(mesmo com inconclusivos; 3 com --strict), 1 = falha, 2 = uso incorreto.
EOF
}

LIST=0 FAST=0 NO_DOCKER=0 KEEP_GOING=0 STRICT=0 VERBOSE=0 ALL_CHANGED=0 REUSE=1 ONLY="" SKIPS="" BASE_REF=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) LIST=1 ;;
    --fast) FAST=1 ;;
    --no-docker) NO_DOCKER=1 ;;
    --keep-going) KEEP_GOING=1 ;;
    --strict) STRICT=1 ;;
    --verbose|-v) VERBOSE=1 ;;
    --all-changed) ALL_CHANGED=1 ;;
    --no-reuse) REUSE=0 ;;
    --only) ONLY="${ONLY:+$ONLY,}${2:-}"; shift ;;
    --only=*) ONLY="${ONLY:+$ONLY,}${1#*=}" ;;
    --skip) SKIPS="${SKIPS:+$SKIPS,}${2:-}"; shift ;;
    --skip=*) SKIPS="${SKIPS:+$SKIPS,}${1#*=}" ;;
    --base) BASE_REF=${2:-}; shift ;;
    --base=*) BASE_REF=${1#*=} ;;
    -h|--help) usage; exit 0 ;;
    *) echo "opção desconhecida: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT=$(pwd)
export ROOT

if [[ -t 1 ]]; then
  C_G=$'\e[32m' C_R=$'\e[31m' C_Y=$'\e[33m' C_B=$'\e[1m' C_D=$'\e[2m' C_0=$'\e[0m'
else
  C_G="" C_R="" C_Y="" C_B="" C_D="" C_0=""
fi

CI_TMP=""
CLEANUPS=()
cleanup() {
  trap '' INT TERM
  trap - EXIT
  local c
  for c in "${CLEANUPS[@]}"; do eval "$c" >/dev/null 2>&1 || true; done
  [[ -n "$CI_TMP" && -d "$CI_TMP" ]] && rm -rf "$CI_TMP"
  return 0
}
trap cleanup EXIT
trap 'echo; echo "interrompido (SIGINT)"; exit 130' INT
trap 'echo; echo "encerrado (SIGTERM)"; exit 143' TERM
# só registre um cleanup DEPOIS de o recurso existir (nunca no início do job)
add_cleanup() { CLEANUPS+=("$1"); }

# node da versão que o repo pede (nvm, se instalada); estrito => aborta em vez de "seguir com a instalada"
ci_use_node() { # major estrito(0|1) motivo
  local want=$1 strict=$2 why=$3 have
  have=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')
  [[ "$have" == "$want" ]] && return 0
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh" --no-use >/dev/null 2>&1 || true
    if nvm use "$want" --silent >/dev/null 2>&1; then
      echo "${C_D}node: usando v$(node -v | tr -d v) via nvm (o repo pede node ${want}: ${why})${C_0}"
      return 0
    fi
  fi
  if (( strict )); then
    echo "${C_R}✘ node ${want} é exigido por este repo (${why}) e node $(node -v 2>/dev/null) não serve (engine-strict).${C_0}" >&2
    echo "   instale com: nvm install ${want}   (ou fnm/volta) e rode de novo." >&2
    exit 2
  fi
  echo "${C_Y}⚠ versão:${C_0} node instalado = $(node -v 2>/dev/null), o repo pede node ${want} (${why}); nvm não tem essa versão — seguindo com a instalada"
  return 0
}

# ── registro de jobs ──
declare -a JOB_ORDER=()
declare -A JOB_NAME JOB_WF JOB_REQ JOB_CLASS JOB_NEEDS JOB_STATIC_SKIPS JOB_RESULT JOB_TIME JOB_RUNTIME_SKIPS JOB_HEAVY JOB_DOCKER JOB_CLOUD JOB_AGG JOB_PROVIDER
# reg_job id nome workflow req(req|via:<agg>|ci|opt) classe needs "o que pula" heavy docker cloud agg provider
reg_job() {
  JOB_ORDER+=("$1")
  JOB_NAME[$1]=$2; JOB_WF[$1]=$3; JOB_REQ[$1]=$4; JOB_CLASS[$1]=$5; JOB_NEEDS[$1]=$6
  JOB_STATIC_SKIPS[$1]=$7; JOB_HEAVY[$1]=$8; JOB_DOCKER[$1]=$9; JOB_CLOUD[$1]=${10}; JOB_AGG[$1]=${11}; JOB_PROVIDER[$1]=${12:-0}
  JOB_RESULT[$1]=pending; JOB_TIME[$1]=0; JOB_RUNTIME_SKIPS[$1]=""
}
# resultados: success | failure | inconclusive (steps bloqueantes pulados) | assumed (cloud-only) |
#             skipped_ci (if do job falso, como no CI) | skipped_local (--fast/--no-docker/pré-condição) |
#             deselected (--only/--skip) | pending

# ── estado do job corrente ──
CUR_JOB="" CUR_LABEL="" JOB_FAILED=0 JOB_ANY_FAILED=0 JOB_INCONCL=0 QUIET_SKIPS=0 JOB_T0=0
STEP_OK=0 STEP_FAIL=0 STEP_SKIP=0
JOB_PATH_PREPEND="" JOB_PATH_PREFIX=""
declare -A STEP_OUT JOB_OUT SKIP_GROUP ENV_SAVED ENV_WAS_SET
declare -a JOB_ENV_KV=() JOB_ENV_NAMES=() SKIP_ORDER=()
ACTIONLINT_FAILED=0

job_begin() {
  CUR_JOB=$1; CUR_LABEL=$1; JOB_FAILED=0; JOB_ANY_FAILED=0; JOB_INCONCL=0; QUIET_SKIPS=0
  STEP_OK=0; STEP_FAIL=0; STEP_SKIP=0
  JOB_ENV_KV=(); JOB_ENV_NAMES=(); JOB_PATH_PREPEND=""; JOB_PATH_PREFIX=${2:-}
  SKIP_GROUP=(); SKIP_ORDER=(); ENV_SAVED=(); ENV_WAS_SET=()
  JOB_T0=$SECONDS
  echo
  echo "${C_B}━━ ${CUR_JOB} — ${JOB_NAME[$CUR_JOB]} ${C_D}(${JOB_WF[$CUR_JOB]})${C_0}"
}
job_end() {
  local n r
  if (( ! VERBOSE )); then   # em --verbose cada SKIP já saiu na hora
    for r in "${SKIP_ORDER[@]}"; do
      echo "  ${C_Y}↷ SKIP${C_0} ${CUR_JOB} — ${r}: ${SKIP_GROUP[$r]}"
    done
  fi
  if (( QUIET_SKIPS > 0 )); then
    echo "  ${C_D}↷ ${QUIET_SKIPS} step(s) de infraestrutura pulados (checkout/setup/cache/artefatos)${C_0}"
  fi
  JOB_TIME[$CUR_JOB]=$(( ${JOB_TIME[$CUR_JOB]} + SECONDS - JOB_T0 ))
  if (( JOB_FAILED || JOB_ANY_FAILED )); then JOB_RESULT[$CUR_JOB]=failure
  elif (( JOB_INCONCL )); then JOB_RESULT[$CUR_JOB]=inconclusive
  else JOB_RESULT[$CUR_JOB]=success; fi
  echo "  ${C_D}${CUR_JOB}: ${STEP_OK} ✔ · ${STEP_SKIP} ↷ · ${STEP_FAIL} ✘ (${JOB_TIME[$CUR_JOB]}s) → ${JOB_RESULT[$CUR_JOB]}${C_0}"
  for n in "${JOB_ENV_NAMES[@]}"; do
    if [[ "${ENV_WAS_SET[$n]:-0}" == 1 ]]; then export "$n=${ENV_SAVED[$n]}"; else unset "$n"; fi
  done
  return 0
}
_job_skip() { # resultado motivo
  JOB_RESULT[$CUR_JOB]=$1
  JOB_RUNTIME_SKIPS[$CUR_JOB]="job inteiro: $2"
  echo "  ${C_Y}↷ SKIP${C_0} ${CUR_JOB} — $2"
  JOB_TIME[$CUR_JOB]=$(( ${JOB_TIME[$CUR_JOB]} + SECONDS - JOB_T0 ))
}
job_skip_ci() { _job_skip skipped_ci "$1"; }        # if: do job falso — o CI também pularia
job_skip_local() { _job_skip skipped_local "$1"; }  # limitação local (--fast/--no-docker/pré-condição/porta)
job_precheck() { # cmd motivo
  if ! eval "$1" >/dev/null 2>&1; then job_skip_local "$2"; return 1; fi
  return 0
}
matrix_end() { # fim de uma combinação da matriz (fail-fast: false)
  (( JOB_FAILED )) && JOB_ANY_FAILED=1
  JOB_FAILED=0
}
job_set_output() { JOB_OUT["$1.$2"]=$3; }
job_out() { printf '%s' "${JOB_OUT[$1.$2]:-}"; }
step_out() { printf '%s' "${STEP_OUT[$1.$2]:-}"; }
job_status() { if (( JOB_FAILED || JOB_ANY_FAILED )); then echo failure; else echo success; fi; }
job_result() { # resultado como o GitHub veria (inconclusivo/cloud-only/deselecionado contam como success p/ needs)
  case "${JOB_RESULT[$1]:-pending}" in
    success|failure) printf '%s' "${JOB_RESULT[$1]}" ;;
    inconclusive|assumed|deselected) printf 'success' ;;
    *) printf 'skipped' ;;
  esac
}
docker_ok() { (( ! NO_DOCKER && ! FAST && ! ${NO_DOCKER_JOB:-0} )); }

quiet_skip() { QUIET_SKIPS=$((QUIET_SKIPS + 1)); STEP_SKIP=$((STEP_SKIP + 1)); }
# skip_step nome motivo tipo   (tipo: secret|fast|docker|cloud|precheck => job INCONCLUSIVO; if|info => não)
skip_step() {
  local name=$1 reason=$2 kind=${3:-info}
  STEP_SKIP=$((STEP_SKIP + 1))
  case "$kind" in secret|fast|docker|cloud|precheck) JOB_INCONCL=1 ;; esac
  if [[ -z "${SKIP_GROUP[$reason]:-}" ]]; then SKIP_ORDER+=("$reason"); SKIP_GROUP[$reason]=$name
  else SKIP_GROUP[$reason]+="; $name"; fi
  (( VERBOSE )) && echo "  ${C_Y}↷ SKIP${C_0} ${CUR_LABEL}/${name} — ${reason}"
  JOB_RUNTIME_SKIPS[$CUR_JOB]+="$name ($reason); "
  return 0
}

parse_github_output() { # arquivo step_id
  local f=$1 sid=$2 line k v delim l2
  [[ -s "$f" && -n "$sid" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    if [[ "$line" == *'<<'* ]]; then
      k=${line%%<<*}; delim=${line#*<<}; v=""
      while IFS= read -r l2 && [[ "$l2" != "$delim" ]]; do v+="${v:+$'\n'}$l2"; done
    else
      k=${line%%=*}; v=${line#*=}
    fi
    STEP_OUT["$sid.$k"]=$v
  done <"$f"
}
parse_github_env() { # arquivo (GITHUB_ENV: vale p/ os steps seguintes do job; valor anterior é restaurado no fim)
  local f=$1 line k v delim l2
  [[ -s "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    if [[ "$line" == *'<<'* ]]; then
      k=${line%%<<*}; delim=${line#*<<}; v=""
      while IFS= read -r l2 && [[ "$l2" != "$delim" ]]; do v+="${v:+$'\n'}$l2"; done
    else
      k=${line%%=*}; v=${line#*=}
    fi
    if [[ "$k" == PATH ]]; then echo "  ${C_Y}⚠ step tentou alterar PATH via GITHUB_ENV — ignorado (use GITHUB_PATH)${C_0}"; continue; fi
    if [[ -z "${ENV_WAS_SET[$k]+x}" ]]; then
      if [[ -n "${!k+x}" ]]; then ENV_WAS_SET[$k]=1; ENV_SAVED[$k]=${!k}; else ENV_WAS_SET[$k]=0; fi
      JOB_ENV_NAMES+=("$k")
    fi
    JOB_ENV_KV+=("$k=$v")
    export "$k=$v"
  done <"$f"
}
parse_github_path() { # arquivo (GITHUB_PATH: prepend para os steps seguintes)
  local f=$1 line
  [[ -s "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] && JOB_PATH_PREPEND="$line:$JOB_PATH_PREPEND"
  done <"$f"
}

# run_step NOME [--id ID] [--env K=V]... [--cwd DIR] [--secrets "A B"] [--if COND TEXTO] [--always]
#          [--heavy] [--docker] [--coe] [--shell "-eo pipefail"] [--timeout MIN] [--cleanup CMD] [--note TEXTO] -- CORPO
run_step() {
  local name=$1; shift
  local -a envs=() secrets=() flags=(-e)
  local cwd="." sid="" coe=0 docker=0 heavy=0 always=0 cond="" condtext="" body="" note="" tmo="" cleanup_cmd="" install=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env) envs+=("$2"); shift 2 ;;
      --cwd) cwd=$2; shift 2 ;;
      --id) sid=$2; shift 2 ;;
      --coe) coe=1; shift ;;
      --docker) docker=1; shift ;;
      --heavy) heavy=1; shift ;;
      --always) always=1; shift ;;
      --shell) read -r -a flags <<<"$2"; shift 2 ;;
      --timeout) tmo=$2; shift 2 ;;
      --cleanup) cleanup_cmd=$2; shift 2 ;;
      --install) install=$2; shift 2 ;;
      --note) note=$2; shift 2 ;;
      --secrets) read -r -a secrets <<<"$2"; shift 2 ;;
      --if) cond=$2; condtext=$3; shift 3 ;;
      --) shift; body=$1; shift; break ;;
      *) echo "run_step: opção interna inválida: $1" >&2; exit 70 ;;
    esac
  done
  if (( JOB_FAILED )) && (( ! always )); then quiet_skip; return 0; fi
  local -a missing=()
  local s
  for s in "${secrets[@]}"; do [[ -n "${!s:-}" ]] || missing+=("$s"); done
  if (( ${#missing[@]} > 0 )); then skip_step "$name" "segredo ${missing[*]} ausente" secret; return 0; fi
  if [[ -n "$cond" ]] && ! eval "$cond"; then skip_step "$name" "if: ${condtext} = false" if; return 0; fi
  if (( heavy && FAST )); then skip_step "$name" "opcional-pesado (--fast)" fast; return 0; fi
  if (( docker )) && ! docker_ok; then skip_step "$name" "sobe containers (docker) — --no-docker/--fast" docker; return 0; fi
  # reuso de node_modules: marca = hash(lockfile + comando de install) gravado após o último install bem-sucedido
  local lockhash="" marker="$ROOT/$cwd/node_modules/.ci-local-lockhash"
  if [[ -n "$install" && -f "$ROOT/$cwd/$install" ]]; then
    lockhash=$( { cat "$ROOT/$cwd/$install" "$ROOT/$cwd/package.json" "$ROOT/$cwd/.npmrc" "$ROOT/$cwd/bunfig.toml" 2>/dev/null; printf '%s\n' "$body" "${envs[@]}"; } | sha256sum | cut -c1-16)
    if (( REUSE )) && [[ -f "$marker" && "$(cat "$marker")" == "$lockhash" ]]; then
      skip_step "$name" "node_modules reutilizado (${install} inalterado desde o último install; --no-reuse desliga)" info
      return 0
    fi
  fi

  echo "${C_B}▶ ${CUR_LABEL} / ${name}${C_0}${note:+ ${C_D}(${note})${C_0}}"
  local t0=$SECONDS rc=0
  local out="$CI_TMP/step_output" envf="$CI_TMP/step_env" pathf="$CI_TMP/step_path" summ="$CI_TMP/step_summary" log="$CI_TMP/step.log"
  : >"$out"; : >"$envf"; : >"$pathf"; : >"$summ"; : >"$log"
  local -a tcmd=()
  tcmd=(timeout --foreground -k 15 "${tmo:-360}m")
  if (( VERBOSE )); then
    {
    (
      cd "$ROOT/$cwd" || exit 1
      PATH="${JOB_PATH_PREPEND}${JOB_PATH_PREFIX}${PATH}" \
      GITHUB_OUTPUT="$out" GITHUB_ENV="$envf" GITHUB_PATH="$pathf" GITHUB_STEP_SUMMARY="$summ" \
        exec "${tcmd[@]}" setsid "$CI_TMP/launch.sh" env "${JOB_ENV_KV[@]}" "${envs[@]}" bash --noprofile --norc "${flags[@]}" -c "$body"
    ) 2>&1 | tee "$log"; rc=${PIPESTATUS[0]}; } || true
  else
    (
      cd "$ROOT/$cwd" || exit 1
      PATH="${JOB_PATH_PREPEND}${JOB_PATH_PREFIX}${PATH}" \
      GITHUB_OUTPUT="$out" GITHUB_ENV="$envf" GITHUB_PATH="$pathf" GITHUB_STEP_SUMMARY="$summ" \
        exec "${tcmd[@]}" setsid "$CI_TMP/launch.sh" env "${JOB_ENV_KV[@]}" "${envs[@]}" bash --noprofile --norc "${flags[@]}" -c "$body"
    ) >"$log" 2>&1 || rc=$?
  fi
  [[ -n "$cleanup_cmd" ]] && add_cleanup "$cleanup_cmd"
  parse_github_output "$out" "$sid"
  parse_github_env "$envf"
  parse_github_path "$pathf"
  local dt=$((SECONDS - t0))
  if (( rc == 0 )); then
    echo "${C_G}✔${C_0} ${CUR_LABEL} / ${name} ${C_D}(${dt}s)${C_0}"
    STEP_OK=$((STEP_OK + 1))
    [[ -n "$sid" ]] && STEP_OUT["$sid.outcome"]=success
    [[ -n "$lockhash" && -d "$ROOT/$cwd/node_modules" ]] && printf '%s' "$lockhash" >"$marker"
  else
    local why="rc=${rc}"
    (( rc == 124 )) && why="timeout ${tmo}m (como no CI)"
    if (( coe )); then
      echo "${C_Y}✔${C_0} ${CUR_LABEL} / ${name} ${C_D}(${dt}s; ${why}, continue-on-error)${C_0}"
      STEP_OK=$((STEP_OK + 1))
    else
      echo "${C_R}✘${C_0} ${CUR_LABEL} / ${name} ${C_D}(${dt}s; ${why})${C_0}"
      STEP_FAIL=$((STEP_FAIL + 1))
      JOB_FAILED=1
    fi
    if (( ! VERBOSE )); then
      echo "${C_D}── últimas linhas de ${name}:${C_0}"
      tail -n 60 "$log" | sed 's/^/    /'
    fi
    [[ -n "$sid" ]] && STEP_OUT["$sid.outcome"]=failure
  fi
  return 0
}

# agregador emulado (lógica real de cada gate): "job:regra ..." (regra: must | skipok | docs_only) "advisory ..."
job_aggregate() {
  local item j rule r ok inconcl=0 docs_only
  docs_only=$(job_out changes docs_only)
  echo "  ${C_D}(agregador emulado com a lógica do workflow sobre os resultados locais; o script literal não roda)${C_0}"
  for item in $1; do
    j=${item%%:*}; rule=${item#*:}; [[ "$rule" == "$item" ]] && rule=must
    r=${JOB_RESULT[$j]:-pending}
    case "$r" in
      success) echo "  ${C_G}✔${C_0} $j: success" ;;
      failure) echo "  ${C_R}✘${C_0} $j: failure"; JOB_FAILED=1 ;;
      skipped_ci)
        ok=0
        [[ "$rule" == skipok ]] && ok=1
        [[ "$rule" == docs_only && "$docs_only" == true ]] && ok=1
        if (( ok )); then echo "  ${C_G}✔${C_0} $j: skipped (aceito pelo gate)"
        else echo "  ${C_R}✘${C_0} $j: skipped — o gate exige success"; JOB_FAILED=1; fi ;;
      inconclusive) echo "  ${C_Y}?${C_0} $j: INCONCLUSIVO (steps bloqueantes pulados localmente)"; inconcl=1 ;;
      assumed) echo "  ${C_Y}?${C_0} $j: não verificado (cloud-only)"; inconcl=1 ;;
      *) echo "  ${C_Y}?${C_0} $j: não verificado (pulado localmente)"; inconcl=1 ;;
    esac
  done
  for j in ${2:-}; do
    r=${JOB_RESULT[$j]:-pending}
    case "$r" in
      success) echo "  ${C_G}✔${C_0} $j: success (advisory)" ;;
      failure) echo "  ${C_Y}!${C_0} $j: failure (advisory — não bloqueia)" ;;
      *) echo "  ${C_Y}?${C_0} $j: não verificado (advisory)" ;;
    esac
  done
  (( inconcl )) && JOB_INCONCL=1
  return 0
}

service_pg_start() { # imagem porta-map env...  → 0 ok | 1 falhou | 2 porta ocupada (inconclusivo)
  local image=$1 ports=$2; shift 2
  local hostport=${ports%%:*} name="ci-local-pg-$$-$RANDOM" e i
  local -a envargs=()
  for e in "$@"; do envargs+=(-e "$e"); done
  /usr/bin/docker ps -aq --filter label=ci-local=1 --filter status=exited 2>/dev/null | xargs -r /usr/bin/docker rm -f >/dev/null 2>&1 || true
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${hostport}$"; then
    echo "  ${C_Y}⚠ porta ${hostport} já está em uso (Postgres/Supabase local?) — serviço postgres não sobe${C_0}"
    return 2
  fi
  echo "  ${C_D}▶ serviço postgres: /usr/bin/docker run -d --name $name -p $ports ${image}${C_0}"
  if ! /usr/bin/docker run -d --name "$name" --label ci-local=1 -p "$ports" "${envargs[@]}" "$image" >/dev/null; then
    echo "  ${C_R}✘ não consegui subir o serviço postgres${C_0}"
    return 1
  fi
  add_cleanup "/usr/bin/docker rm -f $name"
  for i in $(seq 1 60); do
    if /usr/bin/docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then
      echo "  ${C_D}serviço postgres pronto (${i}s)${C_0}"; return 0
    fi
    sleep 1
  done
  echo "  ${C_R}✘ serviço postgres não ficou pronto em 60s${C_0}"
  return 1
}

ver_check() { # ferramenta esperado atual
  if [[ -z "$3" ]]; then
    echo "${C_Y}⚠ versão:${C_0} $1 não encontrado no PATH (workflow usa $2)"
  elif [[ "$3" != "$2"* ]]; then
    echo "${C_Y}⚠ versão:${C_0} $1 instalado = $3, workflow usa $2 (seguindo com a instalada)"
  fi
}

wf_hash_check() {
  local atual f
  local -a files=()
  for f in $CI_WF_FILES; do [[ -f "$f" ]] && files+=("$f"); done
  (( ${#files[@]} )) || return 0
  atual=$(cat "${files[@]}" | sha256sum | cut -c1-16)
  if [[ "$atual" != "$CI_WF_HASH" ]]; then
    echo "${C_Y}⚠ os workflows (${CI_WF_FILES}) mudaram desde a geração deste script (${CI_GERADO_EM}): regenere com gera_ci_local.py — o resultado pode divergir do CI${C_0}"
  fi
}

in_csv() { # valor lista,csv
  local IFS=,; local x
  for x in $2; do [[ "$x" == "$1" ]] && return 0; done
  return 1
}
validate_ids() { # lista,csv rótulo
  local IFS=,; local x bad=""
  for x in $1; do [[ -n "${JOB_NAME[$x]+x}" ]] || bad="$bad $x"; done
  if [[ -n "$bad" ]]; then echo "$2: job(s) inexistente(s):$bad (veja --list)" >&2; exit 2; fi
}

print_list() {
  local id req mark
  printf '%s\n' "ci-local — ${CI_REPO}  (gerado ${CI_GERADO_EM} a partir de ${CI_WORKFLOWS})"
  printf '%s\n' "Checks obrigatórios na main (${CI_GERADO_EM}): ${CI_REQUIRED_CHECKS}"
  [[ -n "${CI_LIST_NOTAS:-}" ]] && printf '%s\n' "${CI_LIST_NOTAS}"
  wf_hash_check
  echo
  printf '%-26s %-7s %-15s %s\n' "job" "obrig." "classe" "check — o que pula"
  printf '%-26s %-7s %-15s %s\n' "---" "------" "------" "------------------"
  for id in "${JOB_ORDER[@]}"; do
    req=${JOB_REQ[$id]}
    case "$req" in
      req) mark="[REQ]" ;;
      via:*) mark="[REQ*]" ;;
      ci) mark="[ci]" ;;
      *) mark="[opt]" ;;
    esac
    printf '%-26s %-7s %-15s %s\n' "$id" "$mark" "${JOB_CLASS[$id]}" "${JOB_NAME[$id]}${JOB_STATIC_SKIPS[$id]:+ — pula: ${JOB_STATIC_SKIPS[$id]}}"
  done
  echo
  echo "[REQ] check obrigatório na main · [REQ*] exigido via agregador obrigatório · [ci] sem proteção na main (espelho) · [opt] só com --only"
}

only_closure() { # acrescenta ao --only os jobs provedores de outputs (needs transitivos) dos selecionados
  local changed=1 id n extra=""
  while (( changed )); do
    changed=0
    for id in "${JOB_ORDER[@]}"; do
      in_csv "$id" "$ONLY" || continue
      for n in ${JOB_NEEDS[$id]}; do
        if [[ "${JOB_PROVIDER[$n]}" == 1 ]] && ! in_csv "$n" "$ONLY" && ! in_csv "$n" "$SKIPS"; then
          ONLY="$ONLY,$n"; extra="$extra $n"; changed=1
        fi
      done
    done
  done
  [[ -n "$extra" ]] && echo "${C_D}--only: incluindo jobs provedores de outputs:${extra}${C_0}"
  return 0
}

selected() { # id -> 0 se deve rodar
  local id=$1
  in_csv "$id" "$SKIPS" && return 1
  if [[ -n "$ONLY" ]]; then in_csv "$id" "$ONLY"; return $?; fi
  [[ "${JOB_REQ[$id]}" != opt ]]
}
only_forced() { # job nomeado explicitamente em --only: roda mesmo com if: dependente de outro job
  [[ -n "$ONLY_EXPLICIT" ]] && in_csv "$CUR_JOB" "$ONLY_EXPLICIT"
}

run_jobs() {
  local id n fn dep_failed
  for id in "${JOB_ORDER[@]}"; do
    if ! selected "$id"; then
      JOB_RESULT[$id]=deselected   # p/ needs/if dos outros jobs conta como success (como no CI)
      if in_csv "$id" "$SKIPS"; then JOB_RUNTIME_SKIPS[$id]="--skip"
      elif [[ -n "$ONLY" ]]; then JOB_RUNTIME_SKIPS[$id]="fora de --only"
      else JOB_RUNTIME_SKIPS[$id]="opcional (rode com --only $id)"; fi
      continue
    fi
    if [[ "${JOB_CLOUD[$id]}" == 1 ]] && ! { [[ -n "$ONLY" ]] && in_csv "$id" "$ONLY"; }; then
      JOB_RESULT[$id]=assumed
      JOB_RUNTIME_SKIPS[$id]="cloud-only: ${JOB_STATIC_SKIPS[$id]}"
      echo
      echo "${C_Y}↷ SKIP${C_0} ${id} — ${JOB_NAME[$id]}: cloud-only (${JOB_STATIC_SKIPS[$id]}) — não verificado localmente"
      continue
    fi
    if [[ "${JOB_HEAVY[$id]}" == 1 ]] && (( FAST )); then
      JOB_RESULT[$id]=skipped_local; JOB_RUNTIME_SKIPS[$id]="opcional-pesado (--fast)"
      echo; echo "${C_Y}↷ SKIP${C_0} ${id} — ${JOB_NAME[$id]}: opcional-pesado (--fast)"
      continue
    fi
    if [[ "${JOB_DOCKER[$id]}" == 1 ]] && ! docker_ok; then
      JOB_RESULT[$id]=skipped_local; JOB_RUNTIME_SKIPS[$id]="precisa de docker (--no-docker/--fast)"
      echo; echo "${C_Y}↷ SKIP${C_0} ${id} — ${JOB_NAME[$id]}: precisa de docker (--no-docker/--fast)"
      continue
    fi
    dep_failed=""
    for n in ${JOB_NEEDS[$id]}; do
      [[ "${JOB_RESULT[$n]:-pending}" == failure ]] && dep_failed="$n"
    done
    if [[ -n "$dep_failed" && "${JOB_AGG[$id]}" != 1 ]]; then
      JOB_RESULT[$id]=skipped_ci; JOB_RUNTIME_SKIPS[$id]="dependência ${dep_failed} falhou"
      echo; echo "${C_Y}↷ SKIP${C_0} ${id} — ${JOB_NAME[$id]}: dependência ${dep_failed} falhou"
      continue
    fi
    fn="job_${id//[^A-Za-z0-9_]/_}"
    "$fn"
    if [[ "${JOB_RESULT[$id]}" == failure ]] && (( ! KEEP_GOING )); then
      echo; echo "${C_R}✘ ${id} falhou — parando (use --keep-going para continuar)${C_0}"
      return 0
    fi
  done
}

run_actionlint() {
  local f files=()
  echo
  if ! git rev-parse -q --verify origin/main >/dev/null 2>&1; then
    echo "actionlint: origin/main não existe localmente — pulado"; return 0
  fi
  while IFS= read -r f; do
    [[ -n "$f" && -f "$f" ]] && files+=("$f")
  done < <({ git diff --name-only origin/main -- .github/workflows/ 2>/dev/null; git ls-files --others --exclude-standard -- .github/workflows/; } | grep -E '\.ya?ml$' | sort -u || true)
  if (( ${#files[@]} == 0 )); then echo "actionlint: nenhum workflow alterado"; return 0; fi
  if ! command -v actionlint >/dev/null 2>&1; then
    echo "${C_Y}actionlint: não instalado — ${#files[@]} workflow(s) alterado(s) sem lint${C_0}"; return 0
  fi
  echo "${C_B}▶ actionlint${C_0} ${files[*]}"
  if actionlint "${files[@]}"; then
    echo "${C_G}✔${C_0} actionlint"
  else
    echo "${C_R}✘${C_0} actionlint"; ACTIONLINT_FAILED=1
  fi
}

print_summary() { # define EXIT_CODE
  local id r t s res col fail=0 inconcl=""
  echo
  printf '%s\n' "${C_B}Resumo${C_0}"
  printf '%-26s | %-14s | %7s | %s\n' "job" "resultado" "tempo" "o que pulou"
  printf '%-26s-+-%-14s-+-%7s-+-%s\n' "--------------------------" "--------------" "-------" "-----------"
  for id in "${JOB_ORDER[@]}"; do
    r=${JOB_RESULT[$id]}; t=${JOB_TIME[$id]}; s=${JOB_RUNTIME_SKIPS[$id]}
    case "$r" in
      success) res="✔ ok"; col=$C_G ;;
      failure) res="✘ FALHOU"; col=$C_R; [[ "${JOB_REQ[$id]}" != opt ]] && fail=1 ;;
      inconclusive) res="? inconcl."; col=$C_Y; [[ "${JOB_REQ[$id]}" != opt ]] && inconcl="$inconcl $id" ;;
      assumed) res="? cloud-only"; col=$C_Y; [[ "${JOB_REQ[$id]}" != opt ]] && inconcl="$inconcl $id" ;;
      skipped_local) res="↷ pulado"; col=$C_Y; [[ "${JOB_REQ[$id]}" != opt ]] && inconcl="$inconcl $id" ;;
      skipped_ci) res="↷ pulado (CI)"; col=$C_D ;;
      deselected) res="— fora"; col=$C_D ;;
      *) res="↷ pulado"; col=$C_Y ;;
    esac
    printf '%-26s | %s%-14s%s | %6ss | %s\n' "$id" "$col" "$res" "$C_0" "$t" "${s:-—}"
  done
  (( ACTIONLINT_FAILED )) && { echo "${C_R}✘ actionlint falhou nos workflows alterados${C_0}"; fail=1; }
  echo
  local escopo="todos os checks obrigatórios"
  [[ -n "$ONLY" ]] && escopo="os jobs selecionados (--only ${ONLY}; os demais não foram verificados)"
  if (( fail )); then
    echo "${C_R}✘ ci-local: há falhas em checks obrigatórios${C_0}"; EXIT_CODE=1
  elif [[ -n "$inconcl" ]]; then
    echo "${C_Y}? ci-local INCONCLUSIVO: checks obrigatórios não verificados localmente:${inconcl}${C_0}"
    EXIT_CODE=0
    if (( STRICT )); then EXIT_CODE=3; fi
  else
    echo "${C_G}✔ ci-local: ${escopo} rodaram e passaram${C_0}"; EXIT_CODE=0
  fi
  return 0
}

EXIT_CODE=0
ONLY_EXPLICIT=""
main() {
  local age
  ci_register_jobs
  if (( LIST )); then print_list; exit 0; fi
  [[ -n "$ONLY" ]] && validate_ids "$ONLY" "--only"
  [[ -n "$SKIPS" ]] && validate_ids "$SKIPS" "--skip"
  ONLY_EXPLICIT=$ONLY
  [[ -n "$ONLY" ]] && only_closure
  export TZ=UTC LANG=C.UTF-8 LC_ALL=C.UTF-8   # runners do GitHub são UTC
  CI_TMP=$(mktemp -d -t ci-local.XXXXXX)
  export CI_TMP
  printf '%s\n' '#!/usr/bin/env bash' 'trap '"'"'kill -TERM -- -$$ 2>/dev/null; sleep 2; kill -KILL -- -$$ 2>/dev/null'"'"' TERM INT' '"$@" & wait $!' >"$CI_TMP/launch.sh"
  chmod +x "$CI_TMP/launch.sh"
  GITHUB_SHA=$(git rev-parse HEAD)
  GITHUB_REF_NAME=$(git branch --show-current 2>/dev/null || true)
  GITHUB_REF_NAME=${GITHUB_REF_NAME:-HEAD}
  CI_FORCE_ALL=0
  if (( ALL_CHANGED )); then
    CI_BASE_SHA=$(git rev-list --max-parents=0 HEAD | tail -n1); CI_FORCE_ALL=1
    echo "${C_Y}--all-changed: todos os arquivos contam como alterados (base = commit raiz)${C_0}"
  elif [[ -n "$BASE_REF" ]]; then
    CI_BASE_SHA=$(git merge-base "$BASE_REF" HEAD 2>/dev/null) || { echo "--base: ref inválida: $BASE_REF" >&2; exit 2; }
  elif git rev-parse -q --verify origin/main >/dev/null 2>&1; then
    CI_BASE_SHA=$(git merge-base origin/main HEAD)
    age=$(( $(date +%s) - $(git log -1 --format=%ct origin/main) ))
    (( age > 7*86400 )) && echo "${C_Y}⚠ origin/main local tem $((age/86400)) dias — rode 'git fetch origin main' para uma base atual${C_0}"
  else
    CI_BASE_SHA=$GITHUB_SHA
  fi
  GITHUB_REPOSITORY=$(git remote get-url origin 2>/dev/null | sed -E 's#\.git$##; s#^.*[:/]([^/]+/[^/]+)$#\1#' || true)
  # arquivos alterados p/ os filtros de caminho: commits desde a base + working tree + novos não rastreados
  CI_CHANGED_FILES="$CI_TMP/changed-files.txt"
  { git diff --name-only "$CI_BASE_SHA" 2>/dev/null; git ls-files --others --exclude-standard; } | grep -v '^scripts/ci-local\.sh$' | sort -u >"$CI_CHANGED_FILES" || true
  if [[ "$CI_BASE_SHA" == "$GITHUB_SHA" ]] && (( ! ALL_CHANGED )); then
    echo "${C_Y}⚠ a base do PR emulado é o próprio HEAD (main, branch já mesclada ou sem commits): só mudanças não commitadas e arquivos novos contam${C_0}"
  fi
  if [[ ! -s "$CI_CHANGED_FILES" ]] && (( ! ALL_CHANGED )); then
    echo "${C_R}✘ nenhum arquivo alterado em relação à base ${CI_BASE_SHA:0:10} (nem commits, nem working tree, nem arquivos novos):${C_0}" >&2
    echo "   os filtros de caminho pulariam todos os jobs e o resultado seria vazio. Use --base <ref> (ex.: --base HEAD~1) ou --all-changed." >&2
    exit 2
  fi
  export GITHUB_SHA GITHUB_REF_NAME CI_BASE_SHA CI_FORCE_ALL CI_CHANGED_FILES GITHUB_REPOSITORY
  export GITHUB_REF="refs/heads/${GITHUB_REF_NAME}" GITHUB_BASE_REF=main GITHUB_HEAD_REF="$GITHUB_REF_NAME"
  export GITHUB_EVENT_NAME=pull_request GITHUB_ACTOR=local GITHUB_RUN_ID=local GITHUB_WORKSPACE="$ROOT"
  export RUNNER_OS=Linux RUNNER_TEMP="$CI_TMP" CI=true
  echo "${C_B}ci-local — ${CI_REPO}${C_0} ${C_D}(${GITHUB_REF_NAME} @ ${GITHUB_SHA:0:10}; base ${CI_BASE_SHA:0:10}; PR emulado)${C_0}"
  wf_hash_check
  ci_version_checks
  ci_env_setup
  run_jobs
  run_actionlint
  print_summary
  exit "$EXIT_CODE"
}

# ───────────────────────── versões (avisa uma vez; não instala) ─────────────────────────
ci_version_checks() {
  ver_check 'bun' '1.4.0' "$({ bun -v; } 2>/dev/null || true)"
  ver_check 'deno' '2.9.5' "$({ deno --version | head -1 | awk '{print $2}'; } 2>/dev/null || true)"
  return 0
}
ci_env_setup() {
  ci_use_node '24' 0 '.nvmrc=24 / engines node>=24'
  return 0
}

# ───────────────────────── jobs (steps literais dos workflows) ─────────────────────────

job_typecheck() {
  job_begin 'typecheck' ''
  local b=""
  quiet_skip  # 📥 Checkout code (actions/checkout)
  quiet_skip  # 🟩 Setup Node (actions/setup-node)
  quiet_skip  # 🧄 Setup Bun (oven-sh/setup-bun)
  quiet_skip  # 💾 Cache de dependências Bun (actions/cache)
  b=$(cat <<'CI_EOF'
bun install --frozen-lockfile --ignore-scripts
CI_EOF
)
  run_step '📚 Install dependencies' --shell '-euo pipefail' --timeout '15' --install bun.lock -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/ci/typecheck-ratchet.mjs
CI_EOF
)
  run_step '🔎 Run TypeScript debt ratchet' --shell '-euo pipefail' --timeout '15' -- "$b"
  b=$(cat <<'CI_EOF'
CLAUDE_MD_BASE=origin/main node scripts/ci/check-claude-md-integrity.mjs
CI_EOF
)
  run_step '🛡️ Integridade do CLAUDE.md (GA02)' --shell '-euo pipefail' --timeout '15' --note 'sem o git fetch --depth=1 (rede); base = origin/main local' -- "$b"
  job_end
}

job_unit_tests() {
  job_begin 'unit-tests' ''
  local b=""
  local MATRIX_shard
  for combo in "shard=1" "shard=2" "shard=3"; do
    MATRIX_shard=$(printf %s "$combo" | tr ";" "\n" | sed -n "s/^shard=//p")
    : "${MATRIX_shard}"
    CUR_LABEL="unit-tests[$combo]"
  quiet_skip  # 📥 Checkout code (actions/checkout)
  quiet_skip  # 🧄 Setup Bun (oven-sh/setup-bun)
  quiet_skip  # 💾 Cache de dependências Bun (actions/cache)
  b=$(cat <<'CI_EOF'
bun install --frozen-lockfile --ignore-scripts
CI_EOF
)
  run_step '📚 Install dependencies' --shell '-euo pipefail' --timeout '12' --install bun.lock -- "$b"
  b=$(cat <<'CI_EOF'
bun vitest run --shard=@@E1@@/3
CI_EOF
)
  b=${b//"@@E1@@"/"${MATRIX_shard}"}
  run_step "🧪 Run Vitest shard ${MATRIX_shard}/3" --env 'CI=true' --shell '-euo pipefail' --timeout '12' -- "$b"
    matrix_end
  done
  CUR_LABEL='unit-tests'
  job_end
}

job_node_scripts() {
  job_begin 'node-scripts' ''
  local b=""
  quiet_skip  # 📥 Checkout code (actions/checkout)
  quiet_skip  # 🟩 Setup Node (actions/setup-node)
  quiet_skip  # 🦕 Setup Deno (denoland/setup-deno)
  quiet_skip  # 🧄 Setup Bun (oven-sh/setup-bun)
  quiet_skip  # 💾 Cache de dependências Bun (actions/cache)
  b=$(cat <<'CI_EOF'
bun install --frozen-lockfile --ignore-scripts
CI_EOF
)
  run_step '📚 Install dependencies' --shell '-euo pipefail' --timeout '10' --install bun.lock -- "$b"
  b=$(cat <<'CI_EOF'
python3 docs/reconciliation/reproduce/validate_package.py
CI_EOF
)
  run_step '📦 Validar pacote de reconciliação' --shell '-euo pipefail' --timeout '10' -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/ci/render-workflow-docs.mjs --check
CI_EOF
)
  run_step '📖 Verificar README gerado dos workflows' --shell '-euo pipefail' --timeout '10' -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/ci/check-test-inventory.mjs
CI_EOF
)
  run_step 'Verificar inventário de testes' --shell '-euo pipefail' --timeout '10' -- "$b"
  b=$(cat <<'CI_EOF'
node --test scripts/ci/*.unit.mjs scripts/lib/seguranca-processo.test.mjs scripts/qa/prova-visao-classificadores.unit.mjs scripts/talkx/lado-a-lado.unit.mjs scripts/talkx/v4-status.unit.mjs scripts/team-chat-db-validate.unit.mjs scripts/ui-audit/contacts-navy-header.unit.mjs scripts/ui-audit/layout-guard.unit.mjs
CI_EOF
)
  run_step '🧩 Run Node CI scripts tests' --env 'CI=true' --shell '-euo pipefail' --timeout '10' -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/talkx/v4-status.mjs --check --ref HEAD
CI_EOF
)
  run_step '📊 Verificar placar V4 (--check)' --shell '-euo pipefail' --timeout '10' -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/vercel/ignore-build.unit.mjs
CI_EOF
)
  run_step '🧪 Test Vercel ignore-build guard' --shell '-euo pipefail' --timeout '10' -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/edge-deploy/generate-manifest.mjs --check
CI_EOF
)
  run_step '📦 Validar manifesto de edge functions' --shell '-euo pipefail' --timeout '10' -- "$b"
  job_end
}

job_edge_contracts() {
  job_begin 'edge-contracts' ''
  local b=""
  quiet_skip  # 📥 Checkout code (actions/checkout)
  quiet_skip  # 🦕 Setup Deno (denoland/setup-deno)
  b=$(cat <<'CI_EOF'
deno check --config scripts/ci/deno.json --frozen supabase/functions/*/index.ts
mapfile -t testes_edge < <(git ls-files 'supabase/functions/**/*.test.ts')
deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 "${testes_edge[@]}"
CI_EOF
)
  run_step '🦕 Test Edge handlers' --shell '-euo pipefail' --timeout '10' -- "$b"
  job_end
}

job_build() {
  job_begin 'build' ''
  local b=""
  quiet_skip  # 📥 Checkout code (actions/checkout)
  quiet_skip  # 🧄 Setup Bun (oven-sh/setup-bun)
  quiet_skip  # 💾 Cache de dependências Bun (actions/cache)
  b=$(cat <<'CI_EOF'
bun install --frozen-lockfile --ignore-scripts
CI_EOF
)
  run_step '📚 Install dependencies' --shell '-euo pipefail' --timeout '15' --install bun.lock -- "$b"
  b=$(cat <<'CI_EOF'
bun run build
CI_EOF
)
  run_step '🏗️ Build for production' --env "VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-https://placeholder.supabase.co}" --env "VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY:-placeholder}" --env 'VITE_CRM_INTEGRATION_ENABLED=true' --shell '-euo pipefail' --timeout '15' -- "$b"
  quiet_skip  # 📦 Upload build artifacts (actions/upload-artifact)
  b=$(cat <<'CI_EOF'
node scripts/ci/bundle-budget.mjs
CI_EOF
)
  run_step '📏 Enforce initial bundle budget (performance-budget.json)' --shell '-euo pipefail' --timeout '15' -- "$b"
  b=$(cat <<'CI_EOF'
echo "📦 Bundle Size Report"
echo "====================="
du -sh dist/
echo ""
echo "JS Files:"
find dist -name "*.js" -exec du -h {} \;
echo ""
echo "CSS Files:"
find dist -name "*.css" -exec du -h {} \;
CI_EOF
)
  run_step '📐 Report bundle size' --shell '-euo pipefail' --timeout '15' -- "$b"
  job_end
}

job_security() {
  job_begin 'security' ''
  local b=""
  for f in audit-report.txt audit-status.txt; do [[ -e "$f" ]] || add_cleanup "rm -f $(printf %q "$ROOT/$f")"; done
  quiet_skip  # 📥 Checkout code (actions/checkout)
  quiet_skip  # 🧄 Setup Bun (oven-sh/setup-bun)
  quiet_skip  # 💾 Cache de dependências Bun (actions/cache)
  b=$(cat <<'CI_EOF'
bun install --frozen-lockfile --ignore-scripts
CI_EOF
)
  run_step '📚 Install dependencies' --shell '-euo pipefail' --timeout '20' --install bun.lock -- "$b"
  b=$(cat <<'CI_EOF'
set -euo pipefail
status=0
bun audit --audit-level=low > audit-report.txt 2>&1 || status=$?
echo "$status" > audit-status.txt
cat audit-report.txt
CI_EOF
)
  run_step '🔎 Audit completo (informativo, inclui devDependencies)' --shell '-euo pipefail' --timeout '20' -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/ci/audit-prod.mjs --level high --input audit-report.txt --status audit-status.txt
CI_EOF
)
  run_step '🔒 Audit bloqueante (HIGH/CRITICAL em dependencias de producao)' --shell '-euo pipefail' --timeout '20' -- "$b"
  b=$(cat <<'CI_EOF'
gitleaks git --no-banner --redact --log-opts="--no-merges --first-parent ${CI_BASE_SHA}..HEAD"
CI_EOF
)
  run_step '🔍 Detect secrets introduced in commits' --env "GITHUB_TOKEN=${GITHUB_TOKEN:-}" --env 'GITLEAKS_ENABLE_COMMENTS=false' --env 'GITLEAKS_ENABLE_UPLOAD_ARTIFACT=false' --env 'GITLEAKS_ENABLE_SUMMARY=false' --shell '-euo pipefail' --timeout '20' --note 'substitui gitleaks-action: commits de origin/main..HEAD, config .gitleaks.toml do repo' -- "$b"
  job_end
}

job_workflow_lint() {
  job_begin 'workflow-lint' ''
  local b=""
  quiet_skip  # 📥 Checkout code (actions/checkout)
  skip_step '📦 Instalar actionlint e shellcheck (versao + sha256 pinados)' 'instalação em ~/.local/bin (actionlint e shellcheck já instalados no WSL)' info
  b=$(cat <<'CI_EOF'
actionlint -no-color .github/workflows/*.yml
CI_EOF
)
  run_step '🔍 actionlint (sintaxe, expressoes e shellcheck dos blocos run)' --shell '-euo pipefail' --timeout '10' -- "$b"
  skip_step '📦 Instalar zizmor (pinado)' 'instalação (pip --break-system-packages) — não instalamos nada' info
  if ! command -v zizmor >/dev/null 2>&1; then
    skip_step '🛡️ zizmor (seguranca dos workflows)' 'zizmor não instalado (python3 -m pip install --user zizmor==1.30.1)' precheck
  else
  b=$(cat <<'CI_EOF'
zizmor --no-online-audits --min-severity medium --format plain .github/workflows
CI_EOF
)
  run_step '🛡️ zizmor (seguranca dos workflows)' --shell '-euo pipefail' --timeout '10' -- "$b"
  fi
  job_end
}

job_ci_gate() {
  job_begin 'ci-gate' ''
  local b=""
  job_aggregate 'typecheck:must unit-tests:must node-scripts:must edge-contracts:must build:must security:must workflow-lint:must' ''
  job_end
}

job_offline_contract() {
  job_begin 'offline-contract' '/usr/bin:'
  local b=""
  local svc_rc=0 NO_DOCKER_JOB=0
  : "$svc_rc" "$NO_DOCKER_JOB"
  quiet_skip  # Checkout code (actions/checkout)
  b=$(cat <<'CI_EOF'
alteradas=$(git diff --name-status "${CI_BASE_SHA}...HEAD" -- supabase/migrations | grep -E '^(M|R|D)' || true)
if [ -n "$alteradas" ]; then
  echo "::error::migration já mesclada foi editada/renomeada/removida neste branch:"
  echo "$alteradas"
  exit 1
fi
echo "OK: nenhuma migration existente foi editada"
CI_EOF
)
  run_step 'Rejeitar edicao de migration ja existente' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --coe --shell '-euo pipefail' --timeout '30' --note 'equivalente local do github-script, mais estrito (sem as exceções do script original) — continue-on-error' -- "$b"
  quiet_skip  # Setup Node (actions/setup-node)
  quiet_skip  # Setup Bun (oven-sh/setup-bun)
  quiet_skip  # Cache do Bun (instalacao) (actions/cache)
  b=$(cat <<'CI_EOF'
bun install --frozen-lockfile --ignore-scripts
CI_EOF
)
  run_step 'Instalar dependencias do guard AST' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --shell '-euo pipefail' --timeout '30' --install bun.lock -- "$b"
  b=$(cat <<'CI_EOF'
node --test \
  scripts/catalog/validate-plan.test.mjs \
  scripts/ui-audit/view-container-padding.unit.mjs \
  scripts/db-tests/run-all.unit.mjs \
  scripts/talkx/gen-estados.unit.mjs
CI_EOF
)
  run_step 'Executar suites Node antes mantidas na allowlist' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --shell '-euo pipefail' --timeout '30' -- "$b"
  quiet_skip  # Setup Deno (denoland/setup-deno)
  b=$(cat <<'CI_EOF'
node scripts/db-audit/supabase-usage-guard.mjs
CI_EOF
)
  run_step 'Validar .from() e .rpc() contra o catalogo' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/db-audit/check-realtime-subscriptions.mjs
CI_EOF
)
  run_step 'Validar subscriptions contra a publicacao Realtime' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
testes_db=()
for teste_db in scripts/db-audit/*.test.mjs; do
  [[ "$teste_db" == "scripts/db-audit/talkx-engine-window-contract.test.mjs" ]] && continue
  testes_db+=("$teste_db")
done
node --test "${testes_db[@]}"
CI_EOF
)
  run_step 'Testar comparadores de catalogo, manifesto e migrations' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --shell '-euo pipefail' --timeout '30' -- "$b"
  # serviço postgres do job (sobe só aqui, antes do 1º step que usa docker)
  if docker_ok; then
    service_pg_start 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' '5432:5432' 'POSTGRES_PASSWORD=shim_test_password' 'POSTGRES_USER=postgres'; svc_rc=$?
    if (( svc_rc == 2 )); then skip_step 'serviço postgres' 'porta 5432 ocupada — steps docker pulados' docker; NO_DOCKER_JOB=1
    elif (( svc_rc != 0 )); then JOB_FAILED=1; fi
  fi
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh node --test scripts/db-audit/talkx-engine-window-contract.test.mjs
CI_EOF
)
  run_step 'Provar contrato Talk X de janela de envio em PostgreSQL descartavel' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_WINDOW_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
mkdir -p "$CI_TMP/shim-bin"
cp scripts/db-audit/docker-shim "$CI_TMP/shim-bin/docker"
chmod +x "$CI_TMP/shim-bin/docker"
echo "$CI_TMP/shim-bin" >> "$GITHUB_PATH"
CI_EOF
)
  run_step 'Instalar docker-shim (E47)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' --note 'shim instalado em $CI_TMP/shim-bin, não em ~/.local/bin' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/supabase-snapshot-stats.test.sh
CI_EOF
)
  run_step 'Provar filtro de consultas do snapshot no PostgreSQL 17' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SNAPSHOT_STATS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/gmail-cas-postgrest.test.sh
CI_EOF
)
  run_step 'Provar cursor e reset Gmail com PostgREST descartável (7 + 1)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'GMAIL_CAS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'GMAIL_CAS_TEST_POSTGREST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-engine-provider.test.sh
CI_EOF
)
  run_step 'Provar X034 com PostgREST e Evolution falso (8)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_ENGINE_PROVIDER_PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'TALKX_ENGINE_PROVIDER_PGRST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/catalog-manifest.test.sh
CI_EOF
)
  run_step 'Validar SQL de catalogo e manifesto no PostgreSQL 17' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh
CI_EOF
)
  run_step 'Provar politica confiavel do rate limit do catalogo' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CATALOG_RATE_LIMIT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh
CI_EOF
)
  run_step 'Simular politica confiavel do rate limit do catalogo' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CATALOG_RATE_LIMIT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/gen-types.test.sh
CI_EOF
)
  run_step 'Testar normalizacao deterministica dos tipos gerados' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
node scripts/db-audit/check-migration-drift.mjs
CI_EOF
)
  run_step 'Validar migrations localmente' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/email-signatures-rls.test.sh
CI_EOF
)
  run_step 'Simular contrato de acesso das assinaturas de e-mail (email_signatures)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'EMAIL_SIGNATURES_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/auto-reconnect-logs.test.sh
CI_EOF
)
  run_step 'Simular contrato de acesso da auto-reconexao de conexoes' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/check-mcp-exec-acl.test.sh
CI_EOF
)
  run_step 'Simular regressões do contrato mcp_exec' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'ACL_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/check-webhook-failures-acl.test.sh
CI_EOF
)
  run_step 'Simular regressões da ACL de webhook failures' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'WEBHOOK_ACL_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/anon-privileges-contact-messages.test.sh
CI_EOF
)
  run_step 'Simular revogacao dos privilegios de anon nas 17 tabelas de contatos/mensagens (SEC-RLS_CONTATOS_MENSAGENS-05)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'ANON_PRIVS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/check-secdef-public-execute.test.sh
CI_EOF
)
  run_step 'Simular SECURITY DEFINER aberta para PUBLIC/anon' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SECDEF_EXEC_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/secd-caller-check.test.sh
CI_EOF
)
  run_step 'Simular chamador ausente nas SECURITY DEFINER expostas' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SECD_CALLER_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/check-live-invariants.test.sh
CI_EOF
)
  run_step 'Simular violações dos invariantes gerais do banco vivo' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'LIVE_INVARIANTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/public-api-disable.test.sh
CI_EOF
)
  run_step 'Provar remoção do token legado da API pública' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'PUBLIC_API_DISABLE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/crm-sync-outbox-behavior.test.sh
CI_EOF
)
  run_step 'Simular concorrência e integridade da fila CRM' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CRM_OUTBOX_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/inbox-contact-authorization.test.sh
CI_EOF
)
  run_step 'Simular autorização canônica do Inbox' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'INBOX_AUTHZ_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/contacts-soft-delete-and-status.test.sh
CI_EOF
)
  run_step 'Simular exclusão, status e grants canônicos de Contatos' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CONTACTS_F1_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/contacts-legacy-visibility.test.sh
CI_EOF
)
  run_step 'Simular contatos legados fora por padrão (include_legacy)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CONTACTS_F5_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/wa-tag-and-status-authorization.test.sh
CI_EOF
)
  run_step 'Simular autorização de status de conversa e etiquetas de WhatsApp' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'WA_TAG_AUTHZ_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/wa-label-connection-scope.test.sh
CI_EOF
)
  run_step 'Simular escopo por conexão das etiquetas de WhatsApp (item 22 / TRA-006)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'WA_LABEL_SCOPE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/conversation-analyses-authorization.test.sh
CI_EOF
)
  run_step 'Simular autorização do INSERT em análises de conversa' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'ANALYSES_AUTHZ_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/ai-read-policies-queue-scope.test.sh
CI_EOF
)
  run_step 'Simular autorização da LEITURA de análises/etiquetas por fila (L8)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'AI_READ_QUEUE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/notify-due-tasks-authorization.test.sh
CI_EOF
)
  run_step 'Simular autorização do notify_due_tasks (RPC sem guarda)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'NOTIFY_DUE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/tasks-rearm-on-remind-change.test.sh
CI_EOF
)
  run_step 'Provar rearme de alarme quando remind_at muda' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TASKS_REARM_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh
CI_EOF
)
  run_step 'Simular pedido anônimo de recuperação de senha (item 72)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'RECUPERACAO_ANONIMA_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/ai-usage-cost-window-open.test.sh
CI_EOF
)
  run_step 'Simular janela aberta (fim nulo) na consulta de custo de IA (item 265)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'AI_USAGE_COST_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/dashboard-rls-authorization.test.sh
CI_EOF
)
  run_step 'Simular fronteira RLS das RPCs do Dashboard (DASH-091/092)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'DASH_RLS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/cron-secret-l5-contract.test.sh
CI_EOF
)
  run_step 'Simular credencial dedicada de cron no Vault (L5)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CRON_SECRET_L5_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/scope-public-policies-authenticated.test.sh
CI_EOF
)
  run_step 'Simular escopo das 14 policies TO public -> authenticated' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'PUBLIC_POLICY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/scope-snoozes-pins-favorites-authenticated.test.sh
CI_EOF
)
  run_step 'Simular escopo das 9 policies de snooze/favorite/pin TO authenticated (N-141)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SNOOZES_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/profiles-can-download-authorization.test.sh
CI_EOF
)
  run_step 'Simular o flag administrativo de download em profiles (R2-AUTH-027)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'PROFILES_CAN_DOWNLOAD_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/higiene-grants-public-policies.test.sh
CI_EOF
)
  run_step 'Simular higiene de grants (EXECUTE de PUBLIC + policies duplicadas)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'HIGIENE_GRANTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/send-messages-permission-authorization.test.sh
CI_EOF
)
  run_step 'Simular permissao send_messages imposta na RPC de envio (L9)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SEND_MESSAGES_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/edit-message-authorization.test.sh
CI_EOF
)
  run_step 'Simular autorizacao da edicao de mensagens' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'EDIT_MESSAGE_AUTHZ_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/enqueue-connection-scope.test.sh
CI_EOF
)
  run_step 'Simular escopo de fila na escolha da conexao de envio (L7)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'ENQUEUE_SCOPE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/whatsapp-media-select-scope.test.sh
CI_EOF
)
  run_step 'Simular escopo de posse da midia privada do Storage (SEC-DEFINER_GRANTS_STORAGE-01/02)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'WHATSAPP_MEDIA_SCOPE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/whatsapp-default-connection-atomicity.test.sh
CI_EOF
)
  run_step 'Simular troca atomica da conexao WhatsApp padrao (#174)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'WHATSAPP_DEFAULT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/gamification-marco-nao-bloqueia-envio.test.sh
CI_EOF
)
  run_step 'Simular gamificacao de marco no enfileiramento (R2-DB-009)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'GAMIFICATION_MARCO_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/conversation-events-insert-autor-visivel.test.sh
CI_EOF
)
  run_step 'Simular INSERT de evento de conversa com autor e contato visivel (N-143)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CONVEVENTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/reset-gatilho-coluna-removida.test.sh
CI_EOF
)
  run_step 'Simular recuperacao autenticada sem coluna reset_token (R2-DB-023)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'RESET_GATILHO_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/dispatch-scheduled-messages.test.sh
CI_EOF
)
  run_step 'Simular o despacho de mensagens agendadas' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'DISPATCH_SCHEDULED_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-reaction-membership.test.sh
CI_EOF
)
  run_step 'Simular vinculo de time na reacao em mensagem (#1265)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_REACTION_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-message-read-state.test.sh
CI_EOF
)
  run_step 'Simular view team_message_read_state — all_read por mensagem (N-070)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_READ_STATE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/drop-redundant-messages-external-id-index.test.sh
CI_EOF
)
  run_step 'Simular drop do indice redundante de messages.external_id (perf)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'DROP_EXTID_INDEX_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/conversation-tasks-completed-indexes.test.sh
CI_EOF
)
  run_step 'Simular índices de tarefas concluídas do kanban (N-083)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CONVERSATION_TASKS_COMPLETED_INDEX_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talk-me-queue-contract.test.sh
CI_EOF
)
  run_step 'Simular fila, autorização e aceite concorrente do TALK ME' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALK_ME_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/queues-distribution-overflow.test.sh
CI_EOF
)
  run_step 'Simular distribuicao e transbordo de filas' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'QUEUES_DIST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/assume-return-conversation.test.sh
CI_EOF
)
  run_step 'Simular assumir e devolver conversa por fila' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'ASSUME_RETURN_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
TALKX_HISTORY_PRECREATE_RUNTIME=false bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-template-history-behavior.test.sh
TALKX_HISTORY_PRECREATE_RUNTIME=true bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-template-history-behavior.test.sh
TALKX_HISTORY_PRECREATE_RUNTIME=true TALKX_HISTORY_INVALID_PRESTATE=true bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-template-history-behavior.test.sh
TALKX_HISTORY_PRECREATE_RUNTIME=true TALKX_HISTORY_INVALID_LIVE_PRESTATE=true bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-template-history-behavior.test.sh
TALKX_HISTORY_PRECREATE_RUNTIME=true TALKX_HISTORY_INVALID_VARIANT_PRESTATE=true bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-template-history-behavior.test.sh
CI_EOF
)
  run_step 'Simular histórico atômico de templates Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_HISTORY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-template-second-update-snapshot.test.sh
CI_EOF
)
  run_step 'Simular snapshot do 2o UPDATE de template Talk X (R2-DB-013)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_SECOND_UPDATE_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
TALKX_HISTORY_FK_PRESTATE=NO_ACTION bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-history-saved-by-fk.test.sh
TALKX_HISTORY_FK_PRESTATE=SET_NULL bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-history-saved-by-fk.test.sh
TALKX_HISTORY_FK_PRESTATE=ORPHAN bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-history-saved-by-fk.test.sh
CI_EOF
)
  run_step 'Simular correção forward-only da FK saved_by do Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_HISTORY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-blacklist-policy-forward-only.test.sh
CI_EOF
)
  run_step 'Simular reconciliação forward-only da policy Talk X blacklist' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_BLACKLIST_POLICY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-blacklist-audit-trigger.test.sh
CI_EOF
)
  run_step 'Simular trilha de auditoria da blacklist Talk X (N-107)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_BLACKLIST_AUDIT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-blacklist-realtime.test.sh
CI_EOF
)
  run_step 'Simular publicação Realtime da blacklist Talk X com escopo de colunas' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_BLACKLIST_REALTIME_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-update-limits-rpc.test.sh
CI_EOF
)
  run_step 'Simular edição de limites de campanha via RPC Talk X (V09)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_UPDATE_LIMITS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-update-limits-send-window.test.sh
CI_EOF
)
  run_step 'Simular correção da janela de envio via RPC Talk X (V09b)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_UPDATE_LIMITS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-n102c-window.test.sh
CI_EOF
)
  run_step 'Simular janela de envio Talk X com fuso/dia local (N-102c)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_N102C_WINDOW_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-update-limits-casts.test.sh
CI_EOF
)
  run_step 'Simular endurecimento de casts na RPC Talk X (V09c)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_UPDATE_LIMITS_CASTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-n102b-cast.test.sh
CI_EOF
)
  run_step 'Simular cast de send_weekdays nas RPCs Talk X (N-102b)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_N102B_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-update-limits-22009.test.sh
CI_EOF
)
  run_step 'Simular correção do vazamento 22009 na RPC Talk X (V09e)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_UPDATE_LIMITS_22009_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-escape-hatch-auth.test.sh
CI_EOF
)
  run_step 'Simular autenticação do escape hatch de limites Talk X (V09d)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_ESCAPE_HATCH_AUTH_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-guards-fail-closed.test.sh
CI_EOF
)
  run_step 'Simular guards fail-closed do Talk X (MAPA)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_GUARDS_FAIL_CLOSED_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-settings-replay-idempotent.test.sh
CI_EOF
)
  run_step 'Simular replay idempotente do talkx_settings (R2-01)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_SETTINGS_REPLAY_IDEMPOTENT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-n102a-ddl.test.sh
CI_EOF
)
  run_step 'Provar o DDL da janela de envio do Talk X (N-102a)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_N102A_DDL_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-send-interval-teto-24h.test.sh
CI_EOF
)
  run_step 'Simular teto de send_interval_max em 24h (A2)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_SEND_INTERVAL_TETO_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-send-budget.test.sh
CI_EOF
)
  run_step 'Simular limites de ritmo por minuto/dia/conexão e perfis de velocidade (X018)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_SEND_BUDGET_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-v12-lifecycle-events.test.sh
CI_EOF
)
  run_step 'Simular eventos do ciclo de vida gravados no servidor (V12)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_V12_LIFECYCLE_EVENTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-v15-replied-count-guard.test.sh
CI_EOF
)
  run_step 'Simular guard de replied_count e remoção da RPC de use_count (V15)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-v16-time-series.test.sh
CI_EOF
)
  run_step 'Simular série horária contando sent + delivered (V16)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-v17-read-at.test.sh
CI_EOF
)
  run_step 'Simular READ marcando read_at + read_count (V17)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-benchmarks-period-names.test.sh
CI_EOF
)
  run_step 'Simular benchmarks por período com nomes (X075 / N-123)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-insights-rules.test.sh
CI_EOF
)
  run_step 'Simular dicas por regra no servidor (X075 / N-124)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-v19-retry-recipient.test.sh
CI_EOF
)
  run_step 'Simular retry manual de destinatário terminal (V19)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-v21-launch-flags.test.sh
CI_EOF
)
  run_step 'Simular flags de lançamento persistidas (V21)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-suppress-phone-axis.test.sh
CI_EOF
)
  run_step 'Simular supressão de contato idempotente nos eixos phone e contact_id (V07b)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_SUPPRESS_PHONE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-metrics-view-invoker.test.sh
CI_EOF
)
  run_step 'Simular vazamento e correção da view de métricas Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_METRICS_INVOKER_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-draft-recipients.test.sh
CI_EOF
)
  run_step 'Simular snapshot atômico de destinatários Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_DRAFT_RECIPIENTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-draft-save.test.sh
CI_EOF
)
  run_step 'Simular identidade e revisão otimista de rascunhos Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_DRAFT_SAVE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-campaign-launch-checks.test.sh
CI_EOF
)
  run_step 'Simular checagens de lançamento de campanha Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_LAUNCH_CHECKS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-delivery-leases.test.sh
CI_EOF
)
  run_step 'Simular leases de entrega concorrente do Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_DELIVERY_LEASES_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-message-snapshot.test.sh
CI_EOF
)
  run_step 'Simular snapshot imutável de mensagem e variante Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_MESSAGE_SNAPSHOT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/multiplix-rls.test.sh
CI_EOF
)
  run_step 'Simular contrato de acesso e fila do Multiplix' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'MULTIPLIX_RLS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/multiplix-delivery-leases.test.sh
CI_EOF
)
  run_step 'Simular a fila de entrega por item do Multiplix' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'MULTIPLIX_RLS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/multiplix-drain-enum-cast.test.sh
CI_EOF
)
  run_step 'Simular conclusão drenada do Multiplix gravando status enum' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'MULTIPLIX_RLS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/multiplix-revoke-execute-public.test.sh
CI_EOF
)
  run_step 'Simular revogação de EXECUTE público do gatilho Multiplix (N-144)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'MULTIPLIX_REVOKE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/multiplix-scope.test.sh
CI_EOF
)
  run_step 'Provar escopo da audiencia Multiplix (F24)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/multiplix-resolve-escopo.test.sh
CI_EOF
)
  run_step 'Simular redacao fora do escopo do resolve Multiplix (R2-DB-003)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'MULTIPLIX_RESOLVE_ESCOPO_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
python3 scripts/db-audit/multiplix-send-mutation.py
CI_EOF
)
  run_step 'Provar por mutação os testes do worker do Multiplix (N-017)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --heavy --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-campaign-state-transitions.test.sh
CI_EOF
)
  run_step 'Simular estados e audiencia canônicos do Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_CAMPAIGN_STATE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-campaign-transitions.test.sh
CI_EOF
)
  run_step 'Simular transições concorrentes de campanha Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_CAMPAIGN_TRANSITIONS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-campaign-worker-lease.test.sh
CI_EOF
)
  run_step 'Simular trava por campanha, fila do worker e segredo de cron do Talk X (X010)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_CAMPAIGN_WORKER_LEASE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/talkx-campaign-recipients-page.test.sh
CI_EOF
)
  run_step 'Provar a RPC de paginacao de destinatarios da campanha Talk X (N-095)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_RECIPIENTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-role-gates.test.sh
CI_EOF
)
  run_step 'Simular portões de papel do Talk X (X014)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_ROLE_GATES_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-audience-rpc.test.sh
CI_EOF
)
  run_step 'Simular a RPC unica de audiencia do Talk X (X016)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_AUDIENCE_RPC_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-segment-fields.test.sh
CI_EOF
)
  run_step 'Simular a tabela e funcao de segmentos do Talk X (N-111)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_SEGMENT_FIELDS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-audience-snapshot.test.sh
CI_EOF
)
  run_step 'Simular o snapshot de audiencia do Talk X (X017)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_AUDIENCE_SNAPSHOT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-ab-weights.test.sh
CI_EOF
)
  run_step 'Provar constraint de pesos de variantes do Talk X (N-103)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_AB_WEIGHTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-segment-health.test.sh
CI_EOF
)
  run_step 'Saude de segmento (N-116)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_SEGMENT_HEALTH_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-regressoes-chain.test.sh
CI_EOF
)
  run_step 'Simular a correção das regressões do Talk X (cadeia completa)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_REGRESSOES_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-engine-tick.test.sh
CI_EOF
)
  run_step 'Simular o tick do motor Talk X (X012)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_ENGINE_TICK_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-transition-overload-postgrest.test.sh
CI_EOF
)
  run_step 'Provar ambiguidade do overload de transition_talkx_campaign no PostgREST' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_TRANSITION_POSTGREST_PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'TALKX_TRANSITION_POSTGREST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-events-contract.test.sh
CI_EOF
)
  run_step 'Provar o contrato de eventos do Talk X' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_EVENTS_CONTRACT_PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-links-conversions.test.sh
CI_EOF
)
  run_step 'Provar escrita de links, leitura de cliques/conversões e investimento (X021)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_LINKS_CONV_PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-lifecycle-events.test.sh
CI_EOF
)
  run_step 'Provar o ciclo de vida com ator/motivo e o fechamento da fila (X024)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_LIFECYCLE_EVENTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-counters-integrity.test.sh
CI_EOF
)
  run_step 'Provar contadores, checklist, duplicar/excluir e policy de eventos (X026)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_COUNTERS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-receipts-replies.test.sh
CI_EOF
)
  run_step 'Provar recibos de leitura, atribuicao de resposta e tempo de resposta (X027)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_RECEIPTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-retry-resolve.test.sh
CI_EOF
)
  run_step 'Provar reenvio manual e resolucao de outcome_unknown com trilha (X031)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_X031_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-lgpd.test.sh
CI_EOF
)
  run_step 'Provar consentimento no lancamento e expurgo por prazo (X032)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_X032_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-engine-health.test.sh
CI_EOF
)
  run_step 'Provar log por destinatario, saude do motor e alertas (X033)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_X033_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-engine-cron-runs-role-gate.test.sh
CI_EOF
)
  run_step 'Provar gate de papel nas leituras do cron do motor Talk X (M-DB-03)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_CRON_GATE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-tick-expurgo.test.sh
CI_EOF
)
  run_step 'Provar que o tick nao aborta no expurgo (M-DB-01)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_MDB01_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-alerts-outcome-unknown-lote.test.sh
CI_EOF
)
  run_step 'Provar lote de alertas Talk X com outcome_unknown_24h (item 33)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_LOTE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-expurgo-escopo-ai-jobs.test.sh
CI_EOF
)
  run_step 'Provar que o expurgo nao apaga ai_jobs de outros modulos (#130)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_ESCOPO_AI_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/message-delivery-phase1-behavior.test.sh
CI_EOF
)
  run_step 'Simular primitivas atômicas de mensagens e encerramento' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'MESSAGE_DELIVERY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/interactive-buttons-list-behavior.test.sh
CI_EOF
)
  run_step 'Simular transporte canônico de mensagens interativas (botões/lista)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'MESSAGE_DELIVERY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/calls-telefonia-contract.test.sh
CI_EOF
)
  run_step 'Simular contrato de dados da Telefonia v2' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CALLS_TELEFONIA_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/notification-delivery-atomicity.test.sh
CI_EOF
)
  run_step 'Simular notificações atômicas de chamadas e sentimento' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'NOTIFICATION_ATOMICITY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/generic-migration-runtime.test.sh
CI_EOF
)
  run_step 'Simular contrato runtime generico de migration' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'GENERIC_RUNTIME_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/check-reconcile-ledger-drift.test.sh
CI_EOF
)
  run_step 'Simular reconciliação segura do ledger' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'LEDGER_RECONCILE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/runtime-config.test.sh
CI_EOF
)
  run_step 'Simular auditoria somente-leitura de configuracao runtime' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh node scripts/db-audit/psql-environment.integration.mjs
CI_EOF
)
  run_step 'Provar transporte libpq com cliente e PostgreSQL reais' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh node --test scripts/db-audit/ledger-postapply-query.integration.mjs
CI_EOF
)
  run_step 'Executar o SQL do ledger pos-apply no PostgreSQL 17 (R2-INF-005)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'LEDGER_POSTAPPLY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-chat-rpc-ambiguity.test.sh
CI_EOF
)
  run_step 'Simular ambiguidade da RPC e recursao da policy do team chat (#1266)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_CHAT_RPC_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/tc002-direct-conversation-race.test.sh
CI_EOF
)
  run_step 'Simular concorrencia da RPC de conversa direta (TC-002)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TC002_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/l11-departments-acl-escrita.test.sh
CI_EOF
)
  run_step 'Simular ACL de escrita de departments (L11)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'L11_DEPARTMENTS_ACL_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/departments-admin-management.test.sh
CI_EOF
)
  run_step 'Simular gestao de departamentos pelo admin' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'DEPARTMENTS_ADMIN_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-receipts-membership.test.sh
CI_EOF
)
  run_step 'Simular vinculo obrigatorio no recibo de leitura do team chat (auditoria Onda 3)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_RECEIPTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-membership-bootstrap-owner.test.sh
CI_EOF
)
  run_step 'Simular guarda de bootstrap e ultimo owner no team chat (TC-003)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_MEMBERSHIP_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/gmail-write-blocks-restrictive.test.sh
CI_EOF
)
  run_step 'Simular bloqueios RESTRICTIVE de escrita em gmail_accounts' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'GMAIL_BLOCKS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh
CI_EOF
)
  run_step 'Simular contrato de seguranca do WhatsApp de departamento (TC-005)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TC005_WHATSAPP_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/request-department-access.test.sh
CI_EOF
)
  run_step 'Simular pedido de acesso a departamento (N-071)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'REQUEST_DEPT_ACCESS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-receipts-reactions-conversation-id.test.sh
CI_EOF
)
  run_step 'Simular conversation_id derivado da mensagem em recibos e reacoes (TC-009)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_CID_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-member-role-rpcs.test.sh
CI_EOF
)
  run_step 'Simular member_role nas RPCs de saída/remoção do team chat (TC-004)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_MEMBER_ROLE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-chat-media-acl-r2-db-020.test.sh
CI_EOF
)
  run_step 'Simular ACL e persistencia de media_path do Team Chat (R2-DB-020)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'R2DB020_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-chat-department-transfer-guards.test.sh
CI_EOF
)
  run_step 'Simular guarda de departamento e transferencia no team chat (QA5-10)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_DEPT_GUARD_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/mapa-f1-address-contract.test.sh
CI_EOF
)
  run_step 'Provar contrato de endereco da RPC search_contacts (mapa F1)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'MAPA_F1_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/ai-block03-vocabulary-contract.test.sh
CI_EOF
)
  run_step 'Provar contrato de vocabulário de IA — backfill e reversão (IA-030)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'AI_VOCAB_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-settings-rls.test.sh
CI_EOF
)
  run_step 'Provar RLS de escrita em talkx_settings — admin persiste, agente não (V06)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_SETTINGS_RLS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-template-columns.test.sh
CI_EOF
)
  run_step 'Provar as colunas novas de talkx_templates (N-126b)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_TEMPLATE_COLUMNS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/user-settings-sound-integrity-contract.test.sh
CI_EOF
)
  run_step 'Provar contrato de integridade de som em user_settings — NOT NULL e vocabulário fechado' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SOUND_INTEGRITY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/f64-voz-assets-e-grants.test.sh
CI_EOF
)
  run_step 'Provar grants e revogação das vozes do Multiplix (F64)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'F64_VOZ_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/storage-limits-whatsapp-audio-multiplix.test.sh
CI_EOF
)
  run_step 'Provar limite de tamanho nos buckets whatsapp-media, audio-messages e multiplix-voice (N-010)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'STORAGE_LIMITS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/department-whatsapp-mode-rpc.test.sh
CI_EOF
)
  run_step 'Simular RPC de modo do WhatsApp do departamento (QA5-09)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'DEPARTMENT_WA_MODE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/feature-flags-rollout.test.sh
CI_EOF
)
  run_step 'Provar o rollout gradual de feature_flags (V3 etapa 5) — percentual, papéis, listas e RLS' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'FEATURE_FLAGS_ROLLOUT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/network-policy-rpc.test.sh
CI_EOF
)
  run_step 'Provar a RPC canônica de política de rede (R2-AUTH-022)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'NETWORK_POLICY_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/revoke-auth-sessions.test.sh
CI_EOF
)
  run_step 'Provar revogação de sessões Auth por migration (R2-AUTH-004)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/user-sessions-expire.test.sh
CI_EOF
)
  run_step 'Provar encerramento diario de sessoes vencidas (N-008)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/sec-y25-01-insert-alvo.test.sh
CI_EOF
)
  run_step 'Simular amarração do alvo no INSERT de atividades, chamadas e tarefas (SEC-Y25-01)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SEC_Y25_INSERT_ALVO_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/profiles-role-escalation-guard.test.sh
CI_EOF
)
  run_step 'Provar a trava de escalada de privilegio em profiles (N-002)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'PROFILES_ESCALATION_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/email-rls-sem-ramo-admin.test.sh
CI_EOF
)
  run_step 'Provar a remocao do ramo admin inerte do RLS de email (N-147)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'EMAIL_RLS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/dashboard-daily-series.test.sh
CI_EOF
)
  run_step 'Provar a serie diaria de KPIs do dashboard (DASHBOARD-03)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'DASHBOARD_DAILY_SERIES_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/recriar-banco-local.test.sh
CI_EOF
)
  run_step 'Provar o runbook de recriacao do banco local (N-136)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/n142-message-reactions-select-user-id.test.sh
CI_EOF
)
  run_step 'Provar leitura de reacoes pelo profile_id (N-142)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'N142_REACTIONS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-conversion-defaults.test.sh
CI_EOF
)
  run_step 'Provar defaults de conversao Talk X com NULL explicito (R2-API-036)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TALKX_CONVERSION_DEFAULTS_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-chat-media-contract.test.sh
CI_EOF
)
  run_step 'Provar contrato de banco da midia do team chat (TC-001)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_CHAT_MEDIA_CONTRACT_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-direct-conversation-race.test.sh
CI_EOF
)
  run_step 'Provar corrida de criacao de conversa direta no team chat (item 55)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'TEAM_DIRECT_CONV_RACE_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/conversation-tasks-events-insert-authorization.test.sh
CI_EOF
)
  run_step 'Provar autorizacao de INSERT de conversation_tasks e conversation_events' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'CONV_TASKS_EVENTS_AUTH_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/department-invite-contract-audit-vocabulary.test.sh
CI_EOF
)
  run_step 'Provar contrato de convites e vocabulario de auditoria do team chat (TC-008)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'DEPT_INVITE_VOCAB_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/ia-usage-outbox-duravel.test.sh
CI_EOF
)
  run_step 'Provar outbox duravel do log de uso de IA (IA-TIMEOUT-001)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'IA_USAGE_OUTBOX_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/n011-storage-avatar-policies-dedup.test.sh
CI_EOF
)
  run_step 'Provar dedup de policies de avatar em storage (N-011)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'N011_AVATAR_DEDUP_TEST_POSTGRES_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/search_path_pg_temp_is_admin_get_own_gmail.test.sh
CI_EOF
)
  run_step 'Provar search_path com pg_temp em is_admin_or_supervisor e get_own_gmail_accounts (n-148)' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
docker pull "$POSTGRES_TEST_IMAGE"
docker tag "$POSTGRES_TEST_IMAGE" postgres:17-alpine
testes=(
  scripts/db-audit/contacts-stats-series-rpc.test.sh
  scripts/db-audit/conversation-closures-reopen-same-day.test.sh
  scripts/db-audit/crisis-room-snapshot.test.sh
  scripts/db-audit/cron-remocao-vacuum-messages.test.sh
  scripts/db-audit/docker-shim.test.sh
  scripts/db-audit/e44-whatsapp-connections-anon-grants.test.sh
  scripts/db-audit/ia131-audio-stt-cadeia.test.sh
  scripts/db-audit/ia131-audio-stt-openrouter.test.sh
  scripts/db-audit/login_gate_rpc.test.sh
  scripts/db-audit/message-attempts-log.test.sh
  scripts/db-audit/message-reactions-author-model.test.sh
  scripts/db-audit/message-reactions-autoria.test.sh
  scripts/db-audit/multiplix-completion-item-queue.test.sh
  scripts/db-audit/pg-cron-escalonamento.test.sh
  scripts/db-audit/reminders-migracao-identidade.test.sh
  scripts/db-audit/replay-local-harness.test.sh
  scripts/db-audit/talk-me-client-privileges.test.sh
  scripts/db-audit/talkx-campaign-logs-cursor.test.sh
  scripts/db-audit/talkx-campaign-segments-rpc.test.sh
  scripts/db-audit/talkx-campaign-segments.test.sh
  scripts/db-audit/talkx-campaign-window-open.test.sh
  scripts/db-audit/talkx-contact-attributes.test.sh
  scripts/db-audit/talkx-current-template-version.test.sh
  scripts/db-audit/talkx-e27-replay-divergence.test.sh
  scripts/db-audit/talkx-monitor-panel.test.sh
  scripts/db-audit/talkx-optout.test.sh
  scripts/db-audit/talkx-overview-stats.test.sh
  scripts/db-audit/talkx-purge-nao-falsa-falha.test.sh
  scripts/db-audit/talkx-segment-library-stats.test.sh
  scripts/db-audit/talkx-v23-draft-step.test.sh
  scripts/db-audit/talkx-v25-owner.test.sh
  scripts/db-audit/talkx-v26-template-version.test.sh
  scripts/db-audit/whatsapp-media-policies-sem-curinga.test.sh
)
for teste in "${testes[@]}"; do
  echo "::group::${teste}"
  case "$teste" in
    scripts/db-audit/docker-shim.test.sh|scripts/db-audit/replay-local-harness.test.sh)
      SKIP_DOCKER_SHIM=0 bash "$teste"
      ;;
    scripts/db-audit/cron-remocao-vacuum-messages.test.sh)
      bash scripts/db-audit/retry-disposable-postgres-test.sh bash "$teste" supabase/migrations/20261006202215_remover_cron_vacuum_messages_post_expurgo.sql
      ;;
    scripts/db-audit/pg-cron-escalonamento.test.sh)
      bash scripts/db-audit/retry-disposable-postgres-test.sh bash "$teste" supabase/migrations/20261002541230_pg_cron_escalonar_jobs.sql
      ;;
    *)
      bash scripts/db-audit/retry-disposable-postgres-test.sh bash "$teste"
      ;;
  esac
  echo "::endgroup::"
done
CI_EOF
)
  run_step 'Provar contratos shell restantes em serviços descartáveis' --env 'POSTGRES_TEST_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' --env 'POSTGREST_TEST_IMAGE=ghcr.io/supabase/postgrest:v14.5@sha256:bb289d00570b569525e1e22fb77c49cd17c17ca3f41da9ee2b4351a35027551b' --env 'POSTGRES_SERVICE_HOST=localhost' --env 'POSTGRES_SERVICE_PORT=5432' --env 'POSTGRES_SERVICE_USER=postgres' --env 'POSTGRES_SERVICE_PASS=shim_test_password' --env "DOCKER_SHIM_STATE_DIR=${CI_TMP}/docker-shim-state" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  job_end
}

job_replay_migrations() {
  job_begin 'replay-migrations' '/usr/bin:'
  local b=""
  quiet_skip  # Baixar o codigo (actions/checkout)
  b=$(cat <<'CI_EOF'
if grep -q "^supabase/migrations/" "$CI_CHANGED_FILES"; then
  echo "mudou=true" >> "$GITHUB_OUTPUT"
else
  echo "mudou=false" >> "$GITHUB_OUTPUT"
fi
CI_EOF
)
  run_step 'Detectar mudanca em supabase/migrations' --id 'mudou' --env "BASE_SHA=${CI_BASE_SHA}" --shell '-euo pipefail' --timeout '30' --note 'detecção inclui working tree e arquivos novos' -- "$b"
  b=$(cat <<'CI_EOF'
img=$(grep -m1 -oE 'ghcr\.io/supabase/postgres:[0-9.]+@sha256:[a-f0-9]{64}' scripts/db-audit/replay-local.sh)
if [ -z "$img" ]; then
  echo "nao achei a imagem fixada por digest em scripts/db-audit/replay-local.sh"
  exit 2
fi
echo "imagem do replay: $img"
for tentativa in 1 2 3; do
  if docker image inspect "$img" >/dev/null 2>&1 || docker pull "$img"; then break; fi
  echo "pull falhou (tentativa $tentativa); aguardando antes de repetir"
  sleep $((tentativa * 20))
done
docker image inspect "$img" >/dev/null
CI_EOF
)
  run_step 'Pre-baixar a imagem do replay' --if '[[ "$(step_out mudou mudou)" == "true" ]]' 'steps.mudou.outputs.mudou == '\''true'\''' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/replay-local.sh
CI_EOF
)
  run_step 'Aplicar as migrations em PostgreSQL 17 descartavel' --if '[[ "$(step_out mudou mudou)" == "true" ]]' 'steps.mudou.outputs.mudou == '\''true'\''' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  quiet_skip  # Publicar o log e os erros do replay (actions/upload-artifact)
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-suppression-read-rpcs.test.sh
CI_EOF
)
  run_step 'Provar as RPCs de leitura da supressão do Talk X (X176)' --env "TALKX_SUPPRESSION_READ_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/storage-limits-stickers-audio-memes.test.sh
CI_EOF
)
  run_step 'Provar limites de storage em stickers e audio-memes (N-009)' --env "STICKERS_MEMES_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-help-top-topics.test.sh
CI_EOF
)
  run_step 'Provar talkx_help_views + ranking dos mais vistos (N-135)' --env "TALKX_HELP_TOP_TOPICS_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-messages-page-cursor-tiebreak.test.sh
CI_EOF
)
  run_step 'Provar cursor tiebreak e limite minimo de get_team_messages_page (N-072)' --env "TEAM_CHAT_PAGE_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/buckets-stickers-team-chat-files.test.sh
CI_EOF
)
  run_step 'Provar limites dos buckets e a identidade de team-chat-files (SEC-DEFINER_GRANTS_STORAGE-06/08)' --env "BUCKETS_CHAT_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/scheduled-whisper-visibility-rls.test.sh
CI_EOF
)
  run_step 'Provar RLS de agendamento e sussurro por contato visível e permissão (t_d3c1981f)' --env "SCHEDULED_WHISPER_RLS_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/searchbox-budget-alert-monthly-idempotency.test.sh
CI_EOF
)
  run_step 'Provar a identidade mensal do alerta de custo do autocomplete (R2-API-058)' --env "SEARCHBOX_ALERT_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/sec-y25-01-insert-alvo.test.sh
CI_EOF
)
  run_step 'Simular amarração do alvo no INSERT de atividades, chamadas e tarefas (SEC-Y25-01)' --env "SEC_Y25_INSERT_ALVO_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/messages-group-sender.test.sh
CI_EOF
)
  run_step 'Provar o remetente de grupo em messages (t_35d5aa82)' --env "MESSAGES_GROUP_SENDER_TEST_POSTGRES_IMAGE=${POSTGRES_TEST_IMAGE:-}" --env 'SKIP_DOCKER_SHIM=1' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-save-template-variants.test.sh
CI_EOF
)
  run_step 'Provar talkx_save_template_variants' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-segment-progress.test.sh
CI_EOF
)
  run_step 'Provar talkx_segment_progress' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/admin-cron-jobs-rpc.test.sh
CI_EOF
)
  run_step 'Provar admin_cron_jobs_rpc' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/gmail-accounts-sync-backoff.test.sh
CI_EOF
)
  run_step 'Provar gmail_accounts_sync_backoff' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/replay-classify.test.sh
CI_EOF
)
  run_step 'Provar replay_classify' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/search-email-threads.test.sh
CI_EOF
)
  run_step 'Provar search_email_threads' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-campaign-recurrence.test.sh
CI_EOF
)
  run_step 'Provar talkx_campaign_recurrence' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  b=$(cat <<'CI_EOF'
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-n102-window-acl.test.sh
CI_EOF
)
  run_step 'Provar talkx_n102_window_acl' --docker --shell '-euo pipefail' --timeout '30' -- "$b"
  job_end
}

ci_register_jobs() {
  reg_job 'typecheck' '🔎 TypeCheck' 'ci.yml' 'req' 'local' '' '' 0 0 0 0 0
  reg_job 'unit-tests' '🧪 Unit Tests (*/3)' 'ci.yml' 'via:ci-gate' 'local' '' '' 0 0 0 0 0
  reg_job 'node-scripts' '🧩 Node CI Scripts' 'ci.yml' 'via:ci-gate' 'local' '' '' 0 0 0 0 0
  reg_job 'edge-contracts' '🦕 Edge contracts' 'ci.yml' 'via:ci-gate' 'local' '' '' 0 0 0 0 0
  reg_job 'build' '🏗️ Build' 'ci.yml' 'req' 'local' 'typecheck unit-tests' '' 0 0 0 0 0
  reg_job 'security' '🔒 Security Audit' 'ci.yml' 'via:ci-gate' 'local' '' '' 0 0 0 0 0
  reg_job 'workflow-lint' '🛡️ Workflow lint' 'ci.yml' 'via:ci-gate' 'local' '' '📦 Instalar actionlint e shellcheck (versao + sha256 pinados) (instalação em ~/.local/bin (actionlint e shellcheck já insta); 📦 Instalar zizmor (pinado) (instalação (pip --break-system-packages) — não instalamos na)' 0 0 0 0 0
  reg_job 'ci-gate' '✅ CI Gate (required check)' 'ci.yml' 'req' 'local' 'typecheck unit-tests node-scripts edge-contracts build security workflow-lint' 'agregador emulado (lógica do gate sobre os resultados locais)' 0 0 0 1 0
  reg_job 'offline-contract' 'Contrato DB offline' 'db-guard.yml' 'opt' 'parcial' '' '166 step(s) docker; 1 step(s) pesados' 0 0 0 0 0
  reg_job 'replay-migrations' 'Replay local das migrations' 'db-guard.yml' 'opt' 'parcial' '' '19 step(s) docker' 0 0 0 0 0
}

main "$@"
