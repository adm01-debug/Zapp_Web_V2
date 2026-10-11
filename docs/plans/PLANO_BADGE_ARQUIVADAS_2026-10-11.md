# Plano: badge de conversas arquivadas na lista de conversas

Pedido do Joaquim (11/10/2026): criar, ao lado de Todas / Não lidas / Em atendimento / Aguardando / Resolvidas, o badge (chip com contador) de conversas **Arquivadas**.

## Fatos verificados
- Chips em `src/components/inbox/conversation-list/StatusChips.tsx`; filtro da lista em `src/hooks/inbox/useInboxFilters.ts`, que decide por `contact.conversation_status`.
- Banco de produção (consulta de contagem, 11/10): `open` 3.631, `resolved` 17, `archived` 0.
- Nenhuma ação da interface grava `archived`: `archiveContact`, `bulkArchive` e o atalho só fazem `assigned_to = null` (a conversa cai em "Aguardando"). Só `useBulkActions` (genérico) grava `conversation_status='archived'`.
- `ingest_inbound_message` não usa `conversation_status`: mensagem nova **não reabre** conversa arquivada/resolvida (o cartão SL-079, que faria isso, está bloqueado há ~60 h).
- Os contadores atuais dos chips usam proxies antigos (Resolvidas = "sem mensagens carregadas": 497 na tela contra 17 reais). Não faz parte deste pedido.

## Escopo
Fazer: chip "Arquivadas" com contador e filtro pelo status real. Não fazer: mudar o que "Arquivar" grava (hoje esconderia respostas de clientes) nem corrigir os outros contadores. Esses dois pontos são decisões do Joaquim.

## Cartões
| Id | Perfil | O quê | Depende de |
|---|---|---|---|
| B1 | iris | chip + contador + testes (StatusChips) | – |
| B2 | hugo | filtro `archived` em `useInboxFilters` + testes | B1 |

## Validação
Código da branch viva (chip renderizado, contagem pelo status real, arquivadas fora dos outros chips, filtro testado), fila do integrador e relatório ao Joaquim.
