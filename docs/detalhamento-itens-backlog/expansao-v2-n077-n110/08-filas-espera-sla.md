# 08 — Filas de espera e SLA

## 6.9 N-087 — Alertas de fila: wait_time e messages_pending

QueuesView calcula alertas de `wait_time` (espera mais antiga vs `max_wait_time_minutes`)
e `messages_pending` (soma de pendentes vs `max_messages_pending`) a partir de
`QueueService.fetchQueueMetrics`, que usa as RPCs existentes `talk_me_list_queues`
(`oldest_waiting_at`) e `talk_me_list_waiting` (`pending_message_count`).

- `pending_message_count`/`waiting_since` são valores derivados das RPCs (computados
  da tabela messages), não colunas de contacts — não consultar em contacts.
- `p_limit 1000` no `talk_me_list_waiting`: acima de 1000 aguardando, a soma é mínima.
