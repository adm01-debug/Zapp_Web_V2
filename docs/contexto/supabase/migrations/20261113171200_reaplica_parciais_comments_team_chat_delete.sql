comment on function public.set_default_whatsapp_connection(uuid) is
  'TRA-004 (item 174): troca atomica da conexao padrao do WhatsApp. Uma transacao '
  '(desmarca a anterior e marca o alvo), serializada por advisory lock, autorizada '
  'por is_admin_or_supervisor(auth.uid()) (mesma policy de UPDATE da tabela) e com '
  'resultado validado (exatamente uma padrao ao final). Retorna o uuid do alvo. '
  'Erro identico para id inexistente e chamador sem permissao.'

SET LOCAL lock_timeout = '3s'

DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage.objects

CREATE POLICY "Users can delete own team chat files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-chat-files'
    AND (storage.foldername(name))[1] = (public.current_profile_id())::text
  )
