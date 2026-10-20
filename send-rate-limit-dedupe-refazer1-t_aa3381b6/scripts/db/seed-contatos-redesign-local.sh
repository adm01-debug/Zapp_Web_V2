#!/usr/bin/env bash
# seed-contatos-redesign-local.sh — RD-009
#
# Roda scripts/db/seed-contatos-redesign-local.sql (DML puro, NAO e migration) e
# confere o criterio de pronto do RD-009. Os contatos de teste existem SO no banco
# local: nunca em producao.
#
# USO
#   bash scripts/db/seed-contatos-redesign-local.sh --url "$SEED_DB_URL"   # URL do banco LOCAL
#   bash scripts/db/seed-contatos-redesign-local.sh                 # descobre a URL pelo banco local da tarefa
#   bash scripts/db/seed-contatos-redesign-local.sh --rollback      # tira os dados de teste (so o fixture local)
#   bash scripts/db/seed-contatos-redesign-local.sh --verificar     # so confere, nao grava nada
#   bash scripts/db/seed-contatos-redesign-local.sh --help
#
# A URL tambem pode vir de $SEED_DB_URL (ou $DATABASE_URL). Sem --url e sem variavel,
# o script usa `zapp-db-local env . <DB_LOCAL do .hermes-tarefa>` — o banco local da
# tarefa, ja com as migrations aplicadas.
#
# RECUSA PRODUCAO: aborta antes de conectar se a URL citar um host do Supabase
# (producao) ou qualquer host que nao seja localhost/127.0.0.1/::1. O .sql tem outras
# duas travas: exige a marca de sessao `app.zapp_seed_contatos_redesign=on` (que so este
# wrapper liga) e recusa conexao de fora da rede local (inet_client_addr publico).
#
# IDEMPOTENTE: no modo seed roda 2x e confere que a contagem nao mudou.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$AQUI/seed-contatos-redesign-local.sql"
URL="${SEED_DB_URL:-${DATABASE_URL:-}}"
MODO="seed"   # seed | verificar | rollback

uso() { sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

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
      PORTA="$(zapp-db-local env . "$DB_LOCAL" 2>/dev/null | sed -n 's/.*# banco: 127\.0\.0\.1:\([0-9]\+\).*/\1/p' | head -1)"
      # a senha do banco local da ferramenta e a padrao 'postgres' (a URL do `env` vem mascarada);
      # vai em PGPASSWORD, para nao carregar credencial na URL
      [ -n "$PORTA" ] && URL="postgres://postgres@127.0.0.1:${PORTA}/postgres"
    fi
  fi
fi
[ -n "$URL" ] || { echo "ERRO: informe a URL do banco LOCAL (--url, \$SEED_DB_URL) ou rode dentro da tarefa com o banco local de pe." >&2; exit 2; }

# ------------------------------------------------------ TRAVA: so banco local
case "$URL" in
  *supabase*)   # cobre *.supabase.co, *.supabase.in, pooler.supabase.com etc. (producao)
    echo "RECUSADO: a URL aponta para o Supabase/producao. Este script so roda em banco LOCAL." >&2; exit 3 ;;
esac
AUTORIDADE="${URL#*://}"
AUTORIDADE="${AUTORIDADE%%/*}"
AUTORIDADE="${AUTORIDADE##*@}"
HOST="${AUTORIDADE%%:*}"
case "$HOST" in \[*\]) HOST="${HOST#[}"; HOST="${HOST%]}";; esac
case "$HOST" in
  localhost|127.0.0.1|::1|0.0.0.0) ;;
  *) echo "RECUSADO: host '$HOST' nao e local. Este script so roda em localhost/127.0.0.1." >&2; exit 3 ;;
esac

command -v psql >/dev/null 2>&1 || { echo "ERRO: psql nao encontrado no PATH." >&2; exit 2; }

# credencial do banco local: a padrao 'postgres' vai por PGPASSWORD (nunca na URL do repositorio).
# Se a propria --url trouxer senha, ela tem precedencia.
export PGPASSWORD="${SEED_DB_PASSWORD:-postgres}"

PSQL=(psql "$URL" -X -q -v ON_ERROR_STOP=1)

echo "== seed-contatos-redesign (RD-009) =="
echo "banco local: ${HOST}:${AUTORIDADE##*:}"

if [ "$MODO" = "rollback" ]; then
  # Manutencao do FIXTURE local: apaga so o que este script criou (ids d9000000-*).
  # Nao e funcionalidade do produto — o Zapp nao tem exclusao em massa de contatos.
  "${PSQL[@]}" <<'SQL'
delete from public.contacts where id::text like 'd9000000-%';
SQL
  "${PSQL[@]}" -At -c "select 'restantes=' || count(*) from public.contacts where id::text like 'd9000000-%';"
  echo "-- rollback concluido"
  exit 0
fi

aplicar() { { echo "set app.zapp_seed_contatos_redesign = 'on';"; cat "$SQL"; } | "${PSQL[@]}"; }

contagem() { "${PSQL[@]}" -At -c "select count(*) from public.contacts where id::text like 'd9000000-%';"; }

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
echo "-- conferindo o criterio de pronto (RD-009)"
CHECKS="$("${PSQL[@]}" -At -F'|' <<'SQL'
with s as (
  select * from public.contacts where id::text like 'd9000000-%'
), visiveis as (
  select * from s where deleted_at is null and is_lid_legacy = false and phone ~ '^[0-9]{10,15}$'
)
select '~40 contatos',              case when (select count(*) from s) between 38 and 45 then 'OK' else 'FALHA' end
union all select '7 grupos de tipo', case when (select count(distinct coalesce(contact_type,'__sem_tipo__')) from s) >= 7 then 'OK' else 'FALHA' end
union all select 'com e-mail',       case when (select count(*) from s where email is not null) > 0 then 'OK' else 'FALHA' end
union all select 'sem e-mail',       case when (select count(*) from s where email is null) > 0 then 'OK' else 'FALHA' end
union all select 'retrato SVG data URI (>=20)', case when (select count(*) from s where avatar_url like 'data:image/svg+xml,%') >= 20 then 'OK' else 'FALHA' end
union all select '6 variacoes de retrato', case when (select count(distinct avatar_url) from s where avatar_url like 'data:image/svg+xml,%') >= 6 then 'OK' else 'FALHA' end
union all select 'retrato quebrado = 3', case when (select count(*) from s where avatar_url like 'https://exemplo.invalid/%') = 3 then 'OK' else 'FALHA' end
union all select 'sem avatar (iniciais)', case when (select count(*) from s where avatar_url is null) > 0 then 'OK' else 'FALHA' end
union all select 'legado 16 digitos = 2', case when (select count(*) from s where is_lid_legacy and length(phone) = 16) = 2 then 'OK' else 'FALHA' end
union all select 'legado fora da lista', case when (select count(*) from s where is_lid_legacy) = (select count(*) from s where is_lid_legacy and phone !~ '^[0-9]{10,15}$') then 'OK' else 'FALHA' end
union all select 'telefone prefixo 5599000', case when (select count(*) from s where phone not like '5599000%') = 0 then 'OK' else 'FALHA' end
union all select 'nome curto (<=30)', case when (select count(*) from s where length(name) <= 30) > 0 then 'OK' else 'FALHA' end
union all select 'nome 60+ chars',   case when (select count(*) from s where length(name) >= 60) > 0 then 'OK' else 'FALHA' end
union all select 'nome [E2E]',       case when (select count(*) from s where name like '[E2E]%') > 0 then 'OK' else 'FALHA' end
union all select 'nome com emoji',   case when (select count(*) from s where name ~ '[^[:ascii:]]') > 0 then 'OK' else 'FALHA' end
union all select 'sem etiquetas (recurso removido)', case when (select count(*) from s where tags is not null and tags <> '{}') = 0 then 'OK' else 'FALHA' end
union all select 'ids unicos',       case when (select count(*) from s) = (select count(distinct id) from s) then 'OK' else 'FALHA' end
union all select 'visiveis na lista', case when (select count(*) from visiveis) between 36 and 43 then 'OK' else 'FALHA' end;
SQL
)"
printf '%s\n' "$CHECKS" | sed 's/|/ — /'
if printf '%s\n' "$CHECKS" | grep -q '|FALHA'; then
  echo "RESULTADO: FALHOU (veja as linhas FALHA acima)" >&2; exit 1
fi
echo "RESULTADO: OK — $(printf '%s\n' "$CHECKS" | grep -c '|OK') checagens verdes"
