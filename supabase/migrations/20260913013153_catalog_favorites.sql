-- E27: catalog_favorites — favoritos do catálogo, por usuário.
-- Segue o mesmo padrão real de favorite_contacts (checado antes de
-- escrever): id proprio + UNIQUE(user_id, product_id) em vez de PK
-- composta, FK simples pra auth.users, 1 unica policy FOR ALL.
-- product_id refere-se ao id do produto no PromoGifts (banco externo,
-- Supabase Cloud separado) — sem FK possível, é só um uuid.
create table public.catalog_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  product_sku text,
  primary_image_url text,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.catalog_favorites enable row level security;

create policy "Users can manage own catalog favorites"
  on public.catalog_favorites
  for all
  using (user_id = auth.uid());

create index idx_catalog_favorites_user_created
  on public.catalog_favorites (user_id, created_at desc);
