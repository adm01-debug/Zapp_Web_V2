Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/WhisperMode.tsx: seletor de destinatário (avatares + anel de presença success quando online) com teclado completo (setas, Enter, Esc, Tab) e mola curta do kit; o alvo do INSERT passa a vir do responsável atual da conversa por padrão e da escolha no seletor; falha do INSERT não limpa mais o campo — mantém o texto, mostra o motivo em pt-BR ("sem permissão", "contato inacessível") numa faixa destructive com "Tentar de novo"; botão de envio desabilitado sem destino válido, com tooltip explicando; estados carregando (skeleton com shimmer) e vazio; movimento reduzido respeitado (nada se desloca, só cor/opacidade); spinner do envio com motion-safe:animate-spin.
- src/components/inbox/ChatPanel.tsx: uma linha — passa targetAgentId={conversation.assignedTo?.id} ao WhisperMode, para o sussurro já nascer endereçado ao responsável da conversa.
- src/components/inbox/__tests__/WhisperMode.destino.test.tsx (novo): prova o destino do INSERT, o bloqueio sem destino, a falha que preserva o texto e o comportamento com movimento reduzido.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/WhisperMode.destino.test.tsx` (com o WhisperMode da base dia/2026-10-11) → `Test Files 1 failed (1)` / `Tests 5 failed (5)` (na base não existe seletor, o botão nunca fica desabilitado, o INSERT ignora o erro e o campo é limpo mesmo na falha).
- verde depois: `npx vitest run src/components/inbox/__tests__/WhisperMode.destino.test.tsx src/components/inbox/__tests__/WhisperMode.a11y.test.tsx` → `Test Files 2 passed (2)` / `Tests 8 passed (8)`.
- regressão do ChatPanel: `npx vitest run src/components/inbox/__tests__/ChatPanel.ligar.test.tsx ...atalhos-busca ...typing-presence ...scheduled-media` → `Test Files 4 passed (4)` / `Tests 22 passed (22)`.
- tipos: `npx tsc -b --force` → exit 0, sem saída.
- visão estática: `npx eslint src/components/inbox/WhisperMode.tsx src/components/inbox/ChatPanel.tsx src/components/inbox/__tests__/WhisperMode.destino.test.tsx` → `0 errors` (3 warnings, todos pré-existentes: os dois imports do client do Supabase já estavam na baseline do lint-ratchet e o exhaustive-deps do ChatPanel é de linha que não toquei).

## Estados conferidos na tela
- vazio: lista de destinatários sem atendentes mostra "Nenhum atendente disponível para receber o sussurro."
- carregando: skeleton shimmer (variant="shimmer") em 3 linhas.
- erro: faixa destructive com role="alert" e "Tentar de novo".
- movimento reduzido: painel e seletor são divs simples (sem transform/height para animar), testado.

## O que NÃO fiz e por quê
- Kit de microinterações em src/components/inbox/chat/motion/ citado no cartão não existe no repositório; reaproveitei src/lib/motion.ts (zappMotion, zappTransition, zappPopoverVariants) com uma mola curta local de ~200 ms.
- Nada de banco/migration: o cartão é só de tela.
