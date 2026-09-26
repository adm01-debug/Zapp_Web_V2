-- A policy "Users can update their assigned contacts" em public.contacts esta
-- com roles={public} desde a criacao, enquanto as outras 2 policies da tabela
-- (INSERT: "Users can insert contacts", SELECT: contacts_select_policy) ja
-- sao {authenticated}. auth.uid() e NULL para uma sessao anon, e toda
-- condicao do USING (get_visible_agent_ids, is_admin_or_supervisor, e o
-- EXISTS em queue_members via get_profile_id_for_user) depende de auth.uid()
-- para bater com alguma linha — nenhuma bate com NULL, entao uma request anon
-- ja nao conseguia atualizar contacts na pratica. Esta migration so remove a
-- superficie desnecessaria (role public na policy), sem tocar USING/WITH
-- CHECK nem mudar comportamento de nenhuma sessao autenticada.
ALTER POLICY "Users can update their assigned contacts"
  ON public.contacts
  TO authenticated;
