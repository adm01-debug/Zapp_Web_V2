-- CT-19 (2a parte) — contador append-only.
--
-- Por que trocar: a versao anterior (20261002681230) mantinha UMA linha por
-- (usuario, acao) com `on conflict do update`. Sob concorrencia real (61 requisicoes
-- simultaneas do mesmo usuario/acao) todas disputavam o lock da MESMA linha e o
-- Postgres cancelava por statement timeout. Medido em producao (function_logs):
--   error: "canceling statement due to statement timeout", action: bootstrap
-- e, por causa do fail-open da edge, 429=0 na rajada. A funcao em si esta correta e
-- rapida isolada (5 chamadas / 45 ms / 1 permitida com limite 1) — o defeito era o
-- ponto de serializacao, nao a logica.
--
-- Agora cada hit e LINHA NOVA: insert puro nao disputa lock com insert. O limite e a
-- contagem de linhas dentro da janela, coberta por indice composto.
--
-- rollback: drop function if exists public.catalog_rate_limit_hit(uuid, text, integer, integer); drop table if exists public.catalog_rate_limit_hits; drop table if exists public.catalog_rate_limits;

create table if not exists public.catalog_rate_limit_hits (
  id      bigserial   primary key,
  user_id uuid        not null,
  action  text        not null,
  hit_at  timestamptz not null default now()
);

-- Indice da janela: cobre tanto a contagem por (usuario, acao) quanto a limpeza dos antigos.
create index if not exists catalog_rate_limit_hits_lookup_idx
  on public.catalog_rate_limit_hits (user_id, action, hit_at desc);

comment on table public.catalog_rate_limit_hits is
  'CT-19: um registro por requisicao contada, append-only. O limite e count(*) na janela. Nao e lido nem escrito direto: o unico caminho e a funcao catalog_rate_limit_hit().';

alter table public.catalog_rate_limit_hits enable row level security;

-- Sem policies, de proposito: o unico caminho e a funcao SECURITY DEFINER abaixo.
revoke all on table public.catalog_rate_limit_hits from public, anon, authenticated;

create or replace function public.catalog_rate_limit_hit(
  p_user      uuid,
  p_action    text,
  p_limit     integer,
  p_window_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_janela interval := make_interval(secs => p_window_ms / 1000.0);
  v_count  integer;
begin
  -- Guarda de identidade: usuario autenticado so gasta a PROPRIA cota; o service_role
  -- (auth.uid() nulo) pode passar qualquer usuario, que e como a edge chama.
  if auth.uid() is not null and auth.uid() <> p_user then
    return false;
  end if;

  insert into public.catalog_rate_limit_hits (user_id, action) values (p_user, p_action);

  -- Limpeza oportunista da propria chave: nao deixa hit velho acumular para sempre.
  delete from public.catalog_rate_limit_hits
   where user_id = p_user and action = p_action and hit_at <= now() - v_janela;

  select count(*) into v_count
    from public.catalog_rate_limit_hits
   where user_id = p_user and action = p_action and hit_at > now() - v_janela;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.catalog_rate_limit_hit(uuid, text, integer, integer) from public, anon;
grant execute on function public.catalog_rate_limit_hit(uuid, text, integer, integer) to service_role, authenticated;

-- A tabela antiga fica INERTE (a funcao nao a le mais). Nao e removida aqui: soltar
-- dado so com decisao explicita. Registrado para quem ler depois.
comment on table public.catalog_rate_limits is
  'CT-19: OBSOLETA desde 20261003122707 — substituida por catalog_rate_limit_hits (append-only). O lock de linha do on-conflict estourava o statement timeout sob concorrencia. Nao e mais lida nem escrita.';
