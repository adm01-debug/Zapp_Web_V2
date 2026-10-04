#!/usr/bin/env bash
# Bateria de ataque contra public.mcp_query_ro (leitura do gateway MCP, backlog QA5-01).
# Chama a função como service_role, o papel que o gateway usa, e exige que toda tentativa de
# escrever, trocar de papel, ler cofre/auth ou mandar mais de uma instrução seja recusada.
#
# Precisa de um banco com os papéis do Supabase, por isso roda contra o banco LOCAL da cópia:
#   zapp-db-local up <cópia> <nome>
#   bash scripts/db-audit/check-mcp-query-ro.local.test.sh <nome>
# Nunca aponta para a produção: só fala com o contêiner local supabase-<nome>-<nome>-database-*.
set -u
N="${1:?uso: check-mcp-query-ro.local.test.sh <nome-do-conjunto-local>}"
C=$(docker ps --format '{{.Names}}' | grep "^supabase-$N-$N-database-" | head -1)
[ -n "$C" ] || { echo "conjunto local $N não está de pé" >&2; exit 2; }
run() { docker exec -i "$C" psql -U postgres -d postgres -X -At -v ON_ERROR_STOP=1 -c "set role service_role" -c "$1" 2>&1 | grep -v '^SET$' | tr '\n' ' ' | cut -c1-400; }
ok=0; bad=0
espera() { # espera <rótulo> <regex esperado> <sql>
  local out; out="$(run "$3")"
  if printf '%s' "$out" | grep -qiE "$2"; then ok=$((ok+1)); printf 'ok    %-44s %s\n' "$1" "$(printf '%s' "$out" | cut -c1-70)"
  else bad=$((bad+1)); printf 'FALHA %-44s %s\n' "$1" "$out"; fi
}
q() { printf "select public.mcp_query_ro(\$q\$%s\$q\$)" "$1"; }
espera "lê tabela com RLS (contatos)"        '"n": *[1-9]'                  "$(q 'select count(*) n from public.contacts')"
espera "lê cron.job_run_details"             '"row_count": *1'            "$(q 'select count(*) n from cron.job_run_details')"
espera "lê catálogo (pg_proc)"               '"row_count": *1'            "$(q 'select count(*) from pg_proc')"
espera "WITH de leitura"                     '"x": *1'                    "$(q 'with a as (select 1 x) select x from a')"
espera "limite de linhas e truncated"        '"truncated": *true'         "select public.mcp_query_ro('select generate_series(1,50)', 5)"
espera "ponto e vírgula final tolerado"      '"row_count": *1'            "$(q 'select 1;  ')"
espera "recusa INSERT"                       'apenas leitura'             "$(q "insert into public.feature_flags(key) values ('x')")"
espera "recusa UPDATE"                       'apenas leitura'             "$(q 'update public.contacts set name = name')"
espera "recusa DELETE"                       'apenas leitura'             "$(q 'delete from public.contacts')"
espera "recusa DDL"                          'apenas leitura'             "$(q 'drop table public.contacts')"
espera "recusa GRANT"                        'apenas leitura'             "$(q 'grant all on public.contacts to anon')"
espera "recusa DO"                           'apenas leitura'             "$(q 'do $x$ begin null; end $x$')"
espera "recusa COPY/SET/CALL"                'apenas leitura'             "$(q 'set role postgres')"
espera "recusa duas instruções"              'ERROR'                      "$(q 'select 1; drop table public.contacts')"
espera "recusa WITH que escreve"             'read-only|permission denied' "$(q 'with d as (delete from public.contacts returning 1) select count(*) from d')"
espera "recusa SELECT INTO"                  'read-only|permission denied|ERROR' "$(q 'select 1 as a into public.zz_teste')"
espera "recusa SELECT FOR UPDATE"            'read-only|permission denied' "$(q 'select id from public.contacts for update')"
espera "recusa nextval"                      'read-only|permission denied' "$(q "select nextval('cron.jobid_seq')")"
espera "recusa cofre (vault.secrets)"        'permission denied'          "$(q 'select * from vault.secrets')"
espera "recusa cofre (decrypted_secrets)"    'permission denied'          "$(q 'select * from vault.decrypted_secrets')"
espera "recusa auth.users"                   'permission denied'          "$(q 'select * from auth.users')"
espera "recusa pgsodium"                     'permission denied|does not exist' "$(q 'select * from pgsodium.key')"
espera "recusa voltar a ler-escrever"        'ERROR'                      "$(q "select set_config('transaction_read_only','off',true)")"
espera "recusa trocar de papel (set_config)" 'ERROR'                      "$(q "select set_config('role','service_role',true)")"
espera "recusa session_authorization"        'ERROR'                      "$(q "select set_config('session_authorization','postgres',true)")"
espera "recusa escrever via query_to_xml"    'read-only|permission denied|not allowed' "$(q "select query_to_xml('delete from public.contacts returning 1',true,true,'')")"
espera "recusa ler cofre via query_to_xml"   'permission denied'          "$(q "select query_to_xml('select * from vault.decrypted_secrets',true,true,'')")"
espera "recusa pg_net (http_post)"           'read-only|permission denied' "$(q "select net.http_post('http://127.0.0.1:9/x','{}'::jsonb)")"
espera "recusa cron.schedule"                'read-only|permission denied' "$(q "select cron.schedule('x','* * * * *','select 1')")"
espera "recusa mcp_exec por dentro"          'permission denied'          "$(q "select public.mcp_exec('create table public.zz(a int)')")"
espera "recusa pg_read_file"                 'permission denied'          "$(q "select pg_read_file('/etc/passwd')")"
espera "recusa pg_terminate_backend alheio"  'permission denied|"pg_terminate_backend": *false|ERROR' "$(q "select pg_terminate_backend(pid) from pg_stat_activity where usename='supabase_admin' limit 1")"
espera "recusa dblink/COPY PROGRAM"          'apenas leitura'             "$(q "copy (select 1) to program 'id'")"
espera "comentário antes não burla"          'apenas leitura'             "$(q '/* select */ drop table public.contacts')"
espera "papel corrente dentro = leitor"      'mcp_ro_reader'              "$(q 'select current_user u')"
echo "--- quem pode chamar:"
for r in anon authenticated; do
  out="$(docker exec -i "$C" psql -U postgres -d postgres -X -At -c "set role $r" -c "select public.mcp_query_ro('select 1')" 2>&1 | grep -v '^SET$' | tr '\n' ' ')"
  if printf '%s' "$out" | grep -q 'permission denied'; then ok=$((ok+1)); echo "ok    $r não executa"; else bad=$((bad+1)); echo "FALHA $r executa: $out"; fi
done
echo "--- depois da bateria, nada mudou:"
docker exec -i "$C" psql -U postgres -d postgres -X -At -c "select 'contatos='||count(*) from public.contacts" -c "select 'tabela zz='||count(*) from pg_class where relname in ('zz','zz_teste')" -c "select 'jobs x='||count(*) from cron.job where jobname='x'" -c "select 'fila pg_net='||count(*) from net.http_request_queue" | tr '\n' ' '
echo; echo "RESULTADO: $ok ok, $bad falha(s)"
[ $bad = 0 ]
