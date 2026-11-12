BEGIN

SET LOCAL lock_timeout = '5s'

SET LOCAL statement_timeout = '120s'

DO $precond_talkx_blacklist_reconcilia$
DECLARE
  v_def text;
BEGIN
  IF to_regclass('public.talkx_blacklist') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: public.talkx_blacklist nao existe';
  END IF;
  IF to_regclass('public.talkx_suppression_reasons') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: aplique antes 20261108100000 (talkx_suppression_reasons)';
  END IF;
  IF to_regprocedure('public.talkx_blacklist_audit_trigger()') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: public.talkx_blacklist_audit_trigger() nao existe';
  END IF;
  -- O gatilho so pode ser ligado ao corpo da X070 (le o catalogo). O corpo antigo
  -- (cast para o enum talkx_blacklist_reason, que nao existe mais) zeraria reason_code
  -- calado.
  v_def := pg_get_functiondef('public.talkx_blacklist_audit_trigger()'::regprocedure);
  IF v_def NOT LIKE '%talkx_suppression_reasons%' OR v_def LIKE '%talkx_blacklist_reason%' THEN
    RAISE EXCEPTION 'pre-condicao: corpo de talkx_blacklist_audit_trigger() nao e o de 20261108100000';
  END IF;
  IF to_regprocedure('public.mark_pause_investigated(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: aplique antes 20261111181000 (mark_pause_investigated)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.instance_pauses'::regclass
       AND attname = 'investigated_by' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'pre-condicao: instance_pauses.investigated_by nao existe (20261111181000)';
  END IF;
  IF to_regclass('public.talkx_campaign_optouts') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: view public.talkx_campaign_optouts nao existe';
  END IF;
  IF to_regprocedure('public.talkx_campaign_recipients_page(uuid, integer, text, text, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: aplique antes 20261107180000 (talkx_campaign_recipients_page de 6 argumentos)';
  END IF;
END
$precond_talkx_blacklist_reconcilia$

ALTER TABLE public.talkx_blacklist
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS removal_reason text

REVOKE ALL ON FUNCTION public.talkx_blacklist_audit_trigger() FROM PUBLIC, anon, authenticated

DROP TRIGGER IF EXISTS trg_talkx_blacklist_audit ON public.talkx_blacklist

CREATE TRIGGER trg_talkx_blacklist_audit
  BEFORE INSERT OR UPDATE ON public.talkx_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.talkx_blacklist_audit_trigger()

CREATE OR REPLACE FUNCTION public.talkx_blacklist_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'talkx_blacklist_delete_bloqueado: use remocao logica via removed_at';
END;
$$

REVOKE ALL ON FUNCTION public.talkx_blacklist_no_delete() FROM PUBLIC, anon, authenticated

DROP TRIGGER IF EXISTS trg_talkx_blacklist_no_delete ON public.talkx_blacklist

CREATE TRIGGER trg_talkx_blacklist_no_delete
  BEFORE DELETE ON public.talkx_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.talkx_blacklist_no_delete()

DO $policy_talkx_blacklist_no_delete$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'talkx_blacklist'
       AND policyname = 'talkx_blacklist_no_delete'
  ) THEN
    CREATE POLICY talkx_blacklist_no_delete
      ON public.talkx_blacklist
      FOR DELETE
      TO authenticated
      USING (false);
  END IF;
END
$policy_talkx_blacklist_no_delete$

DROP POLICY IF EXISTS "Admins can remove from blacklist" ON public.talkx_blacklist

REVOKE EXECUTE ON FUNCTION public.mark_pause_investigated(uuid, text) FROM service_role

CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_reason_code
  ON public.talkx_blacklist (reason_code)

CREATE INDEX IF NOT EXISTS idx_instance_pauses_investigated_by
  ON public.instance_pauses (investigated_by)

CREATE INDEX IF NOT EXISTS idx_talkx_suppression_reasons_created_by
  ON public.talkx_suppression_reasons (created_by)

REVOKE INSERT, UPDATE, DELETE ON public.talkx_campaign_optouts FROM authenticated

REVOKE EXECUTE ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, text, uuid) FROM PUBLIC, anon

DO $poscond_talkx_blacklist_reconcilia$
DECLARE
  v_ordem text;
BEGIN
  -- Os três gatilhos BEFORE de linha, habilitados, na ordem alfabética esperada.
  SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) INTO v_ordem
    FROM pg_trigger AS t
   WHERE t.tgrelid = 'public.talkx_blacklist'::regclass
     AND NOT t.tgisinternal
     AND t.tgenabled = 'O'
     AND t.tgname IN ('trg_talkx_blacklist_audit',
                      'trg_talkx_blacklist_no_delete',
                      'trg_talkx_blacklist_reason_active');
  IF v_ordem IS DISTINCT FROM
     'trg_talkx_blacklist_audit,trg_talkx_blacklist_no_delete,trg_talkx_blacklist_reason_active' THEN
    RAISE EXCEPTION 'pos-condicao: gatilhos da talkx_blacklist fora do esperado: %', v_ordem;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'talkx_blacklist'
       AND cmd IN ('DELETE', 'ALL') AND qual IS DISTINCT FROM 'false'
  ) THEN
    RAISE EXCEPTION 'pos-condicao: ainda existe policy que libera DELETE em talkx_blacklist';
  END IF;
  IF has_function_privilege('service_role', 'public.mark_pause_investigated(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-condicao: service_role ainda executa mark_pause_investigated';
  END IF;
  IF has_function_privilege('anon', 'public.talkx_campaign_recipients_page(uuid, integer, text, text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-condicao: anon ainda executa talkx_campaign_recipients_page';
  END IF;
END
$poscond_talkx_blacklist_reconcilia$

COMMIT
