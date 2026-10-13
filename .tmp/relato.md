Especialista: hugo

## O que mudou e por quê

- `src/hooks/chat/useTypingPresence.ts`: o canal `typing:<contato>` passou a ser criado com
  `config: { private: true }` (o tópico e a chave de presença não mudaram). Sem o flag a Realtime não
  consulta a RLS de `realtime.messages`, então a policy `can_access_realtime_topic` da migration
  `20261013210002` não valia nada nesse canal. O `subscribe` agora trata `CHANNEL_ERROR`/`TIMED_OUT`
  com `log.warn` e retorna — autorização negada não derruba a tela.
- `src/hooks/team-chat/useTeamTyping.ts`: canal `team-typing-<conversa>` marcado privado; o mesmo
  tratamento de status negado; os três `send` (aviso, throttle e parada) ganharam `.catch` com
  `log.warn` para não deixar rejeição solta quando a policy nega o broadcast.
- `src/hooks/team-chat/useTeamPresence.ts`: canal `team-presence-<conversa>` privado; o `track`
  passou para um `try/catch` (presença não sincroniza, o chat de equipe continua), e o status negado
  é registrado em vez de silencioso.
- `src/components/inbox/collaboration/ViewersIndicator.tsx` (`useConversationViewers`): canal
  `conversation:<contato>` privado; `CHANNEL_ERROR`/`TIMED_OUT` só registram aviso e o indicador
  renderiza vazio (o painel de chat não quebra); `removeChannel` no cleanup virou `void` explícito.
- `src/hooks/__tests__/canais-realtime-privados.test.tsx` (novo): monta os quatro hooks, lê a chamada
  real do provedor e prova `config.private === true`, os tópicos conhecidos pela migration, a chave de
  presença do usuário logado, a tolerância ao `CHANNEL_ERROR` (hooks voltam neutros e o
  `ViewersIndicator` renderiza vazio) e a montagem dupla sob `StrictMode` com cleanup.
- `src/hooks/team-chat/__tests__/useTeamTyping.test.tsx`: a asserção do canal passou a exigir o
  segundo argumento (`{ config: { private: true } }`) — verificação mais estrita, não afrouxada.

Faixa do pai (t_db7ea742, "policy de autorização por tópico em realtime.messages") não estava neste
workspace: `git rev-list --reverse --no-merges dia/2026-10-13..b41f506b5` → `e4671d14d`,
`b41f506b5`; trazida inteira com `git cherry-pick -n -x` (migration
`20261013210002_realtime_canais_privados.sql` + `supabase/tests/realtime_canais_privados.sql`).

## Prova

- vermelho antes (quatro fontes revertidas para `HEAD`): `npx vitest run
  src/hooks/__tests__/canais-realtime-privados.test.tsx` → `Tests 3 failed | 3 passed (6)`
  ("expected undefined to be true" nas asserções de `private: true`).
- verde depois: `npx vitest run src/hooks/__tests__/canais-realtime-privados.test.tsx
  src/hooks/team-chat/__tests__/useTeamTyping.test.tsx
  src/hooks/__tests__/useTypingPresence.identidade.test.tsx
  src/components/inbox/__tests__/ChatPanel.typing-presence.test.tsx` → `Test Files 4 passed (4);
  Tests 23 passed (23)`, zero pulados.

## O que NÃO fiz e por quê

- Não marquei os outros canais (notificações, talkx, gmail, warroom, etc.). A policy
  `can_access_realtime_topic` só conhece `typing:`, `conversation:`, `team-typing-` e
  `team-presence-`; marcar qualquer outro como privado o NEGARIA. Os quatro canais privados são
  exatamente a união dos tópicos que a migration autoriza.
- Não rodei a prova de banco (`zapp-db-local up` respondeu "contêiner do banco não encontrado"): a
  autorização por tópico sob os papéis reais é a prova do cartão pai (t_db7ea742), que já entregou a
  migration e o teste SQL; esta trilha é só o front que consome a policy.
- Não usei `setAuth` explícito: o `@supabase/supabase-js` 2.117.2 injeta o token de sessão no
  Realtime sozinho (`SupabaseClient` chama `realtime.setAuth` no estado inicial e a cada mudança de
  auth); conferido no `node_modules` instalado.
