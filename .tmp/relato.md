Especialista: worker (geral)

Concluí sem ressalvas: a paginação de mensagens antigas do Team Chat passa a usar
a RPC `get_team_messages_page` e o remetente (nome + foto) chega às mensagens
antigas.

## O que mudou e por quê
- src/components/team-chat/useTeamChatPanel.ts: `fetchOlderMessages` deixa de ler
  `team_messages` direto com embed `sender:profiles!team_messages_sender_id_fkey`
  e passa a chamar a RPC achatada `get_team_messages_page` com o cursor em
  `p_before_id` (página de 60, teto do `.limit(60)` antigo). Motivo: a RLS de
  `profiles` é 'own + admin', então para o agente o embed voltava `sender: null`
  e as mensagens ANTIGAS apareciam sem nome e sem foto. A RPC resolve o remetente
  no servidor (`sender_name`/`sender_avatar`) — mesmo caminho já usado pelo
  histórico novo (`useTeamMessages`, SL-016/F54).
- src/components/team-chat/useTeamChatPanel.ts: tipo `TeamMessagePageRow` e
  mapeador `pageRowToTeamMessage` (achata `sender_name`/`sender_avatar` em
  `sender`; `status` fica de fora como no `useTeamMessages`: coluna NOT NULL sem
  UPDATE no cliente).
- src/components/team-chat/__tests__/useTeamChatPanel.pagination.test.tsx: o
  teste antigo afirmava o filtro `.or(created_at,id)` do `select` direto; ele NÃO
  foi pulado nem apagado — foi reescrito para o caminho novo, com 3 testes que
  chamam o hook real (`renderHook(useTeamChatPanel)` + `fetchOlderMessages`):
  (1) a paginação chama `get_team_messages_page` com o cursor composto
  (`p_before_id: 'm-new'`, `p_limit: 60`) e não há leitura direta de
  `team_messages`; (2) as antigas trazem `sender.name`/`sender.avatar_url` em
  ordem ASC; (3) o cursor avança (`m-new` → `m-old-1`) e `hasOlderMessages` vira
  `false` quando a página volta vazia.

## Prova
- vermelho antes: `npx vitest run src/components/team-chat/__tests__/useTeamChatPanel.pagination.test.tsx`
  → `AssertionError: expected [ 'm-new' ] to deeply equal [ 'm-old-1', 'm-old-2', 'm-new' ]`
  e `a paginação deve usar a RPC get_team_messages_page` (2 failed)
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 3 passed (3)`
- regressão do módulo: `npx vitest run src/components/team-chat src/hooks/team-chat`
  → `Test Files 35 passed (35); Tests 358 passed | 1 todo (359)`

## Notas de decisão
- O caminho do cartão (`src/hooks/team-chat/useTeamChatPanel.ts`) não existe: o
  hook mora em `src/components/team-chat/useTeamChatPanel.ts` (é de lá que
  `useTeamChatPanel` é exportado; `src/hooks/team-chat/` tem só os vizinhos —
  `useTeamMessages` e tipos). É esse o arquivo do defeito descrito no cartão (o
  `.select(...)` com embed de `profiles` está nele): a lista do cartão traz um
  caminho errado, não um arquivo a mais.
- O desempate por `id` para mensagens com o MESMO `created_at` do cursor é do
  banco (N-072, "fora do HEAD, traga"); o SQL atual da RPC compara só
  `created_at < v_before_at`, e o hook registra isso em comentário.
- Não alterei `useTeamMessages.ts` (mapeamento equivalente, fora do escopo): o
  mapeador ficou local no hook da paginação.
