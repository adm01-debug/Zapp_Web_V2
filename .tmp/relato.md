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

- vermelho antes (hook original, só os testes novos/endurecidos aplicados) — `npx vitest run
  src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`:
  `Tests 7 failed | 20 passed | 1 expected fail (28)` — as 7 falhas são exatamente os casos
  novos (filtro sender=contact, RPC por contato agente/fila, p_note nulo, sucesso parcial,
  todos falham, rejeição crua de rede).
- verde depois (mesmo comando, com a correção): `Test Files 1 passed (1)` e
  `Tests 27 passed | 1 expected fail (28)`. Zero falhas, zero pulados; o `1 expected fail` é
  um `it.fails` pré-existente do arquivo (marca de comportamento esperado), não uma falha.
- Caminho de falha exercitado de verdade no verde: `bulkTransfer` rejeita, a seleção permanece
  (`result.current.selectedIds` mantém os contatos) e `refetch` NÃO é chamado.

## O que NÃO fiz e por quê

- Não toquei em `src/components/inbox/BulkActionsToolbar.tsx` (arquivo de outro cartão): lá o
  `handleTransfer` (linha ~30) chama `onTransfer(...)` sem `await`/`catch` e fecha o diálogo na
  hora — com a rejeição nova, essa chamada vira promise rejeitada não tratada. O caminho de
  `TransferDialog` (linha ~65) já faz `await onTransfer` em try/catch e mantém o diálogo aberto
  (correto). O ajuste do toolbar é do cartão irmão t_8016679b.
- Não mexi em RLS/banco: a RPC `transfer_conversation` (migration 20261005185729) já existe na
  ponta do dia; o cartão pedia só o consumo dela pelo lote.

## Nota de infraestrutura (não afeta o diff)

O disco `/` estava 100% cheio (32K livres) e o `patch` falhou com "No space left on device" no
meio do trabalho. Liberei espaço com `npm cache clean --force` (~12G de `_cacache`, regenerável)
e o disco voltou a 25G livres. Nenhum arquivo do projeto foi afetado; dois `.hermes-tmp.*` de
0 bytes deixados por uma escrita falha em `src/hooks/inbox/` foram movidos para `.tmp/` e não
entram no commit.
