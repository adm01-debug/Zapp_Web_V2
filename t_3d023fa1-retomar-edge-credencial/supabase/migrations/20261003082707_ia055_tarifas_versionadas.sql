-- IA-055 — Tarifas de modelo/serviço com vigência.
--
-- Por que esta tabela existe: hoje o sistema sabe QUANTOS tokens consumiu
-- (`ai_usage_logs`) e não sabe quanto isso custou. Sem tarifa versionada, o
-- custo só existe como número solto em código ou em planilha — e qualquer
-- reajuste de preço reescreve o passado, fazendo o relatório de setembro mudar
-- quando o preço de outubro entra.
--
-- Decisões de desenho:
--  1. VIGÊNCIA, não preço solto: cada linha vale de `valid_from` (inclusivo) até
--     `valid_to` (EXCLUSIVO; NULL = vigente). Fronteira meio-aberta evita que
--     duas vigências cubram o mesmo instante.
--  2. UNIDADE explícita: a IA cobra por token em texto e por caractere/segundo
--     em áudio (IA-055 cita os dois). Unidade diferente não é comparável, então
--     ela participa da identidade da tarifa — nunca se converte por conta.
--  3. `source` distingue TARIFA INTERNA de TARIFA RECONCILIADA com extrato do
--     provedor: o aceite da etapa exige que o relatório diferencie estimativa
--     interna de custo reconciliado.
--  4. Nada de conversão de moeda aqui: guarda-se a moeda da tarifa. Converter
--     exige taxa e data, que são outro problema (não inventado nesta etapa).
--
-- Classe: ADITIVA (tabela nova, nenhum objeto existente alterado).
--
-- rollback: drop policy if exists authenticated_read_ai_model_prices on public.ai_model_prices;
-- rollback: drop index if exists public.idx_ai_model_prices_vigencia;
-- rollback: drop index if exists public.uq_ai_model_prices_vigencia;
-- rollback: drop table if exists public.ai_model_prices;

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
);

-- Uma tarifa por (modelo, unidade, início de vigência, fonte): repetir o mesmo
-- cadastro não cria duas linhas concorrentes que discordariam entre si.
create unique index if not exists uq_ai_model_prices_vigencia
  on public.ai_model_prices (model, unit, valid_from, source);

-- Busca do caminho quente: "qual a tarifa de (modelo, unidade) vigente em T".
create index if not exists idx_ai_model_prices_vigencia
  on public.ai_model_prices (model, unit, valid_from desc);

alter table public.ai_model_prices enable row level security;

-- Leitura para quem já está autenticado: tarifa não é dado pessoal e o relatório
-- roda no app. Escrita NÃO ganha policy: fica restrita ao service_role (as edge
-- functions e a administração), para que preço não seja editável pelo cliente.
drop policy if exists authenticated_read_ai_model_prices on public.ai_model_prices;
create policy authenticated_read_ai_model_prices
  on public.ai_model_prices for select
  to authenticated
  using (true);

comment on table public.ai_model_prices is
  'IA-055: tarifas versionadas por modelo/unidade. valid_from inclusivo, valid_to exclusivo (NULL = vigente). source separa tarifa interna de tarifa reconciliada com o extrato do provedor.';
