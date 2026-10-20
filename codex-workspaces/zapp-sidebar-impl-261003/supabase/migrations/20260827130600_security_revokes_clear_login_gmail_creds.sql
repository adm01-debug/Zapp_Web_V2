-- Fix C-01: clear_login_attempts exposta para anon/PUBLIC.
-- Qualquer request HTTP não autenticado conseguia resetar o lockout de
-- força bruta para qualquer email. A chamada legítima ocorre apenas APÓS
-- signIn() bem-sucedido — cliente já tem JWT session (authenticated).
REVOKE EXECUTE ON FUNCTION public.clear_login_attempts(text) FROM PUBLIC, anon;

-- Fix C-03: decrypt_gmail_token e encrypt_gmail_token chamáveis por authenticated.
-- Funções SECURITY DEFINER que manipulam tokens OAuth. Não há .rpc() real no
-- src/ (apenas type declarations em types.ts). Uso legítimo apenas por service_role.
REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_gmail_token(text)  FROM authenticated;

-- Fix A-03: get_channel_credentials retorna credenciais brutas do canal.
-- Existe get_channel_credentials_safe para uso pelo frontend.
REVOKE EXECUTE ON FUNCTION public.get_channel_credentials(uuid) FROM authenticated;
