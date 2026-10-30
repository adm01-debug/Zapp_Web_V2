-- scheduled_messages_state_machine
-- Rollback: remove o gatilho e a funcao da maquina de estados, remove as duas constraints de vocabulario e devolve as policies de INSERT/UPDATE de scheduled_messages ao estado anterior (contato visivel + permissao de envio, WITH CHECK no UPDATE — o mesmo texto da migration 20261011154648).
-- Rollback (SQL executavel, na ordem):
--   drop trigger if exists trg_scheduled_messages_state_machine on public.scheduled_messages;
--   drop function if exists public.enforce_scheduled_message_state();
--   alter table public.scheduled_messages drop constraint if exists scheduled_messages_message_type_valid_check;
--   alter table public.scheduled_messages drop constraint if exists scheduled_messages_status_valid_check;
--   drop policy if exists "Users can create scheduled messages" on public.scheduled_messages;
--   create policy "Users can create scheduled messages" on public.scheduled_messages for insert to authenticated with check (public.is_admin_or_supervisor(auth.uid()) or (created_by in (select id from public.profiles where user_id = auth.uid()) and public.is_contact_visible_to_user(contact_id, auth.uid()) and public.user_has_permission(auth.uid(), 'send_messages')));
--   drop policy if exists "Users can update their scheduled messages" on public.scheduled_messages;
--   create policy "Users can update their scheduled messages" on public.scheduled_messages for update to authenticated using (created_by in (select id from public.profiles where user_id = auth.uid()) or public.is_admin_or_supervisor(auth.uid())) with check (public.is_admin_or_supervisor(auth.uid()) or (created_by in (select id from public.profiles where user_id = auth.uid()) and public.is_contact_visible_to_user(contact_id, auth.uid()) and public.user_has_permission(auth.uid(), 'send_messages')));
--
-- HZ5-03 / HZ1-03 (auditoria de paridade V3 -> V2 dos hooks raiz, 13/10/2026).
--
-- PROBLEMA: a RLS de public.scheduled_messages decidia so por created_by/admin. Sem CHECK
-- de status, sem gatilho e com UPDATE sem WITH CHECK: o criador conseguia voltar uma linha
-- de 'sent' para 'pending' (reenvio), editar content depois de enviada e agendar para um
-- contato que nao enxerga (a FK e o unico portao). Isso importa assim que o despachante
-- entrar.
--
-- Esta migration e ADITIVA e COMPOE com as duas migrations de scheduled_messages que ja
-- estao na fila do integrador:
--   * CHECK de status (cartao t_0f85a8b6, cadeia t_f23e9286 -> t_0f85a8b6, arquivo
--     20261011133612_dispatch_scheduled_messages.sql): o CHECK usa o MESMO nome e a MESMA
--     expressao (scheduled_messages_status_valid_check), criado sob IF NOT EXISTS: quem for
--     aplicado primeiro cria, o outro nao duplica e nao diverge. O vocabulario de status e o
--     do despachante -- ('pending','sent','failed','cancelled','expired') -- e NAO existe
--     estado 'sending' (o despachante vai de 'pending' direto para 'sent'/'failed'/
--     'expired'); o gatilho nao fixa vocabulario do despachante, so exige que quem transita
--     seja ele, entao um 'sending' futuro so precisa entrar no CHECK por outra migration.
--   * Policies de INSERT/UPDATE (cartao t_d3c1981f/t_8ed401d9, arquivo
--     20261011154648_rls_scheduled_whisper_visibility.sql): esta migration recria as MESMAS
--     duas policies PRESERVANDO o que aquela entrega exige (contato visivel ao chamador e
--     public.user_has_permission(auth.uid(),'send_messages') no INSERT) e acrescenta o que o
--     HZ5-03 pede: status='pending' e scheduled_at no futuro no INSERT, e WITH CHECK no
--     UPDATE. Nenhum ramo de permissao foi removido; o rollback devolve exatamente o texto
--     daquela migration.
--
-- Sem DML: nenhuma linha da tabela e lida ou reescrita por esta migration, entao o gatilho
-- update_scheduled_messages_updated_at (BEFORE UPDATE, o unico gatilho de scheduled_messages
-- antes desta migration) nao e disparado e nenhuma data e reescrita.
--
-- Nada aqui decide prazo maximo de antecedencia (decisao do dono 11/10): scheduled_at e
-- timestamptz (UTC), sem conversao no banco. O "data no futuro" vive no WITH CHECK do INSERT
-- (policy) e no gatilho, nao numa constraint de tabela.

-- 1. CHECK de status (mesmo nome/expressao do despachante; NOT VALID para nao varrer o legado).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.scheduled_messages'::regclass
      AND conname = 'scheduled_messages_status_valid_check'
  ) THEN
    ALTER TABLE public.scheduled_messages
      ADD CONSTRAINT scheduled_messages_status_valid_check
      CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'expired')) NOT VALID;
  END IF;
END
$do$;

-- 2. CHECK de message_type: mesma lista de public.messages (a coluna aceitava qualquer texto).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.scheduled_messages'::regclass
      AND conname = 'scheduled_messages_message_type_valid_check'
  ) THEN
    ALTER TABLE public.scheduled_messages
      ADD CONSTRAINT scheduled_messages_message_type_valid_check
      CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'poll', 'contact')) NOT VALID;
  END IF;
END
$do$;

-- 3. Maquina de estados. Quem e o despachante: o JWT do PostgREST so executa como
--    'authenticated' ou 'anon'; qualquer outro current_user e backend -- service_role, o
--    dono do cron e a RPC SECURITY DEFINER do enviador (dono postgres). O despachante troca
--    request.jwt.claims pelo do criador antes de gravar, entao a distincao NAO pode sair de
--    auth.role()/auth.uid(); sai de current_user.
CREATE OR REPLACE FUNCTION public.enforce_scheduled_message_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_is_dispatcher boolean := current_user NOT IN ('authenticated', 'anon');
BEGIN
  -- Despachante: transita livre dentro do vocabulario (o CHECK de status e o portao).
  IF v_is_dispatcher THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'scheduled_message_initial_status_must_be_pending'
        USING ERRCODE = '22023';
    END IF;
    IF NEW.sent_at IS NOT NULL OR NEW.error_message IS NOT NULL THEN
      RAISE EXCEPTION 'scheduled_message_initial_row_must_not_carry_delivery_state'
        USING ERRCODE = '22023';
    END IF;
    IF NEW.scheduled_at <= now() THEN
      RAISE EXCEPTION 'scheduled_message_scheduled_at_must_be_future'
        USING ERRCODE = '22023';
    END IF;
    IF auth.uid() IS NULL
       OR public.is_contact_visible_to_user(NEW.contact_id, auth.uid()) IS NOT TRUE THEN
      RAISE EXCEPTION 'scheduled_message_contact_not_visible'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE pelo usuario: so linha pendente, so para 'cancelled' (ou seguir pendente, ao
  -- corrigir conteudo/horario), sem tocar no que o despachante escreve nem no dono da linha.
  IF OLD.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'scheduled_message_not_pending'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS NULL OR NEW.status NOT IN ('pending', 'cancelled') THEN
    RAISE EXCEPTION 'scheduled_message_user_transition_not_allowed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
     OR NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'scheduled_message_field_not_editable'
      USING ERRCODE = '42501';
  END IF;
  -- Trocar de contato so para contato que o usuario enxerga. Ficar no mesmo contato (que
  -- pode ter sido reatribuido a outro agente depois de a agendada nascer) continua valendo:
  -- cancelar a pendente nao pode depender de ainda enxergar o contato.
  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id
     AND (auth.uid() IS NULL
          OR public.is_contact_visible_to_user(NEW.contact_id, auth.uid()) IS NOT TRUE) THEN
    RAISE EXCEPTION 'scheduled_message_contact_not_visible'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Funcao so de gatilho: nenhum papel precisa de EXECUTE (o gatilho chama por dentro).
REVOKE ALL ON FUNCTION public.enforce_scheduled_message_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_scheduled_messages_state_machine ON public.scheduled_messages;
CREATE TRIGGER trg_scheduled_messages_state_machine
  BEFORE INSERT OR UPDATE ON public.scheduled_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_scheduled_message_state();

-- 4. INSERT: contato que o usuario enxerga, created_by do proprio usuario e permissao de
--    envio (o mesmo exigido pela migration 20261011154648), e mais: so pendente e so com
--    data no futuro. admin/supervisor passam pelo ramo administrativo, mas as duas ultimas
--    condicoes (pendente, futuro) valem para todo mundo -- o gatilho aplica as mesmas.
DROP POLICY IF EXISTS "Users can create scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can create scheduled messages" ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND scheduled_at > now()
    AND (
      public.is_admin_or_supervisor((SELECT auth.uid()))
      OR (
        created_by IN (SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid()))
        AND public.is_contact_visible_to_user(contact_id, (SELECT auth.uid()))
        AND public.user_has_permission((SELECT auth.uid()), 'send_messages')
      )
    )
  );

-- 5. UPDATE: WITH CHECK explicito (a linha nao passa para outro dono e exige a permissao de
--    envio). A visibilidade do contato NAO entra aqui de proposito: se o contato for
--    reatribuido a outro agente, o criador ainda precisa conseguir CANCELAR a agendada
--    pendente. A troca para um contato invisivel e barrada no gatilho (item 3), que olha
--    contact_id com precisao -- a policy nao tem como distinguir "trocou o contato" de
--    "manteve o contato".
DROP POLICY IF EXISTS "Users can update their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can update their scheduled messages" ON public.scheduled_messages
  FOR UPDATE TO authenticated
  USING (
    created_by IN (SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid()))
    OR public.is_admin_or_supervisor((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_admin_or_supervisor((SELECT auth.uid()))
    OR (
      created_by IN (SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid()))
      AND public.user_has_permission((SELECT auth.uid()), 'send_messages')
    )
  );
