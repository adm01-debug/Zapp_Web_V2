# Team Chat — Hooks

## Convenção de nomes de canal Supabase Realtime

| Canal | Padrão | Tipo | Filtro de payload |
|-------|--------|------|-------------------|
| Mensagens | `team:messages:<cid>:<nanoid>` | postgres_changes | `conversation_id=eq.<cid>` |
| Reações | `team:reactions:<cid>:<nanoid>` | postgres_changes | `conversation_id=eq.<cid>` |
| Recibos | `team:receipts:<cid>:<nanoid>` | postgres_changes | `conversation_id=eq.<cid>` |
| Inbox (membros) | `team:inbox:<profile>:<nanoid>` | postgres_changes | `profile_id=eq.<profile>` |
| Digitando | `team:typing:<cid>` | broadcast | — (canal compartilhado, sem sufixo) |
| Presença global | `team:presence` | presence | — (canal único global) |

### Regras

1. **Sempre incluir `:<nanoid>` nos canais `postgres_changes`** para garantir
   canal único por instância de hook e evitar vazamento de evento entre
   componentes concorrentes montados ao mesmo tempo.

2. **`team:typing:<cid>` e `team:presence` não levam sufixo** — são canais
   broadcast/presence genuinamente compartilhados entre todos os participantes.

3. O sufixo é gerado via `nanoid(8)` no `useMemo` inicial do hook, **nunca**
   dentro do `useEffect` — para não trocar de canal a cada re-render.
   ```ts
   const channelId = useMemo(() => nanoid(8), []);
   const channelName = `team:messages:${conversationId}:${channelId}`;
   ```

4. Ao desmontar o hook, sempre chamar `supabase.removeChannel(channel)` no
   cleanup do `useEffect`.

5. Qualquer canal de postgres_changes deve usar **filtro server-side** para
   evitar tráfego desnecessário:
   ```ts
   filter: `conversation_id=eq.${conversationId}`
   ```
   A coluna `conversation_id` foi desnormalizada em `team_message_receipts`
   (migration `20260928650000`) exatamente para habilitar esse filtro.

## Estrutura de hooks

| Hook | Responsabilidade |
|------|------------------|
| `useTeamConversations` | Lista do inbox via RPC `get_team_inbox` |
| `useTeamMessages` | Mensagens paginadas via `useInfiniteQuery` + RPC `get_team_messages_page` |
| `useMarkConversationRead` | Marcar conversa como lida via RPC `mark_team_messages_read` |
| `useTeamChatMutations` | Envio (RPC `send_team_message`), upload de mídia, CRUD de conversa |
| `useTeamMessageReactions` | Toggle de reação via RPC `toggle_team_message_reaction` |
| `useTeamReadState` | Estado de leitura por conversa em cache local |
| `useTeamDraft` | Rascunho por conversa em localStorage |
| `useTeamTyping` | Indicador de digitação via broadcast |
| `useTeamPresence` | Presença global via presence channel |
| `useTeamUnreadCount` | Contador de não-lidas (realtime) |
| `useTeamChatNotifications` | Notificações de menção e mensagem direta |
