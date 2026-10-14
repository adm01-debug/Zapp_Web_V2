Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261014014129_close_stale_calls.sql (novo): cria
  public.close_stale_calls() (SECURITY DEFINER, search_path fixo 'public, pg_temp')
  que fecha chamadas presas (ended_at IS NULL):
  - status='ringing' há mais de 2 min -> 'missed' se direction='inbound', senão
    'ended'; end_reason='timeout'; ended_at=now();
  - status='answered' há mais de 4 h -> 'ended'; end_reason='failed';
    ended_at=now(); talk_seconds limitado a 14400 s (teto: não há evento de fim);
  - devolve a contagem de linhas fechadas; idempotente (só toca ended_at IS NULL);
  - permissão: REVOKE de public/anon/authenticated; GRANT EXECUTE só a service_role;
  - agendamento pg_cron 'close-stale-calls' a cada 5 min, idempotente
    (unschedule do job homônimo antes de recriar).
- supabase/tests/close_stale_calls.sql (novo): prova no banco LOCAL do cartão.

Escolha do agendamento: pg_cron está instalado no banco local e no retrato de
produção -> uso pg_cron (não a Edge agendada). Registro conforme o cartão.

## Prova
- vermelho antes: sem a migration, `select public.close_stale_calls();` ->
  `ERROR: function public.close_stale_calls() does not exist` (42883). Executei
  dentro de transação com DROP + ROLLBACK (função confirmada de volta depois).
- verde depois: `zapp-db-local psql . v2-26101322397971 < supabase/tests/close_stale_calls.sql`
  -> `NOTICE: close_stale_calls: suite OK (fechou 3, idempotente, anon/authenticated negados, service_role permitido)` (DO; ROLLBACK).
- job registrado: `select jobname,schedule,active from cron.job where jobname='close-stale-calls'`
  -> `close-stale-calls | */5 * * * * | t`.
- rollback executado de verdade: rodei as duas linhas `-- Rollback:` em transação
  (DO de unschedule + `drop function if exists`) -> `DO` / `DROP FUNCTION`, e o
  ROLLBACK restaurou tudo (função e job de volta: fn=1, job=1).
- verificação: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (161s)`
  (banco_local é pulado sem o nome do conjunto, exatamente como o fechar chama).

## O que a suíte prova (supabase/tests/close_stale_calls.sql)
- ringing inbound há 3 min -> missed + timeout + ended_at preenchido;
- ringing outbound há 10 min -> ended + timeout;
- answered há 5 h -> ended + failed + talk_seconds = 14400 (teto);
- ringing de 30 s e answered de 1 h -> intactos; linha já terminal -> intacta;
- 2ª rodada -> 0 linhas (idempotente);
- has_function_privilege: anon=false, authenticated=false, service_role=true; e
  tentativa REAL como anon e como authenticated levanta 42501
  (insufficient_privilege), provando o "quem pode / não pode / anônimo".

## O que NÃO fiz e por quê
- Não toquei produção; o retrato (supabase/schema-manifest.json) ainda não tem
  close_stale_calls — esperado, a produção ganha a função só quando a migration
  for integrada e aplicada.
- O banco LOCAL do cartão veio do replay sem a migration
  20260926800000_calls_telefonia_v2 (as colunas end_reason/talk_seconds de calls
  estavam ausentes). Apliquei essa migration do PRÓPRIO repo ao banco local para
  ter o schema real de calls e rodar a prova. Nenhuma fixture fica no banco (a
  suíte abre e termina em ROLLBACK).
- Não criei scripts/db-audit/*.test.sh (fora de ARQUIVOS QUE PODE TOCAR); a prova
  vive em supabase/tests/close_stale_calls.sql, que o cartão permite.
