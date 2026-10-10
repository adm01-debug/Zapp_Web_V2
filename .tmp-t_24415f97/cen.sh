#!/usr/bin/env bash
# t_24415f97 — roda UM cenário. uso: cen.sh <novo|pristino> <A|B> <nome> [arquivos-de-fila...]
# Nenhum comando real de CI roda: zapp-verify/zapp-db-local são stubs que registram o argv efetivo.
# O REF é a cópia de referência (somente leitura). BASE_SHA/NOVO podem vir do ambiente.
set -uo pipefail
SB="/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_24415f97"
EX="$SB/extraido"; H="$SB/home"
IMPL="$1"; MODO="$2"; NOME="$3"; shift 3
export HOME="$H"
export STUB_LOG="$SB/out/$NOME-cmd.log"
export PATH="$H/.local/bin:$PATH"
export TMPDIR="$SB/tmp"; mkdir -p "$TMPDIR"
GIT=git; REF=/home/joaquim_ataides/projetos/Zapp_Web_V2
INT="$H/hermes-workspaces/Zapp_Web_V2/.integrador"
DIRLOG="$H/arquitetura-v2/integrador"; LOG="$SB/out/$NOME-integrar.log"
RX_ID='^[0-9a-f]{12,16}$'; RX_DIA='^dia/[0-9]{4}-[0-9]{2}-[0-9]{2}$'
DRY=0; SO_PORTAO=0
: > "$STUB_LOG"; : > "$LOG"
rm -f "$DIRLOG"/.base-verde-* "$DIRLOG"/.base-vermelha-*
. "$EX/cabecalho.sh"     # log(), campo()
. "$EX/reteste.sh"       # reteste_isolado()
[ "$IMPL" = novo ] && . "$EX/conferencia.sh"   # CONJUNTO_BASE, ponta_tem_migration(), conferir_base()

BASE_SHA="${BASE_SHA:-$(git -C "$REF" rev-parse dia/2026-10-04)}"
SHA_COM="$(git -C "$REF" rev-parse 689345d7f)"

if [ "$MODO" = A ]; then
  DIAV="$(git -C "$REF" for-each-ref --format='%(refname:short)' 'refs/heads/dia/*' | sort | tail -1)"
  TIPV="$(git -C "$REF" rev-parse "$DIAV")"
  MKV="$DIRLOG/.base-vermelha-$TIPV"
  touch -d '2 hours ago' "$MKV"          # marcador vencido: o bloco do ponto A reprocessa a base
  PRONTOS=(); for f in "$@"; do PRONTOS+=("$H/hermes-workspaces/.v2-fila/$f.json"); done
  echo "== cenario $NOME ($IMPL/pontoA) dia=$DIAV fila=$(printf '%s ' "${PRONTOS[@]##*/}")"
  if [ "$IMPL" = novo ]; then ( . "$EX/pontoA.sh" ); else
    RC=1; eval "$(cat "$EX/pristino-pontoA.cmd")" && RC=0; echo "   (referencia sem a correcao) rc=$RC"
  fi
  echo "   marcador .base-verde-${TIPV:0:9}: $([ -e "$DIRLOG/.base-verde-$TIPV" ] && echo CRIADO || echo ausente)"
else
  ID="${ID:-aaa111aaa222}"; NOVO="${NOVO:-$SHA_COM}"
  BOK="$DIRLOG/.base-verde-$BASE_SHA"; BRED="$DIRLOG/.base-vermelha-$BASE_SHA"
  PCT=$(git -C "$REF" diff --name-only --diff-filter=AM "$BASE_SHA...$NOVO" -- supabase/migrations | head -1)
  echo "== cenario $NOME ($IMPL/pontoB) ID=$ID base=${BASE_SHA:0:9} ponta=${NOVO:0:9} migration_na_ponta=${PCT:-(nenhuma)}"
  if [ "$IMPL" = novo ]; then ( . "$EX/pontoB.sh" ); else eval "$(cat "$EX/pristino-pontoB.linha")"; fi
  echo "   marcador: $([ -e "$BOK" ] && echo "base VERDE (.base-verde)" || echo "base VERMELHA (.base-vermelha)")"
fi
echo "   argv efetivo:"
sed 's/^/     /' "$STUB_LOG"
echo "   log do integrador (rota escolhida):"
grep -E 'conferida COM o conjunto|conferida sem banco' "$LOG" | sed 's/^/     /'
grep -E 'AVISO|VERIFY:' "$DIRLOG/.verificacao-da-base.log" 2>/dev/null | sed 's/^/     saida do stub: /'
