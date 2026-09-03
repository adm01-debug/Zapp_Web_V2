-- 20260902000600_fix_record_failed_login_acl
-- REVOKE de PUBLIC/anon em record_failed_login (least privilege).

REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM PUBLIC;

-- anon: EXECUTE mantido — record_failed_login e chamada pela tela de login (sem sessao);
-- revogar quebrou o lockout de forca bruta em producao (revertido em 20260903170000).

-- anon mantem EXECUTE: record_failed_login roda na tela de login antes de sessao existir
-- (lockout de forca bruta). O REVOKE e somente de PUBLIC.
