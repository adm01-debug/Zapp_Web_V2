Especialista: hugo
Área: area-front-hooks (cartão entregue ao worker (geral) como reserva)

Concluí. Um defeito, com prova vermelho→verde sobre os arquivos do cartão.

## O que mudou e por quê

Título: fix(inbox): lote marca so mensagens recebidas e transfere via RPC por contato

- `src/hooks/inbox/useInboxBulkActions.ts`:
  - `bulkMarkAsRead`: o update em `messages` ganhou `.eq('sender', 'contact')`. Antes o lote
    fazia `update({ is_read: true }).in('contact_id', ids).eq('is_read', false)`, o que zerava
    também o `is_read` das mensagens ENVIADAS pelo agente (mesma tabela, mesmo `contact_id`).
    O caminho individual já filtrava por remetente; o lote não.
  - `bulkTransfer`: parou de fazer `from('contacts').update({assigned_to|queue_id}).in('id', ids)`
    e passou a chamar `supabase.rpc('transfer_conversation', { p_contact_id, p_to_agent_id,
    p_to_queue_id, p_note: null })` uma vez por contato, em laço `for...of` sequencial. A RPC é
    atômica POR CONVERSA (UPDATE em `contacts` + INSERT do evento na mesma transação), por isso
    o laço é serial em vez de concorrente.
  - Falha: conta quantos transferiram e quantos falharam; com qualquer falha emite toast de erro
    com as contagens, mantém a seleção e propaga a rejeição (a `TransferDialog` usa a rejeição
    para permanecer aberta). Só no sucesso total limpa a seleção e recarrega. Exceção crua de
    rede também emite o toast de erro de sempre e propaga.
- `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`: mock de `supabase.rpc` (+ estado
  `rpcFailures`/`rpcCalls`), casos novos de contrato e reescrita dos testes que travavam o
  comportamento antigo (update em `contacts`) para o novo contrato via RPC.

## Fora de escopo (não tocado)

- `src/components/inbox/BulkActionsToolbar.tsx` (arquivo de outro cartão): o `handleTransfer`
  (linha ~30) chama `onTransfer(...)` sem `await`/`catch` e fecha o diálogo na hora — com a
  rejeição nova essa chamada passa a ser uma promise rejeitada não tratada. O caminho de
  `TransferDialog` (linha ~65) já faz `await onTransfer` em try/catch e mantém o diálogo aberto
  (correto). O ajuste do toolbar é do cartão irmão t_8016679b.
- RLS/banco: não tocado. A RPC `transfer_conversation` (migration 20261005185729) já existe na
  ponta do dia; o cartão pedia só o consumo dela pelo lote.

## Prova

- vermelho antes (hook original, com os testes novos/endurecidos já aplicados) — comando
  `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`, saída
  `Tests 7 failed | 20 passed | 1 expected fail (28)`: as 7 falhas são exatamente os casos
  novos (filtro sender=contact, RPC por contato agente/fila, p_note nulo, sucesso parcial,
  todos falham, rejeição crua de rede).
- verde depois — mesmo comando, saída `Test Files 1 passed (1), Tests 27 passed | 1 expected
  fail (28)`. Zero teste falhou e zero pulado; o `1 expected fail` é um `it.fails` que já
  existia na base (marca de comportamento esperado), não é falha nem pulo.
- caminho de falha exercitado de verdade no verde: `bulkTransfer` rejeita, a seleção permanece
  (`result.current.selectedIds` mantém os contatos) e `refetch` NÃO é chamado.
- verificação do cartão — comando `zapp-verify . --rapido`, saída
  `VERIFY: VERDE SEM BANCO (95s)` com `OK tipos`, `OK lint`, `OK migrations`, `OK db_guard`.
