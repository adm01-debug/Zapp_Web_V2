-- Talk X (N-102, fatia "acesso"): restringe o EXECUTE de public.talkx_campaign_window_open.
--
-- Rollback: desfaz esta migration, restaurando a ACL anterior (EXECUTE para authenticated).
-- Rollback (SQL executável, na ordem):
--   REVOKE EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz) FROM service_role;
--   GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz) TO authenticated;
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
-- Não edita a base 20261009203548 nem o corpo da função (as fatias de cast e de fuso cuidam
-- disso em separado). Sem BEGIN/COMMIT (o ledger aplica cada migration em transação própria).

REVOKE ALL ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  TO service_role;
