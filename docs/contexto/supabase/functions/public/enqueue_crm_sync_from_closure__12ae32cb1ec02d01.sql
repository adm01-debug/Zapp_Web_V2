CREATE OR REPLACE FUNCTION public.enqueue_crm_sync_from_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_contact public.contacts%rowtype;
  v_phone text;
  v_phone_valid boolean;
begin
  select * into v_contact from public.contacts where id = NEW.contact_id;
  if not found then return NEW; end if;

  v_phone := regexp_replace(coalesce(v_contact.phone, ''), '[^0-9]', '', 'g');
  v_phone_valid := length(v_phone) between 8 and 15;

  insert into public.crm_sync_outbox (
    closure_id, contact_id, idempotency_key, normalized_phone, payload,
    status, last_error_code
  ) values (
    NEW.id,
    NEW.contact_id,
    'closure:' || NEW.id::text,
    case when v_phone_valid then v_phone else null end,
    jsonb_strip_nulls(jsonb_build_object(
      'channel', coalesce(v_contact.channel_type, 'whatsapp'),
      'direction', 'inbound',
      'assunto', left('Conversa encerrada - ' || v_contact.name, 300),
      'resumo', left(coalesce(NEW.notes, NEW.close_reason), 2000),
      -- Ausencia e ausencia: nada e inventado na fronteira com o CRM.
      'sentiment', v_contact.ai_sentiment,
      'zapp_conversation_id', NEW.id::text
    )),
    case when v_phone_valid then 'pending' else 'dead_letter' end,
    case when v_phone_valid then null else 'INVALID_PHONE' end
  ) on conflict (closure_id) do nothing;
  return NEW;
end;
$function$
