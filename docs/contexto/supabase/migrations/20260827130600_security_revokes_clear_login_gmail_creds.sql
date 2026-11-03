REVOKE EXECUTE ON FUNCTION public.clear_login_attempts(text) FROM PUBLIC, anon

REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM authenticated

REVOKE EXECUTE ON FUNCTION public.encrypt_gmail_token(text) FROM authenticated

REVOKE EXECUTE ON FUNCTION public.get_channel_credentials(uuid) FROM authenticated
