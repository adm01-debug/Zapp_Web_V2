-- fecha_record_incoming_call_event
-- Rollback: so ACL + DROP de funcao sem chamador (nenhuma linha e tocada). Desfazer, na ordem:
--   GRANT EXECUTE ON FUNCTION public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text) TO PUBLIC, authenticated;
--   GRANT EXECUTE ON FUNCTION public.record_talkx_campaign_lifecycle_event() TO PUBLIC, authenticated, service_role;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   recriar o overload de 6 argumentos: reexecutar o bloco "B.5-eventos" de
--   supabase/migrations/20260926800000_calls_telefonia_v2.sql (linhas 404-587) e, logo depois,
--   REVOKE ALL ON FUNCTION public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean) TO service_role;
--   (o REVOKE/GRANT e o de 20260922220000; sem ele o overload recriado nasce aberto para PUBLIC.)
--   Obs.: o rollback escrito na T26 (20261002531230) esta errado: reexecutar o B.5 recria o overload
--   de 6 AO LADO do de 7, nao desfaz a T26 nem fecha o EXECUTE do de 7.
-- nomes-antigos-conferidos: record_incoming_call_event — so o overload de 6 argumentos sai; o de 7
--   continua e e o que supabase/functions/_shared/evolution-webhook-handlers.ts:314 chama.
--
-- M-DB-02 (= R2-DB-001), P0 de seguranca: funcao do banco executavel por qualquer pessoa, sem login.
--
-- Medido no banco local da tarefa (replay das migrations, estrutura identica ao retrato da producao):
--   public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text) e SECURITY DEFINER e
--   tem proacl {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}.
--   POST anonimo em /rest/v1/rpc/record_incoming_call_event com IDs reais -> HTTP 200 e grava em
--   public.calls; com UUID inexistente -> "incoming call contact not found" (oraculo de IDs).
-- Causa raiz: a T26 (20261002531230) fez create or replace com um parametro a mais. Isso NAO
--   substitui a funcao de 6 argumentos: cria outra identidade, que nasce com o ACL padrao
--   (EXECUTE para PUBLIC, que nunca foi revogado globalmente, + o pg_default_acl de postgres em
--   public: authenticated, service_role). O REVOKE de 20260922220000 so vale para o de 6.
-- Unico chamador real: a edge function evolution-webhook, com cliente service_role
--   (evolution-webhook/index.ts:158-161), passando os 7 argumentos nomeados. Nenhum cliente do
--   navegador (src/) chama a RPC. O overload de 6 e inalcancavel pelo PostgREST (6 argumentos
--   nomeados casam com os dois e dao PGRST203) e nada no banco o chama.
--
-- Classe: CONTRATO (REVOKE + ALTER DEFAULT PRIVILEGES + DROP FUNCTION). Nenhum dado e removido.

-- (1) Fecha o overload de 7 argumentos: so service_role (o webhook) executa.
REVOKE EXECUTE ON FUNCTION public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean, text)
  TO service_role;

-- (2) A outra SECURITY DEFINER de public com EXECUTE para PUBLIC: funcao TRIGGER, nao e RPC (o PG
--     recusa chama-la fora de trigger) e o PG so confere EXECUTE da funcao de trigger no CREATE
--     TRIGGER, nao a cada disparo. Mesmo tratamento de 20261001191230 (que fechou as outras 59
--     funcoes trigger de public; esta nasceu depois, em 20261003172707).
REVOKE EXECUTE ON FUNCTION public.record_talkx_campaign_lifecycle_event()
  FROM PUBLIC, anon, authenticated, service_role;

-- (3) Evita reincidencia: funcao nova criada por postgres deixa de nascer com EXECUTE para PUBLIC.
--     Tem de ser a forma GLOBAL (sem IN SCHEMA): o EXECUTE de PUBLIC e privilegio padrao global, e
--     um REVOKE por schema nao remove privilegio concedido globalmente (doc do ALTER DEFAULT
--     PRIVILEGES; medido no banco local: com IN SCHEMA public a funcao nova continuou com =X).
--     O default por schema de postgres em public (authenticated, service_role) fica como esta.
--     Hoje postgres so e dono de funcoes em public e supabase_migrations; nenhuma existente muda.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- (4) Overload morto de 6 argumentos.
DROP FUNCTION public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean);
