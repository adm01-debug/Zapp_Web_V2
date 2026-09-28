-- E20: Fix DELETE policy de team_conversation_members
-- Adicionar guard contra remocao do ultimo owner
-- Fix INSERT WITH CHECK para garantir que member_role inicial seja 'member'

DROP POLICY IF EXISTS "Members can leave conversations" ON public.team_conversation_members;
DROP POLICY IF EXISTS "Admins can remove members" ON public.team_conversation_members;

-- Funcao que garante que a conversa nunca fique sem owner apos delete
CREATE OR REPLACE FUNCTION public.team_conversation_members_prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  IF OLD.member_role = 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.team_conversation_members
    WHERE conversation_id = OLD.conversation_id
      AND member_role = 'admin'
      AND id != OLD.id;

    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Nao e possivel remover o ultimo administrador da conversa';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.team_conversation_members_prevent_last_admin_removal() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS team_conversation_members_prevent_last_admin_removal ON public.team_conversation_members;

CREATE TRIGGER team_conversation_members_prevent_last_admin_removal
  BEFORE DELETE ON public.team_conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.team_conversation_members_prevent_last_admin_removal();

-- Policy: membros podem sair (se nao for o ultimo admin)
CREATE POLICY "Members can leave conversations"
  ON public.team_conversation_members
  FOR DELETE
  TO authenticated
  USING (
    profile_id = auth.uid()
  );

-- Policy: admins do sistema podem remover qualquer membro
CREATE POLICY "System admins can remove members"
  ON public.team_conversation_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
    )
  );

-- Fix INSERT WITH CHECK: member_role inicial deve ser 'member' (nao 'admin')
-- Somente admins do sistema podem inserir com role != 'member'
DROP POLICY IF EXISTS "Conversation members can add others" ON public.team_conversation_members;
DROP POLICY IF EXISTS "Members can add participants" ON public.team_conversation_members;

CREATE POLICY "Authenticated can join conversations"
  ON public.team_conversation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND member_role = 'member'
  );

CREATE POLICY "Admin can add members with any role"
  ON public.team_conversation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
    )
  );
