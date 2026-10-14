Especialista: hugo

## O que mudou e por quê
- src/hooks/inbox/useInboxBulkActions.ts: `bulkArchive` deixou de zerar `assigned_to` e passou a gravar `conversation_status: 'archived'` (mesmo valor e caminho do `useBulkActions.ts`), sem tocar no responsável. Antes ele lia `assigned_to`, arquivava com `assigned_to: null` (ninguém aparece na aba "Arquivadas", que lê `conversation_status`) e o desfazer devolvia o responsável — não o estado de conversa.
- O retrato da operação agora é o `conversation_status` de cada contato; o desfazer reagrupa os ids por valor anterior e faz UM update por status distinto (não um update por contato). Só entra no alvo quem foi lido; zero linha lida vira erro, em vez de arquivar às cegas sem retrato.
- A leitura dos originais passou para dentro do `try` e o `error` do SELECT é conferido: falha de RLS/rede avisa em pt-BR, não arquiva, mantém a seleção e solta o `bulkLoading`.
- src/hooks/inbox/__tests__/useInboxBulkActions.test.ts: bloco `bulkArchive` reescrito; o antigo `it.fails` do SELECT de RLS virou caso de comportamento correto.

## Prova
- vermelho antes: `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` com a versão da base em posse → `Tests  5 failed | 23 passed (28)`
- verde depois: mesmo comando com a correção → `Test Files  1 passed (1)` / `Tests  28 passed (28)`

## Conclusão
- Concluí o cartão: arquivar em lote grava `conversation_status: 'archived'`, o responsável (`assigned_to`) fica, o desfazer devolve cada conversa ao status anterior e falha de leitura/update avisa em pt-BR sem arquivar.

## Item 4 do cartão (some da lista aberta / contagem reflete)
- Por construção, sem código novo: `src/hooks/inbox/chipCounts.ts` decide chips por `conversation_status` (`isOpenActive` = open|waiting; `isArchived` = 'archived'), e `useInboxFilters` filtra com as MESMAS funções. Gravar `archived` tira a conversa da lista aberta e a conta no chip "Arquivadas".

## Duplicação e cartão irmão
- Canônico do arquivar em lote no inbox é este `useInboxBulkActions` (traz o desfazer); `useBulkActions.ts` é o hook genérico de tabela.
- HOTSPOT: o cartão irmão de workspace 2610132250f1eb (commit 8d9db103a7, ainda não integrado) também reescreve `src/hooks/inbox/useInboxBulkActions.ts`, por RPC `set_conversation_status`, e o desfazer dele reabre sempre para 'open' (não restaura o status anterior). Os dois branches tocam o mesmo arquivo — combinar qual entra antes de integrar.
