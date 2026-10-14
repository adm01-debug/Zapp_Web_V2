-- contact_audit_log
-- Rollback: desfaz o trigger em public.contacts, as duas funcoes e a tabela da trilha (o inverso de cada comando desta migration).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_audit_contact_change on public.contacts;
--   drop function if exists public.audit_contact_change();
--   drop function if exists public.contact_audit_snapshot(public.contacts);
--   drop table if exists public.contact_audit_log;
--
-- LGPD art. 37 (CONTATOS / P4 de 13/10/2026): hoje NINGUEM sabe quem mudou nome, e-mail ou
-- telefone de um contato, nem quando. `public.contacts` nao tem trilha de alteracao de campo;
-- `public.audit_logs` (ledger global) e `public.contact_deletion_audit` cobrem outros eixos
-- (papel, exclusao) e nenhum deles responde "quem mudou o telefone do contato X".
--
-- O QUE ESTA MIGRATION FAZ
--   1) public.contact_audit_log: trilha append-only de INSERT/UPDATE/DELETE de contato, com o
--      CAMPO alterado (changed_fields), de/para e AUTOR + instante. Escrita SO pelo trigger
--      SECURITY DEFINER; nenhum papel da API escreve direto.
--   2) Trigger AFTER INSERT OR UPDATE OR DELETE em public.contacts. O UPDATE so grava quando um
--      campo AUDITADO muda de fato (IS DISTINCT FROM): reescrever a mesma linha nao polui a
--      trilha e `deleted_at` (que ja tem trilha propria, 20260930170000) nao entra aqui.
--   3) Leitura: o atendente ve a trilha dos contatos que ele JA enxerga --
--      public.is_contact_visible_to_user(contact_id, auth.uid()), o MESMO predicado da policy
--      de SELECT de public.contacts: a regra de visibilidade nao e duplicada nem afrouxada.
--      `anon` nao ve nada; admin/supervisor veem tudo -- inclusive a trilha de contato ja
--      purgado, por isso is_admin_or_supervisor entra como braco PROPRIA da policy (o helper
--      de visibilidade so responde para contato que ainda existe).
--   4) PII: telefone, e-mail e observacoes NUNCA sao gravados com valor. A trilha diz QUE o
--      campo mudou (changed_fields) e guarda o marcador '[redigido]' no lugar do valor; um
--      CHECK (contact_audit_log_pii_redigido_check) recusa qualquer outro conteudo nessas
--      chaves. name/nickname/surname/company/job_title/contact_type/assigned_to/queue_id/
--      conversation_status guardam de/para (contexto operacional). Etiquetas (`tags`) ficam
--      FORA da trilha.
--   5) Sem FK em contact_id de proposito: a purga (DELETE fisico) nao pode apagar nem rebaixar
--      a trilha (mesma decisao de public.contact_deletion_audit).
--
-- FORA DO ESCOPO (de proposito, para nao duplicar): soft-delete/restauracao (trilha propria em
-- 20260930170000) e endereco/coordenadas (trigger proprio em 20260929150000).
--
-- Classe: ADITIVA. Nao altera coluna, policy, funcao nem GRANT de public.contacts.
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.

-- ============================================================================================
-- 1) Tabela append-only da trilha
-- ============================================================================================
CREATE TABLE IF NOT EXISTS public.contact_audit_log (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Sem FK de proposito: a purga do contato nao apaga a trilha (o id fica como referencia
  -- historica). Mesma decisao de public.contact_deletion_audit.
  contact_id         uuid        NOT NULL,
  action             text        NOT NULL,
  old_values         jsonb,
  new_values         jsonb,
  changed_fields     text[]      NOT NULL,
  -- Autor: auth.uid() (claim `sub`) e o profile correspondente, resolvidos no evento.
  changed_by         uuid,
  changed_by_profile uuid,
  -- Papel do banco SEMPRE preenchido (session_user, nao current_user: a funcao e SECURITY
  -- DEFINER e current_user seria o dono). E o unico autor quando changed_by e NULL (purge,
  -- backoffice sem JWT).
  changed_by_db_role text        NOT NULL DEFAULT session_user,
  changed_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_audit_log_action_check
    CHECK (action IN ('insert', 'update', 'delete')),
  -- Invariante de forma: cada acao so admite um par de/para coerente.
  CONSTRAINT contact_audit_log_shape_check CHECK (
    (action = 'insert' AND old_values IS NULL     AND new_values IS NOT NULL) OR
    (action = 'update' AND old_values IS NOT NULL AND new_values IS NOT NULL) OR
    (action = 'delete' AND old_values IS NOT NULL AND new_values IS NULL)
  ),
  -- Toda linha aponta ao menos um campo alterado.
  CONSTRAINT contact_audit_log_fields_check CHECK (cardinality(changed_fields) >= 1),
  -- Defesa em profundidade da PII: nestas chaves so o marcador (JSON null quando o campo era
  -- vazio). Vale para a escrita do trigger E para qualquer escrita futura que ganhe permissao.
  CONSTRAINT contact_audit_log_pii_redigido_check CHECK (
    coalesce(old_values ->> 'phone', '[redigido]') = '[redigido]'
    AND coalesce(old_values ->> 'email', '[redigido]') = '[redigido]'
    AND coalesce(old_values ->> 'notes', '[redigido]') = '[redigido]'
    AND coalesce(new_values ->> 'phone', '[redigido]') = '[redigido]'
    AND coalesce(new_values ->> 'email', '[redigido]') = '[redigido]'
    AND coalesce(new_values ->> 'notes', '[redigido]') = '[redigido]'
  )
);

CREATE INDEX IF NOT EXISTS idx_contact_audit_log_contact_recent
  ON public.contact_audit_log (contact_id, changed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_contact_audit_log_recent
  ON public.contact_audit_log (changed_at DESC);

COMMENT ON TABLE public.contact_audit_log IS
  'Trilha append-only de INSERT/UPDATE/DELETE de contato (campo, de/para, autor e instante). Escrita so pelo trigger SECURITY DEFINER; leitura para quem ja enxerga o contato. Telefone/e-mail/observacoes entram so como campo alterado + marcador [redigido].';
COMMENT ON COLUMN public.contact_audit_log.contact_id IS
  'id de public.contacts no momento do evento. Sem FK de proposito: a purga nao pode apagar/rebaixar a trilha.';
COMMENT ON COLUMN public.contact_audit_log.changed_fields IS
  'Campos auditados que mudaram DE FATO (IS DISTINCT FROM). E onde o telefone/e-mail aparecem: o nome do campo, nunca o valor.';
COMMENT ON COLUMN public.contact_audit_log.changed_by IS
  'auth.uid() do chamador. NULL em DML sem sessao (backoffice/service_role sem claim `sub`) -- a autoria nesses casos fica em changed_by_db_role.';

-- --------------------------------------------------------------------------------------------
-- 1-A) RLS + ACL imediatamente apos o CREATE TABLE.
--      ENABLE RLS ANTES do REVOKE: se o aborto cair entre os dois, RLS ligada e zero policies
--      ja negam tudo a qualquer non-owner.
-- --------------------------------------------------------------------------------------------
ALTER TABLE public.contact_audit_log ENABLE ROW LEVEL SECURITY;

-- O default do schema concede tudo a anon/authenticated/service_role em tabela nova; sem estes
-- REVOKEs a trilha nasceria com DML completo para a API.
REVOKE ALL ON TABLE public.contact_audit_log FROM PUBLIC, anon, authenticated, service_role;

-- authenticated precisa de SELECT na TABELA para a policy de SELECT ser avaliada (a RLS filtra
-- as linhas). Nada de INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER: a trilha e append-only
-- e quem escreve e o trigger SECURITY DEFINER (dono).
GRANT SELECT ON TABLE public.contact_audit_log TO authenticated;
-- service_role: backoffice le e insere; UPDATE/DELETE ficam negados (nem ele reescreve a trilha).
GRANT SELECT, INSERT ON TABLE public.contact_audit_log TO service_role;

-- Visibilidade: a MESMA regra do contato (o helper e o predicado da policy de SELECT de
-- public.contacts). Quem nao enxerga o contato nao enxerga a trilha dele.
DROP POLICY IF EXISTS contact_audit_log_select_visivel ON public.contact_audit_log;
CREATE POLICY contact_audit_log_select_visivel
ON public.contact_audit_log FOR SELECT TO authenticated
USING (
  -- admin/supervisor ANTES do helper de visibilidade: o helper so responde para contato que
  -- AINDA existe. Sem este braco, a trilha de um contato purgado (DELETE fisico) ficaria
  -- invisivel para todo mundo -- justamente o caso em que a auditoria mais importa.
  public.is_admin_or_supervisor((SELECT auth.uid()))
  OR public.is_contact_visible_to_user(contact_id, (SELECT auth.uid()))
);

-- Negacao explicita da escrita direta por authenticated (defesa em profundidade: os REVOKEs ja
-- tiram INSERT/UPDATE/DELETE, mas a policy `false` sobrevive a um GRANT acidental).
DROP POLICY IF EXISTS contact_audit_log_block_authenticated_insert ON public.contact_audit_log;
CREATE POLICY contact_audit_log_block_authenticated_insert
ON public.contact_audit_log FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS contact_audit_log_block_authenticated_update ON public.contact_audit_log;
CREATE POLICY contact_audit_log_block_authenticated_update
ON public.contact_audit_log FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS contact_audit_log_block_authenticated_delete ON public.contact_audit_log;
CREATE POLICY contact_audit_log_block_authenticated_delete
ON public.contact_audit_log FOR DELETE TO authenticated USING (false);

-- Sem policy para `anon`: RLS ligada + nenhuma policy + REVOKE = zero linhas e permission denied.

-- --------------------------------------------------------------------------------------------
-- 1-B) Guarda de forma: `CREATE TABLE IF NOT EXISTS` nao reconcilia drift. Forma divergente =
--      excecao com a lista do que falta (fail-closed), rodada depois da RLS ligada.
-- --------------------------------------------------------------------------------------------
DO $drift_guard$ DECLARE v_faltando text; BEGIN
  SELECT string_agg(esperada.nome, ', ' ORDER BY esperada.nome) INTO v_faltando
  FROM (VALUES ('id'),('contact_id'),('action'),('old_values'),('new_values'),('changed_fields'),
               ('changed_by'),('changed_by_profile'),('changed_by_db_role'),('changed_at')
       ) AS esperada(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_audit_log'
      AND a.attname = esperada.nome AND a.attnum > 0 AND NOT a.attisdropped
  );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'contact_audit_log com forma divergente: faltam %', v_faltando;
  END IF;
END $drift_guard$;

-- ============================================================================================
-- 2) Snapshot dos campos auditados (valor CRU, usado para comparar)
--    Immutable: so transforma a linha que recebe. O acesso e feito pela trigger function
--    (SECURITY DEFINER), entao o EXECUTE e negado a todos os papeis.
-- ============================================================================================
CREATE OR REPLACE FUNCTION public.contact_audit_snapshot(c public.contacts)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'name',                c.name,
    'nickname',            c.nickname,
    'surname',             c.surname,
    'job_title',           c.job_title,
    'company',             c.company,
    'contact_type',        c.contact_type,
    'assigned_to',         c.assigned_to,
    'queue_id',            c.queue_id,
    'conversation_status', c.conversation_status,
    'phone',               c.phone,
    'email',               c.email,
    'notes',               c.notes
  );
$function$;

REVOKE ALL ON FUNCTION public.contact_audit_snapshot(public.contacts)
  FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================================
-- 3) Trigger function: grava a linha da trilha (raw para comparar, redigido para guardar)
-- ============================================================================================
CREATE OR REPLACE FUNCTION public.audit_contact_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  -- Unicas chaves que NUNCA guardam valor: dado pessoal de contato (LGPD).
  v_pii     constant text[] := ARRAY['phone', 'email', 'notes'];
  v_raw_old jsonb;
  v_raw_new jsonb;
  v_old     jsonb;
  v_new     jsonb;
  v_action  text;
  v_changed text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action  := 'insert';
    v_raw_new := public.contact_audit_snapshot(NEW);
    SELECT array_agg(kv.key ORDER BY kv.key) INTO v_changed
      FROM jsonb_object_keys(v_raw_new) AS kv(key);

  ELSIF TG_OP = 'UPDATE' THEN
    v_action  := 'update';
    v_raw_old := public.contact_audit_snapshot(OLD);
    v_raw_new := public.contact_audit_snapshot(NEW);
    -- Compara o valor CRU (o redigido e constante e esconderia a troca de telefone).
    SELECT array_agg(kv.key ORDER BY kv.key) INTO v_changed
      FROM jsonb_each(v_raw_new) AS kv(key, value)
     WHERE kv.value IS DISTINCT FROM (v_raw_old -> kv.key);
    IF v_changed IS NULL THEN
      RETURN NULL;  -- nenhum campo auditado mudou: nao polui a trilha
    END IF;

  ELSE  -- DELETE
    v_action  := 'delete';
    v_raw_old := public.contact_audit_snapshot(OLD);
    SELECT array_agg(kv.key ORDER BY kv.key) INTO v_changed
      FROM jsonb_object_keys(v_raw_old) AS kv(key);
  END IF;

  IF v_raw_old IS NOT NULL THEN
    SELECT jsonb_object_agg(kv.key,
             CASE WHEN kv.key = ANY (v_pii) THEN to_jsonb('[redigido]'::text) ELSE kv.value END)
      INTO v_old FROM jsonb_each(v_raw_old) AS kv(key, value);
  END IF;
  IF v_raw_new IS NOT NULL THEN
    SELECT jsonb_object_agg(kv.key,
             CASE WHEN kv.key = ANY (v_pii) THEN to_jsonb('[redigido]'::text) ELSE kv.value END)
      INTO v_new FROM jsonb_each(v_raw_new) AS kv(key, value);
  END IF;

  INSERT INTO public.contact_audit_log
    (contact_id, action, old_values, new_values, changed_fields, changed_by, changed_by_profile)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_action,
    v_old,
    v_new,
    v_changed,
    auth.uid(),
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

  RETURN NULL;
END;
$function$;

-- Trigger function NAO checa EXECUTE do chamador: tira de todos (senao `authenticated` cria
-- trigger TEMP sobre ela e injeta linha forjada na trilha).
REVOKE EXECUTE ON FUNCTION public.audit_contact_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================================
-- 4) Trigger em public.contacts
-- ============================================================================================
DROP TRIGGER IF EXISTS trg_audit_contact_change ON public.contacts;
CREATE TRIGGER trg_audit_contact_change
AFTER INSERT OR UPDATE OR DELETE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_change();
