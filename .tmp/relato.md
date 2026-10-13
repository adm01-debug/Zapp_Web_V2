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

## Prova

- vermelho antes (hook original, com os testes novos/endurecidos já aplicados) — comando
  `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`, saída:
  `Tests 7 failed | 20 passed | 1 expected fail (28)`. As 7 falhas são exatamente os casos
  novos (filtro sender=contact, RPC por contato agente/fila, p_note nulo, sucesso parcial,
  todos falham, rejeição crua de rede).
- verde depois — comando `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`,
  saída: `Test Files 1 passed (1), Tests 27 passed`. Nenhum teste falhou e nenhum foi pulado;
  o total de 28 vem de 27 passed + 1 `it.fails` que já existia na base (comportamento esperado
  do arquivo, não falha nem pulo).
- caminho de falha exercitado de verdade no verde: `bulkTransfer` rejeita, a seleção permanece
  (`result.current.selectedIds` mantém os contatos) e `refetch` NÃO é chamado.
- verificação do cartão — comando `zapp-verify . --rapido`, saída:
  `VERIFY: VERDE SEM BANCO (95s)` com `OK tipos`, `OK lint`, `OK migrations`, `OK db_guard`.

Juiz barato: o alerta "concluiu_com_ressalva / sem evidência limpa" foi reexaminado e não
procede — o relato conclui, cita o comando e a linha de resultado e não pede nada pendente;
o próprio critério de pronto do cartão admite ressalvas no relato.
