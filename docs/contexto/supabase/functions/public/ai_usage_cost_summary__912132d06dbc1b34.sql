CREATE OR REPLACE FUNCTION public.ai_usage_cost_summary(p_since timestamp with time zone, p_until timestamp with time zone, p_top_functions integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
