-- user_ui_preferences: preferências de interface por usuário (skin, raio, densidade, atalhos, favoritos).
-- Rollback: desfaz tudo — remove o gatilho e a tabela (policy, constraints e grants caem com ela; nada mais foi criado ou alterado).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists user_ui_preferences_touch_updated_at on public.user_ui_preferences;
--   drop table if exists public.user_ui_preferences;
--
-- Migration ADITIVA: cria APENAS objeto novo (tabela, policy, gatilho e grant a authenticated).
-- Não altera, não revoga e não migra nada existente. O gatilho reusa a função
-- public.update_updated_at_column() já existente no banco; nenhuma função nova nasce aqui.
--
-- prefs: objeto JSON (skin/raio/densidade/atalhos/favoritos do usuário). O CHECK
-- user_ui_preferences_prefs_object recusa array/escalar; o CHECK user_ui_preferences_prefs_size
-- (octet_length(prefs::text) <= 16384, 16 KiB) impede que a linha vire depósito de blob —
-- é preferência de UI, não armazenamento de arquivo.
--
-- RLS "própria linha": a policy FOR ALL TO authenticated usa o MESMO predicado em USING
-- (o que o usuário enxerga) e em WITH CHECK (o que ele pode gravar), então ninguém lê,
-- insere, atualiza nem apaga a linha de outro. anon não tem policy: fica negado por RLS.
set search_path to 'public', 'pg_temp';

create table public.user_ui_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb
    constraint user_ui_preferences_prefs_object check (jsonb_typeof(prefs) = 'object')
    constraint user_ui_preferences_prefs_size check (octet_length(prefs::text) <= 16384),
  updated_at timestamptz not null default now()
);

alter table public.user_ui_preferences enable row level security;

create policy user_ui_preferences_own_row
  on public.user_ui_preferences
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger user_ui_preferences_touch_updated_at
  before update on public.user_ui_preferences
  for each row execute function public.update_updated_at_column();

grant select, insert, update, delete on public.user_ui_preferences to authenticated;
