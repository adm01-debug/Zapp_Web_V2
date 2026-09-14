-- E28: catalog_send_events — log de envios do catálogo. Schema e RLS
-- seguem o padrão real de csat_surveys (checado antes de escrever):
-- agent_id referencia profiles(id) (não auth.users direto — profiles
-- é quem representa o atendente no app), ON DELETE SET NULL; contact_id
-- referencia contacts(id) ON DELETE CASCADE; 2 policies (insert com
-- WITH CHECK, select restrito a "meus próprios ou admin/supervisor"),
-- não 1 única FOR ALL como catalog_favorites (aquele era por-usuário
-- comum; este é log de atividade com visibilidade restrita).
create table public.catalog_send_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  product_name text not null,
  product_sku text,
  variant_label text,
  contact_id uuid references public.contacts(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  template text check (template in ('formal', 'informal', 'promo', 'custom')),
  images_count integer,
  message_length integer,
  status text check (status in ('sent', 'partial', 'failed')),
  message_ids jsonb,
  created_at timestamptz not null default now()
);

alter table public.catalog_send_events enable row level security;

create policy "Users can insert own catalog send events"
  on public.catalog_send_events
  for insert
  with check (
    agent_id is null
    or agent_id in (select profiles.id from public.profiles where profiles.user_id = auth.uid())
    or is_admin_or_supervisor(auth.uid())
  );

create policy "Users can view own catalog send events"
  on public.catalog_send_events
  for select
  using (
    agent_id in (select profiles.id from public.profiles where profiles.user_id = auth.uid())
    or is_admin_or_supervisor(auth.uid())
  );

create index idx_catalog_send_events_created on public.catalog_send_events (created_at desc);
create index idx_catalog_send_events_product on public.catalog_send_events (product_id);
create index idx_catalog_send_events_contact on public.catalog_send_events (contact_id);
