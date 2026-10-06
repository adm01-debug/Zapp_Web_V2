-- ai_replace_tags_preserva_humana
-- Rollback: reaplicar o corpo anterior de public.replace_ai_conversation_tags
--   (supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql, linhas 169-221),
--   que termina com "on conflict (contact_id, tag_name) do update set confidence = greatest(...), source = 'ai';"
--   e reconcede o EXECUTE a service_role (revoke all on function ... from public, authenticated;
--   grant execute on function ... to service_role).

-- R2-DB-012 (item 297 / BACKLOG_VERIFICADO P2): a reclassificação de IA convertia uma
-- etiqueta HUMANA homônima em etiqueta de IA.
--
-- Como o defeito acontecia: a versão anterior da RPC já apagava só source='ai' no DELETE
-- inicial, mas o UPSERT final ("on conflict (contact_id, tag_name) do update ... set source = 'ai'")
-- conflitava pela chave única (contact_id, tag_name) e FORÇAVA source='ai' na linha existente.
-- Bastava a sugestão da IA usar um nome que o humano já havia etiquetado à mão: a etiqueta humana
-- passava a ter source='ai' e a próxima reclassificação (delete where source='ai') a apagava —
-- a IA removia uma decisão do humano que ela nunca criou.
--
-- Correção: o conflito só atualiza a linha quando ELA É da IA (where source='ai'). Se a linha
-- existente é humana/manual (ou de origem desconhecida), o UPSERT não a toca: nome, confiança e
-- source permanecem como o humano definiu. Assim a IA nunca adota nem herda uma etiqueta que não é dela.
create or replace function public.replace_ai_conversation_tags(
  p_contact_id uuid,
  p_tags jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

comment on function public.replace_ai_conversation_tags(uuid, jsonb) is
  'Substitui as etiquetas de IA do contato em uma transação (delete source=ai + insert), preservando etiquetas humanas/manuais (IA-028). O UPSERT só atualiza linha de source=ai: etiqueta humana homônima nunca é adotada nem apagada pela reclassificação (R2-DB-012).';
