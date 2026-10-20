-- Funções trigger com security_definer não precisam de EXECUTE para anon/authenticated.
-- O trigger é invocado pelo mecanismo do PG com os privilégios do owner (postgres).
REVOKE EXECUTE ON FUNCTION public.handle_message_gamification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_conversation_closure_gamification() FROM PUBLIC, anon, authenticated;
