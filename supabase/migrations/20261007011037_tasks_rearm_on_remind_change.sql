-- tasks_rearm_on_remind_change
-- Rollback: DROP TRIGGER IF EXISTS trg_task_rearm_on_remind_change ON public.conversation_tasks;
--   DROP FUNCTION IF EXISTS public.conversation_task_rearm_on_remind_change();
--
-- Esta migration so cria funcao e gatilho: nenhuma linha e lida ou escrita, entao nao ha dado a
--   restaurar. Rodar os dois `DROP` acima devolve exatamente o comportamento anterior (o Salvar
--   com hora nova volta a nao rearmar a tarefa ja notificada).
--
-- R2-MOD-052 / item 420 (P2) — "Reagendar o alarme pelo Salvar nao rearma uma tarefa que ja
-- foi notificada".
--
-- Defeito (medido no Postgres descartavel do teste, com este arquivo aplicado por ultimo):
--   O alarme da tarefa mora em public.conversation_tasks.remind_at e o carimbo do disparo em
--   notified_at. public.notify_due_tasks() so enxerga `remind_at <= now() AND notified_at IS
--   NULL AND status NOT IN ('done','cancelled')`, que e o mesmo filtro do indice parcial
--   idx_tasks_owner_remind_pending. O unico gatilho de estado da tabela,
--   trg_task_state_change, tem WHEN (NEW.status IS DISTINCT FROM OLD.status): quem muda SO o
--   remind_at nao passa por ele. E esse e exatamente o caminho do Salvar da ficha da tarefa
--   (src/hooks/tasks/shared/WorkItemSheet.tsx monta `patch.remindAt` e
--   src/hooks/tasks/useMyWorkItems.ts:154-163 traduz para `out.remind_at`, sem notified_at).
--   Resultado: o alarme novo e gravado, notified_at continua preenchido e o cron
--   tasks-notify-due nunca mais ve a linha — a tarefa fica muda para sempre.
--
-- Correcao: gatilho BEFORE UPDATE OF remind_at que zera notified_at quando o alarme muda e o
--   escritor NAO declarou um notified_at proprio. Quem depende disso:
--     * Salvar com hora nova (o defeito): notified_at volta a NULL -> o cron rearma;
--     * Adiar/soneca (useWorkItemNotifications.ts) ja manda `notified_at: null` no mesmo
--       update: nada muda de resultado;
--     * desfazer cancelamento/conclusao (R2-MOD-053, useMyWorkItems.restoreSnapshot) reescreve
--       remind_at E notified_at juntos a partir do snapshot — por isso o gatilho respeita um
--       notified_at declarado e diferente do atual; sem essa condicao o undo perderia o
--       "ja notificado";
--     * UPDATE que nao lista remind_at (titulo, position, upsert de reordenacao) nao dispara.
--
-- Sem DML: nenhuma linha existente e lida ou alterada (sem backfill), entao nao ha gatilho de
-- dado a desligar nem valor antigo a guardar. Como o arquivo so cria objeto novo, o unico ACL
-- tocado e o da propria funcao criada aqui (logo abaixo), que nasce fechada.

CREATE OR REPLACE FUNCTION public.conversation_task_rearm_on_remind_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- O WHEN do gatilho ja garante que NEW.remind_at mudou. Aqui so decidimos se quem escreveu
  -- disse algo proprio sobre notified_at: se disse (e diferente do atual), e ele quem manda
  -- (restoreSnapshot do undo); se nao disse, o carimbo antigo nao vale mais para o alarme novo.
  IF NEW.notified_at IS NOT DISTINCT FROM OLD.notified_at THEN
    NEW.notified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Funcao de gatilho NAO precisa de EXECUTE para disparar (o privilegio e conferido uma vez, no
-- CREATE TRIGGER), e a 20261001191230 fechou por FAMILIA (RETURNS trigger em public) o EXECUTE
-- de PUBLIC, anon, authenticated e service_role — regra fail-closed no catalogo. Funcao nova que
-- nasce com o privilegio padrao do schema (authenticated, service_role) furaria essa regra, entao
-- ela e fechada aqui, pela assinatura exata: fica igual a irma conversation_task_state_trigger.
REVOKE EXECUTE ON FUNCTION public.conversation_task_rearm_on_remind_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_task_rearm_on_remind_change ON public.conversation_tasks;
CREATE TRIGGER trg_task_rearm_on_remind_change
  BEFORE UPDATE OF remind_at ON public.conversation_tasks
  FOR EACH ROW
  WHEN (NEW.remind_at IS DISTINCT FROM OLD.remind_at)
  EXECUTE FUNCTION public.conversation_task_rearm_on_remind_change();
