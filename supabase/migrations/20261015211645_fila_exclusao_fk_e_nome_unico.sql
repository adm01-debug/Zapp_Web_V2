-- fila_exclusao_fk_e_nome_unico: excluir fila sem erro de FK e sem perder conversa em silencio; nome de fila unico
-- Rollback: desfaz a RPC delete_queue, o indice unico de nome e o ON DELETE das FKs (as filas renomeadas na consolidacao de duplicatas NAO voltam ao nome antigo)
-- Rollback (SQL executavel, na ordem):
--   DROP FUNCTION IF EXISTS public.delete_queue(uuid, uuid);
--   DROP INDEX IF EXISTS public.queues_name_lower_trim_uidx;
--   ALTER TABLE public.channel_routing_rules DROP CONSTRAINT IF EXISTS channel_routing_rules_queue_id_fkey, ADD CONSTRAINT channel_routing_rules_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id);
--   ALTER TABLE public.queue_positions DROP CONSTRAINT IF EXISTS queue_positions_queue_id_fkey, ADD CONSTRAINT queue_positions_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id);
--   ALTER TABLE public.conversation_events DROP CONSTRAINT IF EXISTS conversation_events_from_queue_id_fkey, ADD CONSTRAINT conversation_events_from_queue_id_fkey FOREIGN KEY (from_queue_id) REFERENCES public.queues(id), DROP CONSTRAINT IF EXISTS conversation_events_to_queue_id_fkey, ADD CONSTRAINT conversation_events_to_queue_id_fkey FOREIGN KEY (to_queue_id) REFERENCES public.queues(id);

-- ============================================================================
-- Cartao HQ1 / t_e16586d1 (workersql). Origem: auditoria de paridade V3->V2
-- (PARTE11, 2026-10-13): "excluir uma fila falha por chave estrangeira depois
-- de qualquer transferencia para ela, e as conversas em espera perdem a fila
-- sem aviso". O nome da fila tambem aceita duplicata.
--
-- O que entra:
--   1) FKs que apontam para public.queues ganham comportamento de exclusao:
--      historico (conversation_events) preserva o evento e perde a referencia
--      da fila (SET NULL); channel_routing_rules tambem (a regra sobrevive,
--      sem fila); queue_positions.queue_id e NOT NULL e so existe por causa da
--      fila -> CASCADE.
--   2) public.delete_queue(p_queue_id, p_destino): admin (ou service_role)
--      exclui a fila reatribuindo conversas e posicoes de espera ao destino;
--      sem destino, RECUSA quando ha conversa/posicao apontando para a fila
--      (fim do "perde a fila sem aviso"); deixa trilha em audit_logs.
--      Tudo em uma transacao: falhou, nada mudou.
--   3) indice unico em lower(trim(name)): nome de fila duplicado passa a ser
--      recusado; duplicatas JA existentes (mesmo nome normalizado, ignorando
--      caixa e espaco nas pontas) sao renomeadas para "nome (n)" — nunca
--      apagadas.
-- ============================================================================

-- ─────────── 1) FK de public.queues passa a tratar a exclusao ───────────
do $$
declare
  r record;
  v_con text;
begin
  for r in
    select * from (values
      ('conversation_events',  'from_queue_id', 'SET NULL'),
      ('conversation_events',  'to_queue_id',   'SET NULL'),
      ('channel_routing_rules','queue_id',      'SET NULL'),
      ('queue_positions',      'queue_id',      'CASCADE')
    ) as t(tabela, coluna, acao)
  loop
    if not exists (
      select 1
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = r.tabela and a.attname = r.coluna
    ) then
      raise exception 'public.%.% nao existe', r.tabela, r.coluna;
    end if;

    -- derruba TODA FK da coluna que aponte para public.queues (nome do
    -- constraint varia entre a base local e a producao)
    for v_con in
      select con.conname
        from pg_constraint con
        join pg_class t on t.oid = con.conrelid
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
       where con.contype = 'f'
         and t.relname = r.tabela
         and a.attname = r.coluna
         and con.confrelid = 'public.queues'::regclass
    loop
      execute format('alter table public.%I drop constraint %I', r.tabela, v_con);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.queues(id) on delete %s',
      r.tabela, r.tabela || '_' || r.coluna || '_fkey', r.coluna, r.acao);
  end loop;
end $$;

-- ─────────── 2) nome de fila unico (duplicata e renomeada, nunca apagada) ───────────
do $$
declare
  r record;
  v_base text;
  v_cand text;
  n int;
begin
  for r in
    select id, name from (
      select id, name,
             row_number() over (partition by lower(trim(name)) order by created_at, id) as rn
        from public.queues
    ) d
   where d.rn > 1
  loop
    -- nome normalizado (trim) + sufixo " (n)", sem tocar no nome da fila que
    -- fica: o resultado e deterministico e nao sobra espaco extra no rotulo
    v_base := trim(r.name);
    n := 1;
    loop
      n := n + 1;
      v_cand := v_base || ' (' || n || ')';
      exit when not exists (
        select 1 from public.queues q where lower(trim(q.name)) = lower(trim(v_cand))
      );
    end loop;
    update public.queues set name = v_cand where id = r.id;
    raise notice 'fila % renomeada de "%" para "%" (duplicata de nome normalizado)', r.id, v_base, v_cand;
  end loop;
end $$;

create unique index if not exists queues_name_lower_trim_uidx
  on public.queues (lower(trim(name)));

-- ─────────── 3) RPC de exclusao ───────────
create or replace function public.delete_queue(p_queue_id uuid, p_destino uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
  v_role text;
  v_nome text;
  v_conversas integer := 0;
  v_posicoes integer := 0;
begin
  v_uid := auth.uid();
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');

  -- negar por padrao: so admin/supervisor; o service_role (Edge) entra sem usuario
  if v_role <> 'service_role' then
    if v_uid is null then
      raise exception 'Sem permissao para excluir fila' using errcode = '42501';
    end if;
    if not public.is_admin_or_supervisor(v_uid) then
      raise exception 'Sem permissao para excluir fila' using errcode = '42501';
    end if;
  end if;

  if p_queue_id is null then
    raise exception 'Fila obrigatoria' using errcode = '22004';
  end if;

  -- trava as duas filas sempre na ordem do id (duas exclusoes simultaneas nao
  -- se abracam); nada e escrito antes de todas as validacoes passarem
  if p_destino is not null and p_destino < p_queue_id then
    perform 1 from public.queues where id = p_destino for update;
    perform 1 from public.queues where id = p_queue_id for update;
  else
    perform 1 from public.queues where id = p_queue_id for update;
    if p_destino is not null then
      perform 1 from public.queues where id = p_destino for update;
    end if;
  end if;

  select q.name into v_nome from public.queues q where q.id = p_queue_id;
  if v_nome is null then
    raise exception 'Fila nao encontrada' using errcode = 'P0002';
  end if;

  if p_destino is not null then
    if p_destino = p_queue_id then
      raise exception 'A fila de destino deve ser diferente da fila excluida' using errcode = '22023';
    end if;
    if not exists (select 1 from public.queues q where q.id = p_destino) then
      raise exception 'Fila de destino nao encontrada' using errcode = '22023';
    end if;
  end if;

  select count(*)::integer into v_conversas from public.contacts c where c.queue_id = p_queue_id;
  select count(*)::integer into v_posicoes
    from public.queue_positions p where p.queue_id = p_queue_id;

  if p_destino is null and (v_conversas > 0 or v_posicoes > 0) then
    raise exception
      'Fila em uso: % conversa(s) e % posicao(oes) de espera apontam para ela; informe a fila de destino',
      v_conversas, v_posicoes
      using errcode = '22023';
  end if;

  if p_destino is not null then
    update public.contacts set queue_id = p_destino where queue_id = p_queue_id;
    update public.queue_positions set queue_id = p_destino where queue_id = p_queue_id;
  end if;

  delete from public.queues where id = p_queue_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (v_uid, 'queue_delete', 'queue', p_queue_id,
          jsonb_build_object('name', v_nome,
                             'destination_id', p_destino,
                             'contacts_reassigned', v_conversas,
                             'positions_moved', v_posicoes));

  return v_conversas;
end;
$$;

comment on function public.delete_queue(uuid, uuid) is
  'Exclui a fila (admin ou service_role) reatribuindo conversas e posicoes de espera ao destino; sem destino recusa quando ha uso; grava audit_logs.';

revoke all on function public.delete_queue(uuid, uuid) from public;
revoke all on function public.delete_queue(uuid, uuid) from anon;
grant execute on function public.delete_queue(uuid, uuid) to authenticated;
grant execute on function public.delete_queue(uuid, uuid) to service_role;
