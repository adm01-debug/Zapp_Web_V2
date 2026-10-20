-- confere que a migration foi reaplicada (funcao de volta e ACL certa)
\set ON_ERROR_STOP on
SELECT to_regprocedure('public.admin_unlock_login(text)') IS NOT NULL AS recriada,
       has_function_privilege('authenticated', 'public.admin_unlock_login(text)', 'EXECUTE') AS autenticado,
       has_function_privilege('anon', 'public.admin_unlock_login(text)', 'EXECUTE') AS anonimo;
