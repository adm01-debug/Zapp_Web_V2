-- PROPOSTA P004 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: public.department_invites — índice duplicado idx_dept_invites_code
-- Problema: Dois índices cobrem a mesma coluna 'code':
--   department_invites_code_key (constraint UNIQUE — impõe unicidade)
--   idx_dept_invites_code (índice simples — redundante com a constraint acima)
--   Tamanho: 16 kB cada = 16 kB desperdiçados + overhead de escrita desnecessário.
--
--   Evidência (db_duplicate_indexes):
--     idx1=department_invites_code_key, idx2=idx_dept_invites_code, size=16 kB cada
--
-- Impacto se não corrigido: Write amplification desnecessária em INSERT/UPDATE na coluna code.
--
-- ROLLBACK:
--   CREATE INDEX idx_dept_invites_code ON public.department_invites (code);
--
-- NOTA: Manter department_invites_code_key (constraint UNIQUE) — ela impõe a unicidade.
--   Dropar apenas o índice simples redundante.

DROP INDEX IF EXISTS public.idx_dept_invites_code;
