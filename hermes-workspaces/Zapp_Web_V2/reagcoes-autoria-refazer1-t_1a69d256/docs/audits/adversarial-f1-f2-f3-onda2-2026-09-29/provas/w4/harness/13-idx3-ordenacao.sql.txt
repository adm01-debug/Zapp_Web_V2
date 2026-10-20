-- =============================================================================
-- W4 -- FASE idx3: indices ORDENADOS PARCIAIS para a página (WHERE deleted_at IS
-- NULL). Sem estes, nem a reescrita `IF sort_field=...` consegue evitar o Sort.
-- =============================================================================
-- `deleted_at IS NULL` cobre ~95% das linhas: um indice CHEIO em deleted_at e
-- inutil (95% de seletividade = varredura de qualquer jeito). O que ajuda e o
-- indice PARCIAL com a chave de ordenacao, que serve para (a) descartar as 5%
-- excluidas sem filtro por linha e (b) entregar as linhas JA ordenadas.
--
-- Forma equivalente e mais barata (indice parcial + ordenacao embutida):
--   CREATE INDEX ... ON contacts (name) WHERE deleted_at IS NULL;
-- Em PG >= 11 um indice parcial pode ser usado desde que o predicado do indice
-- seja implicado pelo WHERE da consulta ("deleted_at IS NULL" e literalmente
-- o filtro do RPC).
\set ON_ERROR_STOP on
\timing on
CREATE INDEX IF NOT EXISTS idx_w4_live_name
  ON public.contacts (name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_w4_live_name_desc
  ON public.contacts (name DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_w4_live_created
  ON public.contacts (created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_w4_live_created_desc
  ON public.contacts (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_w4_live_updated_desc
  ON public.contacts (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_w4_live_company
  ON public.contacts (company) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_w4_live_company_desc
  ON public.contacts (company DESC) WHERE deleted_at IS NULL;
-- Cardinalidade baixa: btree resolve; partial reduz o indice em 5%.
CREATE INDEX IF NOT EXISTS idx_w4_live_type
  ON public.contacts (contact_type) WHERE deleted_at IS NULL;
\timing off
ANALYZE public.contacts;
