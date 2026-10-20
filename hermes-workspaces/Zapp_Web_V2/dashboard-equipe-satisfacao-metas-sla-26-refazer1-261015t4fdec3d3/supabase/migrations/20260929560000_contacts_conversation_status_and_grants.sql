-- Migration: canonicaliza contacts.conversation_status + revoga grants perigosos em contacts
-- Autor: Hermes (docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md — etapas 14 e 15)
--
-- (14) Havia DOIS CHECKs ativos e contraditorios na mesma coluna (auditoria §3.3):
--        contacts_conversation_status_check : open | waiting | resolved | archived
--        chk_conversation_status_values     : open | resolved | pending | closed (ou NULL)
--      A interseccao era so `open`/`resolved`, entao `pending` (14 usos no front) e
--      `waiting` (3 usos) eram rejeitados pelo banco — enquanto o FSM
--      `enforce_conversation_status_transition` validava transicoes entre eles.
--      Censo antes da migration: 3.087 `open`, 17 `resolved`, nenhum outro valor.
--      Agora existe UM conjunto canonico com os 6 estados do FSM, e o FSM aceita o mesmo
--      conjunto (alinhado a `ConversationStatus` em src/types/chat.ts).
--
-- (15) `authenticated` e `anon` tinham TRUNCATE e REFERENCES em public.contacts. RLS NAO
--      cobre TRUNCATE: qualquer sessao autenticada com acesso REST podia esvaziar a tabela.
--      `anon` tambem tinha SELECT, inutil porque a policy de SELECT e `TO authenticated`.
--
-- Layout: `BEGIN` fica na mesma linha da abertura do bloco de proposito — ver a nota no
-- topo de 20260929370000 (heuristica do hermes-db-migrar x corpo plpgsql em dollar-quote).
--
-- Aplicada DEPOIS do merge e do deploy (classe contrato), pelo hermes-tarefa-mergear.

-- ── (14) um unico CHECK canonico ──────────────────────────────────────────────────────────
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_conversation_status_check;

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS chk_conversation_status_values;

ALTER TABLE public.contacts
  ADD CONSTRAINT chk_conversation_status_values
  CHECK (
    conversation_status IS NULL
    OR conversation_status IN ('open', 'pending', 'waiting', 'resolved', 'closed', 'archived')
  );

COMMENT ON CONSTRAINT chk_conversation_status_values ON public.contacts IS
  'Estados canonicos de conversa (6), alinhados ao FSM enforce_conversation_status_transition '
  'e a src/types/chat.ts ConversationStatus. Sincronizar os tres ao alterar.';

-- FSM alinhado ao conjunto canonico. Regras escolhidas (documentadas porque o plano nao as
-- fixava): qualquer estado ativo pode ir para qualquer outro; `resolved` nao volta para
-- `waiting` (nao ha o que aguardar depois de resolvido); `closed` so reabre ou arquiva;
-- `archived` so desarquiva (volta a ativo = open/pending).
CREATE OR REPLACE FUNCTION public.enforce_conversation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ BEGIN
  -- No-op when status is unchanged (WHEN clause already guards, but defensive)
  IF OLD.conversation_status IS NOT DISTINCT FROM NEW.conversation_status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('pending', 'waiting', 'resolved', 'closed', 'archived')) OR
    (OLD.conversation_status = 'pending'  AND NEW.conversation_status IN ('open', 'waiting', 'resolved', 'closed', 'archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open', 'pending', 'resolved', 'closed', 'archived')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open', 'pending', 'closed', 'archived')) OR
    (OLD.conversation_status = 'closed'   AND NEW.conversation_status IN ('open', 'pending', 'archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status IN ('open', 'pending'))
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %',
      OLD.conversation_status, NEW.conversation_status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END;
$function$;

-- ── (15) superficie de grants de public.contacts ──────────────────────────────────────────
-- TRUNCATE nao passa por RLS e REFERENCES permitiria criar FKs apontando para a tabela.
REVOKE TRUNCATE, REFERENCES ON public.contacts FROM authenticated, anon;

-- A policy de SELECT de `contacts` e `TO authenticated`; o SELECT de `anon` nunca devolvia
-- linha e so poluia auditoria de grants (auditoria §3.4).
REVOKE SELECT ON public.contacts FROM anon;
