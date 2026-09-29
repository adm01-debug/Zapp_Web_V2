# Team Chat Hooks

## Canal Realtime — Nomenclatura Canônica (E52)

| Canal | Tipo | Usado em |
|---|---|---|
| `team:inbox:<pid>:<sfx>` | postgres_changes | `useTeamConversations` |
| `team:messages:<cid>:<sfx>` | postgres_changes | `useTeamMessages` |
| `team:reactions:<cid>:<sfx>` | postgres_changes | `useTeamMessageReactions` |
| `team:receipts:<cid>:<sfx>` | postgres_changes | `useTeamReadState` |
| `team:typing:<cid>` | broadcast | `useTeamTyping` |
| `team:presence` | presence | `useTeamPresence` |

`<sfx>` = `crypto.randomUUID().slice(0, 8)` — evita colisão de subscrição por instância de componente.

## Hooks × RPCs

| Hook | RPC | QueryKey |
|---|---|---|
| `useTeamConversations` | `get_team_inbox()` | `TEAM_KEYS.inbox(pid)` |
| `useTeamMessages` | `get_team_messages_page(cid, before_id, limit)` | `TEAM_KEYS.messages(cid)` |
| `useMarkConversationRead` | `mark_team_conversation_read(cid)` | — (mutation) |
| `useTeamChatMutations.useSendTeamMessage` | `send_team_message(...)` | — |
| `useTeamChatMutations.useLeaveConversation` | `leave_team_group(cid)` | — |
| `useTeamChatMutations.useRemoveConversationMember` | `remove_team_member(cid, pid)` | — |
| `useTeamMessageReactions` | `toggle_team_reaction(mid, emoji)` | `TEAM_KEYS.reactions(cid)` |
| `useTeamReadState` | — (view query) | `TEAM_KEYS.readState(cid)` |

## Regras de Upload (E60)

- Path: `${authUid}/${conversationId}/${timestamp}_${name}.${ext}`
- Bucket `team-chat-files` é **privado** → sempre `createSignedUrl(path, 3600)`
- Nunca `getPublicUrl` neste bucket
