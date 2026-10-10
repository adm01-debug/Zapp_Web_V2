#!/usr/bin/env bash
# Integrador da Arquitetura V2 — versão 2 (04/10/2026, depois da campanha QA1/QA2/QA3).
# Roda como Claude/timer — NUNCA como agente. Pega os cartões "pronto" da fila (~/hermes-workspaces/.v2-fila/*.json)
# e aplica cada um como UM commit (squash) na branch LOCAL do dia, numa worktree só dele. Nada vai ao GitHub.
#
# A fila é escrita pelo hermes-tarefa-fechar (mesmo usuário do agente) → NÃO É CONFIÁVEL. Por isso, para cada cartão,
# o integrador refaz a partir do GIT: formato de id/branch/base, sha == ponta da branch, nenhum merge, segredos (com
# --text), URL/ref de produção, colisão de versão de migration. Aprovação do Claude só vale se estiver em
# ~/.local/libexec/hermes-guard/v2-aprovacoes/<id> (pasta que a guarda proíbe o agente de escrever) e para o mesmo sha.
# Depois: portão de saída (filtros determinísticos + Jev v2) → squash desacoplado → commit sem hooks do cartão →
# zapp-verify full (testes + build) → avança a branch do dia só por compare-and-swap. Conflito/falha desfaz só aquele cartão.
#
# Uso: integrar.sh [--dry-run] [--max N]  |  integrar.sh --aprovar <id>  (Claude libera um cartão em "revisao")
set -uo pipefail
{ # 05/10: o bash lê o script aos poucos; a rodada longa (até 20 × zapp-verify) quebrou com "syntax error" quando o
  # arquivo foi atualizado no meio dela. Com o corpo num bloco { …; exit; } o bash lê tudo antes de executar.
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"  # QA2: systemd não tem
[ "${HERMES_AGENT:-}" = "1" ] && { echo "ERRO: o integrador não roda para agentes" >&2; exit 75; }
GIT=/usr/bin/git
REF="$HOME/projetos/Zapp_Web_V2"
FILA="$HOME/hermes-workspaces/.v2-fila"
APROV="$HOME/.local/libexec/hermes-guard/v2-aprovacoes"
INT="$HOME/hermes-workspaces/Zapp_Web_V2/.integrador"
DIRLOG="$HOME/arquitetura-v2/integrador"; LOG="$DIRLOG/integrar.log"
ESPV="$(md5sum "$DIRLOG/ci_espelho.sh" 2>/dev/null | cut -c1-8)"   # versão do espelho: mudou o script, o cache da base não vale mais
RX_ID='^[0-9a-f]{12,16}$'
RX_DIA='^dia/[0-9]{4}-[0-9]{2}-[0-9]{2}$'
[ "${V2_INTEGRAR_TESTE:-}" = "1" ] && RX_DIA='^(dia/[0-9]{4}-[0-9]{2}-[0-9]{2}|teste/[a-z0-9][a-z0-9-]{0,60})$'
T_RODADA=$(date +%s)   # 05/10: orçamento de tempo da rodada (a unidade systemd agora mata aos 60 min; antes eram 30 e a verificação em curso se perdia)
DRY=0; MAX="${V2_MAX:-24}"; APROVAR=""; SHA_REV=""; SO_PORTAO=0   # com o lote otimista, até 8 cartões aprovados custam 1 verificação
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) DRY=1; shift ;; --max) MAX="$2"; shift 2 ;; --so-portao) SO_PORTAO=1; MAX=500; shift ;; --aprovar) APROVAR="${2:-}"; SHA_REV="${3:-}"; shift 2; [ $# -gt 0 ] && case "$1" in --*) ;; *) shift ;; esac ;;
  *) echo "opção desconhecida: $1"; exit 2 ;; esac; done

# 05/10 (QA3-03): a aprovação NÃO disputa a trava do integrador (ela só grava o arquivo de aprovação e muda o item de
# "revisao" para "pronto"); tem trava própria e é imediata. Antes esperava até 20 min e segurava os revisores.
if [ -n "${APROVAR:-}" ]; then exec 8>"$DIRLOG/.lock-aprovar"; flock -w 60 8 || { echo "outra aprovação em andamento"; exit 1; }
# 06/10 (atolamento: 62 de 79 prontos sem triagem): --so-portao roda SÓ as revalidações e o portão de saída em TODOS os
# prontos, com trava própria, sem esperar a rodada de verificação (que só olhava os 10 mais antigos a cada ~35 min). Não
# integra nada: o retido vai para o revisor já, o resto fica "pronto" para a rodada normal, que repete todas as checagens.
elif [ "$SO_PORTAO" = 1 ]; then exec 7>"$DIRLOG/.lock-portao"; flock -n 7 || { echo "outro pré-portão rodando"; exit 0; }
else exec 9>"$DIRLOG/.lock"; flock -n 9 || { echo "outro integrador rodando"; exit 0; }; fi
log() { echo "$(date -Is) $*" | cut -c1-600 | tee -a "$LOG"; }
campo() { python3 -c "import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2],''))
except Exception: print('')" "$1" "$2"; }
marca() {  # escrita atômica: $1 arquivo, $2 estado, $3 detalhe
  python3 - "$1" "$2" "${3:-}" <<'EOP'
import json, sys, os, datetime
p, est, det = sys.argv[1:]
import re
det = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", det)
d = json.load(open(p))
# 06/10 (auditoria A2): o item pode ter sido refechado com outro commit enquanto a rodada trabalhava. MARCA_SHA = o sha que ESTA
# rodada julgou; se o item já tem outro sha, o resultado não vale para ele e nada é gravado (o commit novo segue o fluxo normal).
_sha = os.environ.get("MARCA_SHA", "")
if _sha and d.get("sha") != _sha:
    print("marca: " + os.path.basename(p) + " mudou de commit durante a rodada; resultado descartado", file=sys.stderr); sys.exit(0)
d["estado"] = est; d["detalhe"] = det[:1500]   # J4-06: 500 cortava o erro e o caminho do log
d["integrado_em"] = datetime.datetime.now().astimezone().isoformat()
json.dump(d, open(p + ".novo", "w"), ensure_ascii=False, indent=1); os.replace(p + ".novo", p)
EOP
}

if [ -n "$APROVAR" ]; then
  echo "$APROVAR" | grep -Eq "$RX_ID" || { echo "id inválido"; exit 1; }
  F="$FILA/$APROVAR.json"; [ -f "$F" ] || { echo "cartão $APROVAR não está na fila"; exit 1; }
  [ "$(campo "$F" estado)" = "revisao" ] || { echo "cartão $APROVAR está '$(campo "$F" estado)': só se aprova cartão em revisao"; exit 1; }
  SHA="$(campo "$F" sha)"; echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || { echo "sha inválido na fila"; exit 1; }
  # QA1-01: a aprovação vale para o COMMIT que foi revisado, não para o que estiver na fila agora
  [ -n "$SHA_REV" ] || { echo "informe o sha revisado: --aprovar <id> <sha>"; exit 1; }
  [ "$SHA" = "$SHA_REV" ] || { echo "o cartão mudou de commit depois da revisão (revisado ${SHA_REV:0:9}, na fila ${SHA:0:9}); aprovação recusada"; exit 1; }
  printf 'sha=%s\naprovado_em=%s\npor=%s\n' "$SHA" "$(date -Is)" "${USER}" > "$APROV/$APROVAR"
  marca "$F" pronto "aprovado pelo Claude (sha ${SHA:0:9})"
  log "$APROVAR: APROVADO pelo Claude para o sha ${SHA:0:9}"; exit 0
fi

[ -d "$FILA" ] || { echo "fila vazia"; exit 0; }
mkdir -p "$FILA/.quarentena"
# listagem tolerante: arquivo corrompido ou sem campos vai para a quarentena e não esconde os outros (QA2)
mapfile -t PRONTOS < <(python3 - "$FILA" "$MAX" <<'EOP'
import json, os, sys
fila, maxn = sys.argv[1], int(sys.argv[2]); ok = []
for n in sorted(os.listdir(fila)):
    if not n.endswith(".json"): continue
    p = os.path.join(fila, n)
    try:
        d = json.load(open(p))
        if d.get("estado") != "pronto": continue
        if not all(d.get(k) for k in ("id", "branch", "base_dia", "sha", "titulo", "quando")): raise ValueError("campos faltando")
        ok.append((d["quando"], os.path.getmtime(p), p))
    except Exception as e:
        os.replace(p, os.path.join(fila, ".quarentena", n)); print("QUARENTENA " + n + " " + str(e)[:80], file=sys.stderr)
for _, _, p in sorted(ok)[:maxn]: print(p)
EOP
)
[ ${#PRONTOS[@]} -gt 0 ] || { echo "nenhum cartão pronto"; exit 0; }

# ================= RETESTE ISOLADO (05/10 09:30) ==================================================================
# Com 10 agentes rodando suítes ao mesmo tempo a carga passa de 50 em 24 núcleos e testes estouram o tempo (15 s) só
# por isso. Às 09:23 isso deixou a BASE "vermelha" e travou o integrador. Regra: se o ÚNICO passo que falhou foi o de
# testes, os arquivos de teste que falharam são rodados de novo, sozinhos; passando, a verificação vale como verde.
reteste_isolado() {   # $1 = resumo do zapp-verify; $2 = commit de referência (opcional): arquivos mudados desde ele NÃO podem ser "resgatados"
  local VL="$1" REFB="${2:-}" PL LIMPO ARQS NARQ NFAIL NERR NORIG PROPRIOS
  [ -f "$VL" ] && [ "$(grep -c '^FALHOU' "$VL")" = 1 ] && grep -qE '^FALHOU +testes' "$VL" || return 1
  PL="$(grep -oE '\(ver [^)]+\.log\)' "$VL" | sed 's/^(ver //; s/)$//' | head -1)"; [ -f "$PL" ] || return 1
  LIMPO="$(sed 's/\x1b\[[0-9;]*[A-Za-z]//g' "$PL")"
  # (1) a suíte tem de ter chegado ao FIM: sem a linha de resumo o processo morreu no meio e os outros arquivos nem rodaram
  printf '%s\n' "$LIMPO" | grep -qE '^ *Test Files +' || return 1
  NFAIL="$(printf '%s\n' "$LIMPO" | sed -nE 's/^ *Test Files +([0-9]+) failed.*/\1/p' | tail -1)"; NFAIL="${NFAIL:-0}"
  NERR="$(printf '%s\n' "$LIMPO" | sed -nE 's/^ *Errors +([0-9]+) errors?.*/\1/p' | tail -1)"; NERR="${NERR:-0}"
  # (2) arquivos: só a linha "FAIL <arquivo> >" e a origem dos erros não tratados (linha de pilha ❯ não é falha)
  ARQS="$( { printf '%s\n' "$LIMPO" | sed -nE 's/^ *FAIL +([^ ]+\.(test|spec)\.[a-z]+)( .*)?$/\1/p'
             printf '%s\n' "$LIMPO" | sed -nE 's/^This error originated in "([^"]+)" test file.*/\1/p'; } | sort -u)"
  NORIG="$(printf '%s\n' "$LIMPO" | grep -cE '^This error originated in "[^"]+" test file')"
  NARQ="$(printf '%s\n' "$ARQS" | grep -c . || true)"
  # (3) TODA falha tem de estar identificada: nº de arquivos FAIL = resumo; todo erro não tratado tem origem; nada de corte
  [ "$NARQ" -ge 1 ] && [ "$NARQ" -le 15 ] || return 1
  [ "$(printf '%s\n' "$LIMPO" | sed -nE 's/^ *FAIL +([^ ]+\.(test|spec)\.[a-z]+)( .*)?$/\1/p' | sort -u | grep -c . || true)" = "$NFAIL" ] || return 1
  [ "$NORIG" -ge "$NERR" ] || return 1
  printf '%s\n' "$ARQS" | grep -qvE '^src/[A-Za-z0-9_./@-]+\.(test|spec)\.tsx?$' && return 1      # só o que o vitest roda
  # (4) teste que o próprio cartão/lote criou ou mexeu não é "instável alheio": quem decide é a suíte inteira
  if [ -n "$REFB" ]; then
    PROPRIOS="$(comm -12 <(printf '%s\n' "$ARQS") <($GIT -C "$INT" diff --name-only "$REFB" HEAD 2>/dev/null | sort -u))"
    [ -z "$PROPRIOS" ] || return 1
  fi
  ( cd "$INT" && timeout -k 10 900 zapp-db-guard run -- bun run test -- $ARQS ) > "$DIRLOG/.reteste-isolado.log" 2>&1 9>&- || return 1
  # (5) o zapp-verify para no primeiro vermelho: o BUILD nunca rodou nesta árvore — roda agora
  ( cd "$INT" && timeout -k 10 900 zapp-db-guard run -- bun run build ) > "$DIRLOG/.reteste-build.log" 2>&1 9>&- || return 1
  echo "$(date -Is) reteste isolado VERDE (+build): $(echo $ARQS)" >> "$LOG"
  printf '%s\t%s\n' "$(date -Is)" "$(echo $ARQS)" >> "$DIRLOG/instaveis.tsv"     # para o sensor: mesmo arquivo resgatado ≥ 3×/dia = cartão de conserto
  return 0
}

# ================= LOTE OTIMISTA (05/10/2026) =====================================================================
# O integrador era o gargalo (1 cartão por vez, ~5 min cada, contra ~29 entregas/h dos 10 agentes). Agora os cartões
# JÁ APROVADOS pelo revisor e sem migration são empilhados (um squash por cartão) e a verificação completa + espelho do
# CI rodam UMA vez na ponta da pilha. Se ficar verde, a árvore de cada degrau é anotada; o laço principal continua
# validando e integrando cartão por cartão como sempre, mas pula a verificação quando a árvore resultante é uma das
# anotadas (mesmo conteúdo, byte a byte). Lote vermelho, cartão fora de ordem ou recusado → nada anotado/árvore
# diferente → verificação individual como antes. Nenhuma validação nem portão é pulado.
ARVORES="$DIRLOG/.arvores-verificadas"; LOTE_MAX="${V2_LOTE_MAX:-8}"; [ "$SO_PORTAO" = 1 ] || rm -f "$ARVORES" "$DIRLOG/.ci-lote-ponta.txt"   # 06/10 (auditoria A1): o pré-portão NÃO apaga estado da rodada normal
# BISSECÇÃO (05/10 21:00, pedido do Joaquim: "não tenho todo esse tempo"): pilha vermelha → acha o MAIOR PREFIXO VERDE com
# O(log n) sondas (3 para 8 cartões) em vez de n verificações completas de 5-6 min. O prefixo entra sem repetir a
# verificação; o cartão seguinte é o suspeito e é verificado sozinho (e marcado falhou se for ele mesmo); os demais ficam
# para o próximo lote. Nenhum portão é pulado: o prefixo só é anotado depois de verificado como pilha.
sonda_verde() {   # $1 = full|espelho. Verde = (full: verificação completa ou reteste) E espelho sem falha nova. Saída do espelho fica em .ci-lote-ponta.txt
  if [ "$1" = full ]; then
    timeout 1500 zapp-verify full "$INT" >"$DIRLOG/.verificacao-da-sonda.log" 2>&1 9>&- || reteste_isolado "$DIRLOG/.verificacao-da-sonda.log" "$B0" || return 1
  fi
  "$DIRLOG/ci_espelho.sh" "$INT" > "$DIRLOG/.ci-lote-ponta.txt" 9>&-
  [ -z "$(comm -23 <(sed '/^$/d' "$DIRLOG/.ci-lote-ponta.txt" | sort -u) <(sed '/^$/d' "$CIB" 2>/dev/null | sort -u) | head -1)" ]
}
bissecao() {      # $1 = modo da sonda; usa B0, PAI, CIB, INT. Escreve ARVORES (árvores do prefixo verde). Retorna 1 se nada ficou verde.
  local MODO="$1" COMMITS=() lo hi mid best=-1 c T1 k
  mapfile -t COMMITS < <($GIT -C "$INT" rev-list --reverse "$B0..$PAI")
  [ ${#COMMITS[@]} -ge 2 ] || return 1
  lo=0; hi=$(( ${#COMMITS[@]} - 2 ))        # a ponta já é vermelha
  while [ $lo -le $hi ]; do
    [ $(( $(date +%s) - T_RODADA )) -lt 1500 ] || { log "bissecção: orçamento da rodada acabando; paro com o que já sei"; break; }
    mid=$(( (lo + hi) / 2 )); c="${COMMITS[$mid]}"; T1=$(date +%s)
    $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null; $GIT -C "$INT" checkout --quiet --detach "$c" || return 1
    if sonda_verde "$MODO"; then best=$mid; lo=$(( mid + 1 )); log "bissecção ($MODO): prefixo de $(( mid + 1 )) cartão(ões) VERDE em $(( $(date +%s) - T1 ))s"
    else hi=$(( mid - 1 )); log "bissecção ($MODO): prefixo de $(( mid + 1 )) cartão(ões) vermelho em $(( $(date +%s) - T1 ))s"; fi
  done
  [ $best -ge 0 ] || return 1
  c="${COMMITS[$best]}"
  if [ "$($GIT -C "$INT" rev-parse HEAD)" != "$c" ]; then     # a última sonda foi vermelha: a lista do espelho tem de ser a da ponta VERDE
    $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null; $GIT -C "$INT" checkout --quiet --detach "$c"
    "$DIRLOG/ci_espelho.sh" "$INT" > "$DIRLOG/.ci-lote-ponta.txt" 9>&-
  fi
  for k in $(seq 0 $best); do $GIT -C "$INT" rev-parse "${COMMITS[$k]}^{tree}"; done > "$ARVORES"
  log "bissecção: ${#COMMITS[@]} na pilha; os $(( best + 1 )) primeiros entram sem repetir a verificação; o $(( best + 2 ))º (${COMMITS[$((best+1))]:0:9}) é o suspeito e é verificado sozinho"
  return 0
}
lote_otimista() {
  local DIAL B0 PAI f ID BR D SHA TIT ok T0 S=() O=()
  DIAL="$($GIT -C "$REF" for-each-ref --sort=-refname --format='%(refname:short)' 'refs/heads/dia/' | head -1)"
  [ -n "$DIAL" ] && [ -e "$INT/.git" ] || return 0
  B0="$($GIT -C "$REF" rev-parse "$DIAL")"; PAI="$B0"
  $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null
  $GIT -C "$INT" checkout --quiet --detach "$B0" 2>/dev/null || return 0
  for f in "${PRONTOS[@]}"; do
    ID="$(campo "$f" id)"; BR="$(campo "$f" branch)"; D="$(campo "$f" base_dia)"; SHA="$(campo "$f" sha)"
    TIT="$(campo "$f" titulo | tr -d '\r' | head -c 100)"; ok=1
    [ ${#S[@]} -lt "$LOTE_MAX" ] || ok=0
    echo "$ID" | grep -Eq "$RX_ID" && echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || ok=0
    [ $ok = 1 ] && [ -f "$APROV/$ID" ] && grep -qx "sha=$SHA" "$APROV/$ID" || ok=0
    [ $ok = 1 ] && echo "$D" | grep -Eq '^dia/[0-9]{4}-[0-9]{2}-[0-9]{2}$' && $GIT -C "$REF" merge-base --is-ancestor "$D" "$DIAL" 2>/dev/null || ok=0
    [ $ok = 1 ] && [ "$($GIT -C "$REF" rev-parse "$BR" 2>/dev/null)" = "$SHA" ] || ok=0
    [ $ok = 1 ] && [ -z "$($GIT -C "$REF" diff --name-only "$DIAL...$SHA" -- supabase/migrations 2>/dev/null)" ] || ok=0
    if [ $ok = 1 ] && $GIT -C "$INT" merge --squash --quiet "$SHA" >/dev/null 2>&1 && ! $GIT -C "$INT" diff --cached --quiet \
       && $GIT -C "$INT" -c core.hooksPath=/dev/null commit --quiet --no-verify -m "$TIT" -m "Cartão V2: $ID (lote)" 2>/dev/null; then
      S+=("$f"); PAI="$($GIT -C "$INT" rev-parse HEAD)"
    else
      $GIT -C "$INT" reset --quiet --hard "$PAI" 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null; O+=("$f")
    fi
  done
  # 06/10 (2 FAIXAS, pedido do Joaquim): a faixa 2 (faixa2.sh) verifica ADIANTADO o próximo lote em cima do atual e anota as
  # árvores verdes em .arvores-pre-verificadas. Se TODAS as árvores desta pilha estão lá (mesmo conteúdo byte a byte), a
  # verificação já foi feita: anota-as como a verificação do lote faria e segue. Qualquer diferença = verificação normal abaixo.
  PRE="$DIRLOG/.arvores-pre-verificadas"
  if [ ${#S[@]} -ge 2 ] && [ -f "$PRE" ] && [ ! -e "$DIRLOG/.faixa2-desligada" ]; then
    local TODAS=1 c TP
    for c in $($GIT -C "$INT" rev-list --reverse "$B0..$PAI"); do grep -qx "$($GIT -C "$INT" rev-parse "$c^{tree}")" "$PRE" || { TODAS=0; break; }; done
    if [ $TODAS = 1 ]; then
      for c in $($GIT -C "$INT" rev-list --reverse "$B0..$PAI"); do $GIT -C "$INT" rev-parse "$c^{tree}"; done > "$ARVORES"
      TP="$($GIT -C "$INT" rev-parse "$PAI^{tree}")"
      if [ -f "$DIRLOG/.ci-pre-$TP.txt" ]; then cp -f "$DIRLOG/.ci-pre-$TP.txt" "$DIRLOG/.ci-lote-ponta.txt"; else rm -f "$DIRLOG/.ci-lote-ponta.txt"; fi
      log "lote: ${#S[@]} cartões JÁ VERIFICADOS pela faixa 2 (ponta ${PAI:0:9}); entram sem repetir a verificação"
      PRONTOS=("${S[@]}" "${O[@]}")
      $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null; $GIT -C "$INT" checkout --quiet --detach "$B0" 2>/dev/null
      return 0
    fi
  fi
  if [ ${#S[@]} -ge 2 ]; then
    T0=$(date +%s); log "lote: verificando ${#S[@]} cartões aprovados de uma vez (ponta ${PAI:0:9})"
    if timeout 1500 zapp-verify full "$INT" >"$DIRLOG/.verificacao-do-lote.log" 2>&1 9>&- || reteste_isolado "$DIRLOG/.verificacao-do-lote.log" "$B0"; then
      CIB="$DIRLOG/.ci-base-${ESPV}-${B0}.txt"
      if [ ! -f "$CIB" ]; then
        $GIT -C "$INT" checkout --quiet --detach "$B0"; "$DIRLOG/ci_espelho.sh" "$INT" > "$CIB.tmp" 9>&- && mv "$CIB.tmp" "$CIB"
        $GIT -C "$INT" checkout --quiet --detach "$PAI"
      fi
      "$DIRLOG/ci_espelho.sh" "$INT" > "$DIRLOG/.ci-lote-ponta.txt" 9>&-
      if [ -z "$(comm -23 <(sed '/^$/d' "$DIRLOG/.ci-lote-ponta.txt" | sort -u) <(sed '/^$/d' "$CIB" 2>/dev/null | sort -u) | head -1)" ]; then
        for c in $($GIT -C "$INT" rev-list --reverse "$B0..$PAI"); do $GIT -C "$INT" rev-parse "$c^{tree}"; done > "$ARVORES"
        log "lote: VERDE em $(( $(date +%s) - T0 ))s — ${#S[@]} cartões entram sem repetir a verificação"
      else
        # 05/10 20:30: guarda o que falhou (antes apagava e ninguém sabia qual cartão quebrou o lote)
        NOVAS="$(comm -23 <(sed '/^$/d' "$DIRLOG/.ci-lote-ponta.txt" | sort -u) <(sed '/^$/d' "$CIB" 2>/dev/null | sort -u) | head -5 | tr '\n' ';')"
        cp -f "$DIRLOG/.ci-lote-ponta.txt" "$DIRLOG/.ci-lote-falhou-$(date +%H%M).txt" 2>/dev/null
        log "lote: o espelho do CI acusou falha nova na pilha (${NOVAS:-?}); bissecção para achar o prefixo verde"
        bissecao espelho || { rm -f "$ARVORES" "$DIRLOG/.ci-lote-ponta.txt"; log "bissecção: nenhum prefixo verde; os cartões seguem um a um"; }
      fi
    else
      log "lote: VERMELHO em $(( $(date +%s) - T0 ))s (ver $DIRLOG/.verificacao-do-lote.log); bissecção para achar o prefixo verde"
      CIB="$DIRLOG/.ci-base-${ESPV}-${B0}.txt"
      if [ ! -f "$CIB" ]; then
        $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null; $GIT -C "$INT" checkout --quiet --detach "$B0"
        "$DIRLOG/ci_espelho.sh" "$INT" > "$CIB.tmp" 9>&- && mv "$CIB.tmp" "$CIB"
      fi
      bissecao full || { rm -f "$ARVORES" "$DIRLOG/.ci-lote-ponta.txt"; log "bissecção: nenhum prefixo verde; os cartões seguem um a um"; }
    fi
    PRONTOS=("${S[@]}" "${O[@]}")     # a ordem do laço principal tem de ser a da pilha
  fi
  $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null; $GIT -C "$INT" checkout --quiet --detach "$B0" 2>/dev/null
  return 0
}
# QA3-B A3 (05/10): base marcada vermelha → antes, cada rodada refazia lote + cartão + base (2 a 3 verificações completas) só
# para parar de novo, sem aviso. Agora: marcador recente = sai na hora; marcador vencido (15 min) = reverifica SÓ a base.
if [ $DRY != 1 ] && [ $SO_PORTAO != 1 ] && [ ${#PRONTOS[@]} -gt 0 ]; then
  DIAV="$($GIT -C "$REF" for-each-ref --format='%(refname:short)' 'refs/heads/dia/*' | sort | tail -1)"; TIPV="$($GIT -C "$REF" rev-parse "$DIAV" 2>/dev/null)"
  MKV="$DIRLOG/.base-vermelha-$TIPV"
  if [ -n "$TIPV" ] && [ -e "$MKV" ]; then
    if [ -n "$(find "$MKV" -mmin -15 2>/dev/null)" ]; then echo "base $DIAV @ ${TIPV:0:9} vermelha (marcador recente); nada a fazer nesta rodada"; exit 0; fi
    $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null; $GIT -C "$INT" checkout --quiet --detach "$TIPV"
    if timeout 1200 zapp-verify full "$INT" >"$DIRLOG/.verificacao-da-base.log" 2>&1 9>&- || reteste_isolado "$DIRLOG/.verificacao-da-base.log"; then
      rm -f "$MKV"; : > "$DIRLOG/.base-verde-$TIPV"; log "a BASE ($DIAV @ ${TIPV:0:9}) voltou a ficar verde; integração retomada"
    else
      touch "$MKV"; NV="$(( $(cat "$MKV" 2>/dev/null || echo 0) + 1 ))"; echo "$NV" > "$MKV"
      log "a BASE ($DIAV @ ${TIPV:0:9}) continua VERMELHA (${NV}ª reverificação); ${#PRONTOS[@]} cartões aguardando — $(grep -E '^FALHOU' "$DIRLOG/.verificacao-da-base.log" | head -2 | tr '\n' ' ' | cut -c1-200)"
      [ "$NV" = 2 ] && printf '\n## %s — BASE DO DIA VERMELHA há mais de 30 min\n%s cartões prontos não integram enquanto %s (%s) falhar na verificação completa. Ver %s\n' \
        "$(date '+%d/%m %H:%M')" "${#PRONTOS[@]}" "$DIAV" "${TIPV:0:9}" "$DIRLOG/.verificacao-da-base.log" >> "/mnt/c/Users/Joaquim Ataides/Desktop/V2_ALERTAS.md" 2>/dev/null
      exit 0
    fi
  fi
fi
[ $DRY = 1 ] || [ $SO_PORTAO = 1 ] || [ "${V2_LOTE:-1}" != 1 ] || [ ${#PRONTOS[@]} -lt 2 ] || lote_otimista

for f in "${PRONTOS[@]}"; do
  if [ $DRY != 1 ] && [ -z "$APROVAR" ] && [ $(( $(date +%s) - T_RODADA )) -gt 2100 ]; then
    log "orçamento de tempo da rodada esgotado (35 min); os cartões restantes ficam para a próxima rodada, sem perder verificação"; break
  fi
  # 06/10: a lista foi lida no começo da rodada; o pré-portão ou o revisor podem ter mudado o item desde então
  [ "$(campo "$f" estado)" = "pronto" ] || continue
  ID="$(campo "$f" id)"; BR="$(campo "$f" branch)"; DIA="$(campo "$f" base_dia)"; SHA="$(campo "$f" sha)"
  export MARCA_SHA="$SHA"      # 06/10 (auditoria A2): ver marca()
  ALVO="$($GIT -C "$REF" for-each-ref --sort=-refname --format='%(refname:short)' 'refs/heads/dia/' | head -1)"
  if [ -n "$ALVO" ] && [ "$ALVO" != "$DIA" ] && echo "$DIA" | grep -Eq '^dia/[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
    # QA1-02/QA3-04: entrega com base de um dia anterior entra na branch do dia MAIS NOVA (que nasceu da ponta da antiga)
    if $GIT -C "$REF" merge-base --is-ancestor "$DIA" "$ALVO"; then DIA="$ALVO"
    else echo "$(date -Is) $ID: $DIA tem commits que $ALVO não tem; integro em $DIA" >> "$LOG"; fi
  fi
  TIT="$(campo "$f" titulo | tr -d '\r' | head -c 100)"; RELATO="$(campo "$f" relato)"
  falha() { log "$ID: $1"; [ $DRY = 1 ] || marca "$f" "${2:-falhou}" "$1"; }
  # ---- revalidação a partir do git (a fila não é confiável) ----
  echo "$ID" | grep -Eq "$RX_ID" || { falha "id inválido"; continue; }
  [ "$(basename "$f" .json)" = "$ID" ] || { falha "nome do arquivo não bate com o id"; continue; }
  echo "$BR" | grep -Eq "^v2(-devin)?/[a-z0-9-]+-${ID}\$" || { falha "branch '$BR' não é de tarefa V2 deste id"; continue; }
  echo "$DIA" | grep -Eq "$RX_DIA" || { falha "base '$DIA' não é uma branch do dia"; continue; }
  echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || { falha "sha inválido"; continue; }
  $GIT -C "$REF" show-ref --verify --quiet "refs/heads/$DIA" || { falha "$DIA não existe"; continue; }
  $GIT -C "$REF" rev-parse -q --verify "$SHA^{commit}" >/dev/null || { falha "commit $SHA não existe"; continue; }
  [ "$($GIT -C "$REF" rev-parse "$BR" 2>/dev/null)" = "$SHA" ] || { falha "a branch da tarefa andou depois do fechar"; continue; }
  [ "$($GIT -C "$REF" rev-list --count --merges "$DIA..$SHA")" = 0 ] || { falha "a tarefa tem commit de merge (não aceito)"; continue; }
  N="$($GIT -C "$REF" rev-list --count "$DIA..$SHA")"; { [ "$N" -ge 1 ] && [ "$N" -le 30 ]; } || { falha "número de commits fora do esperado ($N)"; continue; }
  if $GIT -C "$REF" log -p --text --no-textconv --no-ext-diff --format= "$DIA..$SHA" | grep -E '^\+' | grep -qE \
     'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{35}|postgres(ql)?://[^:@/ ]+:[^@/ ]{6,}@|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|sb_(secret|publishable)_[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|tnnnlkbymytvtqngbbqh'; then
    falha "o diff contém token/chave ou o ref de produção"; continue; fi
  if $GIT -C "$REF" diff --name-only --diff-filter=A "$DIA...$SHA" | grep -qE '(^|/)\.env($|\.)|\.pem$|\.key$|id_rsa|id_ed25519'; then
    falha "o cartão adiciona arquivo com cara de segredo"; continue; fi
  COL=""
  while IFS= read -r m; do
    case "$m" in supabase/migrations/[0-9]*.sql) ;; *) continue ;; esac
    v="$(basename "$m")"; v="${v%%_*}"
    o="$($GIT -C "$REF" ls-tree --name-only "$DIA" supabase/migrations/ | grep "^supabase/migrations/${v}_" | grep -vx "$m" | head -1 || true)"
    [ -n "$o" ] && COL="$m × $o"
  done < <($GIT -C "$REF" diff --name-only --diff-filter=AR "$DIA...$SHA")
  [ -z "$COL" ] || { falha "colisão de versão de migration: $COL" conflito; continue; }
  # ---- portão de saída (pulado só com aprovação do Claude para ESTE sha, em pasta protegida) ----
  APROVADO=0; [ -f "$APROV/$ID" ] && grep -qx "sha=$SHA" "$APROV/$ID" && APROVADO=1
  if [ $APROVADO = 0 ]; then
    PORTAO="$(python3 "$HOME/arquitetura-v2/jev/portao_saida.py" "$REF" "$DIA" "$SHA" "$RELATO" 2>/dev/null | tail -1)"
    DEC="$(printf '%s' "$PORTAO" | python3 -c "import json,sys
try: print(json.loads(sys.stdin.read())['decisao'])
except Exception: print('revisar')")"
    if [ "$DEC" != "integrar" ]; then falha "RETIDO pelo portão — ${PORTAO:-portão sem resposta}" revisao; continue; fi
  fi
  [ $SO_PORTAO = 1 ] && continue      # pré-portão: nunca integra
  if [ $DRY = 1 ]; then log "DRY $ID: integraria $BR (${SHA:0:9}) em $DIA — $TIT"; continue; fi
  # ---- integração desacoplada ----
  if [ ! -e "$INT/.git" ]; then
    $GIT -C "$REF" worktree add --quiet --detach "$INT" "$DIA" || { falha "não consegui criar a worktree do integrador"; continue; }
    [ -e "$INT/node_modules" ] || ln -s "$REF/node_modules" "$INT/node_modules"
    log "integrador: worktree criada em $INT"
  fi
  BASE_SHA="$($GIT -C "$REF" rev-parse "$DIA")"
  $GIT -C "$INT" reset --quiet --hard 2>/dev/null; $GIT -C "$INT" clean -fdq 2>/dev/null   # limpa sobras (mantém ignorados)
  $GIT -C "$INT" checkout --quiet --detach "$BASE_SHA" && $GIT -C "$INT" reset --quiet --hard "$BASE_SHA" \
    || { falha "worktree do integrador em estado ruim"; continue; }
  if ! $GIT -C "$INT" merge --squash --quiet "$SHA" >/dev/null 2>&1; then
    CONF="$($GIT -C "$INT" diff --name-only --diff-filter=U | tr '\n' ' ')"
    $GIT -C "$INT" reset --quiet --hard "$BASE_SHA"; $GIT -C "$INT" clean -fdq
    falha "CONFLITO com $DIA em: ${CONF:-?}" conflito; continue
  fi
  if $GIT -C "$INT" diff --cached --quiet; then
    $GIT -C "$INT" reset --quiet --hard "$BASE_SHA"; falha "nada a commitar (o conteúdo já está na branch do dia)" vazio; continue
  fi
  # commit SEM os hooks do próprio cartão (QA2: core.hooksPath apontava para o conteúdo do cartão)
  if ! $GIT -C "$INT" -c core.hooksPath=/dev/null commit --quiet --no-verify -m "$TIT" -m "Cartão V2: $ID (branch $BR @ ${SHA:0:9})"; then
    $GIT -C "$INT" reset --quiet --hard "$BASE_SHA"; falha "o commit falhou"; continue
  fi
  NOVO="$($GIT -C "$INT" rev-parse HEAD)"
  # 05/10 (QA5-03/04): cartão com migration → (a) dependência declarada "-- Depende: <versão>" tem de já estar na
  # branch do dia; (b) as migrations são EXECUTADAS de verdade num banco local do integrador antes de entrar.
  MIGS="$($GIT -C "$INT" diff --name-only --diff-filter=AM "$BASE_SHA" "$NOVO" -- supabase/migrations | tr '\n' ' ')"
  if [ -n "$MIGS" ]; then
    FALTA=""
    for m in $MIGS; do
      for dep in $(grep -hoiE '^--[[:space:]]*Depende:[[:space:]]*[0-9]{14}' "$INT/$m" 2>/dev/null | grep -oE '[0-9]{14}'); do
        ls "$INT"/supabase/migrations/${dep}_*.sql >/dev/null 2>&1 || FALTA="$FALTA $dep"
      done
    done
    if [ -n "$FALTA" ]; then
      $GIT -C "$INT" reset --quiet --hard "$BASE_SHA"; $GIT -C "$INT" clean -fdq
      log "$ID: aguarda dependência de migration ($FALTA ) entrar em $DIA; fica pronto"; continue
    fi
    BANCO_OK=1; UPLOG="$DIRLOG/.ultimo-up-banco.log"
    zapp-db-local down "$INT" v2-integrador >/dev/null 2>&1 || true
    timeout 1200 zapp-db-local up "$INT" v2-integrador >"$UPLOG" 2>&1 || true
    FAL="$HOME/.local/share/zapp-local/stacks/v2-integrador/estado/falhas.tsv"
    # 05/10 09:20: cada checagem diz POR QUE reprovou (a 1ª reprovação real saiu com motivo vazio) e a prova fica no log
    MOTBD=""
    for m in $MIGS; do [ -f "$FAL" ] && grep -q "$(basename "$m")" "$FAL" && { BANCO_OK=0; MOTBD="$MOTBD a migration $(basename "$m") FALHOU ao aplicar: $(grep "$(basename "$m")" "$FAL" | head -1 | cut -c1-300);"; }; done
    grep -qE '^ERRO:' "$UPLOG" && { BANCO_OK=0; MOTBD="$MOTBD $(grep -E '^(ERRO|ERROR):' "$UPLOG" | tail -1 | cut -c1-200);"; }
    LST="$(zapp-db-local list 2>&1)"
    echo "$LST" | grep -qE '"name":"v2-integrador"|(^|[ |])v2-integrador +\|.*\| +reachable( |$)' || { BANCO_OK=0; MOTBD="$MOTBD o conjunto v2-integrador não ficou de pé (infra do integrador, não do cartão);"; INFRABD=1; }
    { echo "=== falhas.tsv ==="; cat "$FAL" 2>/dev/null | tail -30; echo "=== list ==="; echo "$LST" | head -c 1500; } >> "$UPLOG"
    if [ "$BANCO_OK" != 1 ]; then
      zapp-db-local down "$INT" v2-integrador >/dev/null 2>&1 || true
      $GIT -C "$INT" reset --quiet --hard "$BASE_SHA"; $GIT -C "$INT" clean -fdq
      cp "$UPLOG" "$DIRLOG/verificacoes/$ID-banco-$(date +%H%M%S).log" 2>/dev/null
      if [ "${INFRABD:-0}" = 1 ] && ! echo "$MOTBD" | grep -q "FALHOU ao aplicar"; then
        INFRABD=0; log "$ID: banco do integrador não subiu (infra); o cartão fica pronto para a próxima rodada —$MOTBD"; continue
      fi
      falha "migration NÃO passou no banco local do integrador:$MOTBD"; continue
    fi
  fi
  # portão FINAL (auditoria 04/10): verificação COMPLETA — tipos, lint, migrations, testes unitários e build
  # QA3-09: verificação com tempo máximo (travada = falha registrada, não fila presa) e sem herdar a trava (9>&-)
  # com migration, o conjunto v2-integrador está de pé: a verificação completa inclui o banco (zapp-verify <cópia> <nome>)
  NOMEBD=""; [ -n "$MIGS" ] && NOMEBD="v2-integrador"
  ARV="$($GIT -C "$INT" rev-parse "$NOVO^{tree}")"; PREVER=0
  [ -z "$MIGS" ] && [ -f "$ARVORES" ] && grep -qx "$ARV" "$ARVORES" && PREVER=1
  if [ $PREVER = 1 ]; then VRC=0    # mesma árvore que o lote verificou: não repete
  else timeout 1200 zapp-verify full "$INT" $NOMEBD >"$DIRLOG/.ultima-verificacao.log" 2>&1 9>&-; VRC=$?; fi
  if [ $VRC != 0 ] && [ -n "$NOMEBD" ]; then
    # com banco no portão, falha de LEITURA da produção (zapp-db-ler: rede/sessão) vira vermelho por regra estrita do
    # zapp-verify — uma segunda tentativa separa oscilação de rede de defeito do cartão
    sleep 20; timeout 1200 zapp-verify full "$INT" $NOMEBD >"$DIRLOG/.ultima-verificacao.log" 2>&1 9>&-; VRC=$?
  fi
  if [ $VRC != 0 ] && [ $PREVER = 0 ] && reteste_isolado "$DIRLOG/.ultima-verificacao.log" "$BASE_SHA"; then
    log "$ID: os testes que falharam passaram quando rodados sozinhos (instáveis sob carga); verificação aceita"; VRC=0
  fi
  [ -n "$MIGS" ] && { zapp-db-local down "$INT" v2-integrador >/dev/null 2>&1 || true; }
  if [ $VRC = 0 ]; then
    # 05/10: ESPELHO DO CI do GitHub (testes Deno das Edges + guardas node) — o que o zapp-verify não roda. Só reprova
    # falha NOVA em relação à base (a lista da base fica em cache por sha).
    CIB="$DIRLOG/.ci-base-${ESPV}-${BASE_SHA}.txt"
    if [ $PREVER = 1 ]; then
      NOVAS=""   # o espelho rodou na ponta do lote; a lista da ponta vira a base do próximo cartão
      if [ "$(tail -1 "$ARVORES")" = "$ARV" ] && [ -f "$DIRLOG/.ci-lote-ponta.txt" ]; then cp "$DIRLOG/.ci-lote-ponta.txt" "$DIRLOG/.ci-novo.txt"; else rm -f "$DIRLOG/.ci-novo.txt"; fi
    else
    if [ ! -f "$CIB" ]; then
      $GIT -C "$INT" checkout --quiet --detach "$BASE_SHA"; "$DIRLOG/ci_espelho.sh" "$INT" > "$CIB.tmp" 9>&- && mv "$CIB.tmp" "$CIB"
      $GIT -C "$INT" checkout --quiet --detach "$NOVO"
    fi
    "$DIRLOG/ci_espelho.sh" "$INT" > "$DIRLOG/.ci-novo.txt" 9>&-
    NOVAS="$(comm -23 <(sed '/^$/d' "$DIRLOG/.ci-novo.txt" | sort -u) <(sed '/^$/d' "$CIB" 2>/dev/null | sort -u) | head -5)"
    fi
    if [ -n "$NOVAS" ]; then
      $GIT -C "$INT" reset --quiet --hard "$BASE_SHA"; $GIT -C "$INT" clean -fdq
      falha "teste que o CI do GitHub roda passou a FALHAR com este cartão: $(echo "$NOVAS" | tr '\n' ';' | cut -c1-300) — rode: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 <arquivo>"; continue
    fi
    [ -f "$DIRLOG/.ci-novo.txt" ] && cp "$DIRLOG/.ci-novo.txt" "$DIRLOG/.ci-base-${NOVO}.txt"; ls -t "$DIRLOG"/.ci-base-*.txt 2>/dev/null | tail -n +8 | xargs -r rm -f
    if $GIT -C "$REF" update-ref "refs/heads/$DIA" "$NOVO" "$BASE_SHA"; then
      log "$ID: INTEGRADO em $DIA como ${NOVO:0:9}$([ $PREVER = 1 ] && echo ' (lote)') — $TIT"; marca "$f" integrado "${NOVO:0:9}"
      # 05/10 (QA5-01): o roteiro do lote de produção é escrito na hora, não de memória no dia do push
      EDG="$($GIT -C "$REF" diff --name-only "$BASE_SHA" "$NOVO" -- supabase/functions | cut -d/ -f3 | sort -u | tr '\n' ' ')"
      if [ -n "$MIGS$EDG" ]; then
        printf -- '- %s | %s | %s | migrations: %s| edges: %s\n' "$(date +%F\ %H:%M)" "${NOVO:0:9}" "$TIT" "${MIGS:-— }" "${EDG:-—}" >> "$HOME/arquitetura-v2/LOTE_AUTOMATICO.md"
      fi
    else
      log "$ID: $DIA mudou durante a verificação; fica pronto para a próxima rodada"
    fi
  else
    mkdir -p "$DIRLOG/verificacoes"; VLOG="$DIRLOG/verificacoes/$ID-$(date +%H%M%S).log"; cp "$DIRLOG/.ultima-verificacao.log" "$VLOG" 2>/dev/null
    # o log do zapp-verify é só o resumo; o erro de verdade está no log do passo que falhou → anexa o fim dele
    for PL in $(grep -oE '\(ver [^)]+\.log\)' "$VLOG" 2>/dev/null | sed 's/^(ver //; s/)$//' | head -3); do
      [ -f "$PL" ] && { echo; echo "=== fim de $PL ==="; sed 's/\x1b\[[0-9;]*[A-Za-z]//g' "$PL" | grep -vE '^\s*$' | tail -60; } >> "$VLOG"
    done
    ls -t "$DIRLOG"/verificacoes/*.log 2>/dev/null | tail -n +60 | xargs -r rm -f
    $GIT -C "$INT" reset --quiet --hard "$BASE_SHA"; $GIT -C "$INT" clean -fdq
    # QA1-03: antes de culpar o cartão, confere UMA vez se a própria base está verde (base quebrada/ambiente fora
    # não pode virar retrabalho em série)
    BOK="$DIRLOG/.base-verde-$BASE_SHA"; BRED="$DIRLOG/.base-vermelha-$BASE_SHA"
    find "$DIRLOG" -maxdepth 1 -name '.base-vermelha-*' -mmin +15 -delete 2>/dev/null   # vermelho vale 15 min: nunca trava para sempre
    if [ ! -e "$BOK" ] && [ ! -e "$BRED" ]; then
      if timeout 1200 zapp-verify full "$INT" >"$DIRLOG/.verificacao-da-base.log" 2>&1 9>&- || reteste_isolado "$DIRLOG/.verificacao-da-base.log"; then : > "$BOK"; else : > "$BRED"; fi
      ls -t "$DIRLOG"/.base-verde-* "$DIRLOG"/.base-vermelha-* 2>/dev/null | tail -n +10 | xargs -r rm -f
    fi
    if [ -e "$BRED" ]; then
      log "$ID: a BASE ($DIA @ ${BASE_SHA:0:9}) já está vermelha na verificação completa; rodada interrompida sem culpar cartões (ver $DIRLOG/.verificacao-da-base.log)"
      break
    fi
    # 05/10 (J4-01/05): só DEPOIS de saber que a base está verde decide-se entre "tentar de novo" e "devolver".
    # (a) regra fixa: os testes que falharam NÃO estão entre os arquivos do cartão (falha alheia/instável — foram
    #     assim as 2 devoluções injustas de hoje); (b) juiz barato (Jev) vê ambiente/instabilidade, agora com a lista
    #     de arquivos do cartão. Em qualquer dos dois: fica "pronto" e tenta de novo na próxima rodada (máx. 2).
    ARQS_CARTAO="$($GIT -C "$REF" diff --name-only "$BASE_SHA" "$NOVO" 2>/dev/null)"
    TESTES_FALHOS="$(sed 's/\x1b\[[0-9;]*[A-Za-z]//g' "$VLOG" | grep -E 'FAIL|✗|×|failed|Error' | grep -oE '[A-Za-z0-9_./@-]+\.(test|spec)\.(tsx?|mjs|js)' | sort -u)"
    ALHEIA=0
    if [ -n "$TESTES_FALHOS" ] && [ -z "$(comm -12 <(echo "$TESTES_FALHOS" | sed 's|^\./||' | sort -u) <(echo "$ARQS_CARTAO" | sort -u))" ]; then ALHEIA=1; fi
    printf '%s\n' "=== arquivos do cartao ===" "$ARQS_CARTAO" >> "$VLOG"
    read -r TIPOF RETRYF <<< "$(python3 "$HOME/arquitetura-v2/jev/classificar_falha.py" "$VLOG" 2>/dev/null)"
    TENT="$DIRLOG/.tentativas-$ID-${SHA:0:12}"; NT="$(cat "$TENT" 2>/dev/null || echo 0)"
    JEVRETRY=0; { [ "$TIPOF" = "environment" ] || [ "$TIPOF" = "flaky_timing" ] || [ "$TIPOF" = "pre_existing" ]; } \
      && python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) >= 0.5 else 1)" "${RETRYF:-0}" 2>/dev/null && JEVRETRY=1
    if { [ $ALHEIA = 1 ] || [ $JEVRETRY = 1 ]; } && [ "$NT" -lt 2 ]; then
      echo $((NT + 1)) > "$TENT"; ls -t "$DIRLOG"/.tentativas-* 2>/dev/null | tail -n +40 | xargs -r rm -f
      log "$ID: verificação falhou em teste alheio ao cartão ou por instabilidade (alheia=$ALHEIA, juiz=$TIPOF $RETRYF); nova tentativa na próxima rodada ($((NT + 1))/2)"; continue
    fi
    falha "verificação FALHOU depois de integrar (a base está verde, então a falha é deste cartão); desfeito. O que falhou: $(grep -E 'FALHOU|FAIL |✗|×|AssertionError|error TS|Error:' "$VLOG" | tail -6 | tr '\n' ' ' | cut -c1-420) (log completo: $VLOG)"
  fi
done
unset MARCA_SHA
# arquivos derivados (manifesto de deploy das Edge Functions): regenerados aqui, sem IA, para o CI do GitHub não reprovar
[ $SO_PORTAO = 1 ] || "$DIRLOG/derivados.sh" --com-trava 9>&- || true
exit 0
}
