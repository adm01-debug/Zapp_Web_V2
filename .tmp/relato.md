Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013230007_my_active_sessions.sql (novo): cria public.my_active_sessions() (SECURITY DEFINER, search_path fixo em 'public') que devolve SO as linhas de public.user_sessions do proprio chamador (us.user_id = auth.uid()) que tem sessao Auth VIVA — INNER JOIN auth.sessions por id E user_id, com (not_after IS NULL OR not_after > now()). Assim a linha orfa (sem auth.sessions, as 13 medidas) e a sessao Auth ja expirada somem da lista, sem apagar a tabela de inventario. Cada linha leva is_current vindo do JWT do chamador: session_id == us.auth_session_id (le request.jwt.claim.session_id e, se vazio, request.jwt.claims->>'session_id'). EXECUTE so para authenticated; PUBLIC e anon revogados (anon recebe 42501).
- supabase/migrations/20261013230007_my_active_sessions.sql (novo): cria public.expire_orphan_user_sessions(), idempotente, que MARCA is_active=false + ended_at para as linhas sem auth.sessions viva (nada e' apagado). Agendado no pg_cron 1x/dia ('23 3 * * *', nome expire-orphan-user-sessions) e roda uma vez no proprio migration para sanear as orfas ja existentes. ACL: sem EXECUTE para authenticated/anon.
- supabase/tests/my_active_sessions.sql (novo): prova por papel real (set_config('role',...)) — T1 so as vivas do chamador (orfa e expirada nao aparecem, B nao vaza), T2 is_current pelo claim session_id (A e B), T3 anon barrado (42501), T4 sem identidade (auth.uid() nulo) devolve 0 linhas, T5 limpeza idempotente (1a vez marca, 2a vez = 0; sessao Auth apagada sai da lista), T6 ACL das duas funcoes. Tudo numa transacao que termina em ROLLBACK.
- src/integrations/supabase/types.ts: entram os tipos da RPC my_active_sessions (ciência do postgrest/child t_b4c0ae4e).
- scripts/db-audit/pg-cron-jobs-baseline.json: entra o job expire-orphan-user-sessions com o schedule '23 3 * * *' — o item 2 do cartao agenda um job novo e o baseline reprova "job novo" if stale; e' arquivo da minha area (scripts/db-audit/**), por isso entrou apesar de o cartao citar so supabase/tests.

## Prova
- vermelho antes (funcionalidade ausente): `zapp-db-local psql <workspace> v2-2610130558f3a3 -v ON_ERROR_STOP=1 < supabase/tests/my_active_sessions.sql` → `ERROR: function public.my_active_sessions() does not exist` / EXIT_RED=3
- verde depois: mesmo comando → `NOTICE: my_active_sessions: suite OK (T1 so as vivas do chamador, T2 is_current pelo JWT, T3 anon barrado, T4 sem identidade 0 linhas, T5 limpeza idempotente, T6 ACL) — 6 grupo(s)` / EXIT_GREEN=0
- guarda de SECURITY DEFINER: `zapp-db-local psql <workspace> v2-2610130558f3a3 < scripts/db-audit/check-secdef-public-execute.sql` → `NOTICE: check-secdef-public-execute: OK (285 funcoes SECURITY DEFINER em public, nenhuma com PUBLIC/anon)`
- baseline do cron: `node --test scripts/db-audit/pg-cron-jobs-baseline.test.mjs` → `pass 12 / fail 0`
- rollback de verdade (3 comandos do cabecalho, em transacao que volta atras): `BEGIN; select cron.unschedule(jobid) from cron.job where jobname='expire-orphan-user-sessions'; drop function if exists public.expire_orphan_user_sessions(); drop function if exists public.my_active_sessions(); ROLLBACK;` → `unschedule t / DROP FUNCTION / DROP FUNCTION / ROLLBACK`; estado depois = 2 funcoes e 1 job (nada foi perdido).
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (105s)` e `zapp-db-local travas <workspace> v2-2610130558f3a3` → `TRAVAS: conferidas (DNS da produção preso, agendador desligado, pg_net sem envio)`.

## Efeitos colaterais conferidos
- O UPDATE da limpeza mexe so em is_active/ended_at; o unico gatilho de user_sessions (trg_user_sessions_auth_session_guard) dispara apenas em INSERT/UPDATE OF auth_session_id, entao nao ha reescrita de data nem efeito em coluna alheia. user_sessions nao tem updated_at.
- Nada e' apagado (so' is_active=false); sem TRUNCATE/DROP/DELETE em massa; nenhum GRANT em objeto existente; nenhuma funcao overload criada. my_active_sessions devolve somente a linha do proprio auth.uid() — nao ha oraculo de enumeracao (resposta igual para usuario existente ou nao).
- Sem identificador/URL do banco real no diff nem no relato.

## O que NAO fiz e por que
- Nao troquei o front (useDeviceDetection/DevicesPanel/SecurityOverview) para chamar a RPC: e' o cartao filho t_b4c0ae4e (worker de telas/hooks). Esta entrega so o contrato do banco; o hook precisa passar a chamar my_active_sessions() e usar is_current no lugar de device_id === currentDeviceId.

NÃO CONCLUÍ: nada — cartao concluido.

## Sobre o aviso do fechar ("codigo alterado sem teste neste commit")
- Falso positivo conhecido de cartao de banco: o fechar olhou src/integrations/supabase/types.ts (src/**, unico arquivo "de aplicacao" no diff) e nao contou a suite de banco nova em supabase/tests/my_active_sessions.sql. O teste do defeito ESTA no commit 7a03b74be2 (supabase/tests/my_active_sessions.sql) e prova vermelho->verde por papel real; types.ts e apenas o espelho gerado da RPC (ciência do postgrest). Nao ha mudanca de comportamento em src/**. Repetindo o MESMO comando de fechar.

