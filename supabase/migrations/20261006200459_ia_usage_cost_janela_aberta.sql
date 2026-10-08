-- ia_usage_cost_janela_aberta
-- Rollback: reaplicar o corpo anterior de supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql
--   (CREATE OR REPLACE FUNCTION public.ai_usage_cost_summary com `and l.created_at < p_until` sem guarda).
--
-- Item 265 (R2-AUTH-041, P2). O painel de consumo de IA chama
-- `ai_usage_cost_summary(p_since, p_until => null, ...)` para pedir a JANELA
-- INTEIRA (o hook declara `p_until: null` e o contrato da IA-055 exige isso),
-- mas a funcao filtrava `l.created_at < p_until` sem tratar o nulo: comparacao
-- com NULL e desconhecida, o WHERE nao deixa passar NENHUMA linha e o relatorio
-- de custo volta zerado ("todas as chamadas da janela" desaparecem) enquanto o
-- resumo de tokens (IA-056) mostra os mesmos registros.
--
-- IA-056 ja resolveu isso do lado dela com `coalesce(p_until, now())`; esta
-- migration aplica a MESMA regra aqui, para as duas agregacoes do painel lerem
-- a mesma janela quando o fim nao e informado. Fim nulo = janela aberta ate
-- agora; fim informado continua EXCLUSIVO (meio-aberta), como na IA-056.
--
-- Classe: CONTRATO (create or replace + revoke/grant) — no modo V2 e aplicada no
-- banco LOCAL da tarefa; em producao entra pelo hermes-tarefa-mergear.
--
-- Nada mais muda: tarifas (vigencia meio-aberta, empate pela reconciliada),
-- moeda unica, contagem de sem-tarifa e autorizacao (security invoker + RLS)
-- seguem identicos a IA-055.

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
      -- Fim ausente NAO pode zerar a janela: sem limite superior o relatorio
      -- vale ate agora (mesma regra da IA-056).
      coalesce(p_until, now()) as fim
  ),
  janela as (
    select l.id,
           l.function_name,
           l.model,
           l.created_at,
           l.total_tokens
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
    'filtros', jsonb_build_object(
      'since', p_since,
      'until', p_until,
      'until_efetivo', (select fim from parametros),
      'fim_exclusivo', true
    ),
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
  'IA-055 + item 265: custo do periodo pela tarifa vigente no instante de cada registro. Fim da janela nulo = aberta ate agora (nunca zera o relatorio). Separa interno de reconciliado, conta (nunca zera) o que ficou sem tarifa e nao converte moeda.';

-- A execucao ja estava negada a public/anon pela IA-055; repetir aqui garante o
-- mesmo estado em um banco construido do zero (o corpo foi trocado, o contrato nao).
revoke all on function public.ai_usage_cost_summary(timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.ai_usage_cost_summary(timestamptz, timestamptz, integer) to authenticated, service_role;

-- security invoker: a leitura da tarifa e do usuario chamador (ver IA-055).
grant select on table public.ai_model_prices to authenticated;
