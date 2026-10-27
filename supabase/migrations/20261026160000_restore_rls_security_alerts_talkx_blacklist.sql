-- 20261026160000_restore_rls_security_alerts_talkx_blacklist
-- Restaura policies removidas manualmente da producao; alinha producao com migrations.
-- Origem: security_alerts_self_select (20261015172527) e talkx_blacklist_no_delete
-- (20261011003007) foram aplicadas e depois removidas fora do fluxo de migrations.
-- Idempotente: DO block com IF NOT EXISTS — nao levanta se a policy ja existir.

-- security_alerts_self_select: dono do alerta le os proprios alertas de seguranca.
-- Sem esta policy, SecurityOverview mostra "sem atividades suspeitas" mesmo com
-- alertas gravados (user_id = auth.uid()), pois nao havia SELECT para o dono.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'security_alerts'
      AND policyname = 'security_alerts_self_select'
  ) THEN
    CREATE POLICY security_alerts_self_select
      ON public.security_alerts
      FOR SELECT
      TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

-- talkx_blacklist_no_delete: barreira de RLS contra DELETE fisico por authenticated.
-- A barreira de trigger (trg_talkx_blacklist_no_delete) cobre service_role/dono;
-- esta policy cobre o caminho RLS para 'authenticated' (defesa em camadas).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'talkx_blacklist'
      AND policyname = 'talkx_blacklist_no_delete'
  ) THEN
    CREATE POLICY talkx_blacklist_no_delete
      ON public.talkx_blacklist
      FOR DELETE
      TO authenticated
      USING (false);
  END IF;
END $$;
