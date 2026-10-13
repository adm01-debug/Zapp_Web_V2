-- Teste de regressao da paridade V3->V2 das notas fixadas (contact_notes.is_pinned).
--
-- ESCOPO E LIMITACAO (ler antes de confiar): rodando pela wrapper `db_query` a sessao e
-- service_role (BYPASSRLS), entao aqui NAO se exercita o enforcement de RLS. Este arquivo prova a
-- ESTRUTURA (coluna, indice parcial, RLS ligada, policies e gatilho intactos, ACL fechada). O
-- COMPORTAMENTO por papel real (autor fixa/desfixa a propria nota, terceiro nao fixa nota alheia,
-- contato oculto, anon recusado, indice parcial usado) foi provado em PG 17 DESCARTAVEL pelo
-- scripts/db-audit/inbox-contact-authorization.test.sh (bloco "Notas fixadas"), com vermelho
-- antes (sem a migration fixar falha) e verde depois.
--
-- Sem EXCEPTION = verde. Read-only, sem side effects.

DO $$
DECLARE
  v_col boolean;
  v_idx boolean;
  v_rls boolean;
  v_policies integer;
  v_trigger integer;
  v_anon boolean;
  v_authenticated boolean;
BEGIN
  -- T1: a coluna existe, e boolean, NOT NULL e nasce com default false (caso legado).
  SELECT (data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false')
    INTO v_col
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'contact_notes'
     AND column_name = 'is_pinned';
  IF v_col IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'contact_notes_pinned T1 FALHOU: is_pinned ausente ou divergente (esperado boolean NOT NULL DEFAULT false)';
  END IF;

  -- T2: existe o indice parcial das fixadas, valido, com predicado is_pinned.
  SELECT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE i.indrelid = 'public.contact_notes'::regclass
       AND c.relname = 'contact_notes_pinned_idx'
       AND i.indisvalid
       AND pg_get_expr(i.indpred, i.indrelid) = 'is_pinned'
  ) INTO v_idx;
  IF v_idx IS NOT TRUE THEN
    RAISE EXCEPTION 'contact_notes_pinned T2 FALHOU: indice parcial contact_notes_pinned_idx ausente/invalido ou sem o predicado WHERE is_pinned';
  END IF;

  -- T3: a RLS da tabela continua ligada (a coluna nova nao pode ter desligado nada).
  SELECT relrowsecurity INTO v_rls
    FROM pg_class
   WHERE oid = 'public.contact_notes'::regclass;
  IF v_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'contact_notes_pinned T3 FALHOU: RLS de contact_notes desligada';
  END IF;

  -- T4: as 4 policies canonicas continuam (a migration nao mexe em policy).
  SELECT count(*) INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'contact_notes'
     AND policyname IN (
       'contact_notes_select_policy',
       'contact_notes_insert_policy',
       'contact_notes_update_policy',
       'contact_notes_delete_policy'
     );
  IF v_policies <> 4 THEN
    RAISE EXCEPTION 'contact_notes_pinned T4 FALHOU: policies canonicas = % (esperado 4)', v_policies;
  END IF;

  -- T5: o gatilho que congela contact_id/author_id continua instalado.
  SELECT count(*) INTO v_trigger
    FROM pg_trigger
   WHERE tgrelid = 'public.contact_notes'::regclass
     AND tgname = 'guard_contact_note_identity'
     AND NOT tgisinternal;
  IF v_trigger <> 1 THEN
    RAISE EXCEPTION 'contact_notes_pinned T5 FALHOU: gatilho guard_contact_note_identity ausente';
  END IF;

  -- T6: ACL intacta — anon sem nada; authenticated com o CRUD ja concedido (a coluna nova herda
  -- o GRANT de tabela; nenhum privilegio novo foi aberto por esta migration).
  SELECT has_table_privilege('anon', 'public.contact_notes', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
    INTO v_anon;
  IF v_anon IS NOT FALSE THEN
    RAISE EXCEPTION 'contact_notes_pinned T6 FALHOU: anon recebeu privilegio em contact_notes';
  END IF;

  SELECT has_table_privilege('authenticated', 'public.contact_notes', 'SELECT')
     AND has_table_privilege('authenticated', 'public.contact_notes', 'INSERT')
     AND has_table_privilege('authenticated', 'public.contact_notes', 'UPDATE')
     AND has_table_privilege('authenticated', 'public.contact_notes', 'DELETE')
    INTO v_authenticated;
  IF v_authenticated IS NOT TRUE THEN
    RAISE EXCEPTION 'contact_notes_pinned T6 FALHOU: authenticated sem o CRUD de contact_notes';
  END IF;

  RAISE NOTICE 'contact_notes_pinned: estrutura ok (coluna NOT NULL DEFAULT false, indice parcial valido, RLS/policies/gatilho intactos, ACL fechada)';
END $$;
