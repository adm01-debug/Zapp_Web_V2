CREATE OR REPLACE FUNCTION public.claim_due_csat_surveys(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, contact_id uuid, agent_id uuid, phone text, message_text text, send_at timestamp with time zone, conversation_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_limit integer;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_csat_limit' using errcode = '22023';
  end if;
  v_limit := least(p_limit, 200);

  -- 1) convite que NÃO pode sair: contato ausente/apagado ou consentimento revogado.
  --    Vira terminal ('failed') em vez de ficar preso na fila para sempre.
  update public.csat_surveys s
     set status = 'failed'
   where s.status = 'scheduled'
     and not exists (
       select 1
         from public.contacts c
        where c.id = s.contact_id
          and c.deleted_at is null
          and coalesce(c.consent_status, 'unknown') <> 'revoked'
     );

  -- 2) claim: marca 'sent' e devolve o lote. for update skip locked evita dois
  --    workers pegarem a mesma linha; o cooldown conta convites dos últimos 30 dias.
  return query
  with devidos as (
    select s.id, s.contact_id, s.agent_id, c.phone, s.message_text, s.send_at, s.conversation_id
      from public.csat_surveys s
      join public.contacts c on c.id = s.contact_id
     where s.status = 'scheduled'
       and s.send_at <= now()
       and c.deleted_at is null
       and coalesce(c.consent_status, 'unknown') <> 'revoked'
       and not exists (
         select 1
           from public.csat_surveys anterior
          where anterior.contact_id = s.contact_id
            and anterior.id <> s.id
            and anterior.status in ('sent', 'responded')
            and anterior.created_at > now() - interval '30 days'
       )
     order by s.send_at, s.created_at
     for update of s skip locked
     limit v_limit
  )
  update public.csat_surveys s
     set status = 'sent'
    from devidos d
   where s.id = d.id
  returning s.id, d.contact_id, d.agent_id, d.phone, d.message_text, d.send_at, d.conversation_id;
end;
$function$
