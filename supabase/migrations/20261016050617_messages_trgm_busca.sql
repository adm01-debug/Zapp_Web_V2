-- messages_trgm_busca
-- Rollback: derruba os dois índices novos. A extensão pg_trgm NÃO é removida: outros objetos do banco já a usam (contatos, team_messages).
-- Rollback (SQL executável, na ordem):
--   DROP INDEX IF EXISTS public.idx_messages_transcription_trgm;
--   DROP INDEX IF EXISTS public.idx_messages_content_trgm;
--
-- Achado L7(b) da auditoria de paridade (15/10/2026): a busca do inbox procura texto
-- parcial em messages.content e messages.transcription com ILIKE '%termo%'
-- (src/components/inbox/useGlobalSearchData.ts, linhas 113-157), um filtro NÃO
-- ancorado — nenhum índice B-tree serve. O único índice que servia à coluna content
-- era o GIN de full-text idx_messages_content_search, removido em
-- 20260901000003_drop_dead_indexes_e51.sql; transcription nunca teve índice. Sem
-- índice, cada tecla digitada varre a tabela inteira.
--
-- Índice GIN de trigramas (pg_trgm) é exatamente o operador que responde a
-- LIKE/ILIKE com curinga no meio, e é o mesmo desenho já usado em
-- team_messages.content (20260927270010). Aditivo: não muda dado, policy, GRANT
-- nem assinatura de função.
--
-- CONCURRENTLY não é possível aqui: o aplicador roda a migration dentro de UMA
-- transação (hermes-db-migrar e o replay local aplicam com transação única para
-- migrations novas). O build do índice é custo de uma vez, com lock de escrita na
-- tabela durante a construção.
--
-- Medido na suíte supabase/tests/messages_trgm_busca.sql (B1/B2 e B3): com 3 ou mais
-- caracteres o planejador usa o índice; com 2 caracteres (o mínimo aceito pela tela)
-- o índice também é utilizável — a suíte registra o plano das duas formas, com e sem
-- `enable_seqscan`. Nenhuma garantia além do que a suíte mede é afirmada aqui.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON public.messages USING gin (content extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_messages_transcription_trgm
  ON public.messages USING gin (transcription extensions.gin_trgm_ops);
