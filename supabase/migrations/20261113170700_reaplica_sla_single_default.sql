-- reaplica_sla_single_default
-- Rollback: dropa o índice único parcial public.sla_configurations_single_active_default_idx; os is_default rebaixados NÃO são reativados (em 14/11 o reparo não rebaixa nenhuma linha — só há 1 padrão ativo).
-- Rollback (SQL executável, na ordem):
--   DROP INDEX IF EXISTS public.sla_configurations_single_active_default_idx;
-- Fim do rollback.
--
-- POR QUE EXISTE
-- A 20261013014629_sla_config_single_default está no ledger
-- (supabase_migrations.schema_migrations) com statements NULL, mas o que ela cria
-- NÃO existe em produção (tnnnlkbymytvtqngbbqh). Prova (SELECT só leitura, 14/11/2026):
--   SELECT count(*) FROM pg_indexes WHERE schemaname='public'
--      AND tablename='sla_configurations'
--      AND indexname='sla_configurations_single_active_default_idx';      -> 0
--   SELECT indexdef FROM pg_indexes WHERE schemaname='public'
--      AND tablename='sla_configurations';
--      -> só "CREATE UNIQUE INDEX sla_configurations_pkey ... (id)"
--   SELECT statements IS NULL FROM supabase_migrations.schema_migrations
--    WHERE version='20261013014629';                                        -> true
--   SELECT count(*) FROM public.sla_configurations
--    WHERE is_default IS TRUE AND is_active IS TRUE;                         -> 1 (de 3 linhas)
-- Sem o índice, nada impede um 2º SLA padrão ativo; aí useApplicableSLA
-- (`where is_default ... limit 1`) devolve uma linha arbitrária e o prazo cobrado do
-- atendimento muda entre consultas.
--
-- O QUE FAZ (corpo da 20261013014629 byte-idêntico, só com lock_timeout curto)
--   1) Reparo de duplicatas sem DELETE: mantém o padrão ativo de updated_at mais
--      recente e desliga is_default dos demais (gatilho de updated_at desligado em
--      volta do UPDATE). Hoje rebaixa 0 linhas (há 1 padrão ativo).
--   2) CREATE UNIQUE INDEX IF NOT EXISTS parcial (is_default) WHERE is_default AND
--      is_active: no máximo 1 padrão ativo, para qualquer papel.
-- Idempotente: rodar de novo não muda nada. ACL, policies e colunas: intocadas.
-- Nenhuma migration posterior (main nem PRs abertas em 14/11) toca este índice ou
-- is_default de sla_configurations; a 20261108204000 só cita a tabela em comentário.

SET LOCAL lock_timeout = '3s';
SET search_path = public, pg_temp;

-- ============================================================================
-- 1) Repara duplicatas: rebaixa todos os padrões ativos menos um (sem DELETE)
-- ============================================================================
ALTER TABLE public.sla_configurations
  DISABLE TRIGGER "update_sla_configurations_updated_at";

WITH keeper AS (
  SELECT d.id
    FROM public.sla_configurations AS d
   WHERE d.is_default IS TRUE
     AND d.is_active IS TRUE
   ORDER BY d.updated_at DESC, d.created_at ASC, d.id ASC
   LIMIT 1
)
UPDATE public.sla_configurations AS s
   SET is_default = false
  FROM keeper AS k
 WHERE s.is_default IS TRUE
   AND s.is_active IS TRUE
   AND s.id <> k.id;

ALTER TABLE public.sla_configurations
  ENABLE TRIGGER "update_sla_configurations_updated_at";

-- ============================================================================
-- 2) Torna a duplicata impossível daqui em diante
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS sla_configurations_single_active_default_idx
  ON public.sla_configurations (is_default)
  WHERE is_default IS TRUE
    AND is_active IS TRUE;
