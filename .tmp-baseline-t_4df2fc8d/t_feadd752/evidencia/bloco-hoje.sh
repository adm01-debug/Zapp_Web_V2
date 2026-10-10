set -u
RAPIDO=0
case "${1:-}" in fast) RAPIDO=1; shift;; full) shift;; esac
W="$(cd "${1:-.}" && pwd)" || { echo "cópia não encontrada" >&2; exit 2; }
NOME="${2:-}"; [ "${NOME#--}" != "$NOME" ] && NOME=""
if [ "${*: -1}" = "--aceitar" ]; then echo "ERRO: --aceitar pede um arquivo" >&2; exit 2; fi
ACEITAR=""; ant=""
for a in "$@"; do [ "$a" = "--rapido" ] && RAPIDO=1; [ "$ant" = "--aceitar" ] && ACEITAR="$(realpath -- "$a")"; ant="$a"; done
# registros FORA da cópia, para não sujar o git status dela
LOG="$HOME/.local/state/zapp-verify/$(printf '%s' "$W" | md5sum | cut -c1-12)"; mkdir -p "$LOG"; RES="$LOG/resultado.txt"; : > "$RES"
echo "$W" > "$LOG/copia.txt"
T_INI=$(date +%s)
passo() {  # passo <nome> <comando...>
  local n="$1"; shift; local t0=$(date +%s)
  if ( cd "$W" && "$@" ) > "$LOG/$n.log" 2>&1; then
    printf 'OK      %-12s %4ss\n' "$n" "$(( $(date +%s)-t0 ))" | tee -a "$RES"
  else
    printf 'FALHOU  %-12s %4ss  (ver %s)\n' "$n" "$(( $(date +%s)-t0 ))" "$LOG/$n.log" | tee -a "$RES"
    tail -15 "$LOG/$n.log" | cut -c1-200
    echo "VERIFY: VERMELHO em $n ($(( $(date +%s)-T_INI ))s)" | tee -a "$RES"; exit 1
  fi
}
if [ -z "$NOME" ]; then
  # sem nome não existe conjunto: o banco NÃO foi verificado. Antes isto saía VERDE em silêncio.
  printf 'AVISO   %-12s NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)\n' banco_local | tee -a "$RES"
else
  passo travas zapp-db-local travas "$W" "$NOME"
  ST="$HOME/.local/share/zapp-local/stacks/$NOME/estado"
  # Migrations PENDENTES = arquivos da cópia cuja versão ainda não está no registro da PRODUÇÃO.
  # O corte por origin/main estava errado: o que falta subir é o que a produção não tem.
  LEDGER="$(zapp-db-ler "select string_agg(version, ',') as v from supabase_migrations.schema_migrations" 2>/dev/null | python3 -c "
import json,sys
t=sys.stdin.read(); i=t.find('{')
try: print(json.loads(t[i:])['rows'][0]['v'] or '')
except Exception: sys.exit(1)" 2>/dev/null)"; LEDGER_RC=$?
  if [ $LEDGER_RC -ne 0 ]; then LEDGER_OK=0; else LEDGER_OK=1; fi
  NOVAS_MIG="$(LEDGER="$LEDGER" LEDGER_OK="$LEDGER_OK" python3 - "$W" <<'PY'
import glob,os,sys
w=sys.argv[1]
if os.environ.get('LEDGER_OK')!='1': sys.exit(0)
prod=set(os.environ.get('LEDGER','').split(','))
for f in sorted(glob.glob(os.path.join(w,'supabase','migrations','*.sql'))):
    if os.path.basename(f).split('_')[0] not in prod: print(os.path.basename(f))
PY
)"
  if [ "$LEDGER_OK" = 0 ]; then
    printf 'AVISO   %-12s não consegui ler o registro da produção: vale a regra estrita\n' banco_local | tee -a "$RES"
  fi
  if [ -n "$ACEITAR" ]; then passo banco_local zapp-db-local check "$W" "$NOME" --aceitar "$ACEITAR"
  elif [ "$LEDGER_OK" = 1 ] && [ -z "$NOVAS_MIG" ]; then passo banco_local zapp-db-local check "$W" "$NOME"
  else
    t0=$(date +%s); zapp-db-local check "$W" "$NOME" > "$LOG/banco_local.log" 2>&1; rc=$?
    if [ $rc = 0 ]; then printf 'OK      %-12s %4ss\n' banco_local "$(( $(date +%s)-t0 ))" | tee -a "$RES"
    elif [ "$LEDGER_OK" = 1 ] && grep -q '^ESTRUTURA:' "$LOG/banco_local.log" && [ -f "$ST/copia.txt" ] && [ "$(cat "$ST/copia.txt")" = "$W" ]; then
      # só vira AVISO se: (a) toda migration pendente pode ter sido aplicada sem falha no conjunto desta cópia;
      # (b) toda diferença de estrutura é citada no texto de alguma migration pendente.
      MOTIVO="$(NOVAS="$NOVAS_MIG" W="$W" ST="$ST" python3 - <<'PY'
import os,re
w=os.environ['W']; st=os.environ['ST']; novas=[x for x in os.environ['NOVAS'].split('\n') if x]
falhas=open(os.path.join(st,'falhas.tsv'),encoding='utf-8').read() if os.path.exists(os.path.join(st,'falhas.tsv')) else ''
ruins=[n for n in novas if n in falhas]
if ruins: print('migration pendente falhou no conjunto: '+', '.join(ruins)); raise SystemExit(1)
texto=' '.join(open(os.path.join(w,'supabase','migrations',n),encoding='utf-8',errors='ignore').read().lower() for n in novas)
def explicada(l):
    # cada tipo de diferença tem a sua prova: objeto (coluna, índice, função...) ou papel (permissão)
    partes = l.split('|')
    tipo = partes[0]
    def cita(x):
        return bool(x) and re.search(r'\b' + re.escape(x) + r'\b', texto) is not None
    def nome_funcao(obj):
        m = re.match(r'f:([a-z_0-9]+)\(', obj + '(')
        return m.group(1) if m else ''
    if tipo == 'functions':
        return cita(nome_funcao(partes[1]) if len(partes) > 1 else '')
    if tipo in ('columns', 'indexes', 'constraints', 'defaults', 'policies', 'triggers'):
        if len(partes) < 2:
            return False
        obj = partes[1]
        if obj[:2] in ('r:', 't:', 'f:', 'i:'):
            obj = obj[2:]
        return cita(obj.split('(')[0].split('.')[-1])
    if tipo in ('relation_grants', 'routine_grants', 'schema_grants'):
        papel = (partes[2] if len(partes) > 2 else '').lower()
        if cita(papel):
            return True
        if tipo == 'routine_grants' and len(partes) > 1:
            return cita(nome_funcao(partes[1]))
        return False
    if tipo == 'default_grants':
        return 'default privileges' in texto
    return False
sem=[]
try: linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
except OSError: linhas=[]
for l in linhas:
    if not explicada(l): sem.append(l)
if sem: print('diferença não explicada por migration pendente: '+'; '.join(sem[:3])+(' (+%d)'%(len(sem)-3) if len(sem)>3 else '')); raise SystemExit(1)
print('ok')
PY
)"; RM=$?
      if [ $RM = 0 ] && [ "$MOTIVO" = ok ]; then
        printf 'AVISO   %-12s %4ss  %s — migration(s) pendente(s): %s; toda diferença é citada por elas (ver %s)\n' banco_local "$(( $(date +%s)-t0 ))" \
          "$(grep -m1 '^ESTRUTURA:' "$LOG/banco_local.log")" "$(printf '%s' "$NOVAS_MIG" | tr '\n' ' ')" "$LOG/banco_local.log" | tee -a "$RES"
      else
        printf 'FALHOU  %-12s %4ss  %s\n' banco_local "$(( $(date +%s)-t0 ))" "${MOTIVO:-diferença de estrutura não explicada}" | tee -a "$RES"
        echo "VERIFY: VERMELHO em banco_local ($(( $(date +%s)-T_INI ))s)" | tee -a "$RES"; exit 1
      fi
    else
      passo banco_local zapp-db-local check "$W" "$NOME"   # nem conseguiu comparar, ou conjunto de outra cópia: vermelho
    fi
  fi
fi
