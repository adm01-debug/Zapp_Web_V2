-- talkx_blacklist_reconcilia_e_higiene
-- Rollback: devolve a policy de DELETE do admin, tira os dois gatilhos da talkx_blacklist e a função talkx_blacklist_no_delete, as duas colunas de trilha, os 3 índices de FK e devolve os privilégios revogados (service_role na mark_pause_investigated, escrita do authenticated na view, EXECUTE de PUBLIC na paginação); a função talkx_blacklist_audit_trigger() e a policy talkx_blacklist_no_delete ficam (já existiam antes).
-- Rollback (SQL executável, na ordem):
--   CREATE POLICY "Admins can remove from blacklist" ON public.talkx_blacklist FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
--   DROP TRIGGER IF EXISTS trg_talkx_blacklist_no_delete ON public.talkx_blacklist;
--   DROP FUNCTION IF EXISTS public.talkx_blacklist_no_delete();
--   DROP TRIGGER IF EXISTS trg_talkx_blacklist_audit ON public.talkx_blacklist;
--   ALTER TABLE public.talkx_blacklist DROP COLUMN IF EXISTS import_batch_id;
--   ALTER TABLE public.talkx_blacklist DROP COLUMN IF EXISTS removal_reason;
--   DROP INDEX IF EXISTS public.idx_talkx_blacklist_reason_code;
--   DROP INDEX IF EXISTS public.idx_instance_pauses_investigated_by;
--   DROP INDEX IF EXISTS public.idx_talkx_suppression_reasons_created_by;
--   GRANT EXECUTE ON FUNCTION public.mark_pause_investigated(uuid, text) TO service_role;
--   GRANT INSERT, UPDATE, DELETE ON public.talkx_campaign_optouts TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, text, uuid) TO PUBLIC;
-- Fim do rollback.
-- Atenção no rollback: as colunas import_batch_id/removal_reason só devem ser
-- removidas se a pré-checagem do dono mostrou que elas NÃO existiam em produção
-- antes desta migration (era o caso em 12/11). O índice idx_talkx_blacklist_reason_code
-- também é criado pela PR #3014; se ela já estiver aplicada, não remover o índice.
--
-- POR QUE ESTA MIGRATION EXISTE (deriva entre o ledger e o banco):
--
-- 1. A migration 20261011003007_talkx_blacklist_audit_trilha_guarda está no ledger de
--    produção (supabase_migrations.schema_migrations), mas os objetos dela NÃO estão no
--    banco: faltam as colunas import_batch_id e removal_reason, o gatilho
--    trg_talkx_blacklist_audit, a função talkx_blacklist_no_delete() e o gatilho
--    trg_talkx_blacklist_no_delete. Arquivo aplicado não se edita (regra 7 do CLAUDE.md),
--    então a reconciliação entra como migration NOVA, idempotente.
--    - A função public.talkx_blacklist_audit_trigger() JÁ existe: o corpo vigente é o de
--      20261108100000 (X070), que preenche reason_code pelo catálogo
--      talkx_suppression_reasons. Esta migration NÃO recria a função; só liga o gatilho a
--      ela. A seção 0 confere que o corpo vivo é o da X070 (lê o catálogo) antes de ligar.
--    - O corpo usa TG_OP = 'INSERT'/'UPDATE', OLD.* no UPDATE e devolve NEW: o gatilho
--      tem de ser BEFORE INSERT OR UPDATE, FOR EACH ROW (igual ao 20261011003007).
--    - Ordem dos gatilhos BEFORE da mesma tabela = ordem alfabética do nome:
--      trg_talkx_blacklist_audit < trg_talkx_blacklist_no_delete <
--      trg_talkx_blacklist_reason_active. O guarda de motivo inativo (X070) roda DEPOIS
--      do gatilho de auditoria e enxerga o reason_code já preenchido a partir de origin,
--      como a X070 previu. A seção 6 confere essa ordem e falha se mudar.
-- 2. Decisão do dono (12/11): NINGUÉM apaga linha da lista de bloqueio, nem admin nem
--    supervisor. A remoção é lógica (UPDATE de removed_at/removed_by/removal_reason).
--    Sai a policy "Admins can remove from blacklist" (20260409190343) e entra a barreira
--    BEFORE DELETE que vale para todo papel (authenticated, service_role e dono).
--    Conferido no código: nenhum DELETE em talkx_blacklist em src/ nem em
--    supabase/functions/ (a tela TalkXSuppression já desbloqueia por UPDATE).
--    Efeito colateral conhecido e desejado: apagar fisicamente um contato que tem linha
--    na lista (FK contact_id ON DELETE CASCADE) passa a falhar; a mesclagem de contatos
--    (merge_contacts_atomic) move as FKs para o primário ANTES do DELETE e segue igual.
-- 3. mark_pause_investigated(uuid, text) (20261111181000) recusa chamada sem auth.uid(),
--    mas o default ACL de produção deixava EXECUTE para service_role. Mesmo contrato da
--    talkx_block_recipient: só authenticated executa. Substitui a PR #2973, que editava o
--    arquivo já existente 20261111181000 (proibido pelo DB Guard).
-- 4. Índices das FKs sem índice (DELETE/UPDATE no pai varre o filho inteiro):
--    talkx_blacklist(reason_code), instance_pauses(investigated_by),
--    talkx_suppression_reasons(created_by). O nome do primeiro é o mesmo da PR #3014
--    (IF NOT EXISTS: quem chegar primeiro cria, o outro vira no-op).
-- 5. talkx_campaign_optouts é uma VIEW de leitura (GROUP BY, não atualizável): o
--    authenticated não precisa de INSERT/UPDATE/DELETE nela. E a
--    talkx_campaign_recipients_page de 20261107180000 (SECURITY DEFINER) nasceu só com
--    GRANT para authenticated, sem REVOKE: PUBLIC (e com ele anon) ficava com EXECUTE.
--
-- Segurança para produção: talkx_blacklist com 0 linhas (12/11). ADD COLUMN sem default
-- é só catálogo; CREATE INDEX simples (o gateway do MCP envolve em transação, então não
-- dá para usar CONCURRENTLY) em tabelas pequenas. lock_timeout curto: se houver fila de
-- lock, a migration aborta inteira em vez de travar a aplicação.
-- Idempotente: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS / REVOKE repetível.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 0. Pré-condições (falha fechada, nada muda se faltar algo).
-- ============================================================================
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
$precond_talkx_blacklist_reconcilia$;

-- ============================================================================
-- 1. Colunas de trilha (20261011003007, passo 1).
-- ============================================================================
ALTER TABLE public.talkx_blacklist
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS removal_reason text;

-- ============================================================================
-- 2. Gatilho de auditoria/normalização ligado à função VIGENTE (corpo da X070).
-- ============================================================================
REVOKE ALL ON FUNCTION public.talkx_blacklist_audit_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_talkx_blacklist_audit ON public.talkx_blacklist;
CREATE TRIGGER trg_talkx_blacklist_audit
  BEFORE INSERT OR UPDATE ON public.talkx_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.talkx_blacklist_audit_trigger();

-- ============================================================================
-- 3. Barreira contra DELETE físico para todo papel (20261011003007, passo 3).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_blacklist_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'talkx_blacklist_delete_bloqueado: use remocao logica via removed_at';
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_blacklist_no_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_talkx_blacklist_no_delete ON public.talkx_blacklist;
CREATE TRIGGER trg_talkx_blacklist_no_delete
  BEFORE DELETE ON public.talkx_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.talkx_blacklist_no_delete();

-- Policy de RLS USING (false) para DELETE do authenticated (20261011003007 e
-- 20261026160000): só cria se faltar, sem derrubar a que já existir.
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
$policy_talkx_blacklist_no_delete$;

-- Decisão do dono: nem admin nem supervisor apagam linha.
DROP POLICY IF EXISTS "Admins can remove from blacklist" ON public.talkx_blacklist;

-- ============================================================================
-- 4. mark_pause_investigated: só authenticated executa (substitui a PR #2973).
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.mark_pause_investigated(uuid, text) FROM service_role;

-- ============================================================================
-- 5. Índices das FKs sem índice.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_reason_code
  ON public.talkx_blacklist (reason_code);
CREATE INDEX IF NOT EXISTS idx_instance_pauses_investigated_by
  ON public.instance_pauses (investigated_by);
CREATE INDEX IF NOT EXISTS idx_talkx_suppression_reasons_created_by
  ON public.talkx_suppression_reasons (created_by);

-- ============================================================================
-- 6. Higiene de privilégios Talk X.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON public.talkx_campaign_optouts FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, text, uuid) FROM PUBLIC, anon;

-- ============================================================================
-- 7. Pós-condições (falha fechada: se algo não ficou como esperado, nada é gravado).
-- ============================================================================
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
$poscond_talkx_blacklist_reconcilia$;

COMMIT;
