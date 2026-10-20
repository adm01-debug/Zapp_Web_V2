-- Recuperacao de DDL aplicado fora do Git (item F18 do plano do Multiplix / issue #1228).
-- Versao: 20260930110000 · nome no ledger: ai_block03_analysis_persistence
--
-- Origem: o DDL abaixo foi aplicado diretamente no banco canonico do Zapp Web V2
-- (tnnnlkbymytvtqngbbqh) e registrado em supabase_migrations.schema_migrations SEM que o
-- arquivo correspondente fosse commitado. O DB Live Guard acusou exatamente isso:
-- "Registro no banco sem arquivo no repo (DDL fora do Git)".
--
-- Reconciliacao: reconstrucao fiel a partir do proprio ledger (os statements foram copiados
-- como estao, sem edicao), conforme docs/MIGRATIONS.md §2. Nada foi reaplicado no banco:
-- a versao ja consta no ledger, por isso o hermes-db-migrar NAO deve ser executado para
-- este arquivo. Os statements abaixo sao o registro historico do que ja esta aplicado.
--
-- Autor da recuperacao: Hermes (tarefa portao-a-f18-contrato-vivo), 30/09/2026.

create function public.ai_is_canonical_sentiment(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or p_value in ('positivo', 'neutro', 'negativo', 'critico');
$$;

create function public.ai_is_canonical_priority(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or p_value in ('low', 'medium', 'high', 'urgent');
$$;

create function public.ai_text_array(p_value jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(x order by ord),
    '{}'::text[]
  )
  from (
    select value as x, ordinality as ord
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
    ) with ordinality
  ) s;
$$;

alter table public.conversation_analyses
  add column if not exists agent_performance jsonb,
  add column if not exists churn_risk text,
  add column if not exists sales_opportunity text,
  add column if not exists analysis_version integer not null default 2,
  add column if not exists period_days integer,
  add column if not exists coverage jsonb,
  add column if not exists model text,
  add column if not exists analyzed_at timestamptz not null default now();

comment on column public.conversation_analyses.agent_performance is
  'Desempenho estimado pelo modelo (empathy/clarity/efficiency/knowledge 1-10). Antes existia só na resposta viva e sumia ao recarregar.';

comment on column public.conversation_analyses.coverage is
  'Evidência/cobertura da análise (quantas mensagens, recorte de período, valores recusados). Distingue medido de estimado.';

comment on column public.conversation_analyses.analysis_version is
  'Versão do contrato de saída usado na análise (IA-025).';

alter table public.contacts
  add column if not exists ai_projection_updated_at timestamptz,
  add column if not exists ai_projection_analysis_id uuid
    references public.conversation_analyses(id) on delete set null;

comment on column public.contacts.ai_projection_updated_at is
  'Quando a projeção de IA (ai_sentiment/ai_priority) foi escrita pela última vez. Usada para impedir que análise de período antigo sobrescreva projeção mais recente.';

create unique index if not exists ai_conversation_tags_contact_tag_uidx
  on public.ai_conversation_tags (contact_id, tag_name);

create function public.persist_conversation_analysis(
  p_contact_id uuid,
  p_analysis jsonb,
  p_analyzed_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_analysis_id uuid;
  v_sentiment text := nullif(btrim(coalesce(p_analysis ->> 'sentiment', '')), '');
  v_priority text := nullif(btrim(coalesce(p_analysis ->> 'ai_priority', '')), '');
  v_projected boolean := false;
begin
  if p_contact_id is null then
    raise exception 'p_contact_id é obrigatório' using errcode = '22023';
  end if;

  -- Valor fora do vocabulário canônico é REJEITADO antes de gravar (IA-025),
  -- em vez de entrar como texto livre (foi assim que 'critica' virou valor
  -- morto em contacts.ai_priority).
  if not public.ai_is_canonical_sentiment(v_sentiment) then
    raise exception 'sentiment fora do vocabulário canônico: %', v_sentiment using errcode = '22023';
  end if;
  if not public.ai_is_canonical_priority(v_priority) then
    raise exception 'ai_priority fora do vocabulário canônico: %', v_priority using errcode = '22023';
  end if;

  insert into public.conversation_analyses (
    contact_id, analyzed_by, summary, sentiment, sentiment_score,
    customer_satisfaction, key_points, next_steps, topics, urgency, status,
    message_count, department, relationship_type, agent_performance,
    churn_risk, sales_opportunity, analysis_version, period_days, coverage,
    model, analyzed_at
  ) values (
    p_contact_id,
    nullif(btrim(coalesce(p_analysis ->> 'analyzed_by', '')), '')::uuid,
    coalesce(nullif(btrim(coalesce(p_analysis ->> 'summary', '')), ''), 'Análise sem resumo'),
    v_sentiment,
    nullif(btrim(coalesce(p_analysis ->> 'sentiment_score', '')), '')::integer,
    nullif(btrim(coalesce(p_analysis ->> 'customer_satisfaction', '')), '')::integer,
    public.ai_text_array(p_analysis -> 'key_points'),
    public.ai_text_array(p_analysis -> 'next_steps'),
    public.ai_text_array(p_analysis -> 'topics'),
    nullif(btrim(coalesce(p_analysis ->> 'urgency', '')), ''),
    coalesce(nullif(btrim(coalesce(p_analysis ->> 'status', '')), ''), 'pendente'),
    nullif(btrim(coalesce(p_analysis ->> 'message_count', '')), '')::integer,
    nullif(btrim(coalesce(p_analysis ->> 'department', '')), ''),
    nullif(btrim(coalesce(p_analysis ->> 'relationship_type', '')), ''),
    case when jsonb_typeof(p_analysis -> 'agent_performance') = 'object'
         then p_analysis -> 'agent_performance' else null end,
    nullif(btrim(coalesce(p_analysis ->> 'churn_risk', '')), ''),
    nullif(btrim(coalesce(p_analysis ->> 'sales_opportunity', '')), ''),
    coalesce(nullif(btrim(coalesce(p_analysis ->> 'analysis_version', '')), '')::integer, 2),
    nullif(btrim(coalesce(p_analysis ->> 'period_days', '')), '')::integer,
    case when jsonb_typeof(p_analysis -> 'coverage') = 'object'
         then p_analysis -> 'coverage' else null end,
    nullif(btrim(coalesce(p_analysis ->> 'model', '')), ''),
    p_analyzed_at
  )
  returning id into v_analysis_id;

  -- Projeção: só escreve se ESTA análise for mais recente que a projeção
  -- vigente. Campo ausente não vira valor (IA-023): se nem sentimento nem
  -- prioridade vieram, a projeção não é tocada.
  if v_sentiment is not null or v_priority is not null then
    update public.contacts c
       set ai_sentiment = coalesce(v_sentiment, c.ai_sentiment),
           ai_priority = coalesce(v_priority, c.ai_priority),
           ai_projection_updated_at = p_analyzed_at,
           ai_projection_analysis_id = v_analysis_id,
           updated_at = now()
     where c.id = p_contact_id
       and (c.ai_projection_updated_at is null or c.ai_projection_updated_at <= p_analyzed_at);
    v_projected := found;
  end if;

  return jsonb_build_object(
    'analysis_id', v_analysis_id,
    'projected', v_projected,
    'analyzed_at', p_analyzed_at
  );
end;
$$;

comment on function public.persist_conversation_analysis(uuid, jsonb, timestamptz) is
  'Grava a análise e projeta no contato em uma única transação, com trava de recência (IA-026/IA-027). Falha em qualquer etapa desfaz tudo: não existe estado em que a análise não gravou mas o contato mudou.';

create function public.replace_ai_conversation_tags(
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
         source = 'ai';

  select count(*) into v_count
    from public.ai_conversation_tags
   where contact_id = p_contact_id and source = 'ai';

  return jsonb_build_object('contact_id', p_contact_id, 'replaced', true, 'count', v_count);
end;
$$;

comment on function public.replace_ai_conversation_tags(uuid, jsonb) is
  'Substitui as etiquetas de IA do contato em uma transação (delete source=ai + insert), preservando etiquetas humanas (IA-028).';
