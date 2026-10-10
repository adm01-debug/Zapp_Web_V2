-- 20260903200000_revoke_anon_record_failed_login
-- NO-OP no repo. O ledger guarda o REVOKE original:
--   REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM anon;
-- Divergencia intencional, registrada em scripts/db-audit/migration-evidence.json
-- como ledger-divergence/pinned-replay (reason: safer-replay).
--
-- Motivo: src/lib/loginAttempts.ts chama record_failed_login via supabase.rpc()
-- na tela de login, antes de existir sessao — ou seja, como anon. Sem o EXECUTE
-- o RPC falha, o erro e engolido (retorna attempts: 0) e nenhuma conta trava:
-- forca bruta aberta. Foi o que aconteceu em producao e 20260903210000 desfez.
--
-- Num replay limpo, aplicar o REVOKE aqui reabriria essa janela entre esta
-- migration e a 210000. Como o estado final permitido e "anon com EXECUTE"
-- (ver 20260903170000 e 20260903210000), este arquivo nao faz nada e o replay
-- nunca passa pelo estado inseguro.

DO $$
BEGIN
  RAISE NOTICE '20260903200000 revertida por 20260903210000 — no-op no replay';
END $$;
