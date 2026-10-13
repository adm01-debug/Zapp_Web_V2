Especialista: worker (geral)

## O que mudou e por quê
- src/components/team-chat/useTeamChatPanel.ts: `fetchOlderMessages` deixa de ler
  `team_messages` direto com embed `sender:profiles!team_messages_sender_id_fkey`
  e passa a chamar a RPC achatada `get_team_messages_page` com o cursor em
  `p_before_id` (página de 60, teto do `.limit(60)` antigo). Motivo: a RLS de
  `profiles` é 'own + admin', então para o agente o embed voltava `sender: null`
  e as mensagens ANTIGAS apareciam sem nome e sem foto. A RPC resolve o remetente
  no servidor (`sender_name`/`sender_avatar`) — é o mesmo caminho já usado pelo
  histórico novo (`useTeamMessages`, SL-016/F54).
- src/components/team-chat/useTeamChatPanel.ts: tipo `TeamMessagePageRow` e
  mapeador `pageRowToTeamMessage` (achata `sender_name`/`sender_avatar` em
  `sender`, e `status` fica de fora como no `useTeamMessages`: coluna NOT NULL
  sem UPDATE no cliente).
- src/components/team-chat/__tests__/useTeamChatPanel.pagination.test.tsx:
  reescrito. Antes provava o filtro `.or(created_at,id)` do select direto; agora
  prova que a paginação chama `get_team_messages_page` com
  `p_before_id: 'm-new'`, que NÃO há leitura direta de `team_messages`, e que as
  antigas trazem `sender.name`/`sender.avatar_url` em ordem ASC.

## Prova
- vermelho antes: `npx vitest run src/components/team-chat/__tests__/useTeamChatPanel.pagination.test.tsx`
  → `expected [ 'm-new' ] to deeply equal [ 'm-old-1', 'm-old-2', 'm-new' ]` e
  `a paginação deve usar a RPC get_team_messages_page` (2 failed)
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 2 passed (2)`
- regressão do módulo: `npx vitest run src/components/team-chat src/hooks/team-chat`
  → `Test Files 35 passed (35); Tests 358 passed | 1 todo (359)`

## O que NÃO fiz e por quê
- Não mexi no SQL da RPC: o desempate por `id` para mensagens com o MESMO
  `created_at` do cursor é do banco (N-072, "fora do HEAD, traga"); o SQL atual
  compara só `created_at < v_before_at`. Está comentado no hook.
- Não alterei `useTeamMessages.ts` (mapeamento equivalente, mas fora do escopo
  deste cartão): o mapeador ficou local no hook da paginação.
