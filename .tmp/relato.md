Especialista: Íris (area-front-componentes)

## O que mudou e por quê
UI-08 (paridade V3): a paleta do ⌘K volta a oferecer "Nova conversa" e "Respostas rápidas" — mas agora cada comando tem executor de verdade, ligado ao dono do fluxo (o defeito do R2-INF-033 era justamente anunciar sem executor). O próprio comentário removido em command-palette-data.tsx dizia que nenhum dos dois fluxos tinha gatilho global; em vez de reexibir botões mortos, criei os dois gatilhos seguindo o padrão já aceito no app (`inbox-open-tasks-tab`, `open-transfer-dialog`).

- `src/components/ui/command-palette-data.tsx`: as duas entradas em `defaultActionCommands`, cada uma com `action` que publica um evento global (`open-new-conversation` / `open-quick-replies`) — mesmo padrão do `action-keyboard` que já existia ali.
- `src/components/inbox/RealtimeInboxView.tsx`: listener de `open-new-conversation` abre o `NewConversationModal` (`setShowNewConversation(true)`), igual ao listener vizinho de `inbox-open-tasks-tab`.
- `src/components/inbox/ChatPanel.tsx`: listener de `open-quick-replies` abre o seletor de respostas rápidas do compositor (`openDialog('quickReplies')`), igual ao listener vizinho de `open-transfer-dialog`.
- Testes: `src/components/ui/__tests__/command-palette-acoes.test.tsx` (os dois casos que exigiam ausência agora provam presença + disparo do evento + fechamento da paleta), `src/components/inbox/__tests__/RealtimeInboxView.mobile-nova-conversa.test.tsx` (case novo: o evento abre o modal) e o novo `src/components/inbox/__tests__/ChatPanel.paleta-respostas-rapidas.test.tsx` (monta o ChatPanel REAL e prova o seletor abrir).

## Prova
- vermelho antes: `npx vitest run src/components/ui/__tests__/command-palette-acoes.test.tsx src/components/inbox/__tests__/RealtimeInboxView.mobile-nova-conversa.test.tsx src/components/inbox/__tests__/ChatPanel.paleta-respostas-rapidas.test.tsx` → `Test Files 3 failed (3); Tests 4 failed | 9 passed (13)` (as 2 entradas não existiam; os 2 listeners não existiam).
- verde depois (mesmo comando) → `Test Files 3 passed (3); Tests 13 passed (13)`.
- suíte do entorno (inbox + ui): `npx vitest run src/components/inbox/__tests__/ src/components/ui/__tests__/` → `Test Files 90 passed (90); Tests 546 passed (546)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` com `OK tipos`, `OK lint`, `OK migrations`, `OK db_guard` (sem banco: o cartão não toca migration).

## Por que toquei arquivos além dos 3 citados no cartão
O cartão citava `command-palette-data.tsx`, `CommandPaletteHost.tsx (só a execução das ações)` e o teste — mas os dois fluxos não tinham gatilho global nenhum (é o que o comentário do R2-INF-033, removido neste diff, registrava). Sem um listener no dono, os comandos voltariam a só fechar a paleta. Os dois donos (`RealtimeInboxView`, `ChatPanel`) são de `src/components/**`, a minha área, e cada listener é de 5 linhas no mesmo padrão dos vizinhos. `CommandPaletteHost.tsx` não precisou mudar: a `action` vive no item (como a de "Atalhos de teclado").

## O que NÃO fiz e por quê
- Não adicionei atalho de teclado `N` para "Nova conversa": `defaultShortcuts.ts` já reserva o `n` puro para `tasks-focus-quickadd` (escopo `TASKS_VIEWS`) e o `Ctrl+N` para `new-message`; sem binding global real o campo `shortcut` da paleta viraria só um selo de tecla que não funciona. Registrado em comentário no cartão.
- Não criei tela nova nem toquei configurações: "Respostas rápidas" abre o seletor real do compositor, não uma tela inventada.
