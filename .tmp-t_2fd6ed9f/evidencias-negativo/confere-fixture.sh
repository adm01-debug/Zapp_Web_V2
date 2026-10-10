#!/usr/bin/env bash
# Prova, de forma independente do zapp-verify, que:
#  (a) os objetos do drift NOVO nao existem no retrato canonico do fixture;
#  (b) nao existem no texto de NENHUMA migration ja aplicada (base);
#  (c) o unico lugar onde nomes do cartao aparecem e a migration PENDENTE;
#  (d) o ledger do fixture marca so a migration do cartao como pendente.
set -u
EV="$(cd "$(dirname "$0")" && pwd)"
FIX="$EV/fixture"; W="$FIX/copia"; MIG="$W/supabase/migrations"
PEND="$MIG/20261007095739_cartao_drift_novo.sql"
NOMES="cartao_novo cartao_dinamico coluna_gerada cartao_novo_pkey coluna_injetada service_role"
echo "== (a) nomes no RETRATO canonico ($W/supabase/schema-manifest.json) =="
for n in $NOMES; do printf '   %-17s ocorrencias=%s\n' "$n" "$(grep -c "$n" "$W/supabase/schema-manifest.json" || true)"; done
echo
echo "== (b) nomes nas migrations JA APLICADAS (tudo menos a pendente) =="
echo "   arquivos: $(ls "$MIG" | grep -v 20261007095739 | tr '\n' ' ')"
for n in $NOMES; do
  c=0; for f in $(ls "$MIG" | grep -v 20261007095739); do c=$((c+$(grep -c "$n" "$MIG/$f" || true))); done
  printf '   %-17s ocorrencias=%s\n' "$n" "$c"
done
echo
echo "== (c) nomes na migration PENDENTE ($(basename $PEND)) =="
for n in $NOMES; do printf '   %-17s ocorrencias=%s\n' "$n" "$(grep -c "$n" "$PEND" || true)"; done
echo "   (a tabela cartao_novo e literal; os outros nomes sao montados por concatenacao em runtime)"
echo
echo "== (d) ledger do fixture decide o que e pendente =="
python3 - "$FIX/ledger-com-pendente.json" "$MIG" <<'PY'
import json,sys,os,glob
v=set(json.load(open(sys.argv[1]))['rows'][0]['v'].split(','))
for f in sorted(glob.glob(os.path.join(sys.argv[2],'*.sql'))):
    b=os.path.basename(f)
    print('   %-46s %s' % (b, 'PENDENTE' if b.split('_')[0] not in v else 'aplicada'))
PY
