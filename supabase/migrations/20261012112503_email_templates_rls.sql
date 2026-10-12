-- email_templates_rls
-- Rollback: dropa o trigger, as 4 policies e a tabela public.email_templates (a tabela e nova, criada por esta migration: nao ha dado anterior a devolver nem GRANT a restaurar).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists set_email_templates_updated_at on public.email_templates;
--   drop policy if exists "email_templates_delete_own" on public.email_templates;
--   drop policy if exists "email_templates_update_owner_or_staff_shared" on public.email_templates;
--   drop policy if exists "email_templates_insert_own" on public.email_templates;
--   drop policy if exists "email_templates_select_own_or_shared" on public.email_templates;
--   drop table if exists public.email_templates;
--
-- feat(db): modelos de e-mail (email_templates) com RLS — paridade V3->V2
-- (auditoria docs/audits/AUDITORIA_PARIDADE_V3_FEATURES_BATCH1_PARTE8_2026-10-12.md,
--  EmailTemplatesManager da V3). Migration ADITIVA: cria a tabela e o contrato de acesso.
-- Nenhuma linha existe antes; nada de backfill.
--
-- DECISOES MEDIDAS NO REPO (nao assumidas):
--  1. Papel/staff: usa-se public.is_admin_or_supervisor(auth.uid()), como o cartao manda
--     e como o modulo de conversas ja faz (20260929580000_multiplix_policies_consolidation.sql).
--     Assinatura real: public.is_admin_or_supervisor(_user_id uuid).
--  2. Dono = auth.uid() (o id do usuario autenticado), como message_templates
--     (20251215160224: user_id = auth.uid()) e saved_filters — nao profiles.id.
--  3. Gatilho de updated_at: public.update_updated_at_column() ja existe
--     (20251215024517_1c312256-b6e4-4d34-8dc5-3b03301e369e.sql:188) e e o que o
--     message_templates usa.
--  4. RLS literal do cartao: o dono le/edita/exclui o seu; linha com is_shared = true e
--     LEGIVEL por todo authenticated e EDITAVEL so pelo dono OU por staff; excluir e so do
--     dono. Compartilhar e mecanismo de LEITURA/edicao-de-compartilhado; nao da poder de
--     escrita sobre o modelo privado de outro usuario.
--  5. Escrita nao permite trocar created_by (WITH CHECK = USING): ninguem "doa" nem
--     reatribui a autoria de um modelo, evitando escalada por UPDATE.
--  6. ACL: anon/PUBLIC sem grant; authenticated com SELECT/INSERT/UPDATE/DELETE (a RLS
--     filtra); service_role com ALL (BYPASSRLS, uso de Edge/admin).

-- ============ 1. tabela ============
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  subject varchar(300) not null default '',
  body text not null default '',
  category text,
  is_shared boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_name_not_blank check (btrim(name) <> ''),
  constraint email_templates_body_len check (char_length(body) <= 50000)
);

comment on table public.email_templates is
  'Modelos de e-mail (nome, assunto, corpo HTML simples). is_shared = visivel a todo authenticated; autoria em created_by.';

-- ============ 2. indices ============
create index if not exists email_templates_created_by_idx on public.email_templates (created_by);
create index if not exists email_templates_is_shared_idx on public.email_templates (is_shared);

-- ============ 3. RLS ============
alter table public.email_templates enable row level security;

drop policy if exists "email_templates_select_own_or_shared" on public.email_templates;
create policy "email_templates_select_own_or_shared" on public.email_templates
  for select to authenticated
  using (created_by = (select auth.uid()) or is_shared = true);

drop policy if exists "email_templates_insert_own" on public.email_templates;
create policy "email_templates_insert_own" on public.email_templates
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists "email_templates_update_owner_or_staff_shared" on public.email_templates;
create policy "email_templates_update_owner_or_staff_shared" on public.email_templates
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or (is_shared = true and public.is_admin_or_supervisor((select auth.uid())))
  )
  with check (
    created_by = (select auth.uid())
    or (is_shared = true and public.is_admin_or_supervisor((select auth.uid())))
  );

drop policy if exists "email_templates_delete_own" on public.email_templates;
create policy "email_templates_delete_own" on public.email_templates
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- ============ 4. updated_at ============
drop trigger if exists set_email_templates_updated_at on public.email_templates;
create trigger set_email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.update_updated_at_column();

-- ============ 5. ACL ============
revoke all on table public.email_templates from public, anon, authenticated;
grant select, insert, update, delete on table public.email_templates to authenticated;
grant all on table public.email_templates to service_role;
