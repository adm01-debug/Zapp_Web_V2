-- catalogo_rate_limit_politica_confiavel
-- Rollback: o bloco BEGIN-ROLLBACK no fim DESTE arquivo recria public.catalog_rate_limit_hit(uuid, text, integer, integer) com o corpo anterior completo e restaura os mesmos REVOKE/GRANT.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.catalog_rate_limit_hit(
--   p_user      uuid,
--   p_action    text,
--   p_limit     integer,
--   p_window_ms integer
--   )
--   returns boolean
--   language plpgsql
--   security definer
--   set search_path = public, pg_temp
--   as $$
--   declare
--   v_janela interval := make_interval(secs => p_window_ms / 1000.0);
--   v_count  integer;
--   begin
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
--   end;
--   $$;
--
--   comment on function public.catalog_rate_limit_hit(uuid, text, integer, integer) is
--   'CT-19: conta um hit e devolve true enquanto o usuario estiver dentro da cota (p_limit por p_window_ms). Atomico: o insert/on conflict serializa no PK, entao chamadas concorrentes somam corretamente entre isolates. Devolve false para JWT de usuario tentando gastar a cota de outro.';
--
--   revoke all on function public.catalog_rate_limit_hit(uuid, text, integer, integer) from public, anon;
--   grant execute on function public.catalog_rate_limit_hit(uuid, text, integer, integer) to service_role, authenticated;
--
-- R2-DB-010 (item 296) — a cota do catalogo vem de CONFIGURACAO CONFIAVEL, nunca dos argumentos.
--
-- Defeito (auditoria de 2026-10-03, severidade P2): public.catalog_rate_limit_hit(uuid, text,
-- integer, integer) e executavel por `authenticated` e recebia a JANELA como argumento livre.
-- A janela alimentava o DELETE de expurgo: com p_window_ms = 0 o proprio usuario autenticado
-- apagava, na chave dele, TODOS os hits (inclusive o que a chamada acabara de inserir, cujo
-- hit_at default e now()). A chamada seguinte ao endpoint via a cota reiniciada e era liberada.
-- p_limit livre permitia o mesmo por outro caminho (limite arbitrario por RPC direta).
--
-- Correcao: a politica (acao normalizada, cota e janela) fica compilada no corpo da funcao
-- SECURITY DEFINER. Os argumentos p_limit/p_window_ms continuam na ASSINATURA (a edge continua
-- chamando igual, com os mesmos nomes), mas nunca mais decidem o expurgo nem a contagem.
--
-- Acao fora da politica cai no balde 'global' (o mesmo fallback ja documentado na edge), para
-- que um nome de acao inventado pelo cliente nao crie um balde novo e ilimitado.
--
-- Sem efeito colateral estrutural novo: esta migration NAO cria tabela/policy/RLS/indice. Ela
-- so recria a funcao existente e reafirma a ACL da assinatura exata (os mesmos REVOKE/GRANT de
-- 20261003122707), evitando diferenca de banco local fora do objeto do cartao.

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

  -- R2-DB-010: cota e janela saem da politica confiavel compilada. p_limit e p_window_ms NAO
  -- sao lidos (ficam na assinatura so para o chamador existente continuar valido).
  v_action := case p_action
    when 'list_products' then 'list_products'
    when 'get_product' then 'get_product'
    when 'list_categories' then 'list_categories'
    when 'list_suppliers' then 'list_suppliers'
    when 'catalog_stats' then 'catalog_stats'
    when 'bootstrap' then 'bootstrap'
    when 'global' then 'global'
    else 'global'
  end;

  v_limit := case v_action
    when 'list_products' then 120
    else 60
  end;
  v_window := interval '60 seconds';

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
  'R2-DB-010: conta um hit e devolve true enquanto o usuario estiver dentro da cota. A cota e a janela vem de politica confiavel compilada na funcao; p_limit e p_window_ms sao aceitos na assinatura por compatibilidade e IGNORADOS — o expurgo nunca depende de argumento do chamador. Acao desconhecida cai no balde global. Devolve false para JWT de usuario tentando gastar a cota de outro.';

-- Reafirmados (negacao por padrao na assinatura exata). A ACL EFETIVA nao muda: create or replace
-- preserva os privilegios ja concedidos; as linhas existem para o caso de a funcao nascer aqui.
revoke all on function public.catalog_rate_limit_hit(uuid, text, integer, integer) from public, anon;
grant execute on function public.catalog_rate_limit_hit(uuid, text, integer, integer) to service_role, authenticated;

-- ===== BEGIN-ROLLBACK (SQL executavel; ordem inversa dos comandos desta migration) =====
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
