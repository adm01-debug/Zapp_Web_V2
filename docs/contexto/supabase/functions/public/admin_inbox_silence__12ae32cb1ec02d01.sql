CREATE OR REPLACE FUNCTION public.admin_inbox_silence()
 RETURNS TABLE(connection_id uuid, connection_name text, connection_status text, received_5m bigint, received_1h bigint, received_24h bigint, last_inbound_at timestamp with time zone, last_outbound_at timestamp with time zone, silence_minutes integer, is_silent boolean, top_conversations jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_minutos integer;
  v_agora   timestamptz := now();
begin
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Le o limiar sem nunca estourar: valor fora do padrao cai no 10, e o clamp
  -- repete a faixa do CHECK (defesa em profundidade).
  select coalesce(max(case when value ~ '^[0-9]{1,4}$' then value::integer end), 10)
    into v_minutos
    from public.global_settings
   where key = 'inbox_silence_minutes';
  v_minutos := greatest(1, least(coalesce(v_minutos, 10), 1440));

  return query
  with recebidas as (
    select m.whatsapp_connection_id as cid,
           count(*) filter (where m.created_at >= v_agora - interval '5 minutes')::bigint as r5m,
           count(*) filter (where m.created_at >= v_agora - interval '1 hour')::bigint as r1h,
           count(*)::bigint as r24h
      from public.messages m
     where m.sender = 'contact'
       and m.created_at >= v_agora - interval '24 hours'
     group by m.whatsapp_connection_id
  ),
  entradas as (
    select distinct on (m.whatsapp_connection_id)
           m.whatsapp_connection_id as cid,
           m.created_at as ultima_entrada
      from public.messages m
     where m.sender = 'contact'
     order by m.whatsapp_connection_id, m.created_at desc
  ),
  saidas as (
    select distinct on (m.whatsapp_connection_id)
           m.whatsapp_connection_id as cid,
           m.created_at as ultima_saida
      from public.messages m
     where m.sender <> 'contact'
     order by m.whatsapp_connection_id, m.created_at desc
  ),
  ativas as (
    select z.cid,
           jsonb_agg(
             jsonb_build_object(
               'contact_id', z.contact_id,
               'contact_name', z.contact_name,
               'received', z.recebidas,
               'last_at', z.ultima
             )
             order by z.recebidas desc, z.ultima desc
           ) as top_conversations
      from (
        select m.whatsapp_connection_id as cid,
               m.contact_id,
               ct.name as contact_name,
               count(*)::bigint as recebidas,
               max(m.created_at) as ultima,
               row_number() over (
                 partition by m.whatsapp_connection_id
                 order by count(*) desc, max(m.created_at) desc
               ) as rn
          from public.messages m
          left join public.contacts ct on ct.id = m.contact_id
         where m.sender = 'contact'
           and m.contact_id is not null
           and m.created_at >= v_agora - interval '24 hours'
         group by m.whatsapp_connection_id, m.contact_id, ct.name
      ) z
     where z.rn <= 10
     group by z.cid
  )
  select c.id,
         c.name,
         c.status,
         coalesce(r.r5m, 0)::bigint,
         coalesce(r.r1h, 0)::bigint,
         coalesce(r.r24h, 0)::bigint,
         e.ultima_entrada,
         s.ultima_saida,
         v_minutos,
         (e.ultima_entrada is null
            or e.ultima_entrada < v_agora - make_interval(mins => v_minutos)),
         coalesce(a.top_conversations, '[]'::jsonb)
    from public.whatsapp_connections c
    left join recebidas r on r.cid = c.id
    left join entradas  e on e.cid = c.id
    left join saidas    s on s.cid = c.id
    left join ativas    a on a.cid = c.id
   order by c.name nulls last, c.id;
end;
$function$
