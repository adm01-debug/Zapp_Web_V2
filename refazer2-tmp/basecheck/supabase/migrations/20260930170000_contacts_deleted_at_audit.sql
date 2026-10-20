-- =============================================================================================
-- Trilha de auditoria de EXCLUSAO e RESTAURACAO de contato (soft-delete) — item 2 do plano.
-- Classe: ADITIVA. Nao altera coluna, policy ou funcao existente de `public.contacts`.
-- Reaplicavel (IF NOT EXISTS / DROP TRIGGER IF EXISTS / CREATE OR REPLACE / REVOKE+GRANT).
-- =============================================================================================
--
-- *** v2 — CORRIGIDA APOS O PARECER ADVERSARIAL de 30/09/2026 (/tmp/val-a2/PARECER.md) ***
-- Nada do DESENHO mudou (schema public, tabela propria e nao audit_logs, trigger SECURITY
-- DEFINER com SET search_path explicito, contact_id sem FK, leitura so admin/supervisor via
-- is_admin_or_supervisor, sem INSERT/UPDATE/DELETE direto para authenticated/service_role,
-- anon barrado em tres camadas). O que mudou e ORDEM, GRANTEE, uma coluna e uma guarda:
--
--  R1 (ALTO — v1 nao era atomica)  Em v1 a tabela nascia na l.64, o ENABLE ROW LEVEL SECURITY
--     so vinha na l.169 e os REVOKEs nas l.201-205. Abortando em `head -93` o auditor mediu
--     relrowsecurity=false, relacl com authenticated=arwdDxtm e o proprio authenticated fazendo
--     INSERT/DELETE na trilha. v2 REORDENA: a tabela nasce TRancada — RLS + REVOKE ALL + GRANTs
--     + policies vem nas instrucoes IMEDIATAMENTE seguintes ao CREATE TABLE (secao 1-B), antes
--     de indice, COMMENT, funcao e trigger. Qualquer falha mais adiante deixa a trilha fechada.
--     Ordem dentro do bloco: ENABLE RLS primeiro, REVOKE depois -> se o aborto cair ENTRE os
--     dois, a RLS ligada com ZERO policies ja nega SELECT/INSERT/UPDATE/DELETE a non-owner.
--     LIMITE DECLARADO: resta uma janela de UMA instrucao (o proprio CREATE TABLE) em
--     autocommit. Fechar 100% exige transacao (BEGIN/COMMIT ou `psql --single-transaction`),
--     que o executor `hermes-db-migrar` recusa (`^BEGIN`) — por isso a correcao e por ORDEM.
--  R2 (ALTO — forja por EXECUTE)  A v1 l.219 fazia `REVOKE EXECUTE ... FROM PUBLIC, anon`:
--     grantees que NUNCA tiveram o privilegio. O default vivo da EXECUTE e
--     authenticated+service_role (medido: proacl de audit_contact_address_change =
--     {postgres=X,authenticated=X,service_role=X}; e department_audit_logs_fill_profile_name
--     segue com authenticated=X mesmo depois de REVOKE identico). Com EXECUTE, `authenticated`
--     criava trigger TEMP apontando para a funcao e INJETAVA linha forjada na trilha
--     append-only (a funcao e SECURITY DEFINER sob postgres, entao a policy `false` nao se
--     aplica). v2: `REVOKE EXECUTE ON FUNCTION public.audit_contact_deletion_change()
--     FROM PUBLIC, anon, authenticated, service_role;` colado ao CREATE OR REPLACE FUNCTION
--     (secao 2-B), antes de qualquer CREATE TRIGGER — trigger function nao checa EXECUTE do
--     chamador, entao remover de todos nao quebra os triggers da secao 3.
--  R3 (ALTO — purge orfao)  Em v1 `performed_by` e nullable e alimentado so por auth.uid(); o
--     DELETE fisico de contato so acontece por service_role/postgres/dashboard_user (nenhuma
--     policy de DELETE existe em contacts), nenhum deles carrega claim `sub` -> 100% das linhas
--     `purge` nasciam com performed_by NULL. v2 adiciona a coluna
--     `performed_by_db_role text NOT NULL DEFAULT session_user` (secao 1) + ADD COLUMN IF NOT
--     EXISTS para ambiente que ja tenha a v1 (secao 1-A) e corrige o comentario que dizia que
--     performed_by sempre tem autor.
--  R4 (MEDIO — ordem no ledger)  Cabeca do ledger medida em 30/09/2026:
--     20260930142000. O `date -u +%Y%m%d%H%M%S` do host no momento da escrita devolveu
--     20260930124142 — ATRAS da cabeca, logo um nome tirado so do relogio local continuaria
--     fora de ordem (o proprio R4). Versao deste arquivo: 20260930150000 (sugerida no parecer),
--     acima da cabeca. Renomear para qualquer versao > 20260930142000 mantem o R4 fechado.
--  R5 (MEDIO — fail-closed)  Declarado abaixo, na secao FAIL-CLOSED (antes era implicito).
--  R6 (BAIXO — drift de forma)  `CREATE TABLE IF NOT EXISTS` nao reconcilia drift: adotaria em
--     silencio uma tabela estranha de mesma nome e o INSERT do trigger quebraria em runtime.
--     v2 afirma a forma (guarda DO, secao 1-C) e reconcilia a coluna nova (secao 1-A).
--
-- FAIL-CLOSED (R5) — decisao explicita
--   A funcao do trigger NAO tem bloco EXCEPTION: a trilha roda na transacao do chamador, entao
--   se a tabela faltar/estiver quebrada o soft-delete e o restore do app ABORTAM
--   (relation "public.contact_deletion_audit" does not exist). E a escolha certa para uma
--   trilha de auditoria — NAO se apaga sem auditar — mas e uma escolha, e esta declarada aqui.
--   Alternativa (NAO adotada): envolver o INSERT em BEGIN ... EXCEPTION WHEN OTHERS THEN NULL,
--   que troca completude da trilha por disponibilidade. So com decisao explicita do Joaquim.
--
-- POR QUE
--   `public.contacts.deleted_at` (migration 20260929370000) e o unico marcador de exclusao do
--   modulo: `delete_contact(uuid)` / `delete_contacts(uuid[])` fazem `UPDATE ... SET
--   deleted_at = now()`, e restaurar e um `UPDATE ... SET deleted_at = NULL`. NENHUMA das duas
--   operacoes deixa rastro. A auditoria adversarial de 30/09/2026 mediu que da para excluir um
--   contato e devolve-lo a vida apagando qualquer evidencia, e que, olhando o banco depois do
--   fato, "excluido e restaurado" e indistinguivel de "nunca aconteceu nada".
--
-- O RISCO QUE FECHA
--   (1) Exclusao sem autoria — a policy de UPDATE de `contacts` (helper can_edit_contact) deixa
--       qualquer membro ativo da fila do contato marcar deleted_at, e nada registra QUEM.
--   (2) Restauracao sem autoria — `UPDATE contacts SET deleted_at = NULL` volta a vida sem
--       registro. Um contato excluido por LGPD ressuscita sem que ninguem saiba.
--   (3) Purge sem rastro — o DELETE fisico (job de limpeza, `trg_redact_crm_sync_on_contact_delete`)
--       apaga a linha e, com ela, qualquer historico de exclusao.
--   Esta migration grava QUEM (auth.uid() quando ha sessao; o papel do banco
--   `session_user` sempre, em performed_by_db_role), QUANDO (performed_at), DE/PARA
--   (deleted_at_from -> deleted_at_to), QUAL contato (contact_id) e QUAL operacao
--   (exclusao / restauracao / limpeza) a cada mudanca REAL de `deleted_at`, numa tabela
--   append-only que nem o service_role reescreve.
--
-- O QUE ESTA MIGRATION ***NAO*** RESOLVE (decisao consciente, fica com o Joaquim)
--   * O filtro `deleted_at IS NULL` na policy de SELECT de `public.contacts`
--     (`contacts_select_policy`) fica FORA desta entrega. Hoje a policy usa
--     can_edit_contact(...) e nao filtra excluidos — o contato soft-deleted continua legivel por
--     id. Mudar isso e decisao de produto (o detalhe do contato e a tela de "restaurar" precisam
--     ler a linha), nao de auditoria. Esta migration torna a exclusao AUDITAVEL, nao a esconde.
--   * Nao bloqueia a restauracao: quem pode editar (can_edit_contact) continua podendo restaurar;
--     a diferenca e que agora isso fica registrado.
--   * Nao altera delete_contact()/delete_contacts(): a trilha e por trigger em `contacts`, logo
--     cobre tambem UPDATE manual, backoffice, service_role e SQL direto.
--   * Retencao/particao da trilha, PII/fingerprint do contato purgado e confiabilidade de
--     `deleted_at_from/to` (o cliente grava `deleted_at = new Date()`) seguem ABERTOS e
--     dependem de decisao do Joaquim — registrados no RESUMO da entrega, nao resolvidos aqui.
--
-- POR QUE TABELA PROPRIA (`public.contact_deletion_audit`) E NAO `public.audit_logs`
--   O repo tem DOIS padroes de auditoria e nenhum dos dois caberia exatamente no pedido:
--     * `public.audit_logs` (ledger global) — a policy de SELECT e `has_role(auth.uid(),'admin')`,
--       ou seja SUPERVISOR NAO LE. O modulo de contatos da poder de exclusao a admin E supervisor,
--       entao escrever so em audit_logs esconderia a trilha de metade de quem apaga. Alem disso as
--       policies de escrita de audit_logs ja existem ("Block direct audit log inserts"), ou seja a
--       migration nao poderia cumprir o pedido de habilitar RLS/REVOKE explicitamente.
--     * `public.department_audit_logs` (precedente de tabela de auditoria de dominio) — RLS
--       propria, SELECT restrito a admin/supervisor, INSERT/UPDATE/DELETE revogados de
--       authenticated, ALL revogado de anon e trigger SECURITY DEFINER. E EXATAMENTE o formato
--       pedido; sigo ESTE precedente.
--   Nao existe schema `audit` no banco (`public`, `auth`, `extensions` apenas), entao criar um
--   schema novo seria divergencia gratuita do padrao do repo.
--
-- Nota: `AFTER UPDATE OF deleted_at` no trigger + comparacao `IS DISTINCT FROM OLD/NEW` na
-- funcao. E o mesmo idioma de `trg_audit_contact_address_change` (20260929150000).
--
-- Nota de layout: `DECLARE ...; BEGIN` fica na MESMA linha da abertura do bloco, de proposito. O
-- executor da casa (hermes-db-migrar) recusa arquivo com `BEGIN` no inicio de uma linha —
-- heuristica que barra transacao explicita de topo e nao distingue corpo plpgsql dentro de
-- dollar-quote (mesma observacao de 20260929370000). Este arquivo NAO tem transacao explicita:
-- a atomicidade e obtida por ORDEM (R1), nao por BEGIN/COMMIT.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1) Tabela append-only  (v2: coluna performed_by_db_role — R3)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_deletion_audit (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id           uuid        NOT NULL,
  operation            text        NOT NULL,
  deleted_at_from      timestamptz,
  deleted_at_to        timestamptz,
  performed_by         uuid,
  performed_by_profile uuid,
  -- R3: papel do banco SEMPRE preenchido. No purge (service_role/postgres, sem claim `sub`)
  -- performed_by fica NULL, mas a autoria nao some: fica registrado com que papel a limpeza
  -- rodou. session_user (e nao current_user) porque a funcao e SECURITY DEFINER: current_user
  -- e o dono (postgres); session_user e o papel da conexao que executou o DELETE.
  performed_by_db_role text        NOT NULL DEFAULT session_user,
  performed_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_deletion_audit_operation_check
    CHECK (operation IN ('delete', 'restore', 'update_marker', 'purge')),
  -- Invariante de forma: cada operacao so admite um par de/para coerente.
  CONSTRAINT contact_deletion_audit_shape_check CHECK (
    (operation = 'delete'        AND deleted_at_from IS NULL     AND deleted_at_to IS NOT NULL) OR
    (operation = 'restore'       AND deleted_at_from IS NOT NULL AND deleted_at_to IS NULL)     OR
    (operation = 'purge'         AND deleted_at_from IS NOT DISTINCT FROM deleted_at_to)        OR
    (operation = 'update_marker' AND deleted_at_from IS NOT NULL AND deleted_at_to IS NOT NULL
                                 AND deleted_at_from IS DISTINCT FROM deleted_at_to)
  )
);

-- 1-A) (R3/R6) Ambiente que ja tenha a versao v1 da tabela (sem a coluna) e reconciliado aqui.
--      Na instalacao limpa e no-op: a coluna ja veio no CREATE TABLE acima.
ALTER TABLE public.contact_deletion_audit
  ADD COLUMN IF NOT EXISTS performed_by_db_role text NOT NULL DEFAULT session_user;

-- ---------------------------------------------------------------------------------------------
-- 1-B) RLS + ACL IMEDIATAMENTE apos o CREATE TABLE (R1 — ordem, nao transacao).
--      ENABLE RLS ANTES do REVOKE: se o aborto cair entre os dois, RLS ligada + zero policies
--      ja nega SELECT/INSERT/UPDATE/DELETE a qualquer non-owner.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.contact_deletion_audit ENABLE ROW LEVEL SECURITY;

-- O default do schema concede tudo a anon/authenticated/service_role em toda tabela nova
-- (medido: `arwdDxtm`). Sem estes REVOKEs a trilha nasceria com DML completo para a API.
-- service_role TAMBEM entra no REVOKE: sem isto ele manteria UPDATE/DELETE e a trilha
-- deixaria de ser imutavel para o papel da API.
REVOKE ALL ON TABLE public.contact_deletion_audit FROM PUBLIC, anon, authenticated, service_role;

-- authenticated precisa de SELECT na TABELA para a policy de SELECT ser avaliada (RLS filtra
-- as linhas). Nada de INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER: a trilha e append-only
-- e quem escreve e o trigger SECURITY DEFINER (dono postgres).
GRANT SELECT ON TABLE public.contact_deletion_audit TO authenticated;
-- service_role: backfill/backoffice leem e inserem; UPDATE/DELETE ficam negados para todos os
-- papeis da API (nem service_role reescreve a trilha).
GRANT SELECT, INSERT ON TABLE public.contact_deletion_audit TO service_role;

DROP POLICY IF EXISTS contact_deletion_audit_select_admin_supervisor ON public.contact_deletion_audit;
CREATE POLICY contact_deletion_audit_select_admin_supervisor
ON public.contact_deletion_audit FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- Negacao explicita das escritas diretas por authenticated (defesa em profundidade: os REVOKEs
-- acima ja tiram INSERT/UPDATE/DELETE, mas a policy `false` sobrevive a um GRANT acidental e e
-- o mesmo idioma das policies "Block ..." de public.audit_logs).
DROP POLICY IF EXISTS contact_deletion_audit_block_authenticated_insert ON public.contact_deletion_audit;
CREATE POLICY contact_deletion_audit_block_authenticated_insert
ON public.contact_deletion_audit FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS contact_deletion_audit_block_authenticated_update ON public.contact_deletion_audit;
CREATE POLICY contact_deletion_audit_block_authenticated_update
ON public.contact_deletion_audit FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS contact_deletion_audit_block_authenticated_delete ON public.contact_deletion_audit;
CREATE POLICY contact_deletion_audit_block_authenticated_delete
ON public.contact_deletion_audit FOR DELETE TO authenticated USING (false);

-- Sem policy para `anon`: RLS ligada + nenhuma policy de SELECT = zero linhas, alem do REVOKE.

-- ---------------------------------------------------------------------------------------------
-- 1-C) (R6) Guarda de forma: `CREATE TABLE IF NOT EXISTS` nao reconcilia drift. Se a tabela
--      ja existia com forma diferente, a reaplicacao a adotaria em silencio e TODO soft-delete
--      do app falharia em runtime (o INSERT do trigger nao encontraria as colunas).
--      Fail-closed: forma divergente = excecao com a lista do que falta. Rodado apos a RLS
--      ligada, entao o aborto deixa a tabela trancada.
-- ---------------------------------------------------------------------------------------------
DO $drift_guard$ DECLARE v_faltando text; BEGIN
  SELECT string_agg(esperada.nome, ', ' ORDER BY esperada.nome) INTO v_faltando
  FROM (VALUES ('id'),('contact_id'),('operation'),('deleted_at_from'),('deleted_at_to'),
               ('performed_by'),('performed_by_profile'),('performed_by_db_role'),('performed_at')
       ) AS esperada(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_deletion_audit'
      AND a.attname = esperada.nome AND a.attnum > 0 AND NOT a.attisdropped
  );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'public.contact_deletion_audit tem forma divergente (drift): coluna(s) ausente(s): %. Nao adotar tabela estranha a trilha — reconciliar manualmente.', v_faltando;
  END IF;
END
$drift_guard$;

-- ---------------------------------------------------------------------------------------------
-- 1-D) Indices e COMMENTs
-- ---------------------------------------------------------------------------------------------
-- `contact_id` SEM FK de proposito: uma FK com ON DELETE CASCADE apagaria a propria trilha no
-- purge (o oposto do objetivo) e com ON DELETE SET NULL perderia a identidade do contato.
-- Tabela de auditoria precisa sobreviver a linha referenciada — mesmo criterio de
-- `audit_logs.entity_id`. O valor e o `id` de `public.contacts` no momento do evento.
CREATE INDEX IF NOT EXISTS idx_contact_deletion_audit_contact
  ON public.contact_deletion_audit (contact_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_deletion_audit_recent
  ON public.contact_deletion_audit (performed_at DESC);

COMMENT ON TABLE public.contact_deletion_audit IS
  'Trilha append-only de exclusao/restauracao/purge de contato. Gravada por trigger em public.contacts; escrita so via SECURITY DEFINER; leitura so admin/supervisor.';
COMMENT ON COLUMN public.contact_deletion_audit.contact_id IS
  'id de public.contacts no momento do evento. Sem FK de proposito: purga nao pode apagar/rebaixar a trilha.';
COMMENT ON COLUMN public.contact_deletion_audit.operation IS
  'delete = soft-delete (NULL -> ts); restore = ts -> NULL; update_marker = ts trocado por outro ts (adulteracao); purge = DELETE fisico.';
COMMENT ON COLUMN public.contact_deletion_audit.deleted_at_from IS
  'contacts.deleted_at ANTES da mudanca (NULL = contato vivo). Valor gravado pelo CHAMADOR (relogio do cliente) — nao serve como tempo confiavel; use performed_at.';
COMMENT ON COLUMN public.contact_deletion_audit.deleted_at_to IS
  'contacts.deleted_at DEPOIS da mudanca (NULL = contato vivo). Mesma ressalva de relogio do de-from.';
-- R3: comentario corrigido. Na v1 este texto dizia que performed_by era "auth.uid() ... (NULL =
-- sem sessao/backoffice sem JWT)" sem avisar que o PURGE nasce NULL em 100% dos casos.
COMMENT ON COLUMN public.contact_deletion_audit.performed_by IS
  'auth.uid() (claim `sub`) do chamador. NULL em TODO purge (DELETE fisico): quem apaga e service_role/postgres/dashboard_user e nenhum carrega `sub`. A autoria desses casos esta em performed_by_db_role.';
COMMENT ON COLUMN public.contact_deletion_audit.performed_by_db_role IS
  'session_user da conexao que executou a mudanca (R3). Sempre preenchido, inclusive no purge — e o unico autor da trilha quando performed_by e NULL.';
COMMENT ON COLUMN public.contact_deletion_audit.performed_by_profile IS
  'public.profiles.id correspondente a performed_by, resolvido na hora do evento.';

-- ---------------------------------------------------------------------------------------------
-- 2) Trigger function: grava somente quando `deleted_at` muda DE FATO
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_contact_deletion_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ DECLARE v_operation text; BEGIN
  -- Limpeza (DELETE fisico): registra o marcador que a linha tinha ao ser apagada.
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contact_deletion_audit
      (contact_id, operation, deleted_at_from, deleted_at_to, performed_by, performed_by_profile)
    VALUES (
      OLD.id, 'purge', OLD.deleted_at, OLD.deleted_at, auth.uid(),
      (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    );
    RETURN NULL;
  END IF;

  -- `AFTER UPDATE OF deleted_at` ja limita o disparo aos UPDATEs que citam a coluna no SET;
  -- este teste barra `SET deleted_at = deleted_at` e qualquer UPDATE que cite a coluna sem
  -- alterar o valor. Sem ele o cenario (iii) gravaria sujeira.
  IF OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
    RETURN NULL;
  END IF;

  v_operation := CASE
    WHEN OLD.deleted_at IS NULL THEN 'delete'      -- NULL -> ts  (exclusao)
    WHEN NEW.deleted_at IS NULL THEN 'restore'     -- ts   -> NULL (restauracao)
    ELSE 'update_marker'                           -- ts   -> ts   (marcador reescrito)
  END;

  INSERT INTO public.contact_deletion_audit
    (contact_id, operation, deleted_at_from, deleted_at_to, performed_by, performed_by_profile)
  VALUES (
    NEW.id, v_operation, OLD.deleted_at, NEW.deleted_at, auth.uid(),
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 2-B) (R2) REVOKE EXECUTE nos GRANTEES CERTOS, imediatamente apos criar/atualizar a funcao.
--      O default vivo da EXECUTE e authenticated+service_role (nao PUBLIC/anon). Com EXECUTE,
--      `authenticated` cria trigger TEMP sobre esta funcao e injeta linha forjada na trilha.
--      Trigger function NAO checa EXECUTE do chamador, entao tirar de todos nao quebra a secao 3.
-- ---------------------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.audit_contact_deletion_change() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3) Triggers em public.contacts
-- ---------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_contact_deletion_change ON public.contacts;
CREATE TRIGGER trg_audit_contact_deletion_change
AFTER UPDATE OF deleted_at ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_deletion_change();

DROP TRIGGER IF EXISTS trg_audit_contact_purge ON public.contacts;
CREATE TRIGGER trg_audit_contact_purge
AFTER DELETE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_deletion_change();
