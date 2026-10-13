Especialista: iris (area-front-componentes)

## Retomada (entrega parada na fila do integrador por conflito)
- A base do dia atual (dia/2026-10-13) já tinha integrado o H1 (`countByChip`): `src/hooks/inbox/chipCounts.ts`, `useInboxFilters` usando `countByChip` e `chipCounts.test.ts` entraram por 8b8354c71d. Por isso NÃO precisei do commit 449a3caf5e (o H1 do branch antigo); ele está equivalente/superado na base.
- Trazo só o commit aprovado que faltava, por `git cherry-pick dd0a3e9922` ("fix(inbox): contadores dos chips usam countByChip") — a correção de telas em si.
- Conflitos do cherry-pick, resolvidos PRESERVANDO o que já entrou na ponta:
  - `src/components/inbox/ConversationListSidebar.tsx`: a ponta reorganizou o cabeçalho (InboxFilters condicional no mobile + StatusChips no header). Mantive essa estrutura e apenas acrescentei ao `<StatusChips/>` as props `snoozedIds`, `showAll` e `selectedQueueId` — as mesmas opções que `useInboxFilters` aplica na lista (5 linhas). Descartei o bloco antigo do branch que duplicava StatusChips/InboxFilters.
  - `src/components/inbox/__tests__/StatusChips.test.tsx`: mantive os testes herdados da ponta (`chama onChipTabChange com archived`, `aplica o mesmo estilo ativo dos demais chips em Arquivadas`) e as fixtures foram ajustadas ao critério novo (status persistido): `c1` do fixture `withArchived` ganhou `conversation_status: 'open'` e o teste `mostra 0 em "Arquivadas"...` passou a usar uma fixture própria sem arquivadas (antes ele dependia da fixture padrão, que agora tem c7/c8 arquivadas).

## Defeito ainda existia? Sim (não fechei "sem commit")
Na base, `StatusChips.tsx` ainda calculava com as regras antigas (`Resolvidas = messages.length === 0`, `Aguardando = !assigned_to`). Provei o vermelho revertendo SÓ o componente para a base e rodando o teste das fixtures novas:
- vermelho antes: `git checkout HEAD~1 -- src/components/inbox/conversation-list/StatusChips.tsx && npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` → `Test Files  1 failed (1)` / `Tests  7 failed | 9 passed (16)` (ex.: `expected '1' to be '3'` em Em atendimento).
- verde depois (componente restaurado): mesma suíte → `Test Files  1 passed (1)` / `Tests  16 passed (16)`.

## O que mudou e por quê
- `src/components/inbox/conversation-list/StatusChips.tsx`: o `useMemo` local de contagens saiu; os números vêm de `countByChip(conversations, profile?.id, { snoozedIds, showAll, selectedQueueId })` — o mesmo predicado que a lista usa, então o número do chip bate com o que a lista mostra ao clicar.
- `src/hooks/inbox/chipCounts.ts` (1 linha): `isAttending` passa a exigir `profileId != null` antes de comparar (`profileId != null && c.assigned_to === profileId`); sem isso uma conversa sem responsável e sem perfil ativo contava como "Em atendimento". Está coberto por `StatusChips.identidade-profile.test.tsx`.
- `src/components/inbox/ConversationListSidebar.tsx`: passa `snoozedIds`/`showAll`/`selectedQueueId` ao StatusChips (o contador acompanha adiamento, "mostrar todas" e fila selecionada).
- `src/components/inbox/__tests__/StatusChips.test.tsx` e `StatusChips.identidade-profile.test.tsx`: cada contador usa o status persistido; Resolvidas não conta conversa só por ter 0 mensagens; Aguardando conta `conversation_status === 'waiting'`; arquivadas só no chip Arquivadas.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` (com o componente da base) → `Tests  7 failed | 9 passed (16)`.
- verde depois: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx src/hooks/inbox/__tests__/chipCounts.test.ts` → `Test Files  3 passed (3)` / `Tests  54 passed (54)`.
- verde depois (vizinhos): `npx vitest run src/components/inbox/__tests__/ConversationListSidebar.test.tsx src/components/inbox/__tests__/ConversationListSidebar.topo.test.tsx src/components/inbox/__tests__/StatusChips.contrasteChipAtendendo.test.tsx src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx` → `Test Files  4 passed (4)` / `Tests  25 passed (25)`.
- `zapp-verify . --rapido`: verde (rodado pelo fechar).

## Ponto 3 do cartão (ContactDetails.tsx)
O E2 NÃO está no código atual: `archiveContact` continua gravando `assigned_to: null` (src/hooks/chat/useConversationActions.ts:250). Por isso deixei o comentário da linha ~68 do ContactDetails.tsx como está, conforme a instrução "se não, deixe e cite no relato".

## O que NÃO fiz e por quê
- Não trouxe o commit 449a3caf5e do branch antigo: seu conteúdo (H1 `chipCounts.ts` + `useInboxFilters`) já está na base atual por 8b8354c71d.
- Não mexi em arquivo fora do escopo (sem DDL, Edge Function ou dependência nova).
