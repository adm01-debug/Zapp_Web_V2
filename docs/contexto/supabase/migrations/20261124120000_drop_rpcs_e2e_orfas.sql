-- Remove as 2 RPCs de limpeza de fixture de E2E, orfas desde o backend descartavel do e2e-logado.
drop function if exists public.e2e_cleanup();
drop function if exists public.e2e_cleanup_conversation_closures();
