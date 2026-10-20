-- Reconstrucao retroativa (GAP: aplicado via db_batch_query direto em producao
-- em 02/09/2026, sem arquivo commitado). Ledger nao tem SQL capturado
-- (statements = [comentario-placeholder apontando para este arquivo]), entao
-- esta migration entra em migration-evidence.json como ledger-only/
-- name-and-file-pinned. DDL abaixo reconstruido a partir do catalogo vivo
-- (information_schema/pg_catalog) em 02/09/2026, apos a aplicacao original.
--
-- Paridade com o Team Chat V3: reacoes em mensagens, status de entrega
-- (parity com o padrao sent/delivered/read do WhatsApp) e departamentos.

-- Status de entrega em mensagens de equipe (paridade com messages.status)
ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';

-- Departamentos
CREATE TABLE IF NOT EXISTS public.departments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL UNIQUE,
  is_active             boolean     NOT NULL DEFAULT true,
  whatsapp_mode         text        NOT NULL DEFAULT 'none',
  whatsapp_api_key      text,
  whatsapp_instance_id  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_select ON public.departments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY departments_admin_write ON public.departments
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Convites de departamento
CREATE TABLE IF NOT EXISTS public.department_invitations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid        NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  code          text        NOT NULL UNIQUE,
  email         text        NOT NULL DEFAULT '',
  role          text        NOT NULL DEFAULT 'agent',
  status        text        NOT NULL DEFAULT 'pending',
  expires_at    timestamptz NOT NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.department_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_invitations_admin_all ON public.department_invitations
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Reacoes em mensagens de equipe
CREATE TABLE IF NOT EXISTS public.team_message_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid        NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_message_reactions_unique UNIQUE (message_id, profile_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_team_message_reactions_message
  ON public.team_message_reactions (message_id);

ALTER TABLE public.team_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_message_reactions_select ON public.team_message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_messages tm
      JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id
      JOIN public.profiles p ON p.id = tcm.profile_id
      WHERE tm.id = team_message_reactions.message_id
        AND p.user_id = auth.uid()
    )
  );

-- NOTA (achado desta reconstrucao, nao corrigido aqui): a policy de INSERT
-- vigente em producao tem uma tautologia em "tcm.profile_id = tcm.profile_id"
-- no lugar de comparar contra o profile de quem esta inserindo — o EXISTS de
-- membership sempre e verdadeiro, entao qualquer usuario autenticado pode
-- reagir a mensagens de conversas das quais nao participa. Reproduzido aqui
-- fielmente (paridade com o estado real ja em producao); corrigido em
-- migration separada (20260902200000).
CREATE POLICY team_message_reactions_insert ON public.team_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = team_message_reactions.profile_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.team_messages tm
      JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id
      WHERE tm.id = team_message_reactions.message_id
        AND tcm.profile_id = tcm.profile_id
    )
  );

CREATE POLICY team_message_reactions_delete ON public.team_message_reactions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = team_message_reactions.profile_id
        AND p.user_id = auth.uid()
    )
  );
