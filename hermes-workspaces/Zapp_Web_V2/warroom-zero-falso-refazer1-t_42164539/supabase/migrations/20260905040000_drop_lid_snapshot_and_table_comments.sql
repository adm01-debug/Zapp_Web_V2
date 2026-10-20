-- lid_audit_snapshot_20260902: snapshot temporario da auditoria de LIDs de
-- 2026-09-02 (unica tabela sem PK, policy service_role_full_access). A auditoria
-- fechou (E32 contact_identity_map); o snapshot nao tem consumidor no codigo.
DROP TABLE IF EXISTS public.lid_audit_snapshot_20260902;

-- Dicionario minimo das tabelas core (126/130 sem COMMENT em 2026-09-05).
COMMENT ON TABLE public.contacts IS 'Contato/cliente por canal (WhatsApp, e-mail, SICOOB): identidade, atribuicao (assigned_to, queue_id), classificacao por IA e conexao de origem. Uma linha = uma conversa/thread ativa com o contato.';

COMMENT ON TABLE public.messages IS 'Mensagens trocadas com contacts (inbound e outbound). external_id = id na Evolution GO (dedup por indice unico). media_url guarda locator do bucket privado whatsapp-media/audio-messages. is_deleted = soft delete.';

COMMENT ON TABLE public.conversation_events IS 'Linha do tempo de uma conversa: transferencias de agente/fila, abertura/fechamento e demais transicoes, com quem executou (performed_by) e metadata.';

COMMENT ON TABLE public.conversation_sla IS 'Instancia de SLA por contato: primeiro contato, primeira resposta (mark_first_response), resolucao e flags de violacao, ligada a sla_configurations.';

COMMENT ON TABLE public.sla_configurations IS 'Configuracoes de SLA (minutos para primeira resposta e resolucao, prioridade, default).';

COMMENT ON TABLE public.profiles IS 'Perfil de atendente ligado a auth.users: nome, avatar, departamento e role em cache (fonte de verdade de permissao = user_roles + role_permissions).';

COMMENT ON TABLE public.user_roles IS 'Papeis por usuario (admin, supervisor, agent, special_agent). Alteracoes auditadas em audit_logs por trigger.';

COMMENT ON TABLE public.whatsapp_connections IS 'Instancias da Evolution GO conectadas (instance_id unico), status da sessao e configuracao de webhook.';

COMMENT ON TABLE public.queues IS 'Filas de atendimento (prioridade, tempo maximo de espera) usadas na distribuicao de contatos.';

COMMENT ON TABLE public.tags IS 'Etiquetas aplicaveis a contatos (contact_tags).';

COMMENT ON TABLE public.audit_logs IS 'Trilha de auditoria: login, mudancas de role/permissao, client_error do front (errorReporter) e acoes sensiveis. Leitura restrita a admin.';

COMMENT ON TABLE public.login_attempts IS 'Contador de falhas de login por e-mail com bloqueio exponencial (record_failed_login / is_account_locked / clear_login_attempts). Acesso apenas via SECURITY DEFINER e edges service_role.';

COMMENT ON TABLE public.email_threads IS 'Threads do Gmail sincronizadas por conta (gmail_accounts), com contato associado, atribuicao e remetente da ultima mensagem.';

COMMENT ON TABLE public.email_messages IS 'Mensagens de e-mail de uma email_thread (corpo texto/HTML sanitizado no front por src/lib/emailHtml.ts).';

COMMENT ON TABLE public.email_attachments IS 'Anexos de email_messages (unico por mensagem+attachment_id).';

COMMENT ON TABLE public.webhook_failures IS 'Dead-letter dos webhooks (endpoint, evento, payload truncado, erro, retries). ACL restrita a service_role.';

COMMENT ON TABLE public.contact_identity_map IS 'Mapa LID -> JID do WhatsApp (identidade anonima vs numero) para reconciliar contatos.';

COMMENT ON TABLE public.departments IS 'Departamentos (modo de WhatsApp e credenciais da instancia por departamento — colunas de segredo revogadas de authenticated).';

COMMENT ON TABLE public.team_conversations IS 'Conversas internas do time (diretas ou grupos), opcionalmente por departamento.';

COMMENT ON TABLE public.team_messages IS 'Mensagens do chat interno do time; media_url aponta para o bucket privado team-chat-files.';
