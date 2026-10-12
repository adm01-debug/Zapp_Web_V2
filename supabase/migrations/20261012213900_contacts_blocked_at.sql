-- contacts_blocked_at
-- Rollback: drop trigger if exists trg_audit_contact_block_change on public.contacts; drop function if exists public.set_contact_blocked(uuid, boolean); drop function if exists public.audit_contact_block_change(); drop table if exists public.contact_block_audit; drop index if exists public.idx_contacts_blocked_at; alter table public.contacts drop column if exists blocked_by; alter table public.contacts drop column if exists blocked_at;
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_audit_contact_block_change on public.contacts;
--   drop function if exists public.set_contact_blocked(uuid, boolean);
--   drop function if exists public.audit_contact_block_change();
--   drop table if exists public.contact_block_audit;
--   drop index if exists public.idx_contacts_blocked_at;
--   alter table public.contacts drop column if exists blocked_by;
--   alter table public.contacts drop column if exists blocked_at;
--
-- O rollback devolve EXATAMENTE o estado anterior: nenhum objeto que já existia é alterado
-- (tudo criado aqui é novo e o inverso é DROP pela assinatura/tabela/índice exatos). O único
-- dado que o rollback NÃO devolve sozinho é o estado de bloqueio em si: `blocked_at`/
-- `blocked_by` nascem do backfill da etiqueta `Bloqueado`, e nesse momento a coluna
-- `public.contacts.tags` ainda existe (a migration de remoção de tags é posterior), então a
-- marcação continua recuperável de `tags` enquanto ela existir.
--
-- Classe: contrato (2 colunas novas + RPC + trilha de auditoria). Aditiva e idempotente: não
-- remove, não renomeia e não reescreve nada existente.
--
-- POR QUÊ: hoje o "bloqueio de contato" NÃO é um estado de verdade — é só a etiqueta textual
-- `Bloqueado` em `public.contacts.tags` (src/hooks/inbox/useContactQuickActions.ts,
-- BLOCKED_TAG = 'Bloqueado'), gravada junto das demais tags livres. Consequências medidas:
--   (a) não há autor nem instante do bloqueio (a etiqueta é anônima e sem data);
--   (b) a etiqueta vive no mesmo campo das tags comuns, então qualquer edição de tags pode
--       apagar o bloqueio sem querer e não há como distinguir "bloqueado" de "tem uma tag
--       escrita Bloqueado";
--   (c) a remoção das tags (cartão posterior, t_b7b5d9f3) levaria a marcação embora se ela
--       não fosse capturada antes num campo próprio.
-- Esta migration cria o estado de verdade: `blocked_at` (instante) + `blocked_by` (autor),
-- uma RPC `set_contact_blocked(contato, bloqueado)` com a MESMA permissão de escrita do
-- contato (a policy de UPDATE de `public.contacts`), e uma trilha append-only
-- `public.contact_block_audit` que registra autor/role/instante de cada mudança.
--
-- A migration de remoção das tags (t_b7b5d9f3) precisa ter timestamp POSTERIOR a esta: é
-- aqui que o valor da etiqueta `Bloqueado` vira campo próprio. Timestamp desta: 20261012213900.

-- ============================================================================================
-- 1) Colunas de estado em public.contacts
-- ============================================================================================
-- Idempotente (ADD COLUMN IF NOT EXISTS). `blocked_by` guarda o auth.uid() (claim `sub`) do
-- autor, no mesmo contrato de `contact_block_audit.performed_by` — uuid de auth.users, sem
-- FK (o autor pode deixar de existir; a trilha não depende dele).
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS blocked_by uuid;

-- Índice parcial: a UI lista os bloqueados por `blocked_at IS NOT NULL` e o índice não pesa
-- na esmagadora maioria (não-bloqueados).
CREATE INDEX IF NOT EXISTS idx_contacts_blocked_at
  ON public.contacts (blocked_at)
  WHERE blocked_at IS NOT NULL;

COMMENT ON COLUMN public.contacts.blocked_at IS
  'Instante do bloqueio do contato. NULL = não bloqueado. Substitui a etiqueta textual `Bloqueado` em tags como estado de verdade.';
COMMENT ON COLUMN public.contacts.blocked_by IS
  'auth.uid() (claim `sub`) de quem bloqueou. NULL quando não bloqueado (ou no backfill da etiqueta legada, que não tem autor).';

-- ============================================================================================
-- 2) Trilha append-only public.contact_block_audit
-- ============================================================================================
-- Mesmo idioma de public.contact_deletion_audit (20260930170000): append-only, RLS ligada
-- antes do REVOKE, leitura só para admin/supervisor, escrita negada a todo papel da API (quem
-- escreve é o trigger SECURITY DEFINER).
CREATE TABLE IF NOT EXISTS public.contact_block_audit (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SEM FK de proposito: uma FK com ON DELETE CASCADE apagaria a propria trilha quando o
  -- contato fosse limpo (mesma decisao de contact_deletion_audit).
  contact_id           uuid        NOT NULL,
  operation            text        NOT NULL,
  blocked_at_from      timestamptz,
  blocked_at_to        timestamptz,
  performed_by         uuid,
  performed_by_profile uuid,
  -- performed_by fica NULL no backfill da migration (auth.uid() nulo fora de sessao), mas a
  -- autoria nunca some: registra com que papel a conexao executou.
  performed_by_db_role text        NOT NULL DEFAULT session_user,
  performed_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_block_audit_operation_check
    CHECK (operation IN ('block', 'unblock', 'update_marker')),
  CONSTRAINT contact_block_audit_shape_check CHECK (
    (operation = 'block'         AND blocked_at_from IS NULL     AND blocked_at_to IS NOT NULL) OR
    (operation = 'unblock'       AND blocked_at_from IS NOT NULL AND blocked_at_to IS NULL)     OR
    (operation = 'update_marker' AND blocked_at_from IS NOT NULL AND blocked_at_to IS NOT NULL
                                 AND blocked_at_from IS DISTINCT FROM blocked_at_to)
  )
);

ALTER TABLE public.contact_block_audit ENABLE ROW LEVEL SECURITY;

-- O default do schema concede tudo a anon/authenticated/service_role em toda tabela nova.
-- Sem estes REVOKEs a trilha nasceria com DML completo para a API.
REVOKE ALL ON TABLE public.contact_block_audit FROM PUBLIC, anon, authenticated, service_role;

-- authenticated precisa de SELECT na TABELA para a policy de SELECT ser avaliada; nada de
-- INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER (a trilha e append-only).
GRANT SELECT ON TABLE public.contact_block_audit TO authenticated;
GRANT SELECT, INSERT ON TABLE public.contact_block_audit TO service_role;

DROP POLICY IF EXISTS contact_block_audit_select_admin_supervisor ON public.contact_block_audit;
CREATE POLICY contact_block_audit_select_admin_supervisor
ON public.contact_block_audit FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS contact_block_audit_block_authenticated_insert ON public.contact_block_audit;
CREATE POLICY contact_block_audit_block_authenticated_insert
ON public.contact_block_audit FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS contact_block_audit_block_authenticated_update ON public.contact_block_audit;
CREATE POLICY contact_block_audit_block_authenticated_update
ON public.contact_block_audit FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS contact_block_audit_block_authenticated_delete ON public.contact_block_audit;
CREATE POLICY contact_block_audit_block_authenticated_delete
ON public.contact_block_audit FOR DELETE TO authenticated USING (false);

-- Sem policy para `anon`: RLS ligada + nenhuma policy de SELECT = zero linhas, alem do REVOKE.

-- Fail-closed de forma: CREATE TABLE IF NOT EXISTS nao reconcilia drift. Se a tabela ja
-- existir com forma diferente, aborta com a lista do que falta (roda com a RLS ja ligada).
DO $drift_guard$ DECLARE v_faltando text; BEGIN
  SELECT string_agg(esperada.nome, ', ' ORDER BY esperada.nome) INTO v_faltando
  FROM (VALUES ('id'),('contact_id'),('operation'),('blocked_at_from'),('blocked_at_to'),
               ('performed_by'),('performed_by_profile'),('performed_by_db_role'),('performed_at')
       ) AS esperada(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_block_audit'
      AND a.attname = esperada.nome AND a.attnum > 0 AND NOT a.attisdropped
  );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'public.contact_block_audit tem forma divergente (drift): coluna(s) ausente(s): %. Nao adotar tabela estranha a trilha — reconciliar manualmente.', v_faltando;
  END IF;
END
$drift_guard$;

CREATE INDEX IF NOT EXISTS idx_contact_block_audit_contact
  ON public.contact_block_audit (contact_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_block_audit_recent
  ON public.contact_block_audit (performed_at DESC);

COMMENT ON TABLE public.contact_block_audit IS
  'Trilha append-only do bloqueio/desbloqueio de contatos (substitui a etiqueta textual Bloqueado). Escrita apenas pelo trigger audit_contact_block_change.';
COMMENT ON COLUMN public.contact_block_audit.operation IS
  'block = NULL->ts; unblock = ts->NULL; update_marker = ts->ts (marcador reescrito).';
COMMENT ON COLUMN public.contact_block_audit.performed_by IS
  'auth.uid() (claim `sub`) do chamador. NULL no backfill da migration e nas escritas de papel sem `sub`. A autoria desses casos esta em performed_by_db_role.';
COMMENT ON COLUMN public.contact_block_audit.performed_by_db_role IS
  'session_user da conexao que executou a mudanca. Sempre preenchido — e o unico autor da trilha quando performed_by e NULL.';
COMMENT ON COLUMN public.contact_block_audit.performed_by_profile IS
  'public.profiles.id correspondente a performed_by, resolvido na hora do evento.';

-- ============================================================================================
-- 3) Trigger function: grava somente quando blocked_at muda DE FATO
-- ============================================================================================
CREATE OR REPLACE FUNCTION public.audit_contact_block_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$ DECLARE v_operation text; BEGIN
  -- `AFTER UPDATE OF blocked_at` ja limita o disparo aos UPDATEs que citam a coluna no SET;
  -- este teste barra `SET blocked_at = blocked_at` e qualquer UPDATE que a cite sem alterar
  -- o valor (nao gravar sujeira).
  IF OLD.blocked_at IS NOT DISTINCT FROM NEW.blocked_at THEN
    RETURN NULL;
  END IF;

  v_operation := CASE
    WHEN OLD.blocked_at IS NULL THEN 'block'          -- NULL -> ts  (bloqueio)
    WHEN NEW.blocked_at IS NULL THEN 'unblock'        -- ts   -> NULL (desbloqueio)
    ELSE 'update_marker'                              -- ts   -> ts   (marcador reescrito)
  END;

  INSERT INTO public.contact_block_audit
    (contact_id, operation, blocked_at_from, blocked_at_to, performed_by, performed_by_profile)
  VALUES (
    NEW.id, v_operation, OLD.blocked_at, NEW.blocked_at, auth.uid(),
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

  RETURN NULL;
END;
$function$;

-- Trigger function NAO checa EXECUTE do chamador; com EXECUTE, `authenticated` poderia criar
-- trigger TEMP sobre ela. Tirar de todos nao quebra os triggers abaixo.
REVOKE EXECUTE ON FUNCTION public.audit_contact_block_change() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_contact_block_change ON public.contacts;
CREATE TRIGGER trg_audit_contact_block_change
AFTER UPDATE OF blocked_at ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_block_change();

-- ============================================================================================
-- 4) Migracao de DADOS: etiqueta textual `Bloqueado` -> campo proprio
-- ============================================================================================
-- Contato que tem a etiqueta `Bloqueado` (comparacao sem caixa, para nao perder variacao de
-- digitacao) recebe blocked_at. SO as linhas marcadas mudam (WHERE ... blocked_at IS NULL em
-- contato com a etiqueta) — nao e UPDATE em massa.
--
-- O gatilho BEFORE UPDATE `update_contacts_updated_at` (20260315172343) regrava `updated_at` em
-- toda linha que o UPDATE toca. Como esta migracao so muda o estado de bloqueio e nao a data de
-- modificacao do cadastro, o gatilho e desligado SO durante este UPDATE -- dentro de UMA
-- transacao, entao falha no meio (ou no ENABLE) reabilita o gatilho no rollback e nada fica
-- desligado por acidente. Preserva o updated_at das linhas migradas (prova antes/depois no
-- contrato scripts/db-audit/contacts-soft-delete-and-status.test.sh).
BEGIN;
DO $bloqueio$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.contacts'::regclass
      AND tgname = 'update_contacts_updated_at'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at';
  END IF;
END
$bloqueio$;
UPDATE public.contacts c
SET blocked_at = now(),
    blocked_by = NULL
WHERE c.blocked_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(COALESCE(c.tags, ARRAY[]::text[])) AS tag(valor)
    WHERE lower(valor) = 'bloqueado'
  );
DO $bloqueio$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.contacts'::regclass
      AND tgname = 'update_contacts_updated_at'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at';
  END IF;
END
$bloqueio$;
COMMIT;

-- ============================================================================================
-- 5) RPC public.set_contact_blocked(contato, bloqueado)
-- ============================================================================================
-- Mesma regra de quem pode EDITAR o contato: a policy de UPDATE de public.contacts usa
-- public.can_edit_contact(assigned_to, queue_id) — aqui a MESMA funcao decide. SECURITY DEFINER
-- com `search_path = pg_catalog, public` (funcoes do repo que resolvem auth.uid() por
-- pg_catalog, sem pg_temp no caminho).
--
-- Nao ha oraculo: contato inexistente e contato sem permissao devolvem a MESMA excecao, e a
-- ordem das checagens e: entrada valida -> tem sessao -> pode editar (que cobre o existente).
CREATE OR REPLACE FUNCTION public.set_contact_blocked(
  p_contact_id uuid,
  p_blocked boolean
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid        uuid;
  v_blocked_at timestamptz;
BEGIN
  IF p_contact_id IS NULL OR p_blocked IS NULL THEN
    RAISE EXCEPTION 'invalid_contact_block_request' USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Autorizacao derivada da MESMA regra da policy de UPDATE de contacts. Se o contato NAO
  -- existe, can_edit_contact recebe NULL/NULL e a funcao tambem recusa — mesma excecao, sem
  -- revelar existencia.
  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = p_contact_id
      AND public.can_edit_contact(c.assigned_to, c.queue_id)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Uma unica instrucao = atomica. Idempotente: rebloquear mantem o instante/autor originais
  -- (COALESCE) e nao gera linha nova na trilha (blocked_at nao muda).
  UPDATE public.contacts
  SET blocked_at = CASE WHEN p_blocked THEN COALESCE(blocked_at, now()) ELSE NULL END,
      blocked_by = CASE WHEN p_blocked THEN COALESCE(blocked_by, v_uid) ELSE NULL END
  WHERE id = p_contact_id
  RETURNING blocked_at INTO v_blocked_at;

  RETURN v_blocked_at;
END;
$function$;

-- Publico da RPC: authenticated. anon NAO (REVOKE + auth.uid() nulo). service_role NAO precisa:
-- ele fala com a tabela direto (BYPASSRLS) e nao carrega claim `sub`, logo nao teria autor.
-- Os DEFAULTS do schema concedem EXECUTE em funcao nova a service_role; por isso ele entra no
-- REVOKE -- senao nasceria executavel por um papel que a funcao sempre recusaria.
REVOKE ALL ON FUNCTION public.set_contact_blocked(uuid, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_contact_blocked(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_contact_blocked(uuid, boolean) IS
  'Bloqueia (true) ou desbloqueia (false) um contato com a mesma permissao de edicao da policy de UPDATE de public.contacts. Devolve o novo blocked_at (NULL quando desbloqueado). Cada mudanca fica em public.contact_block_audit.';
