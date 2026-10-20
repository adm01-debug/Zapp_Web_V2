-- Teste de regressão do RPC get_conversation_tab_counts (etapa 42, Fase 8 do plano de 50 etapas).
--
-- ESCOPO E LIMITAÇÃO (ler antes de confiar no resultado): rodando pela wrapper `db_query` do MCP a
-- sessão é service_role, que tem BYPASSRLS, e a função é SECURITY DEFINER com guarda de
-- visibilidade por `auth.uid()` — ou seja, chamá-la aqui não exercita o enforcement. O que este
-- arquivo prova é ESTRUTURA da definição viva (via `pg_get_functiondef`), que é o suficiente para
-- travar a regressão do defeito: o `files_total` precisa filtrar apagadas, e as outras duas
-- contagens precisam continuar idênticas.
--
-- O ENFORCEMENT (chip "Todos" = badge da aba, com a linha excluída fora da conta) foi provado em
-- PG 17 DESCARTÁVEL: 2 asserções de aceite + prova de necessidade (recriada a definição antiga,
-- files_total volta a contar a apagada), PROVA_OK=1 FALHAS=0 —
-- ~/auditorias/fase-j/arquivos-fase8-pr-h-migration-files-total.md
--
-- Sem EXCEPTION = verde. Read-only, sem side effects.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_conversation_tab_counts';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'rls_tab_counts T0 FALHOU: RPC public.get_conversation_tab_counts ausente';
  END IF;

  -- T1: o files_total exclui apagadas com o MESMO filtro da lista da aba (etapa 09/35)
  IF position('COALESCE(m.is_deleted, false) = false' IN v_def) = 0
     AND position('coalesce(m.is_deleted, false) = false' IN lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'rls_tab_counts T1 FALHOU: files_total nao filtra apagadas (defeito da etapa 42)';
  END IF;

  -- T2: a guarda de visibilidade continua (quem nao enxerga o contato nao pode contar nada)
  IF position('is_contact_visible_to_user' IN v_def) = 0 THEN
    RAISE EXCEPTION 'rls_tab_counts T2 FALHOU: guarda de visibilidade sumiu do RPC';
  END IF;

  -- T3: as outras contagens continuam sendo as mesmas (tasks do usuario atual; notas totais)
  IF position('contact_notes' IN v_def) = 0
     OR position('conversation_tasks' IN v_def) = 0
     OR position('t.created_by = v_profile_id' IN v_def) = 0
     OR position('''done'',''cancelled''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'rls_tab_counts T3 FALHOU: contagens de notas/tasks foram alteradas junto';
  END IF;

  -- T4: a função continua SECURITY DEFINER com search_path fixo (não pode ter sido reescrita "solta")
  IF position('SECURITY DEFINER' IN upper(v_def)) = 0
     OR position('search_path' IN v_def) = 0 THEN
    RAISE EXCEPTION 'rls_tab_counts T4 FALHOU: SECURITY DEFINER/search_path ausentes';
  END IF;

  RAISE NOTICE 'rls_tab_counts: estrutura ok (files_total filtra apagadas; tasks/notas/guarda intactas)';
END $$;
