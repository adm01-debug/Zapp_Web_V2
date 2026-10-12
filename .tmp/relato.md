Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- Nenhum arquivo de código: o defeito do cartão (o disparo pendente do `useDebounce` continuar agendado e rodar depois do unmount, gerando `ReferenceError: window is not defined` no fim da suíte) já está corrigido na ponta do dia. O hook atual tem o `useEffect` com limpeza que faz `clearTimeout` no unmount em `src/hooks/system/useDebounce.ts:12-17`, e o teste "não dispara o callback pendente depois que o componente desmonta" existe em `src/hooks/__tests__/useDebounce.test.ts:113-124` (segundo `describe`, "useDebounce — desmontagem").
- Esse conteúdo veio na ponta no commit `76c97a4b0` ("fix(hooks): useDebounce não dispara o callback pendente depois que o componente desmonta") e `git merge-base --is-ancestor 76c97a4b0 dia/2026-10-12` responde FIX-NA-PONTA. O workspace foi criado a partir de `dia/2026-10-12` e o HEAD é `bff18177f`, o mesmo commit da ponta: não havia base divergente para reconciliar e, como o cartão manda para o caso "já resolvido", fecho sem commit de código.
- O trabalho anterior do mesmo cartão (`6e8e78ec1`, branch `v2/usedebounce-cancela-desmontar-2610080903992c`) não foi trazido: a comparação `git diff 6e8e78ec1 76c97a4b0 -- src/hooks/system/useDebounce.ts src/hooks/__tests__/useDebounce.test.ts` mostra diferença apenas de comentário e de forma do teste — a semântica é a mesma (limpeza do timeout no unmount e teste que avança o timer após o unmount). O cherry-pick duplicaria o mesmo efeito e conflitaria.
- Único arquivo alterado na entrega: este relato (`.tmp/relato.md`, que é versionado na ponta) — nenhuma linha de produção.

## Prova
- Estado da base: `git merge-base --is-ancestor 76c97a4b0 dia/2026-10-12` → FIX-NA-PONTA; `git rev-parse HEAD` = `git rev-parse dia/2026-10-12` = `bff18177f`.
- Hook e teste na ponta: `src/hooks/system/useDebounce.ts:12-17` (o `useEffect`) e `src/hooks/__tests__/useDebounce.test.ts:113` (o `it` de desmontagem) — lidos do workspace agora.
- Verde agora, com os arquivos de teste do grupo ligado ao debounce/paleta e aos hooks do Talk: `npx vitest run src/hooks/__tests__/useDebounce.test.ts src/components/ui/__tests__/command-palette.test.tsx src/components/ui/__tests__/command-palette-acoes.test.tsx src/components/ui/__tests__/command-palette.busca-antiga.test.tsx src/features/talk-me/__tests__/useTalkMeQueue.test.tsx src/hooks/integrations/__tests__/useTalkXSuppression.test.tsx src/components/talkx/__tests__/TalkXSuppression.search.test.tsx src/components/team-chat/__tests__/useTeamChatPanel.test.tsx` → `Test Files  8 passed (8)` / `Tests  72 passed (72)`, sem falhas e sem pulados.
- `git status --short` antes de escrever este relato: saída vazia (nada de código pendente).

## O que NÃO fiz e por quê
- Não alterei `useDebounce.ts` nem o teste: reescrever a mesma correção seria "controle novo" e o congelamento por desmontagem já é o código da ponta.
- Não criei teste novo para um cenário que o cartão não pede — o teste que cobre o defeito já está na base e é o que a suíte executa.
