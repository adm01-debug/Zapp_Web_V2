# ADR-005: Máquina de estados explícita para conversas

- **Status:** Accepted (Step 1 applied — 2026-09-05)
- **Data:** 2026-09-05
- **Contexto:** auditoria técnica 2026-09-05 (dimensão Arquitetura, gap "estado de conversa implícito")

## Contexto

O tipo `Conversation.status` (`src/types/chat.ts:76`) declara cinco valores
(`open | closed | pending | waiting | resolved`), mas **nenhum deles é persistido**: a tabela
`contacts` não tem coluna de status (verificado no catálogo em 2026-09-05). O estado é
derivado em tempo de render, em lugares diferentes e com regras diferentes:

| Onde | Regra hoje |
|---|---|
| `src/hooks/inbox/useInboxFilters.ts:92-106` | aba **Abertas** = contato com `messages.length > 0`; **Resolvidas** = `messages.length === 0`; sub-aba **Aguardando** = `assigned_to IS NULL`; **Atendendo** = `assigned_to = eu` |
| `src/hooks/inbox/useInboxFilters.ts:120-130` | filtro "pendente" = sem `assigned_to` e com mensagens; "resolvido" = zero mensagens |
| `src/components/inbox/CloseConversationDialog.tsx:79` | "fechar" grava uma linha em `conversation_closures` (motivo: resolvido, spam, …) — o contato continua na aba Abertas enquanto tiver mensagens |
| `src/hooks/inbox/useBulkActions.ts:134` | a ação genérica "arquivar" faz `update({ status: 'archived' })` na tabela que receber por `tableName`; `contacts` não tem essa coluna, então arquivar conversa em massa não tem como funcionar (hoje nenhum consumidor passa `tableName`, só o tipo `BulkAction` é reaproveitado) |
| `src/components/inbox/CRMAutoSync.tsx:99` | sincroniza com o CRM quando `status === 'resolved'`, valor que a UI nunca produz |

Consequências observadas: uma conversa "resolvida" volta a ser "aberta" no instante em que a
primeira mensagem antiga é carregada; `conversation_closures` e a aba Resolvidas contam
coisas diferentes; automações e relatórios não têm um campo confiável para filtrar.

## Decisão (proposta)

1. **Persistir o estado** em `contacts.conversation_status` (`open | waiting | resolved |
   archived`, CHECK constraint) + `conversation_status_changed_at timestamptz`.
   `waiting` substitui `pending`; `closed` e `resolved` viram um só (`resolved`).
2. **Transições só por RPC** `set_conversation_status(p_contact_id, p_next, p_reason)`
   (SECURITY DEFINER, valida a tabela de transições abaixo, grava
   `conversation_closures` quando `p_next = resolved` e faz o audit log). O front deixa de
   escrever status direto.
3. **Reabertura automática:** uma **nova migration** (`CREATE OR REPLACE` de
   `ingest_inbound_message`; as já aplicadas 20260905050000/070000 não se editam) passa a
   fazer `resolved | archived → open` quando chega mensagem do contato — é o único ponto de
   entrada inbound, então a regra fica em um lugar. A RPC só reabre quando a flag
   `inbox.status-fsm` está ligada (lê `feature_flags`), para o estado persistido não
   divergir do derivado enquanto a UI ainda deriva.
4. **Backfill:** `resolved` para contatos com linha em `conversation_closures` mais recente
   que a última mensagem; `waiting` para contatos com mensagem e sem `assigned_to`; `open`
   para o resto.

Transições permitidas:

| De \ Para | open | waiting | resolved | archived |
|---|---|---|---|---|
| open | — | atribuição removida | agente / automação | agente |
| waiting | atribuição | — | agente / automação | agente |
| resolved | **mensagem inbound** / agente | — | — | agente |
| archived | **mensagem inbound** / agente | — | — | — |

## Rollout

Atrás da flag `inbox.status-fsm` (tabela `feature_flags`, migration 20260905060000):

1. migration + backfill + RPC (flag desligada: a UI continua derivando e a RPC não reabre —
   persistido e derivado seguem independentes até o passo 3);
2. `useInboxFilters` lê `conversation_status` quando a flag está ligada; comparar contagens
   das abas nos dois modos por uma semana;
3. remover a derivação por `messages.length`, corrigir `useBulkActions` e `CRMAutoSync` para
   o campo real, ligar a flag por padrão e apagar o código antigo.

## Consequências

- Positivas: um único campo indexável para abas, filtros, relatórios e automações; "arquivar"
  volta a funcionar; reabertura por mensagem inbound fica atômica dentro da transação já
  existente.
- Negativas: mais uma coluna em `contacts` (tabela com mais escrita do sistema) e um backfill
  único que precisa rodar fora do horário comercial; a semana de comparação exige manter
  as duas regras vivas.

## Referências

- ADR-003 (auditoria de banco 2026-06), ADR-004 (gates com mantenedor único)
- `docs/audits/AUDITORIA_TECNICA_22_DIMENSOES_2026-09-05.md` — dimensão Arquitetura
- `supabase/migrations/20260905050000_ingest_inbound_message_tx.sql`
