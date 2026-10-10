-- CT-48 (bloco D/E do catalogo): view catalog_send_stats.
-- Envios do catalogo agregados em TRES graos numa unica view: por dia (ultimos 30 dias), por agente e por produto,
-- com contagem de enviados / parciais / falhas e as respectivas taxas.
--
-- ADITIVA: cria SOMENTE uma view nova. Nao altera tabela, coluna, policy, grant ou dado existente.
-- Usado `create view` (e nao `create or replace`) de proposito: a view nao existe ainda, e o CREATE puro e
-- classificacao aditiva (aplica na tarefa), o que permite catalogar a view com `types-sync` neste mesmo PR.
--
-- security_invoker = on: a view e avaliada com as permissoes e a RLS de QUEM CONSULTA (nao do dono da view).
--   Efeito pratico: um agente comum ve apenas os proprios envios (a policy de catalog_send_events filtra por agent_id),
--   enquanto admin/supervisor veem o conjunto que a policy ja lhes permite. Sem isso a view vazaria envios de outros agentes.
--
-- Cobertura: o filtro de 30 dias e aplicado na CTE base, portanto vale para os tres graos.
--
-- rollback: drop view if exists public.catalog_send_stats;
--   (aditiva: cria apenas uma view; nenhuma tabela, coluna, policy, grant ou dado e alterado, logo nao ha nada a restaurar)

create view public.catalog_send_stats
with (security_invoker = on)
as
with base as (
  select
    created_at::date            as dia,
    agent_id,
    product_id,
    product_name,
    coalesce(status, '')        as status
  from public.catalog_send_events
  where created_at >= (now() - interval '30 days')
),
por_dia as (
  select
    'dia'::text  as grao,
    dia::text    as chave,
    dia::text    as rotulo,
    count(*)     as total,
    count(*) filter (where status = 'sent')    as enviados,
    count(*) filter (where status = 'partial') as parciais,
    count(*) filter (where status = 'failed')  as falhas
  from base
  group by dia
),
por_agente as (
  select
    'agente'::text       as grao,
    agent_id::text       as chave,
    agent_id::text       as rotulo,
    count(*)             as total,
    count(*) filter (where status = 'sent')    as enviados,
    count(*) filter (where status = 'partial') as parciais,
    count(*) filter (where status = 'failed')  as falhas
  from base
  group by agent_id
),
por_produto as (
  select
    'produto'::text          as grao,
    product_id::text         as chave,
    max(product_name)        as rotulo,
    count(*)                 as total,
    count(*) filter (where status = 'sent')    as enviados,
    count(*) filter (where status = 'partial') as parciais,
    count(*) filter (where status = 'failed')  as falhas
  from base
  group by product_id
)
select
  grao,
  chave,
  rotulo,
  total::bigint                                  as total,
  enviados::bigint                               as enviados,
  parciais::bigint                               as parciais,
  falhas::bigint                                 as falhas,
  round(parciais::numeric / nullif(total, 0), 4) as taxa_parcial,
  round(falhas::numeric   / nullif(total, 0), 4) as taxa_falha
from (
  select * from por_dia
  union all
  select * from por_agente
  union all
  select * from por_produto
) t;

comment on view public.catalog_send_stats is
  'CT-48: envios do catalogo por dia (30d), por agente e por produto, com parciais/falhas e taxas. security_invoker=on (respeita a RLS por agent_id de catalog_send_events).';
