CREATE OR REPLACE FUNCTION public.replace_ai_conversation_tags(p_contact_id uuid, p_tags jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  if p_contact_id is null then
    raise exception 'p_contact_id é obrigatório' using errcode = '22023';
  end if;

  -- Apaga SOMENTE etiquetas de IA: linha com outro `source` (humana/manual) é
  -- preservada, ao contrário do delete().eq('contact_id') anterior, que
  -- apagava qualquer origem.
  delete from public.ai_conversation_tags
   where contact_id = p_contact_id
     and source = 'ai';

  -- Resultado vazio tem semântica explícita: LIMPA as etiquetas de IA.
  insert into public.ai_conversation_tags (contact_id, tag_name, confidence, source)
  select p_contact_id, t.tag_name, max(t.confidence), 'ai'
    from (
      select
        btrim(coalesce(e ->> 'name', '')) as tag_name,
        case
          when nullif(btrim(coalesce(e ->> 'confidence', '')), '') is null then null
          else least(greatest(nullif(btrim(coalesce(e ->> 'confidence', '')), '')::numeric, 0), 1)
        end as confidence
      from jsonb_array_elements(
        case when jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end
      ) as e
    ) t
   where t.tag_name <> ''
   group by t.tag_name
  on conflict (contact_id, tag_name) do update
     set confidence = greatest(
           coalesce(excluded.confidence, public.ai_conversation_tags.confidence),
           coalesce(public.ai_conversation_tags.confidence, excluded.confidence)
         ),
         source = 'ai'
   -- R2-DB-012: a IA só reescreve a etiqueta que ELA criou. Linha humana/manual
   -- (ou com source nulo, origem desconhecida) fica intacta — inclusive a confiança.
   where public.ai_conversation_tags.source = 'ai';

  select count(*) into v_count
    from public.ai_conversation_tags
   where contact_id = p_contact_id and source = 'ai';

  return jsonb_build_object('contact_id', p_contact_id, 'replaced', true, 'count', v_count);
end;
$function$
