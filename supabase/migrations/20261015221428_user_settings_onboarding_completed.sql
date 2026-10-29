-- user_settings_onboarding_completed
-- Rollback: dropa a coluna onboarding_completed de public.user_settings; nenhuma linha e criada ou removida — o valor por linha sai junto com a coluna.
-- Rollback (SQL executável, na ordem):
--   alter table public.user_settings drop column if exists onboarding_completed;
--
-- Paridade V3 -> V2 (docs/estado/25-hooks-raiz-3.md, segunda passada de 13/10):
-- na V3 o "já viu o tour" é lido/gravado em user_settings.onboarding_completed. Na V2 o hook
-- (src/hooks/ui/useOnboarding.ts:51-68) tratava "já completou" como a mera EXISTÊNCIA de linha em
-- user_settings; qualquer upsert anterior (som, notificações, horário) marcava o usuário como
-- "já viu o tour". Esta migration cria a coluna que é a fonte da verdade.
--
-- Aditiva: coluna nova (boolean NOT NULL DEFAULT false). RLS fica INTACTA — as policies
-- "Users can view/insert/update their own settings" já restringem por user_id = auth.uid().
-- Backfill: quem JÁ tinha linha em user_settings ganha true (a linha só existe porque o app já
-- gravou preferência antes; o usuário estava usando o sistema). O UPDATE desliga o gatilho
-- update_user_settings_updated_at durante o backfill para NÃO reescrever updated_at de todas as
-- linhas (efeito colateral que já derrubou entrega nesta área); ele é religado no fim.

alter table public.user_settings
  add column if not exists onboarding_completed boolean not null default false;

do $$
begin
  if exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.user_settings'::regclass
       and tgname = 'update_user_settings_updated_at'
       and not tgisinternal
  ) then
    execute 'alter table public.user_settings disable trigger update_user_settings_updated_at';
    update public.user_settings
       set onboarding_completed = true
     where onboarding_completed is distinct from true;
    execute 'alter table public.user_settings enable trigger update_user_settings_updated_at';
  else
    update public.user_settings
       set onboarding_completed = true
     where onboarding_completed is distinct from true;
  end if;
end $$;
