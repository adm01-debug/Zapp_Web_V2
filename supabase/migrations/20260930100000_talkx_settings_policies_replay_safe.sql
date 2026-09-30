-- 20260930100000_talkx_settings_policies_replay_safe
-- Etapa V06 do docs/talkx/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md.
--
-- Dois problemas medidos em 2026-09-30 (PG17 descartavel + banco vivo):
--
-- 1) A policy de leitura nasceu na 20260916230000:14 com
--    `CREATE POLICY IF NOT EXISTS` — sintaxe que NAO existe no Postgres
--    (medido: ERROR: syntax error at or near "not"). Migration aplicada nao se
--    edita (guard do CI), entao ela e recriada aqui em forma valida e idempotente
--    (drop if exists + create). O arquivo original fica no repo e a entrada
--    `safer-replay` em scripts/db-audit/migration-evidence.json documenta que o
--    SQL dele nao e replayavel.
--
-- 2) Faltava a policy de UPDATE: talkx_settings tinha SO SELECT (medido no vivo),
--    entao o save nao persistia para nenhum perfil. O consumidor e
--    src/hooks/integrations/useTalkXSettings.ts:37-38, que faz `.update(...)` —
--    com RLS sem policy de UPDATE a linha era silenciosamente ignorada: a UI dizia
--    "salvo" e o valor voltava ao antigo no reload.
--
-- Classe: contrato (drop/create policy) -> aplicada logo apos o merge e o deploy.
-- Idempotente: pode rodar duas vezes (o teste de contrato da V06 prova isso).

drop policy if exists "authenticated_read_talkx_settings" on public.talkx_settings;

create policy "authenticated_read_talkx_settings"
  on public.talkx_settings
  for select
  to authenticated
  using (true);

drop policy if exists talkx_settings_admin_write on public.talkx_settings;

create policy talkx_settings_admin_write
  on public.talkx_settings
  for update
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()))
  with check (public.is_admin_or_supervisor(auth.uid()));
