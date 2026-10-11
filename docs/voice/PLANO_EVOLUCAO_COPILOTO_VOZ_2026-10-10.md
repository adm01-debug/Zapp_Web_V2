# Plano — evoluir o copiloto de voz para assistente real do usuário (10/10/2026)

> Pedido do Joaquim: o agente de IA acionado por áudio precisa ser um assistente de verdade,
> acessando tudo que o PRÓPRIO USUÁRIO já tem acesso no sistema — disparado pelo pedido
> original "achar um arquivo numa conversa" não funcionar hoje.

## 1. Onde ele vive hoje

`supabase/functions/voice-copilot-action/index.ts` — um roteador com 7 ações fechadas:
`search_contacts`, `get_conversation_summary`, `get_dashboard_metrics`,
`assign_conversation`, `create_note`, `list_agents`, `get_queue_status`. Pedir qualquer coisa
fora dessa lista (ex. "achar arquivo") cai no `default` e devolve "Ação desconhecida".

## 2. Regra de segurança — não é negociável, vale para TODA ação nova

"Acessar tudo que o usuário tem acesso" significa **o mesmo que o usuário vê**, nunca mais:

1. Toda LEITURA nova usa `authedClient` (token do próprio chamador) — a RLS real da tabela
   decide o que ele vê, exatamente como `search_contacts`/`get_conversation_summary` já fazem
   hoje. Nunca usar a chave `service_role` pra ler dado de cliente/conversa/arquivo.
2. Toda ESCRITA nova repete o padrão que `assign_conversation`/`create_note` já usam: checar
   visibilidade via `authedClient` primeiro, e checar PAPEL quando a ação for sensível (mover
   algo para outra pessoa). Autoria nunca vem do corpo da chamada — vem do JWT.
3. Única exceção já existente e deliberada: `list_agents` usa `service_role` de propósito,
   porque é diretório de colega (nome/depto, não dado de cliente) — outras ações novas só
   repetem essa exceção se for o mesmo tipo de dado (diretório interno, não PII de terceiro).
4. Continua sendo uma lista FECHADA de ações (um `case` por ação, cada um com seu teste) — não
   criar um executor genérico de SQL/ação livre. Ação nova = 1 cartão, 1 case, 1 teste.

## 3. Onda 1 — cartões já abertos (resolve o pedido original + cobertura básica)

1. **Arquivos** (`search_files_in_conversation`) — achar arquivo numa conversa que o usuário
   vê, devolvendo o `messageId` pra já poder abrir no chat (reaproveita o "ver na conversa"
   que outro cartão desta sessão já está implementando).
2. **Tarefas** (`search_tasks`) — achar/status de tarefa pessoal (`conversation_tasks`).
3. **Catálogo** (`search_catalog_products`) — já existe busca pronta em
   `supabase/functions/promogifts-catalog` (`action: list_products`); não duplicar — só
   ensinar o copiloto a chamar essa função já existente.
4. **E-mail** (`search_emails`) — achar e-mail por contato/assunto nas tabelas locais
   sincronizadas (`email_threads`/`email_messages`) — nunca chamar a API do Gmail
   diretamente de dentro da função de voz (precisaria de token OAuth por usuário, outro nível
   de complexidade/risco; se for necessário no futuro, cartão separado).

## 4. Onda 2 — depois da onda 1, módulos adicionais (ainda sem cartão)

- Agenda/compromissos (`TasksAgendaMode`/Google Calendar) — **fonte de dado real não
  confirmada ainda**, confirmar antes de abrir cartão.
- Status de campanha (Talk X) e de envio (Multiplix) — métricas já existem via RPC, só
  faltaria uma ação de leitura no copiloto.

## Referências

- `supabase/functions/voice-copilot-action/index.ts`, `_shared/voice-copilot-authz.ts` (padrão a seguir)
- `src/components/inbox/tabs/FilesTab.tsx`, `ChatMessagesArea.tsx` (abrir arquivo na conversa)
- `src/hooks/tasks/useMyWorkItems.ts` (`conversation_tasks`)
- `src/hooks/integrations/useCatalogQuickSearch.ts` (reaproveitar `promogifts-catalog`)
- `supabase/migrations/20260403105341_...sql` (`email_threads`, `email_messages`)
