-- fix_reminders_migrated_task_identity
-- Rollback: DROP FUNCTION IF EXISTS public.backfill_reminders_to_conversation_tasks(); DROP INDEX IF EXISTS public.uq_conversation_tasks_migrated_from_reminder; ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_migrated_from_reminder_id_fkey; ALTER TABLE public.conversation_tasks DROP COLUMN IF EXISTS migrated_from_reminder_id;
--
-- Item 293 do BACKLOG_VERIFICADO (R2-DB-005). A migração
-- 20260928140000_tasks_unify_reminders_kanban.sql (linhas 165-192) associa
-- reminders -> conversation_tasks por IGUALDADE DE TÍTULO:
--   WITH ins AS (INSERT ... RETURNING id, title)
--   UPDATE public.reminders r SET migrated_task_id = ins.id
--     FROM ins WHERE ins.title = r.title AND r.migrated_task_id IS NULL;
-- title não é único. Dois lembretes de donos/contatos diferentes com o mesmo
-- título disputam as mesmas tarefas: o vínculo pode apontar para a tarefa criada
-- para OUTRO lembrete, ou repetir a mesma tarefa em vários lembretes. O gate de
-- aceite contava NULL=0 e passava.
--
-- Esta migration NÃO reescreve a migration aplicada. Ela:
--   (1) acrescenta a identidade imutável da origem (migrated_from_reminder_id),
--       com bijeção garantida por índice único;
--   (2) repara os vínculos existentes por IDENTIDADE (título + dono + contato +
--       horários + descrição), nunca por título isolado, de forma idempotente;
--   (3) grava a origem somente em vínculos inequívocos já existentes.
--
-- Reexecutar esta função NÃO cria tarefa: se uma tarefa migrada foi apagada e a
-- FK colocou reminders.migrated_task_id em NULL, o reparo preserva esse NULL em
-- vez de ressuscitar a tarefa removida pelo usuário.

-- 1) Origem imutável: a tarefa sabe de qual lembrete nasceu.
ALTER TABLE public.conversation_tasks
  ADD COLUMN IF NOT EXISTS migrated_from_reminder_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversation_tasks_migrated_from_reminder_id_fkey'
      AND conrelid = 'public.conversation_tasks'::regclass
  ) THEN
    ALTER TABLE public.conversation_tasks
      ADD CONSTRAINT conversation_tasks_migrated_from_reminder_id_fkey
      FOREIGN KEY (migrated_from_reminder_id)
      REFERENCES public.reminders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Bijeção: um lembrete gera no máximo uma tarefa, e uma tarefa tem no máximo uma origem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_tasks_migrated_from_reminder
  ON public.conversation_tasks (migrated_from_reminder_id)
  WHERE migrated_from_reminder_id IS NOT NULL;

-- 2) Reparo idempotente e auditável. Roda quantas vezes for preciso; nunca casa por título isolado.
CREATE OR REPLACE FUNCTION public.backfill_reminders_to_conversation_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_vinculados integer := 0;
BEGIN
  -- (A) REPARO: cada lembrete passa a apontar para a tarefa da SUA origem, um-para-um.
  --     NULL em migrated_task_id significa tarefa apagada pela FK ON DELETE SET NULL
  --     e deve continuar NULL; tarefa que já gravou a origem do próprio lembrete
  --     prevalece sobre campos editáveis (título/remind_at/etc.).
  WITH pares AS (
    SELECT r.id AS reminder_id,
           t.id AS task_id,
           row_number() OVER (
             PARTITION BY r.id
             ORDER BY (t.id = r.migrated_task_id) DESC, t.created_at, t.id
           ) AS rn_lembrete,
           row_number() OVER (PARTITION BY t.id ORDER BY r.id) AS rn_tarefa
      FROM public.reminders r
      JOIN public.conversation_tasks t
        ON r.title        IS NOT DISTINCT FROM t.title
       AND r.profile_id   IS NOT DISTINCT FROM t.created_by
       AND r.contact_id   IS NOT DISTINCT FROM t.contact_id
       AND r.remind_at    IS NOT DISTINCT FROM t.remind_at
       AND r.notified_at  IS NOT DISTINCT FROM t.notified_at
       AND r.description  IS NOT DISTINCT FROM t.description
     WHERE r.migrated_task_id IS NOT NULL
  ),
  escolhido AS (
    SELECT reminder_id, task_id FROM pares WHERE rn_lembrete = 1 AND rn_tarefa = 1
  )
  UPDATE public.reminders r
     SET migrated_task_id = e.task_id
    FROM escolhido e
   WHERE r.id = e.reminder_id
     AND r.migrated_task_id IS DISTINCT FROM e.task_id
     AND NOT EXISTS (
       SELECT 1 FROM public.conversation_tasks ct_origem
        WHERE ct_origem.id = r.migrated_task_id
          AND ct_origem.migrated_from_reminder_id = r.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.conversation_tasks ct
        WHERE ct.id = r.migrated_task_id
          AND ct.title        IS NOT DISTINCT FROM r.title
          AND ct.created_by   IS NOT DISTINCT FROM r.profile_id
          AND ct.contact_id   IS NOT DISTINCT FROM r.contact_id
          AND ct.remind_at    IS NOT DISTINCT FROM r.remind_at
          AND ct.notified_at  IS NOT DISTINCT FROM r.notified_at
          AND ct.description  IS NOT DISTINCT FROM r.description
     );

  -- (B) ORIGEM: grava na tarefa a origem quando o vínculo é inequívoco (uma tarefa por
  --     lembrete); vínculo ambíguo fica SEM origem em vez de mentir sobre ela.
  UPDATE public.conversation_tasks t
     SET migrated_from_reminder_id = r.id
    FROM public.reminders r
   WHERE r.migrated_task_id = t.id
     AND t.migrated_from_reminder_id IS NULL
     AND (SELECT count(*) FROM public.reminders r2 WHERE r2.migrated_task_id = t.id) = 1;

  -- Auditoria: quantos lembretes ficaram ligados à SUA origem.
  SELECT count(*) INTO v_vinculados
    FROM public.reminders r
    JOIN public.conversation_tasks t
      ON t.id = r.migrated_task_id
     AND t.migrated_from_reminder_id = r.id;
  RETURN v_vinculados;
END;
$fn$;

-- Helper de reparo, não é RPC de aplicação: ninguém além do dono executa.
REVOKE ALL ON FUNCTION public.backfill_reminders_to_conversation_tasks() FROM PUBLIC, anon, authenticated;

-- 3) Aplica uma vez. Idempotente: reexecutar não cria tarefa nem reposiciona vínculo correto.
SELECT public.backfill_reminders_to_conversation_tasks();
