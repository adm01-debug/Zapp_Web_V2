Especialista: Íris (area-front-componentes)

Nota de escopo (arquivos dos pais, indispensável): o cartão não lista
`src/hooks/inbox/chipCounts.ts`, `src/hooks/inbox/useInboxFilters.ts` nem
`src/hooks/inbox/__tests__/chipCounts.test.ts` porque eles são a entrega dos pais deste cartão
(t_74bee242 e t_7d4d9088), que NÃO estavam na base do meu workspace (`5eb097cff`, ponta de
`dia/2026-10-11`): `src/hooks/inbox/chipCounts.ts` nem existia. O cartão manda `git cherry-pick <sha>`
nesse caso, e foi o que fiz: os commits 5098b4a3e, ff219637f, 877949f00 e 444fabbea são dos pais,
commitados por eles, não reescritos por mim. Sem eles `inboxFilters.chipCounts` não existiria e o
StatusChips não teria de onde receber o número.

## O que mudou e por quê
- `src/components/inbox/conversation-list/StatusChips.tsx`: o componente deixou de contar
  (`countByChip` + `useMemo` + `useAuth` saíram) e passou a receber `counts: ChipCounts` por prop;
  cada chip ganhou `aria-label` com o número filtrado ("Todas, 1 conversa" / "Não lidas, 2 conversas").
  A classe, o layout e o `data-testid` do chip não mudaram.
- `src/components/inbox/ConversationListSidebar.tsx`: entrega `inboxFilters.chipCounts` ao `StatusChips`
  no lugar de `conversations`/`snoozedIds`/`showAll`/`selectedQueueId` — os quatro só existiam para o
  componente contar sozinho. `RealtimeInboxView.tsx` não precisou mudar: já passa o retorno inteiro de
  `useInboxFilters` como `inboxFilters`.
- `src/components/inbox/__tests__/StatusChips.test.tsx`: os testes de contagem existentes foram reescritos
  para a nova origem do número (`countsOf(...)` = `countByChip` com o profile id, o mesmo que o hook usa),
  mantendo cada asserção anterior; somam-se (a) os seis números vindos por prop, (b) o rótulo acessível
  singular/plural e (c) a integração: `BuscaHarness` monta `useInboxFilters` REAL + `StatusChips` REAL
  como o sidebar faz, digita na busca e o número do chip ativo muda no mesmo render.
- `src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx` (R2-INB-056): as 3 asserções
  seguem iguais, agora pelo caminho de produção AuthProvider(profile.id) → `useInboxFilters` → `StatusChips`.
- `src/components/inbox/__tests__/StatusChips.contrasteChipAtendendo.test.tsx` (Y18-7): só a montagem mudou
  (`counts` no lugar da conversa de exemplo); os 7 testes de contraste continuam os mesmos.

Observação de escopo: os pais deste cartão (t_74bee242 e t_7d4d9088) não estavam na base do meu workspace
(`5eb097cff`, ponta de `dia/2026-10-11`) — `src/hooks/inbox/chipCounts.ts` nem existia. Como o cartão manda,
fiz `git cherry-pick` dos 4 commits deles (5098b4a3e, ff219637f, 877949f00, 444fabbea); o diff deste cartão
inclui essa entrega, nada foi refeito.

## Prova
- vermelho antes: `git show HEAD:src/components/inbox/conversation-list/StatusChips.tsx > .../StatusChips.tsx`
  (componente antigo) e `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx`
  → `Tests 15 failed (15)`, entre eles `× mostra os seis números recebidos por prop` e
  `× digitar na busca atualiza o número do chip ativo` (`Error: useAuth must be used within an AuthProvider`).
- verde depois: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx`
  → `Test Files 2 passed (2); Tests 19 passed (19)`.
- regressão da área: `npx vitest run src/components/inbox src/hooks/inbox`
  → `Test Files 197 passed (197); Tests 1597 passed | 1 expected fail | 1 todo (1599)`, zero falhas,
  zero arquivos pulados.
- tipos: `npx tsc --noEmit` → sem saída, exit 0.

## O que NÃO fiz e por quê
- Não mexi em `RealtimeInboxView.tsx`: a prop já chega pelo objeto `inboxFilters` inteiro.
- A contagem em si (`chipCounts` respeitando busca, filtros, "Mostrar todos", fila e adiadas) é a entrega
  dos pais (worker (hooks)); aqui só encanei o número até o chip e o rotulei.
