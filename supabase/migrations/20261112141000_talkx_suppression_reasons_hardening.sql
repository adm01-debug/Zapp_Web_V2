-- talkx_suppression_reasons_hardening — autor real, rótulo único e índice da FK (Talk X).
--
-- Defeitos corrigidos (produção, conferidos por SELECT em 12/11):
--   1. created_by forjável: o authenticated tem INSERT na coluna created_by
--      (GRANT de colunas da 20261108100000) e o guarda talkx_suppression_reasons_guard
--      não toca nela. Um admin/supervisor podia gravar o motivo em nome de outro usuário.
--      Agora, no INSERT feito como authenticated/anon, created_by := auth.uid()
--      (sobrescreve o enviado). service_role/postgres seguem gravando o valor informado
--      (backend e seed não têm auth.uid()). O GRANT de coluna fica como está: o front
--      que mandar created_by continua funcionando, só não escolhe mais o autor.
--   2. Rótulo duplicado: não havia unicidade em label. Índice único em lower(label)
--      recusa "LGPD" e "lgpd" lado a lado (23505). Produção hoje: 6 motivos, 0 duplicados
--      em lower(label).
--   3. FK talkx_blacklist.reason_code -> talkx_suppression_reasons(code) sem índice
--      (ON UPDATE CASCADE / ON DELETE RESTRICT varrem a tabela inteira). Índice btree
--      simples; a tabela tem 0 linhas em produção, sem custo de criação.
--
-- Base do guarda: pg_get_functiondef de produção (igual ao corpo da 20261108100000);
-- só ganhou o bloco do created_by no ramo INSERT. Mesma assinatura, sem SECURITY DEFINER
-- (current_user tem de ser o papel do chamador), ACL reafirmada.
--
-- Rollback (SQL executável, na ordem): cada linha abaixo sem o prefixo "--   " até a linha
-- "-- Fim do rollback." forma um script único.
-- Extração: sed -n '/^-- Rollback (SQL/,/^-- Fim do rollback/p' ARQ | sed -n 's/^--   //p'
--   DROP INDEX IF EXISTS public.idx_talkx_blacklist_reason_code;
--   DROP INDEX IF EXISTS public.talkx_suppression_reasons_label_lower_key;
--   CREATE OR REPLACE FUNCTION public.talkx_suppression_reasons_guard()
--   RETURNS trigger
--   LANGUAGE plpgsql
--   SET search_path = public, pg_temp
--   AS $$
--   BEGIN
--     IF TG_OP = 'INSERT' THEN
--       IF NEW.is_system AND current_user IN ('authenticated', 'anon') THEN
--         RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema só nasce por migration'
--           USING ERRCODE = '42501';
--       END IF;
--       RETURN NEW;
--     END IF;
--     IF OLD.code IS DISTINCT FROM NEW.code THEN
--       RAISE EXCEPTION 'talkx_suppression_reasons: code imutável após criação'
--         USING ERRCODE = '42501';
--     END IF;
--     IF OLD.is_system IS DISTINCT FROM NEW.is_system THEN
--       RAISE EXCEPTION 'talkx_suppression_reasons: is_system imutável após criação'
--         USING ERRCODE = '42501';
--     END IF;
--     IF OLD.is_system AND OLD.label IS DISTINCT FROM NEW.label THEN
--       RAISE EXCEPTION 'talkx_suppression_reasons: label de motivo do sistema é imutável'
--         USING ERRCODE = '42501';
--     END IF;
--     IF OLD.is_system AND NOT NEW.active THEN
--       RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema não pode ser desativado'
--         USING ERRCODE = '42501';
--     END IF;
--     RETURN NEW;
--   END;
--   $$;
--   REVOKE ALL ON FUNCTION public.talkx_suppression_reasons_guard() FROM PUBLIC, anon, authenticated;
-- Fim do rollback.

-- 0. Pré-condição: sem rótulo duplicado (case-insensitive). Falha com mensagem clara em
-- vez do 23505 genérico do CREATE UNIQUE INDEX.
DO $precond$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(l, ', ') INTO v_dups
    FROM (SELECT lower(label) AS l
            FROM public.talkx_suppression_reasons
           GROUP BY 1
          HAVING count(*) > 1) AS d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: rótulos duplicados (lower) — corrigir antes: %', v_dups
      USING ERRCODE = '23505';
  END IF;
END;
$precond$;

-- 1. Guarda: created_by é sempre quem está logado no INSERT do cliente.
CREATE OR REPLACE FUNCTION public.talkx_suppression_reasons_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_system AND current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema só nasce por migration'
        USING ERRCODE = '42501';
    END IF;
    -- Autor não é escolhido pelo cliente: sobrescreve o created_by enviado.
    IF current_user IN ('authenticated', 'anon') THEN
      NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.code IS DISTINCT FROM NEW.code THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: code imutável após criação'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system IS DISTINCT FROM NEW.is_system THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: is_system imutável após criação'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system AND OLD.label IS DISTINCT FROM NEW.label THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: label de motivo do sistema é imutável'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system AND NOT NEW.active THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema não pode ser desativado'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_suppression_reasons_guard() FROM PUBLIC, anon, authenticated;

-- 2. Rótulo único sem diferenciar maiúsculas/minúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS talkx_suppression_reasons_label_lower_key
  ON public.talkx_suppression_reasons (lower(label));

-- 3. Índice da FK talkx_blacklist.reason_code (CREATE INDEX simples: o gateway do MCP
-- envolve em transação, CONCURRENTLY falharia; tabela com 0 linhas).
CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_reason_code
  ON public.talkx_blacklist (reason_code);
