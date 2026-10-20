-- Talk X (N-102, fatia "acesso"): restringe o EXECUTE de public.talkx_campaign_window_open.
--
-- Rollback: DO $$ BEGIN IF to_regprocedure('public.talkx_campaign_window_open(uuid, timestamptz)') IS NULL THEN RAISE NOTICE 'talkx_n102 rollback: funcao ausente nesta pilha, nada a restaurar'; RETURN; END IF; REVOKE EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz) FROM service_role; GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz) TO authenticated; END; $$;
--
-- Contexto (N-102, defeito de acesso): a migration 20261009203548 criou
-- public.talkx_campaign_window_open(uuid, timestamptz) como SECURITY DEFINER e concedeu
-- EXECUTE a authenticated (REVOKE apenas de PUBLIC e anon), SEM qualquer checagem de ator.
-- A função lê public.talkx_campaigns e public.talkx_settings e responde se a janela de envio
-- está aberta para QUALQUER campanha — logo qualquer usuário autenticado podia chamar a RPC
-- para a campanha de outro dono/tenant e inferir a janela (dias e horário de não perturbe).
--
-- O único consumidor real da RPC é a Edge Function talkx-scheduler
-- (supabase/functions/talkx-scheduler/index.ts:278), que a chama com o cliente criado a partir
-- de SUPABASE_SERVICE_ROLE_KEY (index.ts:125-130) — ou seja, service_role. Não há chamada por
-- authenticated no front (src) nem em outra Edge Function.
--
-- Correção (menor privilégio): tira o EXECUTE de authenticated e o deixa apenas para
-- service_role. A função permanece SECURITY DEFINER com search_path fixo (public, pg_temp),
-- que é o correto: ela precisa ler as tabelas sem depender do RLS do chamador, e agora só é
-- alcançável pela role de serviço. O check-secdef-public-execute segue verde (sem EXECUTE
-- para PUBLIC/anon).
--
-- Empilhamento (refazer t_b7ce25ec): a base que CRIA a função (20261009203548) não está em
-- nenhuma branch dia/ — vive em branches de cartões recusados/preparação. Sem ela na pilha, o
-- REVOKE direto derrubava a aplicação das migrations:
--   psql:<stdin>:30: ERROR:  function public.talkx_campaign_window_open(uuid, timestamp with time zone) does not exist
-- Por isso as duas instruções passam a rodar dentro de um DO que só age quando a função existe,
-- no padrão da casa (20261002381230, 20261003202707, 20261003212707). Não é proteção opcional:
-- sem a função não existe ACL a revogar, e a aplicação é ordenada por versão, então sempre que a
-- base estiver na MESMA cópia ela aplica antes desta (20261009203548 < 20261013085500) e o
-- REVOKE acontece. O que esta migration não cobre: uma migration de versão POSTERIOR a esta que
-- (re)crie a função precisa trazer o próprio REVOKE/GRANT — registrado em comentário no cartão.
-- A prova versionada é scripts/db-audit/talkx-n102-window-acl.test.sh (bloco A aplica a migration
-- num banco SEM a função; bloco B prova que o EXECUTE sai de PUBLIC/anon/authenticated e fica só
-- em service_role quando a função existe).
--
-- Não edita a base 20261009203548 nem o corpo da função (as fatias de cast e de fuso cuidam
-- disso em separado). Sem BEGIN/COMMIT (o ledger aplica cada migration em transação própria).

DO $$
BEGIN
  IF to_regprocedure('public.talkx_campaign_window_open(uuid, timestamptz)') IS NULL THEN
    RAISE NOTICE 'talkx_n102: base 20261009203548 ausente nesta pilha; nada a revogar (a funcao nao existe)';
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
    TO service_role;
END;
$$;
