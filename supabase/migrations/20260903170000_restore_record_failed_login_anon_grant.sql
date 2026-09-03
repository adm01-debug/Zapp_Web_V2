-- 20260903170000_restore_record_failed_login_anon_grant
-- Regressao de 20260902000600: revogar EXECUTE de anon em record_failed_login
-- desligou o lockout de login em producao. A funcao e chamada pela tela de login
-- ANTES de qualquer sessao existir (src/lib/loginAttempts.ts -> useAuthForm.ts,
-- depois de signIn falhar), entao roda como anon. Sem o grant, toda tentativa
-- falha volta 'permission denied', o erro e engolido em loginAttempts.ts e o
-- contador nunca sobe — ou seja, nenhuma conta bloqueia.
--
-- REVOKE de PUBLIC (=) do 20260902000600 fica: PUBLIC daria execute ate para
-- roles futuras. O abuso de lockout por e-mail alheio continua possivel e so se
-- fecha movendo a chamada para o servidor (edge function com rate limit por IP);
-- ate la, ter o lockout funcionando vale mais que nao ter protecao nenhuma.

GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text, text) TO anon;
