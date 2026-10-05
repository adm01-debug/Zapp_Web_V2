-- team_chat_media_acl_r2_db_020
-- Rollback: DROP POLICY IF EXISTS "Team chat files readable by owner admin or conversation member" ON storage.objects; ALTER TABLE public.team_messages DROP CONSTRAINT IF EXISTS team_messages_media_path_matches_sender_conversation; CREATE POLICY "Conversation members can read team chat files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='team-chat-files' AND (is_admin_or_supervisor(auth.uid()) OR (storage.foldername(objects.name))[1] = auth.uid()::text OR EXISTS (SELECT 1 FROM public.team_messages tm JOIN public.team_conversation_members mem ON mem.conversation_id = tm.conversation_id JOIN public.profiles p ON p.id = mem.profile_id WHERE tm.media_bucket='team-chat-files' AND tm.media_path = objects.name AND p.user_id = auth.uid())));
--
-- R2-DB-020 (P1). Fecha a correlação entre a ACL de leitura dos arquivos do Team
-- Chat (storage.objects) e a própria linha externa do objeto + usuário autenticado,
-- e vincula a persistência de team_messages.media_path ao perfil remetente e à
-- conversa — nunca a profiles.name.
--
-- DEFEITO. A policy "Conversation members can read team chat files" (20260927270012)
-- comparava `tm.media_path = name` SEM qualificação. No subselect, `name` resolve para
-- `profiles.name` (a tabela profiles está no JOIN), não para `storage.objects.name`.
-- Medido no catálogo vivo: o qual ficou `tm.media_path = p.name`. Efeito: qualquer
-- usuário cujo `profiles.name` fosse igual ao `media_path` de uma mensagem de conversa
-- da qual participa liberava a leitura de QUALQUER objeto do bucket team-chat-files,
-- inclusive de conversa alheia.
--
-- CONTRATO CANÔNICO (decisão t_60862ed1): a chave de mídia é
--   <profile_id>/<conversation_id>/<nome-opaco>
-- media_path armazenado começa em <profile_id> (sem o bucket). A autorização deriva
-- SOMENTE de `storage.objects.name` (qualificação explícita) e do usuário autenticado.
--
-- Policy final: TO authenticated, substituindo a policy vulnerável. A persistência de
-- media_path (quando media_bucket='team-chat-files') exige 1º segmento = perfil
-- remetente (sender_id) e 2º segmento = própria conversa (conversation_id). Caminho
-- curto/malformado nega (SELECT) ou é recusado (CHECK), nunca erro de cast: comparamos
-- texto com texto (sender_id::text / conversation_id::text), sem castar o path a uuid.
--
-- PROVA DO CONTRATO (por que "dono da pasta" = profile_id e o CHECK exige 3 segmentos):
-- 1) O upload do frontend já grava no formato canônico <profile_id>/<conversation_id>/
--    <opaco>: TeamFileUploader.tsx (`${profile.id}/${conversationId}/${Date.now()}.${ext}`)
--    e useTeamChatDraft.ts (colar imagem, mesmo formato). A policy de INSERT
--    team_chat_files_insert (20260928560000) exige
--    (storage.foldername(name))[1] = current_profile_id() — 1º segmento = profile_id.
--    Não há policy de UPDATE (20260928560000 revogou UPDATE de authenticated). Achado
--    fora de escopo (src/**): o upload de áudio em useTeamChatPanel.ts grava
--    `${conversationId}/${file}` — já falha na policy de INSERT atual; tratar em
--    cartão próprio.
-- 2) Legado: contado em produção em 2026-10-05 via gateway read-only — 0 linhas de
--    team_messages com media_bucket='team-chat-files' e 0 objetos no bucket
--    team-chat-files. Nenhuma linha existente viola o CHECK; ADD CONSTRAINT simples
--    (sem NOT VALID) é seguro e a aplicação no banco local da tarefa confirma a
--    varredura integral da tabela.
-- 3) O formato antigo <auth_uid>/... (policy de INSERT "Users can upload to own
--    folder in team-chat-files", anterior a 20260928560000) foi ABANDONADO: o bucket
--    tem 0 objetos e a gravação já exige current_profile_id() no 1º segmento desde
--    20260928560000. Não é preservado: objeto em <auth_uid>/... NÃO é mais legível
--    pelo dono sob a policy nova (provado no teste runtime).

DROP POLICY IF EXISTS "Conversation members can read team chat files" ON storage.objects;
DROP POLICY IF EXISTS "Team chat files readable by owner admin or conversation member" ON storage.objects;

CREATE POLICY "Team chat files readable by owner admin or conversation member"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = 'team-chat-files'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(objects.name))[1] = current_profile_id()::text
    OR EXISTS (
      SELECT 1
      FROM public.team_conversation_members mem
      WHERE mem.profile_id = current_profile_id()
        AND mem.conversation_id::text = (storage.foldername(objects.name))[2]
    )
  )
);

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_media_path_matches_sender_conversation CHECK (
    media_bucket IS DISTINCT FROM 'team-chat-files'
    OR (
      media_path IS NOT NULL
      AND split_part(media_path, '/', 1) = sender_id::text
      AND split_part(media_path, '/', 2) = conversation_id::text
      AND split_part(media_path, '/', 3) <> ''
    )
  );
