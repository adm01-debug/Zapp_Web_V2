-- Bloco 03 do plano de IA — CONTRATO do vocabulário de IA (IA-021 / IA-022 / IA-023).
--
-- Esta migration é a metade "contrato" do bloco: a aditiva
-- (20260930110000_ai_block03_analysis_persistence.sql, já aplicada) criou colunas,
-- RPCs e os helpers `ai_is_canonical_sentiment` / `ai_is_canonical_priority`.
-- Aqui o vocabulário passa a ser IMPOSTO e os defaults que MASCARAVAM ausência
-- deixam de inventar valor.
--
-- Ordem obrigatória: backfill -> checks. Ela deve ser aplicada DEPOIS do deploy
-- das funções (senão função antiga, que ainda escreve 'neutral'/'normal', passa a
-- tomar erro de constraint). Classe: contrato (ALTER COLUMN SET DEFAULT, ADD
-- CONSTRAINT, REVOKE/GRANT) — não perde dado, mas muda a regra de quem escreve.

-- ── 1. Urgência canônica (helper novo, mesmo padrão dos anteriores) ──
create function public.ai_is_canonical_urgency(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or p_value in ('baixa', 'media', 'alta', 'critica');
$$;

create function public.ai_is_canonical_churn_risk(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or p_value in ('low', 'medium', 'high');
$$;

-- ── 2. Backfill do vocabulário legado em contacts ───────────────────
-- Medido antes de escrever isto: 3.104 contatos com 'neutral' e 3.104 com
-- 'normal' (apenas os defaults das colunas) e ZERO linhas em
-- conversation_analyses, então não há histórico a converter.
--
-- Legado conhecido é TRADUZIDO (IA-021); valor desconhecido NÃO é adivinhado:
-- vira NULL (= "sem análise"), preservando o significado de "não classificado".
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
   and ai_sentiment not in ('positivo', 'neutro', 'negativo', 'critico');

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
   and ai_priority not in ('low', 'medium', 'high', 'urgent');

-- ── 3. Fim dos defaults que inventavam dado (IA-023) ────────────────
-- `ai_sentiment DEFAULT 'neutral'` fazia contato nunca analisado parecer
-- "neutro"; `ai_priority DEFAULT 'normal'` fazia parecer priorizado num valor
-- que nenhum consumidor entende. Ausência passa a ser ausência (NULL).
alter table public.contacts alter column ai_sentiment set default null;
alter table public.contacts alter column ai_priority set default null;

-- Mesma máscara nas colunas numéricas da análise: omitir o campo inventava
-- satisfação neutra (50%) e CSAT 3/5.
alter table public.conversation_analyses alter column sentiment_score set default null;
alter table public.conversation_analyses alter column customer_satisfaction set default null;

-- ── 4. Imposição do vocabulário canônico ────────────────────────────
alter table public.contacts
  add constraint contacts_ai_sentiment_canonical
  check (public.ai_is_canonical_sentiment(ai_sentiment)) not valid;
alter table public.contacts
  validate constraint contacts_ai_sentiment_canonical;

alter table public.contacts
  add constraint contacts_ai_priority_canonical
  check (public.ai_is_canonical_priority(ai_priority)) not valid;
alter table public.contacts
  validate constraint contacts_ai_priority_canonical;

alter table public.conversation_analyses
  add constraint conversation_analyses_sentiment_canonical
  check (public.ai_is_canonical_sentiment(sentiment)) not valid;
alter table public.conversation_analyses
  validate constraint conversation_analyses_sentiment_canonical;

alter table public.conversation_analyses
  add constraint conversation_analyses_urgency_canonical
  check (public.ai_is_canonical_urgency(urgency)) not valid;
alter table public.conversation_analyses
  validate constraint conversation_analyses_urgency_canonical;

alter table public.conversation_analyses
  add constraint conversation_analyses_churn_risk_canonical
  check (public.ai_is_canonical_churn_risk(churn_risk)) not valid;
alter table public.conversation_analyses
  validate constraint conversation_analyses_churn_risk_canonical;

-- Origem da etiqueta (IA-028): o código só escreve 'ai' ou 'human'; toleramos
-- 'manual' como sinônimo legado em vez de derrubar escritor desconhecido.
alter table public.ai_conversation_tags
  add constraint ai_conversation_tags_source_known
  check (source is null or source in ('ai', 'human', 'manual')) not valid;
alter table public.ai_conversation_tags
  validate constraint ai_conversation_tags_source_known;

-- ── 5. Privilégio mínimo nas RPCs do bloco ──────────────────────────
-- Elas escrevem projeção de contato e apagam/inserem etiquetas: só o
-- service_role (Edge Functions) executa; `authenticated` deixa de ter EXECUTE
-- herdado de PUBLIC.
revoke all on function public.persist_conversation_analysis(uuid, jsonb, timestamptz) from public;
revoke all on function public.persist_conversation_analysis(uuid, jsonb, timestamptz) from authenticated;
grant execute on function public.persist_conversation_analysis(uuid, jsonb, timestamptz) to service_role;

revoke all on function public.replace_ai_conversation_tags(uuid, jsonb) from public;
revoke all on function public.replace_ai_conversation_tags(uuid, jsonb) from authenticated;
grant execute on function public.replace_ai_conversation_tags(uuid, jsonb) to service_role;
