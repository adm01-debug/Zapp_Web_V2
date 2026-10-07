-- catalogo_rate_limit_politica_confiavel
-- Rollback: drop table if exists public.catalog_rate_limit_policy; e create or replace da funcao
-- public.catalog_rate_limit_hit(uuid, text, integer, integer) com o corpo ANTERIOR completo — o SQL
-- executavel (com o REVOKE/GRANT de antes) esta no bloco BEGIN-ROLLBACK no fim DESTE arquivo, e o
-- teste scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh extrai e EXECUTA esse bloco.
-- R2-DB-010 (item 296) — a cota do catalogo vem de CONFIGURACAO CONFIAVEL, nunca dos argumentos.
--
-- Defeito (auditoria de 2026-10-03, severidade P2): public.catalog_rate_limit_hit(uuid, text,
-- integer, integer) e executavel por `authenticated` e recebia a JANELA como argumento livre.
-- A janela alimentava o DELETE de expurgo: com p_window_ms = 0 o proprio usuario autenticado
-- apagava, na chave dele, TODOS os hits (inclusive o que a chamada acabara de inserir, cujo
-- hit_at default e now()). A chamada seguinte ao endpoint via a cota reiniciada e era liberada.
-- p_limit livre permitia o mesmo por outro caminho (limite arbitrario por RPC direta).
--
-- Correcao: a politica (cota e janela) passa a morar em public.catalog_rate_limit_policy —
-- tabela sem acesso para anon/authenticated, lida apenas pela funcao SECURITY DEFINER. Os
-- argumentos p_limit/p_window_ms continuam na ASSINATURA (a edge continua chamando igual, com
-- os mesmos nomes), mas nunca mais decidem o expurgo nem a contagem.
--
-- Acao fora da politica cai no balde 'global' (o mesmo fallback ja documentado na edge), para
-- que um nome de acao inventado pelo cliente nao crie um balde novo e ilimitado.
--
-- Sem efeito colateral: a tabela antiga public.catalog_rate_limits segue inerte e nao existe
-- UPDATE/backfill (nenhuma linha de tabela preexistente e tocada); nenhum GRANT/papel/ACL de
-- objeto preexistente muda de valor (os REVOKE/GRANT da funcao sao os MESMOS de 20261003122707).
-- A janela efetiva e a MESMA que a edge ja usava (60 s; 120/min em list_products), entao o
-- caminho normal nao muda de comportamento.

create table if not exists public.catalog_rate_limit_policy (
  action    text    primary key,
  max_hits  integer not null,
  window_ms integer not null,
  constraint catalog_rate_limit_policy_max_hits_check check (max_hits > 0),
  constraint catalog_rate_limit_policy_window_ms_check check (window_ms > 0)
);

comment on table public.catalog_rate_limit_policy is
  'R2-DB-010: configuracao CONFIAVEL da cota do catalogo (max_hits por window_ms, por acao). Nao e acessivel a anon/authenticated: quem le e a funcao SECURITY DEFINER catalog_rate_limit_hit(). Os valores espelham ACTION_RATE_LIMITS/RATE_WINDOW_MS da edge (supabase/functions/promogifts-catalog).';

alter table public.catalog_rate_limit_policy enable row level security;

-- Sem policies, de proposito: negar por padrao. O unico leitor e a funcao SECURITY DEFINER.
revoke all on table public.catalog_rate_limit_policy from public, anon, authenticated;

insert into public.catalog_rate_limit_policy (action, max_hits, window_ms) values
  ('list_products',   120, 60000),
  ('get_product',      60, 60000),
  ('list_categories',  60, 60000),
  ('list_suppliers',   60, 60000),
  ('catalog_stats',    60, 60000),
  ('bootstrap',        60, 60000),
  ('global',           60, 60000)
on conflict (action) do nothing;

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
  v_action text;
  v_limit  integer;
  v_window interval;
  v_count  integer;
begin
  if p_user is null then
    raise exception 'catalog_rate_limit_hit: p_user e obrigatorio'
      using errcode = 'null_value_not_allowed';
  end if;

  -- Guarda de identidade (inalterada): quem chama com JWT de usuario so gasta a PROPRIA cota.
  -- O service_role (auth.uid() nulo) pode passar qualquer usuario, que e como a edge chama.
  if auth.uid() is not null and auth.uid() <> p_user then
    return false;
  end if;

  -- R2-DB-010: cota e janela saem da tabela confiavel. p_limit e p_window_ms NAO sao lidos
  -- (ficam na assinatura so para o chamador existente continuar valido).
  select p.action, p.max_hits, make_interval(secs => p.window_ms / 1000.0)
    into v_action, v_limit, v_window
    from public.catalog_rate_limit_policy p
   where p.action = p_action;

  if not found then
    select p.action, p.max_hits, make_interval(secs => p.window_ms / 1000.0)
      into v_action, v_limit, v_window
      from public.catalog_rate_limit_policy p
     where p.action = 'global';
  end if;

  v_action := coalesce(v_action, 'global');
  v_limit  := coalesce(v_limit, 60);
  v_window := coalesce(v_window, interval '60 seconds');

  insert into public.catalog_rate_limit_hits (user_id, action) values (p_user, v_action);

  -- Expurgo oportunista: apaga so o que JA saiu da janela EFETIVA (a da politica). Nenhum
  -- argumento do chamador alcanca este DELETE, entao ele nunca apaga hit dentro da janela.
  delete from public.catalog_rate_limit_hits
   where user_id = p_user and action = v_action and hit_at <= now() - v_window;

  select count(*) into v_count
    from public.catalog_rate_limit_hits
   where user_id = p_user and action = v_action and hit_at > now() - v_window;

  return v_count <= v_limit;
end;
$$;

comment on function public.catalog_rate_limit_hit(uuid, text, integer, integer) is
  'R2-DB-010: conta um hit e devolve true enquanto o usuario estiver dentro da cota. A cota e a janela vem de public.catalog_rate_limit_policy (configuracao confiavel); p_limit e p_window_ms sao aceitos na assinatura por compatibilidade e IGNORADOS — o expurgo nunca depende de argumento do chamador. Acao desconhecida cai no balde global. Devolve false para JWT de usuario tentando gastar a cota de outro.';

-- Reafirmados (negacao por padrao na assinatura exata). A ACL EFETIVA nao muda: create or replace
-- preserva os privilegios ja concedidos; as linhas existem para o caso de a funcao nascer aqui.
revoke all on function public.catalog_rate_limit_hit(uuid, text, integer, integer) from public, anon;
grant execute on function public.catalog_rate_limit_hit(uuid, text, integer, integer) to service_role, authenticated;

-- ===== BEGIN-ROLLBACK (SQL executavel; ordem inversa dos comandos desta migration) =====
-- drop table if exists public.catalog_rate_limit_policy;
--
-- create or replace function public.catalog_rate_limit_hit(
--   p_user      uuid,
--   p_action    text,
--   p_limit     integer,
--   p_window_ms integer
-- )
-- returns boolean
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_janela interval := make_interval(secs => p_window_ms / 1000.0);
--   v_count  integer;
-- begin
--   if auth.uid() is not null and auth.uid() <> p_user then
--     return false;
--   end if;
--
--   insert into public.catalog_rate_limit_hits (user_id, action) values (p_user, p_action);
--
--   delete from public.catalog_rate_limit_hits
--    where user_id = p_user and action = p_action and hit_at <= now() - v_janela;
--
--   select count(*) into v_count
--     from public.catalog_rate_limit_hits
--    where user_id = p_user and action = p_action and hit_at > now() - v_janela;
--
--   return v_count <= p_limit;
-- end;
-- $$;
--
-- comment on function public.catalog_rate_limit_hit(uuid, text, integer, integer) is
--   'CT-19: conta um hit e devolve true enquanto o usuario estiver dentro da cota (p_limit por p_window_ms). Atomico: o insert/on conflict serializa no PK, entao chamadas concorrentes somam corretamente entre isolates. Devolve false para JWT de usuario tentando gastar a cota de outro.';
--
-- revoke all on function public.catalog_rate_limit_hit(uuid, text, integer, integer) from public, anon;
-- grant execute on function public.catalog_rate_limit_hit(uuid, text, integer, integer) to service_role, authenticated;
-- ===== END-ROLLBACK =====
