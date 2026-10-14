-- global_settings_secrets
-- Rollback: restaura as duas policies de public.global_settings às definições anteriores — a de escrita volta à versão do Gate 16 (FOR ALL is_admin, sem WITH CHECK) e a de leitura volta a liberar todo o SELECT para is_admin_or_supervisor, reexpondo as chaves secretas ao supervisor.
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "Admins can manage global settings" on public.global_settings;
--   create policy "Admins can manage global settings" on public.global_settings for all to authenticated using (is_admin(auth.uid()));
--   drop policy if exists "Admins can view global settings" on public.global_settings;
--   create policy "Admins can view global settings" on public.global_settings for select to authenticated using (is_admin_or_supervisor(auth.uid()));
--
-- Configurações globais — supervisor NÃO lê nem altera chaves secretas.
--
-- Estado vigente (07/10/2026): a policy de escrita "Admins can manage global settings"
-- já é is_admin() desde 20260830150000_gate16_admin_only_write_policies, mas a de leitura
-- "Admins can view global settings" (20260317223223) ainda usa is_admin_or_supervisor(),
-- então o supervisor LÊ toda linha de global_settings — inclusive elevenlabs_api_key, que
-- o botão "mostrar" da aba Configurações -> Global exibe. Aqui:
--   1. reafirma a escrita só do admin (derruba qualquer resquício da policy antiga FOR ALL
--      is_admin_or_supervisor e a "Anyone can view global settings" USING (true), se viva);
--   2. a leitura do supervisor passa a excluir as chaves secretas por LINHA (chave terminando
--      em _api_key, _secret ou _token); o admin continua lendo tudo. Nenhum dado é movido.
--
-- Efeitos colaterais: nenhuma tabela nova; sem GRANT/REVOKE de objeto; sem trigger; a tabela
-- não é alterada (só policies). Idempotente: reaplicar não muda o resultado.

-- 1) Escrita: só admin (reafirma o Gate 16 e garante a ausência da policy antiga larga).
DROP POLICY IF EXISTS "Admins can manage global settings" ON public.global_settings;
CREATE POLICY "Admins can manage global settings" ON public.global_settings
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Defesa em profundidade: a policy de leitura total original (USING (true)) foi removida em
-- 20260317223223; se por qualquer motivo sobreviveu, cai agora.
DROP POLICY IF EXISTS "Anyone can view global settings" ON public.global_settings;

-- 2) Leitura: admin lê tudo; supervisor lê só o que NÃO é segredo (por linha).
DROP POLICY IF EXISTS "Admins can view global settings" ON public.global_settings;
CREATE POLICY "Admins can view global settings" ON public.global_settings
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR (
      is_admin_or_supervisor(auth.uid())
      AND key !~ '(_api_key|_secret|_token)$'
    )
  );
