drop function if exists public . persist_conversation_analysis ( uuid , jsonb , timestamptz )

create function public . persist_conversation_analysis ( p_contact_id uuid , p_analysis jsonb , p_analyzed_at timestamptz , p_expected_projection_updated_at timestamptz , p_should_project boolean ) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_analysis_id uuid;
  v_sentiment text := nullif(btrim(coalesce(p_analysis ->> 'sentiment', '')), '');
  v_priority text := nullif(btrim(coalesce(p_analysis ->> 'ai_priority', '')), '');
  v_projected boolean := false;
  v_current_projection timestamptz;
begin
  if p_contact_id is null then
    raise exception 'p_contact_id é obrigatório' using errcode = '22023';
  end if;
  if p_should_project is null then
    raise exception 'p_should_project é obrigatório' using errcode = '22023';
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

  -- Trava de versão ATÔMICA (R2-INF-023): a linha do contato é travada e a
  -- versão corrente comparada com a esperada na MESMA transação que decide
  -- gravar. Uma leitura de revalidação atrasada em trânsito não muda o que o
  -- lock enxerga. Contato sumiu ou versão divergiu = contexto superado:
  -- devolve o sinal SEM escrever nada (cancelado não persiste, IA-048).
  if p_should_project then
    select c.ai_projection_updated_at
      into v_current_projection
      from public.contacts c
     where c.id = p_contact_id
     for update;
    if not found then
      return jsonb_build_object(
        'analysis_id', null,
        'projected', false,
        'analyzed_at', p_analyzed_at,
        'superseded', true,
        'current_version', null
      );
    end if;
    if v_current_projection is distinct from p_expected_projection_updated_at then
      return jsonb_build_object(
        'analysis_id', null,
        'projected', false,
        'analyzed_at', p_analyzed_at,
        'superseded', true,
        'current_version', v_current_projection
      );
    end if;
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

  -- Projeção: só quando pedida (p_should_project) e com campo a projetar —
  -- campo ausente não vira valor (IA-023). A comparação de versão acima já
  -- garante que a projeção vigente é a esperada; aqui só falta escrever.
  -- greatest() impede a versão de retroceder no tempo quando p_analyzed_at
  -- (timestamp de término) é mais antigo que a versão vigente.
  if p_should_project and (v_sentiment is not null or v_priority is not null) then
    update public.contacts c
       set ai_sentiment = coalesce(v_sentiment, c.ai_sentiment),
           ai_priority = coalesce(v_priority, c.ai_priority),
           ai_projection_updated_at = greatest(p_analyzed_at, v_current_projection + interval '1 microsecond'),
           ai_projection_analysis_id = v_analysis_id,
           updated_at = now()
     where c.id = p_contact_id;
    v_projected := found;
  end if;

  return jsonb_build_object(
    'analysis_id', v_analysis_id,
    'projected', v_projected,
    'analyzed_at', p_analyzed_at,
    'superseded', false,
    'current_version', v_current_projection
  );
end;
$$

comment on function public . persist_conversation_analysis ( uuid , jsonb , timestamptz , timestamptz , boolean ) is 'Grava a análise e projeta no contato em uma única transação, com trava de VERSÃO atômica (R2-INF-023): a linha do contato é travada e ai_projection_updated_at comparada com p_expected_projection_updated_at; divergência devolve superseded=true sem gravar nada. p_should_project=false grava a análise sem tocar em contacts.'

revoke all on function public . persist_conversation_analysis ( uuid , jsonb , timestamptz , timestamptz , boolean ) from public

revoke all on function public . persist_conversation_analysis ( uuid , jsonb , timestamptz , timestamptz , boolean ) from anon

revoke all on function public . persist_conversation_analysis ( uuid , jsonb , timestamptz , timestamptz , boolean ) from authenticated

grant execute on function public . persist_conversation_analysis ( uuid , jsonb , timestamptz , timestamptz , boolean ) to service_role
