#!/usr/bin/env bash
# t_8d3ddc95 - teste dos 3 ramos do bloco shell do zapp-verify (o que decide AVISO x FALHOU),
# com as strings MOTIVO REAIS produzidas pelo explicador embutido. Sem banco, sem producao.
set -u
teste() {  # teste <RM> <MOTIVO>
  local RM="$1" MOTIVO="$2"
  local DRIFT_N="${MOTIVO#*drift=}"; [ "$DRIFT_N" = "$MOTIVO" ] && DRIFT_N=0
  if [ $RM = 0 ] && [ "${MOTIVO%%|*}" = ok ] && [ "$DRIFT_N" = 0 ]; then
    echo "RAMO=AVISO  (todas citadas)                              MOTIVO=$MOTIVO"
  elif [ $RM = 0 ] && [ "${MOTIVO%%|*}" = ok ]; then
    echo "RAMO=AVISO  (drift pre-existente NAO debitado, drift=$DRIFT_N)   MOTIVO=$MOTIVO"
  else
    echo "RAMO=FALHOU (nota vermelha)                                MOTIVO=${MOTIVO:0:70}..."
  fi
}
echo "-- RM=0 MOTIVO=ok           (9 residuais: nenhuma sobrou)"
teste 0 "ok"
echo "-- RM=0 MOTIVO=ok|drift=2   (as 2 residuais viraram drift nao debitado)"
teste 0 "ok|drift=2"
echo "-- RM=1 MOTIVO=erro         (drift NOVO do cartao: 'sem' nao vazio)"
teste 1 "diferença não explicada por migration pendente: indexes|sonda_cartao.sonda_cartao_pkey"
echo
echo "ok: 3 ramos exercitados"
