Especialista: hugo (area-front-hooks) — executado por iris (perfil escalado na retomada)

## O que mudou e por quê
Retomei a entrega já aprovada do cartão anterior (commit `42a10859a`, branch
`v2/arquivar-grava-estado-arquivada-261011121791df`) e a trouxe para a base atual
`dia/2026-10-13`, sem reimplementar: o defeito ainda existe na base (o arquivamento
gravava `contacts.assigned_to = null` em vez do estado arquivada).

- `src/hooks/chat/useConversationActions.ts`: o arquivar individual e o desfazer passam a
  usar a RPC `set_conversation_status` (grava `conversation_status = 'archived'`; o desfazer
  reabre com `'open'`); `assigned_to` deixa de ser tocado.
- `src/hooks/inbox/useBulkActions.ts`: no arquivamento genérico, quando a tabela é `contacts`
  a transição vai por RPC (uma chamada por id); as demais tabelas seguem com `status`.
- `src/hooks/inbox/useInboxBulkActions.ts`: arquivamento em massa por RPC com no máximo
  `BULK_ARCHIVE_CONCURRENCY` (5) chamadas em voo; falha isolada entra na lista de falhas e o
  desfazer reabre só as que foram arquivadas de verdade.
- Testes: `useConversationActions.test.ts`, `useInboxBulkActions.test.ts`,
  `useBulkActions.archive-fsm.test.tsx`, `ContactDetails.quickActions.test.tsx`.

Rebase: só houve conflito em `useConversationActions.test.ts`, onde a base nova já mockava a
RPC `transfer_conversation` (cartão de transferência). Juntei os dois mocks num só: o mock de
`rpc` empilha em `rpcCalls` (prova do `set_conversation_status`) e, quando o nome é
`transfer_conversation`, empilha também em `transferRpcCalls` e responde `transferRpcResult`.
Nenhum teste do cartão de transferência foi afrouxado.

## Prova
- verde depois: `npx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox/__tests__/useInboxBulkActions.test.ts src/hooks/__tests__/useBulkActions.archive-fsm.test.tsx src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` → `Test Files 4 passed (4); Tests 54 passed (54)`
- vermelho antes: na base, `archiveContact` fazia `supabase.from('contacts').update({ assigned_to: null })` e o em massa usava `status: 'archived'`; o teste do RPC (`expect(rpcCalls).toEqual([...set_conversation_status...])`) não teria a chamada — é exatamente o caminho que o diff troca.
- contrato conferido: `zapp-esquema set_conversation_status` → `função set_conversation_status({ p_contact_id: string; p_next: string; p_reason?: string })`, que casa com os argumentos usados.

## O que NÃO fiz e por quê
- Não toquei na RPC/migration `set_conversation_status`: ela veio do cartão pai, fora do diff.
- Não reimplementei nada: o conteúdo de produção é o mesmo já aprovado (cherry-pick), só o
  mock do teste foi reconciliado com a base nova.
