#!/usr/bin/env bash
# seed-contatos-redesign-local.sh — RD-009
#
# Roda scripts/db/seed-contatos-redesign-local.sql (DML puro, NAO e migration) e
# confere o criterio de pronto do RD-009. Os contatos de teste existem SO no banco
# local: nunca em producao.
#
# USO
#   bash scripts/db/seed-contatos-redesign-local.sh                 # banco local da tarefa (padrao; sem URL/senha)
#   bash scripts/db/seed-contatos-redesign-local.sh --rollback      # tira os dados de teste (so o fixture local)
#   bash scripts/db/seed-contatos-redesign-local.sh --verificar     # so confere, nao grava nada
#   bash scripts/db/seed-contatos-redesign-local.sh --url "$SEED_DB_URL"  # URL explicita, so banco LOCAL
#   bash scripts/db/seed-contatos-redesign-local.sh --help
#
# Sem --url, o script executa direto no banco local da tarefa via `zapp-db-local psql`
# (lido do .hermes-tarefa): nenhuma URL e nenhuma senha aparece no repositorio nem no
# comando. Com --url (ou $SEED_DB_URL/$DATABASE_URL), a URL e de quem chama e vale SO
# para banco LOCAL — a trava abaixo recusa qualquer outra antes de conectar.
#
# RECUSA PRODUCAO: sem --url nao ha URL (vai direto ao conjunto local da tarefa).
# Com --url, aborta antes de conectar se ela citar o ref de producao, um host
# do Supabase, ou qualquer host que nao seja localhost/127.0.0.1/::1. O .sql tem outras
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

# ------------------------------------------------------------------ conexao
# Padrao (sem --url): executa direto no banco local da tarefa via `zapp-db-local psql`
# (SQL pelo stdin, como postgres, dentro do conjunto local). Nenhuma URL e nenhuma
# senha aparece no repositorio nem no comando.
# Com --url (ou $SEED_DB_URL/$DATABASE_URL): a URL e de quem chama e vale SO para banco
# LOCAL — a trava abaixo recusa qualquer outra antes de conectar.
if [ -z "$URL" ]; then
  [ -f .hermes-tarefa ] || { echo "ERRO: sem --url, rode dentro da tarefa (falta o .hermes-tarefa) com o banco local de pe." >&2; exit 2; }
  command -v zapp-db-local >/dev/null 2>&1 || { echo "ERRO: zapp-db-local nao encontrado no PATH." >&2; exit 2; }
  DB_LOCAL="$(sed -n 's/^DB_LOCAL=//p' .hermes-tarefa | head -1)"
  [ -n "$DB_LOCAL" ] || { echo "ERRO: .hermes-tarefa sem DB_LOCAL; suba o banco (zapp-db-local up) ou passe --url." >&2; exit 2; }
  PSQL=(zapp-db-local psql . "$DB_LOCAL" -X -q -v ON_ERROR_STOP=1)
  echo "== seed-contatos-redesign (RD-009) =="
  echo "banco local da tarefa: $DB_LOCAL (via zapp-db-local; sem URL/senha)"
else
  # ---------------------------------------------------- TRAVA: so banco local
  case "$URL" in
    *supabase*)   # qualquer host do provedor gerenciado = producao; so passa host local
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
  PSQL=(psql "$URL" -X -q -v ON_ERROR_STOP=1)
  echo "== seed-contatos-redesign (RD-009) =="
  echo "banco local: ${HOST}:${AUTORIDADE##*:}"
fi

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
