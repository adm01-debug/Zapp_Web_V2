#!/usr/bin/env bash
# rotas-base-dry-run.sh — fixture/dry-run do integrador para as DUAS pontas da BASE.
#
# Cartão: t_1f707485 (worker/geral).
# Destino final: ~/arquitetura-v2/integrador/testes/rotas-base-dry-run.sh
#   (a guarda de agente proíbe escrever em ~/arquitetura-v2 — ver APLICAR.md ao lado).
#
# CONTRATO PROVADO, nos DOIS pontos de conferência da BASE
#   ponto A ~ integrar.sh:251-267  (base marcada vermelha; hoje: reteste da base)
#   ponto B ~ integrar.sh:436-441  (QA1-03: confere se a base está verde antes de culpar o cartão)
#
#   ROTA COM MIGRATION -> o comando efetivo do zapp-verify leva o conjunto EXPLÍCITO
#                        (3º argumento = v2-integrador) e o banco É verificado (sem "NÃO VERIFICADO").
#   ROTA SEM MIGRATION -> zero chamadas ao banco (nenhum zapp-db-local) e o comando efetivo segue
#                        SEM nome de conjunto: o log da BASE traz
#                        "AVISO ... NÃO VERIFICADO: sem nome de conjunto".
#
# Critério de aceite: o teste FALHA se a rota com migration não usar conjunto explícito
# e FALHA se a rota sem migration tentar acessar banco.
#
# COMO (dry-run; nada de produção, nada da fila real):
#  1. o integrador recusa rodar em sessão de agente (integrar.sh:18), então o teste NÃO executa o
#     integrador. Ele EXTRAI com awk o texto real do bloco de cada ponto (mais as definições de função
#     do arquivo) e roda esse texto num script de areia, com stubs de zapp-verify / zapp-db-local no PATH.
#     Nada é redigitado: o comando sob teste é o texto que está no arquivo-alvo.
#  2. a areia é um HOME sintético (mktemp) com um repositório git mínimo: branch do dia + branch do
#     cartão (com ou sem supabase/migrations) — é isso que torna a "ponta" com ou sem migration.
#  3. cada stub grava o que recebeu (argv + destino do stdout via /proc/self/fd/1), o que identifica de
#     qual ponto veio a chamada: as duas verificações da BASE escrevem em .verificacao-da-base.log.
#     O stub do zapp-verify espelha o AVISO do zapp-verify real (~/.local/bin/zapp-verify:35-37) quando
#     não recebe nome de conjunto.
#  4. se o âncora de um ponto não for encontrado no arquivo-alvo, o teste ABORTA alto (nunca passa em
#     silêncio por o código ter sido refatorado).
#
# USO:
#   bash testes/rotas-base-dry-run.sh                   # o integrador vivo (o do dia)
#   V2_TESTE_INTEGRAR=/caminho/integrar.sh bash ...     # outra versão (correção pronta, mutante)
#   V2_TESTE_LIMPAR=1 bash ...                          # apaga a areia no fim
# Saída: 4 casos (A-com, A-sem, B-com, B-sem) + evidência crua; exit 0 = todas as rotas conforme.
set -uo pipefail

GIT="${V2_TESTE_GIT:-/usr/bin/git}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# alvo: o irmão (quando instalado em integrador/testes/) > V2_TESTE_INTEGRAR > o vivo
if [ -n "${V2_TESTE_INTEGRAR:-}" ]; then ALVO="$V2_TESTE_INTEGRAR"
elif [ -f "$(dirname "$AQUI")/integrar.sh" ]; then ALVO="$(dirname "$AQUI")/integrar.sh"
else ALVO="$HOME/arquitetura-v2/integrador/integrar.sh"; fi
[ -f "$ALVO" ] || { printf 'ERRO: integrador não encontrado: %s\n' "$ALVO" >&2; exit 2; }

RAIZ="$(mktemp -d /tmp/v2-rotas-base.XXXXXX)"
[ "${V2_TESTE_LIMPAR:-0}" = 1 ] && trap 'rm -rf "$RAIZ"' EXIT

ID_CARTAO="abcdef012345"
DIA="dia/2026-10-07"
BR="v2/teste-rotas-base-$ID_CARTAO"
CONJUNTO="v2-integrador"
FALHAS=0
ok()   { printf '   ok    %s\n' "$1"; }
ruim() { printf '   FALHA %s\n' "$1"; FALHAS=$((FALHAS+1)); }

printf '== rotas-base-dry-run — fixture do integrador (rotas com e sem migration) ==\n'
printf 'integrador sob teste: %s\n' "$ALVO"
printf '  md5 %s | %s linhas | %s\n' "$(md5sum "$ALVO" | cut -c1-16)" "$(wc -l < "$ALVO")" "$(date -r "$ALVO" '+%F %H:%M')"
printf 'areia (HOME sintético): %s\n\n' "$RAIZ"

# ------------------------------------------------------------- extração -------
# Tudo o que vai rodar é TEXTO do arquivo-alvo. Âncora não encontrada = falha alta.
extrair_defs() {  # funções coluna-0 + constantes coluna-0 de valor literal (ex.: CONJUNTO_BASE="v2-integrador")
  awk '/^[A-Za-z_][A-Za-z0-9_]*\(\)[[:space:]]*\{/{d=1} d{print} d&&/^\}/{d=0}' "$ALVO"
  grep -E '^[A-Z][A-Z0-9_]*="[^"$]*"$' "$ALVO" || true
}
extrair_ponto() {  # $1 = A|B
  case "$1" in
    A) awk '/DRY != 1/ && /SO_PORTAO != 1/ && /#PRONTOS\[@\]/{p=1} /^\[ \$DRY = 1 \]/{p=0} p{print}' "$ALVO" ;;
    B) awk '/BOK="[$]DIRLOG\//{p=1} /^[[:space:]]*# 05\/10 \(J4-01\/05\)/{p=0} p{print}' "$ALVO" ;;
  esac
}
linha_de() {  # $1 = A|B -> número da 1a linha do bloco no arquivo-alvo (evidência)
  case "$1" in
    A) grep -n 'DRY != 1' "$ALVO" | grep -m1 'PRONTOS\[@\]' | cut -d: -f1 ;;
    B) grep -nF 'BOK="$DIRLOG/.base-verde-$BASE_SHA"' "$ALVO" | head -1 | cut -d: -f1 ;;
  esac
}
DEFS="$(extrair_defs)"
BLOCO_A="$(extrair_ponto A)"
BLOCO_B="$(extrair_ponto B)"
for p in A B; do
  case "$p" in A) BL="$BLOCO_A" ;; B) BL="$BLOCO_B" ;; esac
  [ -n "$BL" ] || { printf 'ERRO: não achei o ponto %s em %s (âncora mudou) — teste abortado.\n' "$p" "$ALVO" >&2; exit 3; }
done
printf 'extraído de %s: definições %s linhas | ponto A %s linhas (a partir da %s) | ponto B %s linhas (a partir da %s)\n\n' \
  "$(basename "$ALVO")" "$(printf '%s\n' "$DEFS" | grep -c .)" "$(printf '%s\n' "$BLOCO_A" | grep -c .)" \
  "$(linha_de A)" "$(printf '%s\n' "$BLOCO_B" | grep -c .)" "$(linha_de B)"

# ---------------------------------------------------------------- stubs -------
criar_stubs() {
  local BIN="$SB/.local/bin"
  cat > "$BIN/zapp-verify" <<'STUB'
#!/usr/bin/env bash
# stub de zapp-verify: grava argv + destino do stdout; sem nome de conjunto espelha o AVISO real.
set -u
case "${1:-}" in fast|full) shift;; esac
W="${1:-.}"; NOME="${2:-}"; [ "${NOME#--}" != "$NOME" ] && NOME=""
N=0; [ -f "${V2_TESTE_CONTADOR:-/dev/null}" ] && N="$(cat "$V2_TESTE_CONTADOR" 2>/dev/null || echo 0)"
N=$((N+1)); printf '%s\n' "$N" > "${V2_TESTE_CONTADOR:-/dev/null}"
printf 'zapp-verify\tn=%s\tset=%s\tout=%s\n' "$N" "${NOME:--}" "$(readlink -f /proc/$$/fd/1)" >> "$V2_TESTE_REGISTRO_ZV"
case ",${V2_TESTE_ZV_FALHA:-}," in *",$N,"*) printf 'SIMULADO: falha do alvo (chamada %s)\n' "$N"; exit 1;; esac
if [ -z "$NOME" ]; then
  # espelha ~/.local/bin/zapp-verify:35-37 (sem nome = conjunto inexistente = banco não verificado)
  printf 'AVISO   %-12s NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)\n' banco_local
  printf 'VERIFY: VERDE SEM BANCO (1s) — o banco NÃO foi verificado; registros em /dev/null\n'
else
  printf 'OK      %-12s    1s\n' banco_local
  printf 'VERIFY: VERDE (1s) — registros em /dev/null\n'
fi
exit 0
STUB
  cat > "$BIN/zapp-db-local" <<'STUB'
#!/usr/bin/env bash
# stub de zapp-db-local: registra TODA chamada (é isto que prova "acessou o banco").
set -u
printf 'zapp-db-local\t%s\n' "$*" >> "$V2_TESTE_REGISTRO_BD"
[ "${1:-}" = list ] && printf '{"name":"v2-integrador","status":"reachable"}\n'
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "$BIN/zapp-db-guard"
  chmod +x "$BIN/zapp-verify" "$BIN/zapp-db-local" "$BIN/zapp-db-guard"
}

# ----------------------------------------------------------------- areia ------
montar_areia() {  # $1 = nome do caso, $2 = com|sem, $3 = A|B
  local nome="$1" com="$2" ponto="$3"
  CB="$RAIZ/$nome"; SB="$CB/home"
  mkdir -p "$SB/.local/bin" "$SB/arquitetura-v2/integrador" "$SB/hermes-workspaces/.v2-fila" "$SB/projetos"
  REF="$SB/projetos/Zapp_Web_V2"; INT="$SB/hermes-workspaces/Zapp_Web_V2/.integrador"
  FILA="$SB/hermes-workspaces/.v2-fila"; DIRLOG="$SB/arquitetura-v2/integrador"
  ZV="$CB/registro-zapp-verify.tsv"; BD="$CB/registro-zapp-db-local.tsv"
  BASE_LOG="$DIRLOG/.verificacao-da-base.log"; LOG="$DIRLOG/integrar.log"
  : > "$ZV"; : > "$BD"; : > "$LOG"
  criar_stubs

  # repositório mínimo: main -> dia -> branch do cartão (a "ponta": com ou sem supabase/migrations)
  "$GIT" init -q -b main "$REF"
  "$GIT" -C "$REF" config user.email "teste@local.invalid"
  "$GIT" -C "$REF" config user.name "Teste Dry-Run"
  "$GIT" -C "$REF" config commit.gpgsign false
  mkdir -p "$REF/src"
  printf 'export const base = 1\n' > "$REF/src/base.ts"
  "$GIT" -C "$REF" add -A && "$GIT" -C "$REF" -c core.hooksPath=/dev/null commit -q -m "base"
  "$GIT" -C "$REF" checkout -q -b "$DIA"
  printf 'export const dia = 1\n' > "$REF/src/dia.ts"
  "$GIT" -C "$REF" add -A && "$GIT" -C "$REF" -c core.hooksPath=/dev/null commit -q -m "abre o dia"
  if [ "$com" = com ]; then    # migration já integrada na base (o drift da base é o caso real)
    mkdir -p "$REF/supabase/migrations"
    printf -- '-- migration ja integrada na branch do dia\nselect 1;\n' > "$REF/supabase/migrations/20261007000001_dia_base.sql"
    "$GIT" -C "$REF" add -A && "$GIT" -C "$REF" -c core.hooksPath=/dev/null commit -q -m "migration do dia"
  fi
  BASE_SHA="$("$GIT" -C "$REF" rev-parse "$DIA")"
  "$GIT" -C "$REF" checkout -q -b "$BR" "$DIA"
  printf 'export const cartao = 1\n' > "$REF/src/teste-card.ts"
  "$GIT" -C "$REF" add -A && "$GIT" -C "$REF" -c core.hooksPath=/dev/null commit -q -m "cartao"
  if [ "$com" = com ]; then    # quem traz a migration é a ponta (base...ponta)
    mkdir -p "$REF/supabase/migrations"
    printf -- '-- migration trazida pela ponta\nselect 2;\n' > "$REF/supabase/migrations/20261007000002_cartao.sql"
    "$GIT" -C "$REF" add -A && "$GIT" -C "$REF" -c core.hooksPath=/dev/null commit -q -m "migration do cartao"
  fi
  NOVO="$("$GIT" -C "$REF" rev-parse "$BR")"; SHA="$NOVO"
  "$GIT" -C "$REF" worktree add -q --detach "$INT" "$DIA"    # o ponto A mexe na worktree da base
  cat > "$FILA/$ID_CARTAO.json" <<EOF
{"id":"$ID_CARTAO","branch":"$BR","base_dia":"$DIA","sha":"$SHA","titulo":"fixture dry-run rotas base","quando":"2026-10-07T09:00:00-03:00","estado":"pronto","relato":"fixture sintetica do dry-run (rotas-base-dry-run.sh)"}
EOF
  if [ "$ponto" = A ]; then    # o ponto A só roda com marcador de base vermelha VENCIDO (>15 min)
    MKV="$DIRLOG/.base-vermelha-$("$GIT" -C "$REF" rev-parse "$DIA")"
    : > "$MKV"; touch -d '30 minutes ago' "$MKV"
  fi
  ARVORES="$DIRLOG/.arvores-verificadas"
}

# ------------------------------------------------- script da areia (corpo) ----
gerar_roteiro() {  # $1 = A|B; usa $BL, $SB, $CB, $REF, $INT, $DIRLOG, $LOG, $ZV, $BD, $DEFS
  local roteiro="$CB/roteiro-$1.sh"
  cat > "$roteiro" <<PRE
#!/usr/bin/env bash
set -uo pipefail
BIN="$SB/.local/bin"
export PATH="\$BIN:\$PATH"
GIT="$GIT"
REF="$REF"
INT="$INT"
DIRLOG="$DIRLOG"
LOG="$LOG"
RX_ID='^[0-9a-f]{12,16}\$'
RX_DIA='^dia/[0-9]{4}-[0-9]{2}-[0-9]{2}\$'
DRY=0; SO_PORTAO=0; V2_LOTE=0
export V2_TESTE_REGISTRO_ZV="$ZV" V2_TESTE_REGISTRO_BD="$BD" V2_TESTE_CONTADOR="$CB/zv.contador"
export V2_TESTE_ZV_FALHA="${V2_TESTE_ZV_FALHA_CASO:-}"
log() { printf '%s %s\n' "\$(date -Is)" "\$*" >> "\$LOG"; }
reteste_isolado() { return 1; }
marca() { :; }
campo() { python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2],""))
except Exception: print("")' "\$1" "\$2"; }

# ===== definições extraídas de $ALVO =====
$DEFS

# ===== contexto do caso =====
ID='$ID_CARTAO'
DIA='$DIA'
BASE_SHA='$BASE_SHA'
NOVO='$NOVO'
PRONTOS=($FILA/$ID_CARTAO.json)

# ===== bloco do ponto $1 — texto do arquivo-alvo =====
$BL

echo "FIM-DO-BLOCO-$1 rc=0"
PRE
  printf '%s' "$roteiro"
}

# --------------------------------------------------------------- leitura ------
sets_da_base() { grep -F "out=$BASE_LOG" "$ZV" 2>/dev/null | sed -n 's/.*set=\([^[:space:]]*\).*/\1/p'; }
n_base()       { grep -cF "out=$BASE_LOG" "$ZV" 2>/dev/null || true; }
evidencia() {
  printf '   zapp-verify (todas)  : %s\n' "$(tr '\n' ' ' < "$ZV")"
  printf '   zapp-db-local        : %s\n' "$([ -s "$BD" ] && tr '\n' ' ' < "$BD" || echo '(nenhuma chamada)')"
  printf '   log da BASE          : %s\n' "$(grep -m1 -E 'AVISO|VERIFY' "$BASE_LOG" 2>/dev/null || echo '(log vazio)')"
  printf '   rota no log          : %s\n' "$(grep -m1 -E 'conferida COM o conjunto|conferida sem banco|voltou a ficar verde|continua VERMELHA' "$LOG" 2>/dev/null | cut -c25-170 || echo '(o arquivo-alvo nao loga a rota)')"
}

caso() {  # $1 = rótulo, $2 = A|B, $3 = com|sem
  local rotulo="$1" ponto="$2" com="$3" s roteiro nb
  printf -- '-- %s (ponto %s; ponta %s migration)\n' "$rotulo" "$ponto" "$com"
  montar_areia "${rotulo%% *}" "$com" "$ponto"
  export V2_TESTE_ZV_FALHA_CASO=""    # no dry-run o stub sempre aprova a BASE
  case "$ponto" in A) BL="$BLOCO_A" ;; B) BL="$BLOCO_B" ;; esac
  roteiro="$(gerar_roteiro "$ponto")"
  bash "$roteiro" > "$CB/saida-$ponto.txt" 2>&1; local rc=$?
  [ "$rc" = 0 ] || ruim "o roteiro extraído do ponto $ponto saiu com rc=$rc (ver $CB/saida-$ponto.txt)"

  nb="$(n_base)"
  if [ "$nb" -lt 1 ]; then
    ruim "o ponto $ponto NÃO chamou o zapp-verify na BASE (nada em .verificacao-da-base.log)"
  else
    ok "ponto $ponto exercitou a conferência da BASE ($nb chamada(s))"
  fi
  s="$(sets_da_base | sort -u | tr '\n' ' ')"
  if [ "$com" = com ]; then
    if [ "$s" = "$CONJUNTO " ]; then ok "rota COM migration usou conjunto explícito ($CONJUNTO)"
    else ruim "rota COM migration NÃO usou conjunto explícito — conjunto(s): [${s:-nenhum}] (esperado $CONJUNTO)"; fi
    if [ -f "$BASE_LOG" ] && grep -q 'NÃO VERIFICADO' "$BASE_LOG"; then
      ruim "rota COM migration deixou o banco NÃO VERIFICADO no log da BASE"; fi
    printf '   nota  conjunto montado antes? %s chamada(s) ao banco citando %s\n' \
      "$(grep -cF "$CONJUNTO" "$BD" 2>/dev/null || true)" "$CONJUNTO"
  else
    if [ "$s" = "- " ]; then ok "rota SEM migration manteve o comando sem nome de conjunto (como hoje)"
    else ruim "rota SEM migration passou conjunto [${s:-?}] — o zapp-verify consultaria o banco"; fi
    if [ -s "$BD" ]; then ruim "rota SEM migration ACESSOU O BANCO: $(tr '\n' ' ' < "$BD")"
    else ok "rota SEM migration não fez nenhuma chamada ao banco"; fi
    if [ -f "$BASE_LOG" ] && grep -q 'NÃO VERIFICADO' "$BASE_LOG"; then
      ok "o fluxo manteve AVISO/NÃO VERIFICADO no log da BASE"
    else ruim "o log da BASE perdeu o AVISO/NÃO VERIFICADO na rota sem migration"; fi
  fi
  if [ -s "$BD" ] && [ -n "$(grep -F 'v2-' "$BD" 2>/dev/null | grep -vF "$CONJUNTO" || true)" ]; then
    ruim "alguma chamada ao banco usou conjunto diferente de $CONJUNTO"; fi
  evidencia
  printf '\n'
}

caso "A-com (ponto A, base vermelha)" A com
caso "A-sem (ponto A, base vermelha)" A sem
caso "B-com (ponto B, pós-cartão vermelho)" B com
caso "B-sem (ponto B, pós-cartão vermelho)" B sem

printf '== resumo: %s falha(s)\n' "$FALHAS"
if [ "$FALHAS" = 0 ]; then printf 'TODAS AS ROTAS CONFORME O CONTRATO.\n'
else printf 'ROTAS FORA DO CONTRATO (ver FALHA acima).\n'; fi
printf 'areia em %s (V2_TESTE_LIMPAR=1 para apagar)\n' "$RAIZ"
[ "$FALHAS" = 0 ]
