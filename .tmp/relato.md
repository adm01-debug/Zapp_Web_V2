Especialista: iris

## O que mudou e por quê
- src/components/team-chat/TeamMessageItem.tsx: o tick da mensagem própria agora
  vem embrulhado num `span role="img"` com nome acessível (Enviado/Entregue/Lido)
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
- vermelho antes (medido no run anterior por iris, produção revertida para o
  commit-pai `f7cdda1f4d`):
  `npx vitest run src/components/team-chat/__tests__/TeamMessageItem.status.test.tsx`
  → `Tests  7 failed | 2 passed (9)`
- verde depois, re-medido agora neste workspace (retomada do cartão):
  `npx vitest run src/components/team-chat/__tests__/TeamMessageItem.status.test.tsx src/components/team-chat/__tests__/TeamChatPanel.wiring.test.tsx`
  → `Test Files  2 passed (2); Tests  13 passed (13)`
- o juiz do fechar apontou "teste novo que não chama o código real": era o caso do
  teste que só lia `tokens.css` (`readFileSync`), que foi REMOVIDO no commit
  `7e13e88ef7` — agora todos os casos renderizam o `TeamMessageItem` real.

## Retomada (OOM do fechar, não do diff)
Este cartão foi bloqueado como `transient`: o `hermes-tarefa-fechar` morreu na
etapa `tipos` com exit 137 (SIGKILL/OOM) por carga da frota (load > 40, swap
cheia), não por erro do diff. Nesta retomada o workspace foi reusado
(`REUSADO=1`), os testes foram re-rodados verdes e o commit já existente foi
mantido; nada foi reescrito.

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
  `team_message_read_state` (do cartão pai) só expõe `read_count`/`all_read`, e
  `useTeamMessages` mapeia apenas o `status`. Expor os leitores é hook/banco
  (worker (hooks)/(sql)) — registrado em `kanban_comment` neste cartão. O tooltip de
  ESTADO (Enviado/Entregue/Lido) já é o que o `MessageStatus` renderiza.
- captura de tela: não existe projeto visual Playwright para o chat interno
  (R1 só lista contacts/talkx/email-navy/theme) e a regra proíbe sessão de
  produção. A cor do lido é pinada no teste e é o mesmo par do `MessageBubble`
  do inbox, já aferido em `MessageBubble.contrasteStatus.test.tsx`.
