set local lock_timeout = '5s'

update public.contacts
   set ai_sentiment = null,
       ai_priority  = null
 where ai_projection_analysis_id is null
   and ai_projection_updated_at is null
   and ai_sentiment is not distinct from 'neutro'
   and ai_priority  is not distinct from 'medium'
