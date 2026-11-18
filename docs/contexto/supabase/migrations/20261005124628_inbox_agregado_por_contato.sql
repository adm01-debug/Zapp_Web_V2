create or replace function public . get_inbox_contact_summaries ( p_contact_ids uuid [ ] ) returns table ( contact_id uuid , unread_count bigint , last_message_id uuid , last_message_sender text , last_message_content text , last_message_type text , last_message_created_at timestamp with time zone , last_message_is_read boolean , last_message_external_id text , last_message_media_url text , last_message_status text ) language sql stable security definer set search_path to 'public' as $function$
  WITH alvo AS (
    SELECT DISTINCT alvo_ids.id AS contact_id
    FROM unnest(p_contact_ids) AS alvo_ids(id)
    WHERE alvo_ids.id IS NOT NULL
      AND public.is_contact_visible_to_user(alvo_ids.id, auth.uid())
  ),
  ultima AS (
    SELECT DISTINCT ON (m.contact_id)
      m.contact_id,
      m.id,
      m.sender,
      m.content,
      m.message_type,
      m.created_at,
      m.is_read,
      m.external_id,
      m.media_url,
      m.status
    FROM public.messages m
    JOIN alvo a ON a.contact_id = m.contact_id
    -- created_at DESC + id DESC: o critério de desempate é determinístico mesmo
    -- quando duas mensagens dividem o mesmo carimbo de tempo.
    ORDER BY m.contact_id, m.created_at DESC, m.id DESC
  ),
  nao_lidas AS (
    SELECT m.contact_id, count(*) AS total
    FROM public.messages m
    JOIN alvo a ON a.contact_id = m.contact_id
    WHERE m.sender = 'contact'
      AND m.is_read IS NOT TRUE
    GROUP BY m.contact_id
  )
  SELECT
    ultima.contact_id,
    COALESCE(nao_lidas.total, 0)::bigint AS unread_count,
    ultima.id,
    ultima.sender,
    ultima.content,
    ultima.message_type,
    ultima.created_at,
    ultima.is_read,
    ultima.external_id,
    ultima.media_url,
    ultima.status
  FROM ultima
  LEFT JOIN nao_lidas ON nao_lidas.contact_id = ultima.contact_id;
$function$

revoke all on function public . get_inbox_contact_summaries ( uuid [ ] ) from public

revoke execute on function public . get_inbox_contact_summaries ( uuid [ ] ) from anon

grant execute on function public . get_inbox_contact_summaries ( uuid [ ] ) to authenticated , service_role
