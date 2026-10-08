#!/usr/bin/env bash
# seed-contatos-local.sh — CT-003
#
# Roda scripts/db/seed-contatos-local.sql (DML puro, NAO e migration) e confere o
# resultado. Os contatos de teste existem SO no banco local: nunca em producao.
#
# USO
#   SEED_DB_URL="<url-local>" bash scripts/db/seed-contatos-local.sh
#   bash scripts/db/seed-contatos-local.sh                 # descobre a URL pelo banco local da tarefa
#   bash scripts/db/seed-contatos-local.sh --rollback      # tira os dados de teste (so o fixture local)
#   bash scripts/db/seed-contatos-local.sh --verificar     # so confere, nao grava nada
#   bash scripts/db/seed-contatos-local.sh --help
#
# A URL tambem pode vir de $SEED_DB_URL (ou $DATABASE_URL). Sem --url e sem variavel,
# o script usa  `zapp-db-local env . <DB_LOCAL do .hermes-tarefa>`  — o banco local da
# tarefa, que ja traz o seed do ambiente (os 4 vendedores e a Fila Local).
#
# RECUSA PRODUCAO: aborta antes de conectar se a URL apontar para Supabase/producao
# ou sair da allow-list local (localhost/127.0.0.1/::1/0.0.0.0). A allow-list tambem
# recusa host/hostaddr na query da URI e varios hosts separados por virgula, porque
# o libpq pode trocar o destino real nesses casos. O .sql tem uma segunda trava:
# exige a marca de sessao `app.zapp_seed_contatos=on`, que so este wrapper liga —
# rodar o arquivo direto no psql falha de proposito.
#
# IDEMPOTENTE: no modo padrao roda 2x e confere que a contagem nao mudou. O modo
# --verificar so confere os 17 criterios ja gravados e nao aplica dados.

set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$AQUI/seed-contatos-local.sql"
URL="${SEED_DB_URL:-${DATABASE_URL:-}}"
MODO="seed"   # seed | verificar | rollback

uso() { sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --url)      URL="${2:-}"; shift 2 ;;
    --url=*)    URL="${1#--url=}"; shift ;;
    --rollback) MODO="rollback"; shift ;;
    --verificar|--check) MODO="verificar"; shift ;;
    -h|--help)  uso; exit 0 ;;
    *) echo "opcao desconhecida: $1 (veja --help)" >&2; exit 2 ;;
  esac
done

[ -f "$SQL" ] || { echo "ERRO: nao achei $SQL" >&2; exit 2; }

# ---------------------------------------------------------------- descobre a URL
if [ -z "$URL" ]; then
  if [ -f .hermes-tarefa ] && command -v zapp-db-local >/dev/null 2>&1; then
    DB_LOCAL="$(sed -n 's/^DB_LOCAL=//p' .hermes-tarefa | head -1)"
    if [ -n "$DB_LOCAL" ]; then
      ENV_LOCAL="$(zapp-db-local env . "$DB_LOCAL" 2>/dev/null || true)"
      URL="$(printf '%s
' "$ENV_LOCAL" | sed -n 's/^DB_URL=//p' | head -1)"
    fi
  fi
fi
[ -n "$URL" ] || { echo "ERRO: informe a URL do banco LOCAL (--url, \$SEED_DB_URL) ou rode dentro da tarefa com o banco local de pe." >&2; exit 2; }

# ------------------------------------------------------ TRAVA: so banco local
case "$URL" in
  *supabase.co*|*pooler.supabase.com*|*supabase.in*)
    echo "RECUSADO: a URL aponta para Supabase/producao. Este script so roda em banco LOCAL." >&2; exit 3 ;;
esac
URL_SEM_FRAGMENTO="${URL%%#*}"
QUERY=""
case "$URL_SEM_FRAGMENTO" in
  *\?*) QUERY="${URL_SEM_FRAGMENTO#*\?}"; URL_BASE="${URL_SEM_FRAGMENTO%%\?*}" ;;
  *) URL_BASE="$URL_SEM_FRAGMENTO" ;;
esac
QUERY_BAIXA="${QUERY,,}"
case "&$QUERY_BAIXA" in
  *"&host="*|*"&hostaddr="*)
    echo "RECUSADO: parametro host/hostaddr na query da URL pode desviar a conexao real. Use somente host local na autoridade da URI." >&2; exit 3 ;;
esac
AUTORIDADE="${URL_BASE#*://}"; [ "$AUTORIDADE" = "$URL_BASE" ] && AUTORIDADE="$URL_BASE"
AUTORIDADE="${AUTORIDADE%%/*}"
AUTORIDADE="${AUTORIDADE##*@}"
case "$AUTORIDADE" in
  *,*) echo "RECUSADO: URL com multiplos hosts ('$AUTORIDADE'). Use um unico host local." >&2; exit 3 ;;
esac
if [[ "$AUTORIDADE" == \[* ]]; then
  HOST="${AUTORIDADE#\[}"
  HOST="${HOST%%\]*}"
else
  HOST="${AUTORIDADE%%:*}"
fi
[ -n "$HOST" ] || { echo "RECUSADO: host vazio na URL do banco." >&2; exit 3; }
case "$HOST" in
  localhost|127.0.0.1|::1|0.0.0.0) ;;
  *) echo "RECUSADO: host '$HOST' nao e local. Este script so roda em localhost/127.0.0.1/::1." >&2; exit 3 ;;
esac

command -v psql >/dev/null 2>&1 || { echo "ERRO: psql nao encontrado no PATH." >&2; exit 2; }

PSQL=(psql "$URL" -X -q -v ON_ERROR_STOP=1)

echo "== seed-contatos-local =="
echo "banco local permitido: ${HOST}"

if [ "$MODO" = "rollback" ]; then
  # Manutencao do FIXTURE local: apaga so o que este script criou (ids c7000000-* e a
  # fila auxiliar). Nao e funcionalidade do produto — o Zapp nao tem edicao em massa.
  "${PSQL[@]}" <<'SQL'
delete from public.contacts where id::text like 'c7000000-%';
delete from public.queues   where id = '00000000-0000-4000-8000-0000000000f2';
SQL
  "${PSQL[@]}" -At -c "select 'restantes=' || count(*) from public.contacts where id::text like 'c7000000-%';"
  echo "-- rollback concluido"
  exit 0
fi

aplicar() { { echo "set app.zapp_seed_contatos = 'on';"; cat "$SQL"; } | "${PSQL[@]}"; }

contagem() { "${PSQL[@]}" -At -c "select count(*) from public.contacts where id::text like 'c7000000-%';"; }

if [ "$MODO" = "seed" ]; then
  ANTES="$(contagem)"
  echo "-- 1a aplicacao (contatos de teste antes: $ANTES)"
  aplicar || { echo "ERRO: a aplicacao falhou." >&2; exit 1; }
  C1="$(contagem)"
  echo "-- 2a aplicacao (idempotencia)"
  aplicar || { echo "ERRO: a 2a aplicacao falhou." >&2; exit 1; }
  C2="$(contagem)"
  if [ "$C1" != "$C2" ]; then
    echo "ERRO: rodar 2x mudou a contagem ($C1 -> $C2): o script NAO e idempotente." >&2; exit 1
  fi
  echo "-- contagem: antes $ANTES | 1a aplicacao $C1 | 2a aplicacao $C2 (igual = idempotente)"
fi

# ------------------------------------------------------------------- conferencia
echo "-- conferindo o criterio de pronto"
TMP="$(mktemp "${TMPDIR:-/tmp}/seed-ct003-check.XXXXXX")"
"${PSQL[@]}" -At -F'|' > "$TMP" <<'SQL'
with s as (
  select * from public.contacts where id::text like 'c7000000-%'
), visiveis as (
  select * from s where deleted_at is null and is_lid_legacy = false and phone ~ '^[0-9]{10,15}$'
)
select 'total >= 150',            case when (select count(*) from s) >= 150 then 'OK' else 'FALHA' end
union all select '7 grupos de tipo', case when (select count(distinct coalesce(contact_type,'__sem_tipo__')) from s) >= 7 then 'OK' else 'FALHA' end
union all select 'com e-mail',      case when (select count(*) from s where email is not null) > 0 then 'OK' else 'FALHA' end
union all select 'sem e-mail',      case when (select count(*) from s where email is null) > 0 then 'OK' else 'FALHA' end
union all select 'sem empresa',     case when (select count(*) from s where company is null) > 0 then 'OK' else 'FALHA' end
union all select 'sem endereco',    case when (select count(*) from s where address is null) > 0 then 'OK' else 'FALHA' end
union all select 'nome com 60+ chars', case when (select count(*) from s where length(name) >= 60) > 0 then 'OK' else 'FALHA' end
union all select 'nome [E2E]',      case when (select count(*) from s where name like '[E2E]%') > 0 then 'OK' else 'FALHA' end
union all select 'nome com emoji',  case when (select count(*) from s where name ~ '[^[:ascii:]]') > 0 then 'OK' else 'FALHA' end
union all select '4 vendedores',    case when (select count(distinct assigned_to) from s) >= 4 then 'OK' else 'FALHA' end
union all select '2 filas',         case when (select count(distinct queue_id) from s where queue_id is not null) >= 2 then 'OK' else 'FALHA' end
union all select 'legados (LID)',   case when (select count(*) from s where is_lid_legacy) > 0 then 'OK' else 'FALHA' end
union all select 'excluidos',       case when (select count(*) from s where deleted_at is not null) > 0 then 'OK' else 'FALHA' end
union all select 'duplicado por e-mail', case when exists (select 1 from s where email is not null group by email having count(*) >= 2) then 'OK' else 'FALHA' end
union all select 'duplicado por telefone', case when exists (select 1 from s group by right(phone, 11) having count(*) >= 2) then 'OK' else 'FALHA' end
union all select 'E2E nao pula (>= 51 visiveis)', case when (select count(*) from visiveis) >= 51 then 'OK' else 'FALHA' end
union all select 'ids unicos',      case when (select count(*) from s) = (select count(distinct id) from s) then 'OK' else 'FALHA' end;
SQL
CHECKS="$(cat "$TMP")"; rm -f "$TMP"
printf '%s\n' "$CHECKS" | sed 's/|/ — /'
if printf '%s\n' "$CHECKS" | grep -q '|FALHA'; then
  echo "RESULTADO: FALHOU (veja as linhas FALHA acima)" >&2; exit 1
fi
echo "RESULTADO: OK — $(printf '%s\n' "$CHECKS" | grep -c '|OK') checagens verdes"
