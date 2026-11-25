-- IA-055 §2 — preço de ENTRADA e de SAÍDA, com as tarifas vigentes.
--
-- Por que esta migration existe: a IA-055 guarda uma linha por (modelo, unidade)
-- e o relatório multiplicava `unit_price` pela SOMA dos tokens. Só que o
-- fornecedor cobra preços diferentes por token de entrada e de saída — a
-- diferença não é cosmética:
--
--   deepseek-flash ....... entrada $0.30/M · saída $1.20/M  (96% do custo vem da saída)
--   google/gemini-3.8-flash entrada $0.83/M · saída $4.13/M
--   gpt-4o .............. entrada $2.50/M · saída $10.00/M
--
-- Medido no uso real da base (22/11/2026): com preço único, deepseek-flash
-- sairia 89% mais barato ou 53% mais caro, dependendo de qual preço fosse
-- escolhido; gemini-3.8-flash erraria 374% pelo preço de saída. Um número que
-- erra por um fator de 4 é pior que "sem tarifa": o relatório passa a mentir
-- com cara de medido.
--
-- Desenho: `unit` ganha `input_token` e `output_token` (a identidade da tarifa
-- continua (modelo, unidade, vigência, fonte)). O preço único em `token`
-- permanece aceito como FALLBACK para modelos cujo fornecedor cobra um preço
-- só, e como ponte para as linhas antigas — nunca em paralelo com as duas
-- unidades do mesmo modelo, porque aí a ambiguidade seria escolha, não dado.
--
-- Vigência: `valid_from` recebe o PRIMEIRO uso registrado do modelo em
-- `ai_usage_logs` (fato medido, não data inventada), para o histórico já
-- gravado deixar de aparecer como "sem tarifa". A data da conferência do preço
-- fica em `notes`; não existe série histórica de preço do fornecedor para
-- reconstruir reajustes anteriores.
--
-- Arredondamento: `unit_price` é numeric(18,8), ou seja, granularidade de
-- $0.01 por milhão de tokens. Os preços que só têm 12 casas exatas
-- (gemini 0.825/M e 4.125/M) entram com 0.12% a 0.6% de arredondamento e isso
-- está declarado em `notes` — a alternativa (afrouxar a coluna) seria DDL maior
-- para ganhar centavos.
--
-- Classe: CONTRATO (constraint + dados versionados + create or replace).
-- rollback: delete from public.ai_model_prices where notes like 'IA-055 §2%';
-- rollback: alter table public.ai_model_prices drop constraint if exists ai_model_prices_unit_check;
-- rollback: alter table public.ai_model_prices add constraint ai_model_prices_unit_check
-- rollback:   check (unit in ('token', 'character', 'second', 'request'));
-- rollback: reaplicar supabase/migrations/20261006200459_ia_usage_cost_janela_aberta.sql

alter table public.ai_model_prices drop constraint if exists ai_model_prices_unit_check

alter table public.ai_model_prices add constraint ai_model_prices_unit_check
  check (unit in ('token', 'input_token', 'output_token', 'character', 'second', 'request'))

-- ─── Tarifas conferidas no fornecedor em 22/11/2026 ──────────────────────────
-- Fontes: api-docs.deepseek.com/quick_start/pricing e openrouter.ai/api/v1/models
-- (é por lá que a produção chama esses modelos — ver ai_providers.api_endpoint).
-- O preço de pico do DeepSeek é usado de propósito: o teto de custo do mês tem
-- de ser conservador, e cobrar o pico nunca subestima o gasto.
with tarifas (model, unit, por_milhao, nota) as (
  values
    ('deepseek-flash',           'input_token',  0.30::numeric,
     'DeepSeek V4.1-Flash: entrada cache-miss em horario de PICO (off-peak $0.15/M). Preco conferido em 22/11/2026.'),
    ('deepseek-flash',           'output_token', 1.20::numeric,
     'DeepSeek V4.1-Flash: saida em horario de PICO (off-peak $0.60/M). Preco conferido em 22/11/2026.'),
    ('deepseek-v4-flash',        'input_token',  0.30::numeric,
     'Nome legado: servido pelo DeepSeek V4.1-Flash e cobrado ao preco Flash — entrada (pico).'),
    ('deepseek-v4-flash',        'output_token', 1.20::numeric,
     'Nome legado: servido pelo DeepSeek V4.1-Flash e cobrado ao preco Flash — saida (pico).'),
    ('google/gemini-3.8-flash',  'input_token',  0.825::numeric,
     'OpenRouter: $0.825/M de entrada; arredondado para numeric(18,8) = 0.00000083 (+0.6%). Conferido em 22/11/2026.'),
    ('google/gemini-3.8-flash',  'output_token', 4.125::numeric,
     'OpenRouter: $4.125/M de saida; arredondado para numeric(18,8) = 0.00000413 (-0.12%). Conferido em 22/11/2026.'),
    ('gpt-4o',                   'input_token',  2.50::numeric,
     'OpenAI/OpenRouter: $2.50/M de entrada. Conferido em 22/11/2026.'),
    ('gpt-4o',                   'output_token', 10.00::numeric,
     'OpenAI/OpenRouter: $10.00/M de saida. Conferido em 22/11/2026.')
),
com_inicio as (
  select t.model,
         t.unit,
         round(t.por_milhao / 1000000, 8) as unit_price,
         coalesce((select min(l.created_at) from public.ai_usage_logs l where l.model = t.model), now()) as valid_from,
         'IA-055 §2 - ' || t.nota as notes
    from tarifas t
)
insert into public.ai_model_prices (model, unit, currency, unit_price, valid_from, source, notes)
select model, unit, 'USD', unit_price, valid_from, 'internal', notes
  from com_inicio
 where unit_price > 0
on conflict (model, unit, valid_from, source) do nothing

-- ─── O relatório passa a cobrar entrada e saída separadamente ────────────────
-- Fallback declarado: sem as duas unidades, usa a tarifa única em `token` sobre
-- `total_tokens` (comportamento anterior, preservado para os modelos de preço
-- único e para o histórico das linhas antigas). Sem nenhuma das duas: a linha
-- continua CONTADA em `sem_tarifa`, nunca somada como zero.

create or replace function public.ai_usage_cost_summary(
  p_since timestamptz,
  p_until timestamptz,
  p_top_functions integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with parametros as (
    select
      p_since as inicio,
      coalesce(p_until, now()) as fim
  ),
  janela as (
    select l.id,
           l.function_name,
           l.model,
           l.created_at,
           l.total_tokens,
           l.input_tokens,
           l.output_tokens
      from public.ai_usage_logs l, parametros p
     where l.created_at >= p.inicio
       and l.created_at <  p.fim
  ),
  com_tarifa as (
    select j.id,
           j.function_name,
           j.model,
           j.created_at,
           j.total_tokens,
           j.input_tokens,
           j.output_tokens,
           te.unit_price as preco_entrada,
           ts.unit_price as preco_saida,
           tu.unit_price as preco_unico,
           te.currency   as moeda_entrada,
           ts.currency   as moeda_saida,
           tu.currency   as moeda_unico,
           te.source     as fonte_entrada,
           ts.source     as fonte_saida,
           tu.source     as fonte_unico
      from janela j
      -- Tarifa de ENTRADA vigente no instante do registro.
      left join lateral (
        select p.unit_price, p.currency, p.source
          from public.ai_model_prices p
         where p.model = j.model
           and p.unit = 'input_token'
           and p.valid_from <= j.created_at
           and (p.valid_to is null or j.created_at < p.valid_to)
         order by p.valid_from desc,
                  (p.source = 'provider_statement') desc,
                  p.created_at desc
         limit 1
      ) te on true
      -- Tarifa de SAÍDA vigente no instante do registro.
      left join lateral (
        select p.unit_price, p.currency, p.source
          from public.ai_model_prices p
         where p.model = j.model
           and p.unit = 'output_token'
           and p.valid_from <= j.created_at
           and (p.valid_to is null or j.created_at < p.valid_to)
         order by p.valid_from desc,
                  (p.source = 'provider_statement') desc,
                  p.created_at desc
         limit 1
      ) ts on true
      -- Fallback: tarifa única por token (modelos de preço único).
      left join lateral (
        select p.unit_price, p.currency, p.source
          from public.ai_model_prices p
         where p.model = j.model
           and p.unit = 'token'
           and p.valid_from <= j.created_at
           and (p.valid_to is null or j.created_at < p.valid_to)
         order by p.valid_from desc,
                  (p.source = 'provider_statement') desc,
                  p.created_at desc
         limit 1
      ) tu on true
  ),
  medido as (
    select c.id,
           c.function_name,
           case
             when c.preco_entrada is not null and c.preco_saida is not null
                  and c.input_tokens is not null and c.output_tokens is not null
               then (c.preco_entrada * c.input_tokens) + (c.preco_saida * c.output_tokens)
             when c.preco_unico is not null and c.total_tokens is not null
               then c.preco_unico * c.total_tokens
           end as custo,
           case
             when c.preco_entrada is not null and c.preco_saida is not null
                  and c.input_tokens is not null and c.output_tokens is not null
               then 'entrada_saida'
             when c.preco_unico is not null and c.total_tokens is not null
               then 'preco_unico'
           end as granularidade,
           coalesce(c.moeda_entrada, c.moeda_unico) as currency,
           coalesce(c.fonte_entrada, c.fonte_unico) as source
      from com_tarifa c
  ),
  -- Uma linha de `medido` por registro; separar "temos custo" de "temos linha"
  -- é o que mantém a contagem honesta quando nenhuma das tarifas vale.
  custeado as (
    select m.* from medido m where m.custo is not null
  ),
  moedas as (
    select coalesce(jsonb_agg(distinct currency order by currency), '[]'::jsonb) as lista,
           count(distinct currency) as quantas
      from custeado
  ),
  totais as (
    select count(*)                                                          as chamadas,
           -- Sem tarifa = nenhuma das tres unidades vale no instante do registro.
           count(*) filter (where c.preco_entrada is null
                              and c.preco_saida is null
                              and c.preco_unico is null)                     as sem_tarifa,
           -- ...separando o que ADIANTARIA cadastrar preco (a chamada mediu
           -- tokens) do que nunca vai ser tarifado por token: transcricao e
           -- sintese de voz (scribe/eleven) nao registram token nenhum, e o log
           -- tambem nao guarda a grandeza faturavel (segundos de audio,
           -- caracteres). Sao problemas diferentes e o painel nao pode sugerir
           -- a acao errada.
           count(*) filter (where c.preco_entrada is null
                              and c.preco_saida is null
                              and c.preco_unico is null
                              and coalesce(c.total_tokens, 0) = 0)           as sem_tokens,
           -- Cobrado pelo preco unico porque o fornecedor nao expoe as duas pontas.
           count(*) filter (where c.preco_unico is not null
                              and (c.preco_entrada is null or c.preco_saida is null)) as com_preco_unico,
           -- Tinha tarifa mas o registro nao trouxe a quantidade a multiplicar.
           count(*) filter (where m.custo is null
                              and (c.preco_entrada is not null
                                   or c.preco_saida is not null
                                   or c.preco_unico is not null))            as sem_quantidade
      from com_tarifa c
      left join custeado m on m.id = c.id
  ),
  por_funcao as (
    select coalesce(jsonb_agg(linha order by (linha ->> 'chamadas')::int desc, (linha ->> 'funcao')), '[]'::jsonb) as lista
      from (
        select jsonb_build_object(
                 'funcao', x.function_name,
                 'chamadas', x.chamadas,
                 'chamadas_com_tarifa', x.com_tarifa,
                 'custo_medido', x.custo
               ) as linha
          from (
            select c.function_name,
                   count(*) as chamadas,
                   count(m.id) as com_tarifa,
                   sum(m.custo) as custo
              from com_tarifa c
              left join custeado m on m.id = c.id
             group by c.function_name
          ) x
         order by x.chamadas desc, x.function_name
         limit greatest(p_top_functions, 0)
      ) y
  ),
  somente_uma_moeda as (select (quantas = 1) as sim, lista from moedas)
  select jsonb_build_object(
    'escopo', case when public.is_admin_or_supervisor(auth.uid()) then 'todos' else 'proprio' end,
    'filtros', jsonb_build_object(
      'since', p_since,
      'until', p_until,
      'until_efetivo', (select fim from parametros),
      'fim_exclusivo', true
    ),
    'declaracao', 'sem conversao de moeda; entrada e saida cobradas pelo preco do fornecedor; ausencia de tarifa nao entra como zero',
    'moeda', case when (select sim from somente_uma_moeda) then nullif((select lista ->> 0 from somente_uma_moeda), '') else null end,
    'moedas', (select lista from moedas),
    'chamadas', (select chamadas from totais),
    'chamadas_com_tarifa', (select count(*) from custeado),
    'custo_medido', case when (select sim from somente_uma_moeda) then (select sum(custo) from custeado) else null end,
    'custo_interno', case when (select sim from somente_uma_moeda)
                          then (select sum(custo) from custeado where source = 'internal') else null end,
    'custo_reconciliado', case when (select sim from somente_uma_moeda)
                               then (select sum(custo) from custeado where source = 'provider_statement') else null end,
    'unidades_nao_aplicaveis', jsonb_build_array('character', 'second'),
    'sem_tarifa', jsonb_build_object(
      -- `modelo_sem_tarifa` = tem token medido e falta preco cadastrado.
      'modelo_sem_tarifa', (select sem_tarifa - sem_tokens from totais),
      -- `unidade_nao_medida` = a chamada nao registrou token (voz/audio): o log
      -- nao guarda a grandeza que o fornecedor cobra, entao nao existe preco a
      -- cadastrar aqui — o que falta e a COLETA.
      'unidade_nao_medida', (select sem_tokens from totais),
      'sem_quantidade_medida', (select sem_quantidade from totais),
      'com_preco_unico', (select com_preco_unico from totais),
      'motivo_unidade_nao_medida', 'ai_usage_logs mede tokens; nao existe quantidade em caracteres nem em segundos para multiplicar'
    ),
    'por_funcao', (select lista from por_funcao)
  );
$function$

comment on function public.ai_usage_cost_summary(timestamptz, timestamptz, integer) is
  'IA-055 §2: custo do periodo por tarifa vigente no instante de cada registro, cobrando ENTRADA e SAIDA pelo preco correspondente e caindo no preco unico quando o modelo nao tem as duas. Fim nulo = janela aberta. Separa interno de reconciliado, conta (nunca zera) o que ficou sem tarifa e nao converte moeda.'

revoke all on function public.ai_usage_cost_summary(timestamptz, timestamptz, integer) from public, anon

grant execute on function public.ai_usage_cost_summary(timestamptz, timestamptz, integer) to authenticated, service_role

grant select on table public.ai_model_prices to authenticated
