-- sla_config_single_default
-- Rollback: dropa o índice único parcial public.sla_configurations_single_active_default_idx; os is_default rebaixados NÃO são reativados (a origem das duplicatas é ambígua e não é recuperável de forma segura).
-- Rollback (SQL executável, na ordem):
--   DROP INDEX IF EXISTS public.sla_configurations_single_active_default_idx;
--
-- PROBLEMA (cartão t_18e5bdba)
-- public.sla_configurations não tinha nenhuma restrição de unicidade sobre is_default.
-- Com dois padrões ATIVOS, a escolha do SLA aplicável (`select ... where is_default
-- limit 1`, em useApplicableSLA) devolvia uma linha arbitrária — o comportamento mudava
-- entre consultas e o SLA cobrado não era previsível.
--
-- CORREÇÃO (aditiva, sem apagar linha nenhuma, sem tocar policy/GRANT/coluna)
--   1) Repara duplicatas pré-existentes: mantém UM único padrão ativo — o de
--      updated_at mais recente (o último definido pelo admin; desempate por
--      created_at mais antigo e, por fim, id) — e desliga is_default dos demais.
--      O gatilho de updated_at fica desligado em volta do UPDATE para o reparo não
--      reescrever a data de atualização das linhas rebaixadas.
--   2) Cria índice único PARCIAL sobre is_default com o predicado
--      `WHERE is_default IS TRUE AND is_active IS TRUE`: como só entram no índice
--      linhas já ativas e marcadas como padrão, no máximo UMA linha é indexada.
--      Vale para QUALQUER papel (índice de unicidade não passa por RLS), então nem
--      service_role consegue criar um 2º padrão ativo — fim do caso ambíguo.
--
-- ACL: nada muda (nenhum GRANT/REVOKE) — o único objeto novo é o índice.

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
