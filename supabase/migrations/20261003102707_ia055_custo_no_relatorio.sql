-- IA-055 (aceite): o relatório passa a USAR a tarifa aplicável.
--
-- rollback: drop function if exists public.ai_usage_cost_summary(timestamptz, timestamptz, integer);
--
-- Por que uma função separada (e não estender ai_usage_summary):
--   1. o custo depende de OUTRA tabela (ai_model_prices) e de uma regra de
--      vigência por registro; manter as duas agregações separadas evita
--      reescrever 173 linhas de SQL que já está provado e em produção;
--   2. o cliente declara os dois blocos lado a lado, então nenhum número novo
--      entra escondido dentro de um número que já existia.
--
-- Regras (espelham `tarifaAplicavel`/`calcularCusto` do motor, para não existirem
-- duas verdades sobre o mesmo dado):
--   * vigência meio-aberta: valid_from <= created_at < valid_to (NULL = vigente);
--   * casamento por (model, unit); só `unit = 'token'` é aplicável hoje, porque é
--     a única quantidade que `ai_usage_logs` mede (caracteres/segundos não existem
--     no log: devolvidos em `sem_tarifa.motivo_unidade_nao_medida`);
--   * empate de vigência: a tarifa RECONCILIADA vence a interna (`source`);
--   * ausência de tarifa NUNCA entra como zero — vai contada e nomeada;
--   * sem conversão de moeda: com mais de uma moeda o total é null e as moedas
--     são listadas, em vez de somar valores de moedas diferentes.
--
-- Autorização: `security invoker` (o padrão) — a RLS de ai_usage_logs decide o
-- escopo; nada de `security definer` e nada de reimplementar autorização aqui.

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
  with janela as (
    select l.id,
           l.function_name,
           l.model,
           l.created_at,
           l.total_tokens
      from public.ai_usage_logs l
     where l.created_at >= p_since
       and l.created_at <  p_until
  ),
  com_tarifa as (
    select j.id,
           j.function_name,
           j.model,
           j.created_at,
           j.total_tokens,
           t.unit_price,
           t.currency,
           t.source
      from janela j
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
      ) t on true
  ),
  medido as (
    select c.id,
           c.function_name,
           c.currency,
           c.source,
           (c.unit_price * c.total_tokens) as custo
      from com_tarifa c
     where c.unit_price is not null
       and c.total_tokens is not null
  ),
  moedas as (
    select coalesce(jsonb_agg(distinct currency order by currency), '[]'::jsonb) as lista,
           count(distinct currency) as quantas
      from medido
  ),
  totais as (
    select count(*)                                            as chamadas,
           count(*) filter (where c.unit_price is null)         as sem_tarifa,
           count(*) filter (where c.unit_price is not null and c.total_tokens is null)
                                                               as sem_quantidade,
           count(*) filter (where c.model is null)              as sem_modelo
      from com_tarifa c
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
                   count(*) filter (where m.id is not null) as com_tarifa,
                   sum(m.custo) as custo
              from com_tarifa c
              left join medido m on m.id = c.id
             group by c.function_name
          ) x
         order by x.chamadas desc, x.function_name
         limit greatest(p_top_functions, 0)
      ) y
  ),
  somente_uma_moeda as (select (quantas = 1) as sim, lista from moedas)
  select jsonb_build_object(
    'escopo', case when public.is_admin_or_supervisor(auth.uid()) then 'todos' else 'proprio' end,
    'filtros', jsonb_build_object('since', p_since, 'until', p_until, 'fim_exclusivo', true),
    'declaracao', 'sem conversao de moeda; ausencia de tarifa nao entra como zero',
    'moeda', case when (select sim from somente_uma_moeda) then nullif((select lista ->> 0 from somente_uma_moeda), '') else null end,
    'moedas', (select lista from moedas),
    'chamadas', (select chamadas from totais),
    'chamadas_com_tarifa', (select count(*) from medido),
    'custo_medido', case when (select sim from somente_uma_moeda) then (select sum(custo) from medido) else null end,
    'custo_interno', case when (select sim from somente_uma_moeda)
                          then (select sum(custo) from medido where source = 'internal') else null end,
    'custo_reconciliado', case when (select sim from somente_uma_moeda)
                               then (select sum(custo) from medido where source = 'provider_statement') else null end,
    'unidades_nao_aplicaveis', jsonb_build_array('character', 'second'),
    'sem_tarifa', jsonb_build_object(
      'modelo_sem_tarifa', (select sem_tarifa from totais),
      'sem_quantidade_medida', (select sem_quantidade from totais),
      'motivo_unidade_nao_medida', 'ai_usage_logs mede tokens; nao existe quantidade em caracteres nem em segundos para multiplicar'
    ),
    'por_funcao', (select lista from por_funcao)
  );
$function$;

comment on function public.ai_usage_cost_summary(timestamptz, timestamptz, integer) is
  'IA-055: custo do periodo pela tarifa vigente no instante de cada registro. Separa interno de reconciliado, conta (nunca zera) o que ficou sem tarifa e nao converte moeda.';

-- Execucao e PUBLIC por padrao: negar para anon e conceder so a quem tem sessao.
revoke all on function public.ai_usage_cost_summary(timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.ai_usage_cost_summary(timestamptz, timestamptz, integer) to authenticated, service_role;

-- A funcao e `security invoker`: quem le a tarifa e o usuario chamador, entao o
-- SELECT tem de estar CONCEDIDO na tabela (a RLS so filtra linhas, nao concede
-- privilegio). No Supabase isso vem por default privileges implicitas; num
-- PostgreSQL limpo, nao — e o CI prova contrato em PostgreSQL limpo. Explicito
-- aqui para a funcao nao depender de configuracao implicita do ambiente.
grant select on table public.ai_model_prices to authenticated;
