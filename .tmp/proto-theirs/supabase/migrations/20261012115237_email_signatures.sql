-- email_signatures
-- Rollback: dropa o trigger, as 4 policies e a tabela public.email_signatures (a tabela e nova, criada por esta migration: nao ha dado anterior a devolver nem GRANT a restaurar).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists set_email_signatures_updated_at on public.email_signatures;
--   drop policy if exists "email_signatures_delete_own" on public.email_signatures;
--   drop policy if exists "email_signatures_update_own" on public.email_signatures;
--   drop policy if exists "email_signatures_insert_own" on public.email_signatures;
--   drop policy if exists "email_signatures_select_own" on public.email_signatures;
--   drop table if exists public.email_signatures;
--
-- feat(db): assinaturas de e-mail por usuário (email_signatures) — paridade V3->V2
-- (EmailSignaturesSettings/useEmailSignature da V3). Migration ADITIVA: cria a tabela
-- e o contrato de acesso. Nenhuma linha existe antes; nada de backfill.
--
-- DECISOES MEDIDAS NO REPO (nao assumidas):
--  1. Dono = auth.uid() (o id do usuario autenticado), como message_templates
--     (20251215160224: user_id = auth.uid()) e o vizinho email_templates — nao profiles.id.
--  2. Gatilho de updated_at: public.update_updated_at_column() ja existe
--     (20251215024517) e e o que message_templates/email_templates usam.
--  3. "No maximo uma padrao por usuario" = indice unico PARCIAL em (user_id) where is_default
--     (nao ha CHECK que expresse isso; a unicidade e o unico jeito deterministico).
--  4. RLS literal do cartao: SO o dono le/escreve/exclui a propria assinatura. Sem staff
--     (assinatura e dado pessoal de composicao, nao catalogo compartilhado).
--  5. html com teto de 20000 caracteres (CHECK); sanitizacao do HTML e do front, como o cartao diz.
--  6. Escrita nao permite trocar user_id (WITH CHECK = USING): ninguem "doa" nem reatribui
--     a autoria de uma assinatura, evitando escalada por UPDATE.
--  7. ACL: anon/PUBLIC sem grant; authenticated com SELECT/INSERT/UPDATE/DELETE (a RLS
--     filtra); service_role com ALL (BYPASSRLS, uso de Edge/admin).

-- ============ 1. tabela ============
create table if not exists public.email_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name varchar(120) not null,
  html text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_signatures_name_not_blank check (btrim(name) <> ''),
  constraint email_signatures_html_len check (char_length(html) <= 20000)
);

comment on table public.email_signatures is
  'Assinaturas de e-mail do proprio usuario (nome, HTML) com no maximo uma padrao por dono (indice unico parcial em user_id when is_default). Dono em user_id = auth.uid(); acesso so do dono.';

-- ============ 2. indices ============
-- No maximo uma assinatura padrao por usuario.
create unique index if not exists email_signatures_one_default_per_user
  on public.email_signatures (user_id)
  where is_default;
-- Cobre a listagem por dono (e a FK logica de user_id).
create index if not exists email_signatures_user_id_idx on public.email_signatures (user_id);

-- ============ 3. RLS ============
alter table public.email_signatures enable row level security;

drop policy if exists "email_signatures_select_own" on public.email_signatures;
create policy "email_signatures_select_own" on public.email_signatures
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "email_signatures_insert_own" on public.email_signatures;
create policy "email_signatures_insert_own" on public.email_signatures
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "email_signatures_update_own" on public.email_signatures;
create policy "email_signatures_update_own" on public.email_signatures
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "email_signatures_delete_own" on public.email_signatures;
create policy "email_signatures_delete_own" on public.email_signatures
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============ 4. updated_at ============
drop trigger if exists set_email_signatures_updated_at on public.email_signatures;
create trigger set_email_signatures_updated_at
  before update on public.email_signatures
  for each row execute function public.update_updated_at_column();

-- ============ 5. ACL ============
revoke all on table public.email_signatures from public, anon, authenticated;
grant select, insert, update, delete on table public.email_signatures to authenticated;
grant all on table public.email_signatures to service_role;
