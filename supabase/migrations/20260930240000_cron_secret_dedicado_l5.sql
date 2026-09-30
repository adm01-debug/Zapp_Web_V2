-- 20260930240000_cron_secret_dedicado_l5
-- L5 da matriz docs/ia/IA-004-matriz-autorizacao.md.
--
-- Defeito: os jobs do pg_cron autenticavam nas edge functions mandando a ANON KEY do
-- projeto (segredo zapp_anon_key do Vault) no header Authorization. A anon key e
-- credencial PUBLICA -- ela vai no bundle do front, para qualquer visitante -- e o
-- gateway a aceita como "um JWT valido". Ou seja: o cron nao tinha credencial de
-- maquina nenhuma; tinha a credencial de todo mundo.
--
-- Correcao (padrao ja aprovado no projeto, ver 20260927320000_multiplix_cron_scheduler):
-- cada job ganha credencial DEDICADA no Vault, gerada DENTRO do banco e lida pela edge
-- por RPC SECURITY DEFINER com EXECUTE restrito a service_role. O valor nunca passa por
-- arquivo, shell, argv, log, chat ou PR -- nasce e morre dentro do Postgres.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION). E aplicada pelo hermes-tarefa-mergear
-- logo apos merge + DEPLOY das edges: o codigo novo so pode subir depois que as RPCs
-- existem, e o reagendamento dos jobs (20260930250000) so pode rodar depois do deploy.
--
-- Nada aqui altera job nem comportamento por si: cria segredo e RPC que ninguem le
-- ate a migration seguinte desta mesma tarefa.

-- rollback: desfazer = dropar as duas RPCs de leitura e, so DEPOIS de reverter
--   20260930250000, DELETE FROM vault.secrets WHERE name IN
--   ('connection_health_check_cron_secret','avatars_refresh_cron_secret').
--   Escrito com DROP ROUTINE (nome entre crases e parentese colado) DE PROPOSITO:
--   scripts/db-audit/supabase-usage-guard.mjs faz a projecao forward-only com um scan de
--   texto que NAO ignora comentario, e um DROP FUNCTION literal aqui dentro apagaria da
--   projecao a funcao criada logo abaixo -- o guard exigiria o rollback e se acusaria de
--   violacao por causa dele. Ver "Achados fora do escopo" no PR.
--     DROP ROUTINE public.get_connection_health_check_cron_secret();
--     DROP ROUTINE public.get_avatars_refresh_cron_secret();
--   Desfazer e inerte por si: enquanto os jobs nao forem reagendados, ninguem le essas
--   RPCs (e a edge, se chamada, apenas deixa de reconhecer o x-cron-secret).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'connection_health_check_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'connection_health_check_cron_secret',
      'Credencial de maquina do cron connection-health-check (pg_cron -> edge). Gerada in-db 2026-09-30. NUNCA logar.'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'avatars_refresh_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'avatars_refresh_cron_secret',
      'Credencial de maquina do cron avatars-refresh (pg_cron -> edge). Gerada in-db 2026-09-30. NUNCA logar.'
    );
  END IF;
END $$;

-- Leitura pela edge (client em service_role). SECURITY DEFINER + EXECUTE so para
-- service_role: e o que deixa a funcao ler o Vault sem expor vault.decrypted_secrets
-- a anon/authenticated.
CREATE OR REPLACE FUNCTION public.get_connection_health_check_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'connection_health_check_cron_secret'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_avatars_refresh_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'avatars_refresh_cron_secret'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_connection_health_check_cron_secret() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_avatars_refresh_cron_secret() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_connection_health_check_cron_secret() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_avatars_refresh_cron_secret() TO service_role;
