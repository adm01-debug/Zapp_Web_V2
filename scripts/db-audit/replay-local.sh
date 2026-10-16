#!/usr/bin/env bash
# E24 - Replay LOCAL e descartavel das migrations (nunca no banco canonico).
#
# Sobe a imagem do Supabase (que traz roles, schemas auth e as extensoes), cria o bootstrap que
# os SERVICOS do Supabase trazem (storage, supabase_migrations, app.settings) e aplica todas as
# migrations em ordem, gravando o ERRO AO LADO DO ARQUIVO.
#
# Uso:   bash scripts/db-audit/replay-local.sh
# Saida: replay.log (resultado + histograma) e replay-erros.tsv (arquivo<TAB>erro) no CWD.
#
# Codigos de saida, DISTINTOS de proposito (R2-INF-014): o exit code precisa dizer a quem chama
# SE o replay chegou a medir as migrations.
#   0 = verde (nenhuma falha inesperada)
#   1 = drift novo (falha fora do allowlist) - ver replay-classify.py
#   2 = SETUP indisponivel (docker run, prontidao do postgres, bootstrap, trava de DNS ou do
#       agendador). O replay NAO mediu as migrations: nao e "verde" e nao e "drift".
#
# Licoes das rodadas anteriores (ver docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md):
#   1. NAO use um banco vazio: as extensoes so podem ser criadas no banco `postgres`, e sem o
#      bootstrap do Supabase o replay acusa centenas de falhas que NAO sao do repositorio.
#   2. Rode como `supabase_admin`: com o usuario `postgres` dezenas de migrations falham por
#      permissao, e o numero final nao significa nada.
#   3. O container tem NOME UNICO por run e um rotulo de posse (`hermes.e24.replay`). O cleanup
#      remove SO o container que este run criou. Nunca `docker rm -f` de nome fixo: apagaria o
#      container de outra execucao (R2-INF-014). O `trap` cobre saida normal, erro e sinal.
#   4. A imagem e fixada por DIGEST (indice multi-arch): a tag sozinha pode mudar de conteudo
#      sem aviso e o replay deixaria de reproduzir o que foi medido.
#
# Efeitos por arquivo: cada migration roda em um `psql` proprio, uma por vez, e NAO em transacao
# unica (sem `-1`): um arquivo que falha no meio pode deixar os statements ANTERIORES ja
# commitados. Por isso o classificador separa falha RAIZ (fora do allowlist) de CASCATA
# (consequencia de uma falha anterior, ja medida no canonico) - ver replay-known-failures.json.
set -u
# Id deste run: nome de container e valor do rotulo de posse saem dai.
RUN_ID="${REPLAY_RUN_ID:-$(date +%Y%m%d%H%M%S)-$$}"
# Nome UNICO por run: dois replays simultaneos nao competem pelo mesmo nome.
NOME="${REPLAY_NOME:-hermes-e24-replay-$RUN_ID}"
# Rotulo de posse: guarda o NOME do container deste run. So removemos container que traz ESTE rotulo.
ROTULO_CHAVE="hermes.e24.replay"
ROTULO_VALOR="$NOME"
PORTA="${REPLAY_PORTA:-5499}"
# Fixada por digest (indice multi-arch de 17.6.1.159): a tag sozinha nao garante o conteudo.
IMAGEM="${REPLAY_IMAGEM:-public.ecr.aws/supabase/postgres:17.6.1.159@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f}"
LOG="$PWD/replay.log"
ERROS="$PWD/replay-erros.tsv"

# Remove SOMENTE o container criado por este run. Se o nome existir mas o rotulo nao for o nosso,
# nao toca: pode ser de outra execucao. Seguro para rodar duas vezes (trap + caminho normal).
remover_nosso() {
  local dono
  dono=$(docker inspect --format "{{ index .Config.Labels \"$ROTULO_CHAVE\" }}" "$NOME" 2>/dev/null || true)
  if [ "$dono" = "$ROTULO_VALOR" ]; then
    docker rm -f "$NOME" >/dev/null 2>&1 || true
  fi
}
trap 'remover_nosso' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

: > "$LOG"; : > "$ERROS"

echo "subindo $NOME na porta $PORTA (imagem fixada por digest)" | tee -a "$LOG"
if ! docker run -d --name "$NOME" --label "$ROTULO_CHAVE=$ROTULO_VALOR" -e POSTGRES_PASSWORD=replay \
  -p "127.0.0.1:$PORTA:5432" "$IMAGEM" >>"$LOG" 2>&1; then
  echo "FALHA: nao consegui subir o container (docker run); o replay nao mediu nada" | tee -a "$LOG"
  exit 2
fi

PRONTO=0
for i in $(seq 1 90); do
  if docker exec "$NOME" pg_isready -U postgres >/dev/null 2>&1; then
    echo "postgres pronto (${i}s)" | tee -a "$LOG"; PRONTO=1; break
  fi
  sleep 1
done
if [ "$PRONTO" -ne 1 ]; then
  echo "FALHA: postgres nao ficou pronto em 90s; abortando sem aplicar migrations" | tee -a "$LOG"
  exit 2
fi
sleep 5

echo "bootstrap dos objetos que os servicos do Supabase trazem" | tee -a "$LOG"
SAIDA_BOOTSTRAP=$(docker exec -i "$NOME" psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 2>&1 <<'SQL'
create schema if not exists storage;
create table if not exists storage.buckets(
  id text primary key, name text not null, owner uuid, public boolean default false,
  avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects(
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), metadata jsonb, path_tokens text[], version text);
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare p text[]; begin p := string_to_array(name,'/'); return p[1:array_length(p,1)-1]; end $$;
create or replace function storage.filename(name text) returns text language plpgsql as $$
declare p text[]; begin p := string_to_array(name,'/'); return p[array_length(p,1)]; end $$;
create or replace function storage.extension(name text) returns text language plpgsql as $$
declare p text[]; begin p := string_to_array(name,'.'); return p[array_length(p,1)]; end $$;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(
  version text primary key, statements text[], name text);

-- Colunas de auth.users que as migrations referenciam (a imagem traz a tabela, mas nao todas
-- as colunas que o Supabase adiciona com o passar das versoes).
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists banned boolean not null default false;
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;

-- A imagem ja traz a publicacao supabase_realtime populada e o pg_cron funcionando. NAO mexer:
-- tentar recriar (`drop publication` + `create`) ou instalar (`create schema cron` +
-- `create extension pg_cron`) piora o resultado — medido em 03/10: quebrou o pg_cron da imagem
-- e levou 10 migrations a falhar com `cron.schedule(...) does not exist`.

alter database postgres set app.settings.trusted_domains = 'localhost,127.0.0.1';
SQL
)
RC_BOOTSTRAP=$?
printf '%s\n' "$SAIDA_BOOTSTRAP" >>"$LOG"
if [ "$RC_BOOTSTRAP" -ne 0 ]; then
  echo "FALHA: bootstrap falhou (ON_ERROR_STOP); abortando antes das migrations" | tee -a "$LOG"
  exit 2
fi

# TRAVAS CONTRA A PRODUCAO (medido em 04/10/2026): as migrations gravam a URL do banco canonico em
# 4 jobs do pg_cron, 3 funcoes e 2 segredos do cofre. Esta imagem traz pg_cron e pg_net ativos,
# entao um replay que fique de pe alguns minutos faz POST nas edge functions REAIS (com segredo
# local, que elas recusam - mas chama). Duas travas, antes de aplicar qualquer migration:
#   1. o host do canonico resolve para 127.0.0.1 dentro do container;
#   2. o agendador nao dispara job nenhum.
echo "travando o acesso a producao a partir do replay" | tee -a "$LOG"
docker exec -u 0 "$NOME" sh -c "echo '127.0.0.1 tnnnlkbymytvtqngbbqh.supabase.co tnnnlkbymytvtqngbbqh.functions.supabase.co db.tnnnlkbymytvtqngbbqh.supabase.co' >> /etc/hosts"
docker exec "$NOME" grep -q 'tnnnlkbymytvtqngbbqh' /etc/hosts \
  || { echo "FALHA: trava de DNS nao entrou; abortando antes das migrations" | tee -a "$LOG"; exit 2; }
docker exec -i "$NOME" psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 \
  -c "alter system set cron.launch_active_jobs = off" -c "select pg_reload_conf()" >>"$LOG" 2>&1 \
  || { echo "FALHA: nao consegui desligar o agendador; abortando antes das migrations" | tee -a "$LOG"; exit 2; }

TOTAL=$(ls supabase/migrations/*.sql | wc -l)
echo "aplicando $TOTAL migrations" | tee -a "$LOG"
OK=0; FALHA=0
for f in $(ls supabase/migrations/*.sql | sort); do
  SAIDA=$(docker exec -i "$NOME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < "$f" 2>&1)
  if [ $? -eq 0 ]; then
    OK=$((OK+1))
  else
    FALHA=$((FALHA+1))
    ERRO=$(printf '%s' "$SAIDA" | grep -m1 "ERROR:" | cut -c1-190 | tr '\t' ' ')
    printf '%s\t%s\n' "$(basename "$f")" "${ERRO:-sem linha ERROR}" >> "$ERROS"
  fi
done
echo "RESULTADO: $OK ok, $FALHA falha(s) de $TOTAL" | tee -a "$LOG"
echo "--- erros mais comuns ---" >> "$LOG"
cut -f2 "$ERROS" | sed 's/ERROR:  //' | sort | uniq -c | sort -rn | head -14 >> "$LOG"

# Classifica contra o allowlist: falha esperada (ja investigada e medida no canonico) x INESPERADA
# (drift novo). So a inesperada derruba o replay - e o que faz deste script um gate.
python3 "$(dirname "$0")/replay-classify.py" "$ERROS" "$(dirname "$0")/replay-known-failures.json" | tee -a "$LOG"
RC=${PIPESTATUS[0]}

remover_nosso
echo "container removido" >> "$LOG"

# 0 = verde (nenhuma falha inesperada); 1 = drift novo; 2 = setup indisponivel (acima).
exit "$RC"
