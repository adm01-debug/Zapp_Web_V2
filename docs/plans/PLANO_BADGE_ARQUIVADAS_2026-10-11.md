# Plano: badge de conversas arquivadas na lista de conversas

Pedido do Joaquim (11/10/2026): criar, ao lado de Todas / Não lidas / Em atendimento / Aguardando / Resolvidas, o badge (chip com contador) de conversas **Arquivadas**.

## Fatos verificados
- Chips em `src/components/inbox/conversation-list/StatusChips.tsx`; filtro da lista em `src/hooks/inbox/useInboxFilters.ts`, que decide por `contact.conversation_status`.
- Banco de produção (consulta de contagem, 11/10): `open` 3.631, `resolved` 17, `archived` 0.
- Nenhuma ação da interface gravava `archived`: `archiveContact`, `bulkArchive` e o atalho só faziam `assigned_to = null` (a conversa caía em "Aguardando"). Só `useBulkActions` (genérico) gravava `conversation_status='archived'`.
- `ingest_inbound_message` não usava `conversation_status`: mensagem nova **não reabria** conversa arquivada/resolvida (SL-079 bloqueado havia ~60 h).
- Os contadores dos chips usavam proxies antigos (Resolvidas = "sem mensagens carregadas": 497 na tela contra 17 reais).

## Escopo
Fazer: chip "Arquivadas" com contador e filtro pelo status real. As duas decisões abertas (arquivar de verdade; corrigir os outros contadores) foram decididas pelo Joaquim e viraram `PLANO_ARQUIVAR_E_CONTADORES_2026-10-11.md`.

## Cartões
| Id | Cartão | Perfil | O quê | Depende de |
|---|---|---|---|---|
| B1 | `t_2bcde689` (refazer `t_c338faa0`) | iris | chip + contador + testes (StatusChips) | – |
| B2 | `t_e476c02e` | hugo | filtro `archived` em `useInboxFilters` + testes | B1 |
