# Team Chat — contratos do front (`src/hooks/team-chat`)

Este README é o contrato do módulo: o que cada hook assina no realtime, de onde
cada um lê os dados, quais chaves de cache existem e qual vocabulário a auditoria
usa. Ele é verificado por teste (`__tests__/contratosModulo.test.ts`) — todo nome
citado aqui tem de existir no código ou em `src/integrations/supabase/types.ts`.
Nome novo no README sem correspondente no código deixa o teste VERMELHO.

## Canais realtime

Cada canal é do canal de conversa: o nome carrega o id da conversa
(`<área>-<conversationId>`), então duas conversas nunca compartilham assinatura e
o `supabase.removeChannel(channel)` da desmontagem não derruba o canal de outra.
Os canais de dados (`postgres_changes`) só revalidam cache — nunca montam estado
a partir do payload. `useTeamTyping` fala por `broadcast` (`typing`) e
`useTeamPresence` por `presence` (chave = id do usuário).
A publicação realtime do banco tem `team_messages`, `team_message_reactions`,
`team_message_receipts` e `team_conversation_members`; `team_conversations` fica
fora (o `updated_at` é atualizado pelas mutações do próprio módulo).

## Fonte de dados por hook

Tipo: `tabela` = `.from('<nome>')`, `rpc` = `.rpc('<nome>')`,
`canal` = nome do canal do Supabase Realtime, `storage` = bucket do Supabase
Storage.

| Hook | Arquivo | Tipo | Nome |
| --- | --- | --- | --- |
| `useTeamConversations` | `useTeamConversations.ts` | tabela | `team_conversation_members` |
| `useTeamConversations` | `useTeamConversations.ts` | tabela | `team_conversations` |
| `useTeamConversations` | `useTeamConversations.ts` | rpc | `get_team_conversation_previews` |
| `useTeamConversations` | `useTeamConversations.ts` | rpc | `get_team_unread_counts` |
| `useTeamConversations` | `useTeamConversations.ts` | canal | `team-chat-updates` |
| `useTeamMessages` | `useTeamMessages.ts` | tabela | `team_messages` |
| `useTeamMessages` | `useTeamMessages.ts` | tabela | `team_message_receipts` |
| `useTeamMessages` | `useTeamMessages.ts` | canal | `team-messages-<conversationId>` |
| `useTeamMessageReactions` | `useTeamMessageReactions.ts` | tabela | `team_message_reactions` |
| `useTeamMessageReactions` | `useTeamMessageReactions.ts` | canal | `team-reactions-<conversationId>` |
| `useSendTeamMessage` | `useTeamChatMutations.ts` | tabela | `team_messages` |
| `useSendTeamMessage` | `useTeamChatMutations.ts` | tabela | `team_conversations` |
| `useDeleteTeamMessage` | `useTeamChatMutations.ts` | tabela | `team_messages` |
| `useEditTeamMessage` | `useTeamChatMutations.ts` | tabela | `team_messages` |
| `useCreateTeamConversation` | `useTeamChatMutations.ts` | tabela | `team_conversations` |
| `useCreateTeamConversation` | `useTeamChatMutations.ts` | rpc | `find_or_create_direct_conversation` |
| `useCreateTeamConversation` | `useTeamChatMutations.ts` | rpc | `create_team_group_conversation` |
| `useToggleMuteConversation` | `useTeamChatMutations.ts` | tabela | `team_conversation_members` |
| `useRenameConversation` | `useTeamChatMutations.ts` | tabela | `team_conversations` |
| `useRemoveConversationMember` | `useTeamChatMutations.ts` | tabela | `team_conversation_members` |
| `useLeaveConversation` | `useTeamChatMutations.ts` | tabela | `team_conversation_members` |
| `useTransferConversation` | `useTeamChatMutations.ts` | rpc | `transfer_team_conversation_ownership` |
| `useDeleteConversation` | `useTeamChatMutations.ts` | tabela | `team_conversations` |
| `useAddConversationMembers` | `useTeamChatMembers.ts` | tabela | `team_conversation_members` |
| `useTeamMemberDetails` | `useTeamMemberDetails.ts` | rpc | `get_team_profiles` |
| `useTeamPerformance` | `useTeamPerformance.ts` | tabela | `team_messages` |
| `useParticipantStats` | `useParticipantStats.ts` | tabela | `team_messages` |
| `useActiveDepartments` | `useActiveDepartments.ts` | tabela | `departments` |
| `useTeamTyping` | `useTeamTyping.ts` | canal | `team-typing-<conversationId>` |
| `useTeamPresence` | `useTeamPresence.ts` | canal | `team-presence-<conversationId>` |
| `useDepartmentProfiles` | `useDepartmentManagement.ts` | rpc | `get_team_profiles` |
| `useDepartmentAuditLogs` | `useDepartmentManagement.ts` | tabela | `department_audit_logs` |
| `useDepartmentInvites` | `useDepartmentManagement.ts` | tabela | `department_invitations` |
| `useDepartmentWhatsAppCredentials` | `useDepartmentManagement.ts` | rpc | `get_department_whatsapp_config` |
| `uploadTeamMedia` | `uploadTeamMedia.ts` | storage | `team-chat-files` |

Eventos assinados nos canais de dados: `useTeamConversations` escuta `*` em
`team_messages` e em `team_conversation_members` e `UPDATE` em
`team_message_receipts` — o desenho é "qualquer coisa muda o inbox";
`useTeamMessages` escuta `*` em `team_messages` com
`filter: conversation_id=eq.<conversationId>`; `useTeamMessageReactions` escuta
`*` em `team_message_reactions` com o mesmo filtro. O badge de não lidas do
módulo (`useTeamUnreadTotal`) não abre canal nem dispara consulta: lê o
`unread_count` do inbox que já está em cache na chave de `useTeamConversations`.

## Fábricas de chave (`queryKeys.ts`)

Chave literal não entra neste módulo: toda `queryKey` e toda
`invalidateQueries` saem daqui, para que a chave que o hook registra e a chave
que a mutação revalida sejam a MESMA string. A invalidação é por prefixo, então
a fábrica sem argumento devolve a raiz (não um `undefined` no lugar do id):

- `queryKeys.profile()` — raiz `['profile']`, usada para revalidar o perfil depois
  de aceitar convite de departamento.
- `queryKeys.inbox()` — raiz `['team-conversations']`, alcança o inbox de
  qualquer perfil; `queryKeys.inbox(profileId)` é a chave da query.
- `queryKeys.messages(conversationId)`
- `queryKeys.reactions(conversationId)`
- `queryKeys.members(conversationId, memberIds)` — o último elemento é
  `memberIds.join(',')`, como na chave histórica.
- `queryKeys.memberProfile(profileId)`
- `queryKeys.performance(conversationId)`
- `queryKeys.participantStats(conversationId)`
- `queryKeys.departments.list()`
- `queryKeys.departments.members()` — mesma chave de `useDepartmentProfiles`
  (o id do departamento NÃO entra: a RPC `get_team_profiles` devolve a lista
  inteira e o cache é um só).
- `queryKeys.departments.invites(departmentId)`
- `queryKeys.departments.audit(departmentId)`
- `queryKeys.departments.whatsapp(departmentId)`

## Upload de mídia

Bucket privado `team-chat-files`. O caminho canônico é
`<profile_id>/<conversation_id>/<uuid>.<ext>` (uuid por
`createStorageObjectId`, extensão saneada por `sanitizeExtension`), montado
apenas por `buildTeamMediaPath`. Sem `getPublicUrl`: a mensagem persiste
`media_bucket`/`media_path` e o consumo passa por URL assinada
(`useResolvedStorageUrl`).

## Tipos derivados (`teamChatTypes.ts`)

Os tipos de linha saem de `types.ts` em vez de serem escritos à mão:
`TeamConversationRow`, `TeamConversationMemberRow`, `TeamMessageRow`,
`TeamMessageReactionRow`, `TeamInboxRow`, `TeamMessagePageRow`,
`TeamConversationType`, `TeamMemberRole`.

## Vocabulário de auditoria

`DEPARTMENT_AUDIT_ACTIONS` = verbos aceitos pelo CHECK
`department_audit_logs_action_check` no banco (última migration que o define):

`accept_invite`, `create_invite`, `join_department`, `leave_department`,
`remove_member`, `update_settings`, `delete_department`, `create_department`,
`update_role`, `kick_member`, `create_group`, `delete_group`,
`whatsapp_updated`.

## Pendências conhecidas (não são convenção)

- `src/components/team-chat/TransferConversationDialog.tsx` ainda usa a chave
  literal `['transfer-dialog-members', ...]` — arquivo da área de componentes,
  fora deste módulo.
- `useDepartmentManagement` usa as RPCs atuais para convite e WhatsApp de
  departamento (`create_department_invite`, `accept_department_invite`,
  `get_department_whatsapp_config`, `set_department_whatsapp_config`). Campos
  legados do formulário de WhatsApp ficam só como compatibilidade de entrada.
