Especialista: iris (refazer: senior; apoio: area-front-hooks para os commits dos pais)

## Pontos da recusa
- Ponto 1: corrigi o relato em `.tmp/relato.md` para dizer que, no `ConversationListSidebar.tsx`, o encanamento deste cartão removeu só `conversations={inbox.conversations}` do `StatusChips` e passou `counts={inboxFilters.chipCounts}`. Não mantive a frase antiga sobre `snoozedIds`, `showAll` e `selectedQueueId`, porque essas props não existiam no `StatusChips` da base.
- Ponto 2: corrigi o relato em `.tmp/relato.md` para não afirmar que todas as asserções anteriores foram preservadas. O texto agora registra explicitamente que as expectativas mudaram junto com as regras dos pais: `Aguardando` deixou de ser "sem responsável" e passou a ser `conversation_status: 'waiting'`; `Resolvidas` deixou de ser "sem mensagem" e passou a ser `conversation_status: 'resolved'`; e o teste antigo de `Arquivadas` foi substituído por fixture nova. Esses números visíveis mudam por causa da regra dos pais, a mesma usada pela lista, não por uma regra nova deste cartão.
- Ponto 3: uni a nota/observação de escopo num único parágrafo, sem repetir a mesma explicação duas vezes: os arquivos de hooks vieram dos commits pais `5098b4a3e`, `ff219637f`, `877949f00` e `444fabbea`, porque a base do workspace ainda não tinha `inboxFilters.chipCounts`.

## O que mudou e por quê
- `src/components/inbox/conversation-list/StatusChips.tsx`: preservado do trabalho anterior; o componente só exibe `counts: ChipCounts`, mantém `data-testid="status-chip-<id>"` e usa `aria-label` com singular/plural.
- `src/components/inbox/ConversationListSidebar.tsx`: preservado do trabalho anterior; a única troca do encanamento do `StatusChips` é sair `conversations={inbox.conversations}` e entrar `counts={inboxFilters.chipCounts}`. `RealtimeInboxView.tsx` não foi alterado porque já passa o objeto `inboxFilters` inteiro ao sidebar.
- `src/components/inbox/__tests__/StatusChips.test.tsx`: preservado do trabalho anterior com o relato corrigido: há teste para seis números recebidos por prop, rótulo acessível e integração leve com `useInboxFilters` real em que digitar na busca atualiza o número do chip ativo.
- `src/hooks/inbox/chipCounts.ts`, `src/hooks/inbox/useInboxFilters.ts` e `src/hooks/inbox/__tests__/chipCounts.test.ts`: vieram dos pais obrigatórios do cartão, não foram reescritos neste refazer. Eles definem a regra que a lista e os chips compartilham; por isso os números de `Aguardando` e `Resolvidas` mudam para acompanhar a lista.

## Nota de escopo única
Os pais deste cartão (`t_74bee242` e `t_7d4d9088`) ainda não estavam integrados na base do workspace; sem eles, `src/hooks/inbox/chipCounts.ts` nem existiria e `inboxFilters.chipCounts` não estaria disponível. Por isso reaproveitei os commits locais dos pais (`5098b4a3e`, `ff219637f`, `877949f00`, `444fabbea`) antes do commit de tela, como o cartão mandava. Esses arquivos aparecem no diff porque são dependência do encanamento, não porque este refazer ampliou o escopo.

## Prova
- código reaproveitado sem refazer do zero: `git log --oneline dia/2026-10-11..HEAD` mostra os commits dos pais e o commit de tela anterior reaproveitados nesta branch.
- teste de componente/integração: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx` → `Test Files 2 passed (2); Tests 19 passed (19)`.
- typecheck: `npx tsc --noEmit` → exit 0, sem saída.
- verificação rápida: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (88s)`; banco local não verificado pelo modo rápido sem conjunto.

## Arquivos no diff
.tmp/relato.md
src/components/inbox/ConversationListSidebar.tsx
src/components/inbox/__tests__/StatusChips.contrasteChipAtendendo.test.tsx
src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx
src/components/inbox/__tests__/StatusChips.test.tsx
src/components/inbox/conversation-list/StatusChips.tsx
src/hooks/inbox/__tests__/chipCounts.test.ts
src/hooks/inbox/chipCounts.ts
src/hooks/inbox/useInboxFilters.ts

## Avisos do juiz automático
- Teste alterado: o aviso não é remoção/pulo/afrouxamento deste refazer. As expectativas antigas de `Aguardando`, `Resolvidas` e `Arquivadas` mudaram nos commits anteriores porque os pais trocaram a regra de contagem para a mesma regra da lista; a própria recusa mandou registrar essa diferença no relato.
- Arquivos de hooks fora da lista original: o aviso não procede como escopo novo deste refazer. O cartão mandou trazer os commits dos pais se `inboxFilters.chipCounts` não estivesse na base; sem `src/hooks/inbox/chipCounts.ts`, `src/hooks/inbox/useInboxFilters.ts` e o teste dos pais, o `StatusChips` não teria os números filtrados para exibir.

## O que NÃO fiz e por quê
- Não alterei código neste refazer; a recusa pedia SÓ O RELATO e declarou o código correto.
- Não editei `RealtimeInboxView.tsx`; o encanamento necessário já chega pelo objeto `inboxFilters` que ele passa ao sidebar.
- Não adicionei migration, Edge Function, dependência nova, exportação/importação nem edição em massa.
