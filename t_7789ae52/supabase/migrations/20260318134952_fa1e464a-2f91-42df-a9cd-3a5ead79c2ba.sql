
-- Add full-text search index to knowledge_base_articles for RAG
ALTER TABLE public.knowledge_base_articles 
ADD COLUMN IF NOT EXISTS search_vector tsvector 
GENERATED ALWAYS AS (
  setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('portuguese', coalesce(category, '')), 'B') ||
  setweight(to_tsvector('portuguese', coalesce(content, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS idx_kb_articles_search ON public.knowledge_base_articles USING gin(search_vector);

-- Function to search KB articles by relevance
CREATE OR REPLACE FUNCTION public.search_knowledge_base(search_query text, max_results integer DEFAULT 5)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  category text,
  tags text[],
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    a.id, a.title, a.content, a.category, a.tags,
    ts_rank(a.search_vector, websearch_to_tsquery('portuguese', search_query)) AS rank
  FROM public.knowledge_base_articles a
  WHERE a.is_published = true
    AND (
      a.search_vector @@ websearch_to_tsquery('portuguese', search_query)
      OR a.title ILIKE '%' || search_query || '%'
      OR a.content ILIKE '%' || search_query || '%'
    )
  ORDER BY rank DESC
  LIMIT max_results;
$$;

-- Add priority column to contacts for AI prioritization
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_priority text DEFAULT 'normal';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_sentiment text DEFAULT 'neutral';
