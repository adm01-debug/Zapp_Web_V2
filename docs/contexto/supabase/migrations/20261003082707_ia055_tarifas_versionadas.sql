create table if not exists public.ai_model_prices (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.ai_providers(id) on delete set null,
  model text not null,
  unit text not null,
  currency text not null default 'USD',
  unit_price numeric(18, 8) not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  source text not null default 'internal',
  notes text,
  created_at timestamptz not null default now(),
  constraint ai_model_prices_unit_check check (unit in ('token', 'character', 'second', 'request')),
  constraint ai_model_prices_source_check check (source in ('internal', 'provider_statement')),
  constraint ai_model_prices_price_check check (unit_price >= 0),
  constraint ai_model_prices_currency_check check (char_length(currency) = 3),
  constraint ai_model_prices_vigencia_check check (valid_to is null or valid_to > valid_from)
)

create unique index if not exists uq_ai_model_prices_vigencia
  on public.ai_model_prices (model, unit, valid_from, source)

create index if not exists idx_ai_model_prices_vigencia
  on public.ai_model_prices (model, unit, valid_from desc)

alter table public.ai_model_prices enable row level security

drop policy if exists authenticated_read_ai_model_prices on public.ai_model_prices

create policy authenticated_read_ai_model_prices
  on public.ai_model_prices for select
  to authenticated
  using (true)

comment on table public.ai_model_prices is
  'IA-055: tarifas versionadas por modelo/unidade. valid_from inclusivo, valid_to exclusivo (NULL = vigente). source separa tarifa interna de tarifa reconciliada com o extrato do provedor.'
