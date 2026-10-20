# ================= CONFERÊNCIA DA BASE (06/10) =====================================================================
# Os dois pontos que conferem a BASE rodavam `zapp-verify full "$INT"` SEM nome de conjunto. Com a ponta trazendo
# migration isso equivale a não conferir o banco: o passo banco_local sai "AVISO NÃO VERIFICADO", a base parece verde
# e a primeira verificação COM banco cai em cima do cartão (medido em 05/10: 7 cartões com migration reprovados pelo
# MESMO drift da base — decisão 20261005-153846-cef4, pedido 1). Regra nova: se a ponta traz migration, a BASE é
# conferida com o conjunto fixo do integrador — o mesmo que o cartão com migration usa no portão final; sem migration
# na ponta nada muda (segue sem banco, como sempre foi).
# "A ponta" é o que entra: no ponto B, o cartão que acabou de ser integrado; no ponto A, os cartões prontos que
# esperam a base voltar.
CONJUNTO_BASE="v2-integrador"
ponta_tem_migration() {   # $@ = pares "base|ponta" (base_dia|sha). 0 = alguma ponta traz migration
  local par b t
  for par in "$@"; do
    b="${par%%|*}"; t="${par##*|}"
    echo "$b" | grep -Eq "$RX_DIA|^[0-9a-f]{40}$" || continue
    echo "$t" | grep -Eq '^[0-9a-f]{40}$' || continue
    [ -n "$($GIT -C "$REF" diff --name-only --diff-filter=AM "$b...$t" -- supabase/migrations 2>/dev/null | head -1)" ] && return 0
  done
  return 1
}
conferir_base() {   # $1 = rótulo do log; demais = pares "base|ponta". 0 = base verde (ou resgatada pelo reteste)
  local ROT="$1"; shift
  local NOME="" ARQ="$DIRLOG/.verificacao-da-base.log" RC
  if [ "$#" -gt 0 ] && ponta_tem_migration "$@"; then
    NOME="$CONJUNTO_BASE"
    log "$ROT: a ponta traz migration — BASE conferida COM o conjunto $NOME (sem nome de conjunto o banco_local ficaria só AVISO/NÃO VERIFICADO)"
    zapp-db-local down "$INT" "$NOME" >/dev/null 2>&1 || true
    timeout 1200 zapp-db-local up "$INT" "$NOME" >"$DIRLOG/.base-up-banco.log" 2>&1 \
      || log "$ROT: o conjunto $NOME não subiu limpo na árvore da base; a conferência segue com ele (ver $DIRLOG/.base-up-banco.log)"
  else
    log "$ROT: a ponta não traz migration — BASE conferida sem banco (banco_local fica AVISO/NÃO VERIFICADO, como sempre)"
  fi
  timeout 1200 zapp-verify full "$INT" $NOME >"$ARQ" 2>&1 9>&-; RC=$?
  [ -n "$NOME" ] && { zapp-db-local down "$INT" "$NOME" >/dev/null 2>&1 || true; }
  [ $RC = 0 ] && return 0
  reteste_isolado "$ARQ"
}
