create function public.ai_is_canonical_urgency(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or p_value in ('baixa', 'media', 'alta', 'critica');
$$

create function public.ai_is_canonical_churn_risk(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or p_value in ('low', 'medium', 'high');
$$

update public.contacts
   set ai_sentiment = case ai_sentiment
         when 'positive' then 'positivo'
         when 'negative' then 'negativo'
         when 'neutral' then 'neutro'
         when 'critical' then 'critico'
         when 'positivo' then 'positivo'
         when 'negativo' then 'negativo'
         when 'neutro' then 'neutro'
         when 'critico' then 'critico'
         else null
       end
 where ai_sentiment is not null
   and ai_sentiment not in ('positivo', 'neutro', 'negativo', 'critico')

update public.contacts
   set ai_priority = case ai_priority
         when 'low' then 'low'
         when 'medium' then 'medium'
         when 'high' then 'high'
         when 'urgent' then 'urgent'
         when 'normal' then 'medium'
         when 'baixa' then 'low'
         when 'media' then 'medium'
         when 'alta' then 'high'
         when 'critica' then 'urgent'
         else null
       end
 where ai_priority is not null
   and ai_priority not in ('low', 'medium', 'high', 'urgent')

alter table public.contacts alter column ai_sentiment set default null

alter table public.contacts alter column ai_priority set default null

alter table public.conversation_analyses alter column sentiment_score set default null

alter table public.conversation_analyses alter column customer_satisfaction set default null

alter table public.contacts
  add constraint contacts_ai_sentiment_canonical
  check (public.ai_is_canonical_sentiment(ai_sentiment)) not valid

alter table public.contacts
  validate constraint contacts_ai_sentiment_canonical

alter table public.contacts
  add constraint contacts_ai_priority_canonical
  check (public.ai_is_canonical_priority(ai_priority)) not valid

alter table public.contacts
  validate constraint contacts_ai_priority_canonical

alter table public.conversation_analyses
  add constraint conversation_analyses_sentiment_canonical
  check (public.ai_is_canonical_sentiment(sentiment)) not valid

alter table public.conversation_analyses
  validate constraint conversation_analyses_sentiment_canonical

alter table public.conversation_analyses
  add constraint conversation_analyses_urgency_canonical
  check (public.ai_is_canonical_urgency(urgency)) not valid

alter table public.conversation_analyses
  validate constraint conversation_analyses_urgency_canonical

alter table public.conversation_analyses
  add constraint conversation_analyses_churn_risk_canonical
  check (public.ai_is_canonical_churn_risk(churn_risk)) not valid

alter table public.conversation_analyses
  validate constraint conversation_analyses_churn_risk_canonical

alter table public.ai_conversation_tags
  add constraint ai_conversation_tags_source_known
  check (source is null or source in ('ai', 'human', 'manual')) not valid

alter table public.ai_conversation_tags
  validate constraint ai_conversation_tags_source_known

revoke all on function public.persist_conversation_analysis(uuid, jsonb, timestamptz) from public

revoke all on function public.persist_conversation_analysis(uuid, jsonb, timestamptz) from authenticated

grant execute on function public.persist_conversation_analysis(uuid, jsonb, timestamptz) to service_role

revoke all on function public.replace_ai_conversation_tags(uuid, jsonb) from public

revoke all on function public.replace_ai_conversation_tags(uuid, jsonb) from authenticated

grant execute on function public.replace_ai_conversation_tags(uuid, jsonb) to service_role
