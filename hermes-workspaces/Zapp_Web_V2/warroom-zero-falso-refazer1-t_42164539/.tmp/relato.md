Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/dashboard/war-room/WarRoomAgentCard.tsx: `Resp.` mostra `—` quando `avgResponseTime` é `null`
  (antes rendia `s`/zero); `Chats` mostra `—` quando `maxChats` é 0/ausente e a barra só calcula a % com
  capacidade > 0 (antes `0/0` e `0 >= 0` marcavam o agente como sobrecarregado por engano). O cartão virou
  navegável por teclado (role=button, tabIndex, Enter/Espaço) com `aria-label` — ausência de amostra deixa de
  parecer zero medido.
- src/components/dashboard/WarRoomDashboard.tsx: `Satisfação` mostra `—` (sem `/5`) quando nenhum agente tem
  amostra; acrescenta os três estados que faltavam — esqueleto em carregando, painel de erro com botão
  `Tentar de novo` (chama `refetch`) e vazio `Nenhum agente ativo`/`Nenhuma fila ativa`; `Atualizado` agora vem
  de `dataUpdatedAt` real (removido o intervalo que só trocava o carimbo a cada 30s); `Auto-atualização` liga/
  desliga de verdade o `refetchInterval` do hook (`30000` x `false`); botão `Atualizar agora` chama `refetch`;
  `Esc` sai da tela cheia; botões de ícone ganharam `aria-label`/`aria-pressed`; as animações do
  arquivo (`animate-spin-slow` do auto-atualizar e `animate-pulse-subtle` do alerta crítico) passaram a
  `motion-safe:` (efeito sutil com reduzir-movimento).
- src/components/dashboard/__tests__/WarRoomEstados.test.tsx: teste novo (renderiza os componentes REAIS) que
  prova cada item acima.

## Prova
- vermelho antes: `npx vitest run src/components/dashboard/__tests__/WarRoomEstados.test.tsx` (com os arquivos
  restaurados para HEAD) → `Tests  9 failed | 1 passed (10)` (o único verde é o caso com dado medido, que já
  funcionava).
- verde depois: `npx vitest run src/components/dashboard/__tests__/WarRoomEstados.test.tsx` →
  `Test Files  1 passed (1); Tests  10 passed (10)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (43s)` com `OK tipos`, `OK lint`,
  `OK db_guard`, `OK migrations`. Sem banco no diff (nenhuma migration/Edge).

## Arquivos do cartão pai (cherry-pick da faixa t_80beb875), não tocados por mim
Trazidos por `git cherry-pick` de `d8ef8dcfe..2e6b475b4` porque a tela lê os RPCs do pai:
- src/hooks/business/useWarRoomData.ts e src/hooks/business/__tests__/useWarRoomData.test.tsx
- src/integrations/supabase/types.ts
- supabase/migrations/20261012225242_warroom_rpcs_agentes_filas.sql e supabase/tests/warroom_rpcs.sql
Nenhum deles faz parte da minha edição; o que eu mudei são só os 3 arquivos da seção "O que mudou".

## Sobre o aviso do juiz na 1ª passada do fechar (não procede)
O juiz listou arquivos "fora da lista do cartão"; nenhum é edição minha fora do escopo:
- `src/components/dashboard/WarRoomDashboard.tsx` é o MESMO componente que o cartão manda tocar — só que o
  cartão escreve o caminho `src/components/dashboard/war-room/WarRoomDashboard.tsx`, que não existe.
- `src/components/dashboard/__tests__/WarRoomEstados.test.tsx` é o teste novo que prova a mudança (o cartão
  pede cobrir os arquivos tocados; sem ele não há vermelho→verde).
- os 5 arquivos do pai já explicados acima vêm do cherry-pick obrigatório da faixa, sem edição minha.

## O que NÃO fiz e por quê
- WarRoomQueueRow.tsx e WarRoomAlertRow.tsx também têm cartão clicável sem teclado / botão de ícone sem
  `aria-label` (o comentário de acessibilidade cita "cartões Agente/Fila"), mas ficam FORA da lista de arquivos
  do cartão: pedido registrado em `kanban_comment`.
- `Hoje` continua numérico: o `resolvedToday` já é escopado no dia pela RPC do cartão anterior e o tipo no hook
  é `number` (sem caminho `null`); transformar em `—` exigiria mexer no hook (worker (hooks)) — registrado no
  comentário.
- O caminho do dashboard no cartão é `war-room/WarRoomDashboard.tsx`, mas o arquivo real é
  `src/components/dashboard/WarRoomDashboard.tsx` (só o card `WarRoomAgentCard` mora em `war-room/`); toquei o
  arquivo real.
