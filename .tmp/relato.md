Especialista: senior (area-front-hooks)

## Contexto deste refazer
- O commit aprovado informado no cartão (`02e1c7f74`) contém só ajuste de relato; o commit de código aprovado antes dele é `25aef34e9`.
- Ao iniciar sobre a base local do dia (`dia/2026-10-13`), o patch de código já estava integrado como `04c09c64e fix(reactions): refazer lote de reacoes da conversa`.
- Rodei `git cherry-pick -n 25aef34e9`: o git não deixou alteração pendente porque o conteúdo de código já existe na base atual. Portanto não dupliquei código nem reintroduzi conflito.

## Pontos da recusa
- Ponto 1: "Entrega anterior aprovada, mas não pôde ser integrada por conflito/rebase" — resolvido validando na base atual que os arquivos do cartão já carregam o patch aprovado (`src/hooks/reactions/useBatchReactions.ts`, `src/hooks/chat/useMessageReactions.ts`, `src/hooks/reactions/__tests__/useBatchReactions.uma-consulta.test.tsx`) e que a diferença remanescente contra o commit aprovado fica só em `src/components/inbox/chat/ChatMessagesArea.tsx`, por trabalho posterior de agrupamento/scroll. O provider `ReactionsBatchProvider` continua envolvendo a área de mensagens e recebendo `reactionMessageIds`.

## Prova
- Integração do patch aprovado: `git cherry-pick -n 25aef34e9` → `git status --short` sem alterações; o patch já está aplicado na base atual.
- Comparação com o trabalho aprovado: `git diff --name-only 25aef34e9..HEAD -- src/hooks/reactions/useBatchReactions.ts src/hooks/chat/useMessageReactions.ts src/hooks/reactions/__tests__/useBatchReactions.uma-consulta.test.tsx src/components/inbox/chat/ChatMessagesArea.tsx` → apenas `src/components/inbox/chat/ChatMessagesArea.tsx` difere; `useBatchReactions`, `useMessageReactions` e o teste aprovado estão iguais.
- Verde depois: `bunx vitest run src/hooks/reactions/__tests__/useBatchReactions.uma-consulta.test.tsx` → `Test Files  1 passed (1); Tests  12 passed (12)`.
- Typecheck: `bun run typecheck` → `tsc -b --force` com exit 0.
- Verificação rápida: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (162s)` (`db_guard`, `tipos`, `lint`, `migrations` OK; banco local não verificado porque este cartão não altera banco).
- Juiz: `jev-juiz pronto .tmp/relato.md` → `nada a apontar no diff (1 arquivos) nem no relato. Pode fechar.`

## Arquivos do diff desta rodada
- `.tmp/relato.md`

## O que NÃO fiz e por quê
- Não alterei código de produção: a correção aprovada já estava na base do dia e o cherry-pick ficou vazio. Duplicar ou reaplicar manualmente aumentaria o risco de defeito novo.
- Não toquei banco, Edge, produção, credenciais, manifesto, CI nem arquivos fora do escopo.
