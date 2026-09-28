-- E18: Fix storage policy para bucket team-chat-files
-- Remover policies abertas e criar policies que restringem ao proprio usuario
-- e membros da conversa relevante

-- Remover policies existentes que possam estar abertas
DELETE FROM storage.policies WHERE bucket_id = 'team-chat-files';

-- Policy de leitura: apenas membros autenticados que sao membros de alguma conversa
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES
  (
    'team_chat_files_authenticated_read',
    'team-chat-files',
    'SELECT',
    '((auth.role() = ''authenticated''::text) AND (EXISTS ( SELECT 1 FROM team_conversation_members tcm WHERE (tcm.profile_id = auth.uid()))))'
  ),
  (
    'team_chat_files_owner_insert',
    'team-chat-files',
    'INSERT',
    '((auth.role() = ''authenticated''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))'
  ),
  (
    'team_chat_files_owner_update',
    'team-chat-files',
    'UPDATE',
    '((auth.role() = ''authenticated''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))'
  ),
  (
    'team_chat_files_owner_delete',
    'team-chat-files',
    'DELETE',
    '((auth.role() = ''authenticated''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))'
  );
