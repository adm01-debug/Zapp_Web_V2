Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/team-chat/TeamMessageItem.tsx: o tick da mensagem própria agora
  vem embrulhado num `span role="img"` com nome acessível (ENVIADO/ENTREGUE/LIDO)
  e o ícone do `MessageStatus` é recolocado na cor certa DENTRO do balão próprio:
  lido = cor `info` do sistema; enviado/entregue = `text-primary-foreground`.
  Antes o ícone nascia em `text-muted-foreground` (cinza que some no balão roxo
  `bg-primary`) e sem nome acessível — a tela não mostrava o estado real.
- src/components/team-chat/__tests__/TeamMessageItem.status.test.tsx (novo):
  renderiza o componente REAL (sem mock) e cobre enviado (1 traço), entregue
  (2 traços), lido em grupo (`Lido por todos os participantes`, cor info), lido
  em direta (`Lido`), "enviando" (relógio), status desconhecido -> enviado,
  mensagem apagada -> sem tick, e mensagem de OUTRO participante -> sem tick.

## Prova
- vermelho antes (produção revertida para o HEAD, `git checkout HEAD -- TeamMessageItem.tsx`):
  `npx vitest run src/components/team-chat/__tests__/TeamMessageItem.status.test.tsx`
  → `Tests  7 failed | 3 passed (10)` (falham os 7 casos que dependem do nome acessível e da cor; passam os 3 negativos)
- verde depois (mesmo comando, com a correção):
  → `Test Files  1 passed (1); Tests  10 passed (10)`
- vizinho que já travava o tick no Panel, ainda verde:
  `npx vitest run src/components/team-chat/__tests__/TeamChatPanel.wiring.test.tsx`
  → `Test Files  1 passed (1); Tests  4 passed (4)`

## Pré-requisito (NÃO é meu — vem do cartão pai t_74af822e)
O diff contra a branch do dia também lista os arquivos do cartão-pai (Hugo, `area-front-hooks`),
cherry-pickados para esta branch porque eu dependo deles: `src/hooks/team-chat/useTeamReadState.ts`,
`useTeamMessages.ts`, `queryKeys.ts`, `README.md`, os testes `useTeamReadState.test.tsx` /
`useTeamMessages.test.tsx`, `supabase/migrations/20261009214931_team_message_read_state_view.sql`,
`src/integrations/supabase/types.ts`, `scripts/db-audit/team-message-read-state.test.sh` e
`.github/workflows/db-guard.yml`. Os MEUS arquivos são só `TeamMessageItem.tsx` e
`__tests__/TeamMessageItem.status.test.tsx`.

## O que NÃO fiz e por quê
- tooltip com os NOMES ("Lido por X, Y"): o componente não recebe quem leu. A view
  `team_message_read_state` (do cartão anterior) só expõe `read_count`/`all_read`,
  e `useTeamMessages` mapeia apenas o `status`. Expor os leitores é hook/banco
  (worker (hooks)/(sql)) — fica em `kanban_comment` neste cartão. O tooltip de
  ESTADO (Enviado/Entregue/Lido) já é o que o `MessageStatus` renderiza.
- captura de tela: não existe projeto visual Playwright para o chat interno
  (R1 só lista contacts/talkx/email-navy/theme) e a regra proíbe sessão de
  produção. A cor do lido é pinada no teste e é o mesmo par do `MessageBubble`
  do inbox, já aferido em `MessageBubble.contrasteStatus.test.tsx`.
