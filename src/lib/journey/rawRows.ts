/**
 * Linhas CRUAS das fontes do Histórico (Journey) — uma forma por origem, do jeito que o banco
 * devolve a linha, sem regra de tela e sem dependência nova.
 *
 * Este módulo é TIPO: nenhuma consulta, nenhum componente, nenhum efeito. Quem lê as fontes são
 * os hooks de `src/hooks/chat/journey/`, que traduzem a linha do banco (snake_case) para o tipo
 * daqui (camelCase); quem transforma estas linhas em episódios da timeline é o mapeador (cartão
 * seguinte). O nome da coluna do banco fica só no mapeador de cada fonte.
 *
 * DUAS COISAS NÃO ENTRAM AQUI, por decisão do plano:
 * - `calls.recording_url`: o histórico guarda apenas `hasRecording` — se EXISTE gravação — e o
 *   sinal é só `calls.recording_status = 'available'`. A URL não é pedida ao banco por este
 *   caminho (a gravação em si é resolvida no destino do clique, pelo download já existente do
 *   sistema; nenhuma informação sai por aqui).
 * - `email_messages.body_html` / `body_text`: o e-mail entra pelo assunto e pelo trecho
 *   (`snippet`), nunca pelo corpo.
 */

/** Mensagem do WhatsApp (`messages`), de qualquer autor. Ação de robô/IA vem como `system`. */
export interface RawMessage {
  /** `messages.id`. */
  id: string;
  /** `messages.sender` — `contact` | `agent` | `system`. */
  sender: string;
  /** `messages.agent_id` (`profiles.id`); nulo quando quem enviou foi o contato. */
  agentId: string | null;
  /** `messages.content`. */
  content: string;
  /** `messages.message_type`. */
  messageType: string;
  /** `messages.media_filename`. */
  mediaFilename: string | null;
  /** `messages.media_size`, em bytes. */
  mediaSize: number | null;
  /** `messages.media_type` (MIME). */
  mediaType: string | null;
  /** `messages.created_at`. */
  createdAt: string;
}

/** Ligação telefônica (`calls`) do contato. */
export interface RawCall {
  /** `calls.id`. */
  id: string;
  /** `calls.direction`. */
  direction: string;
  /** `calls.status`. */
  status: string;
  /** `calls.started_at` — é por ele que o intervalo do período recorta a ligação. */
  startedAt: string;
  /** `calls.answered_at`. */
  answeredAt: string | null;
  /** `calls.ended_at`. */
  endedAt: string | null;
  /** `calls.duration_seconds`. */
  durationSeconds: number | null;
  /** `calls.talk_seconds`. */
  talkSeconds: number | null;
  /** `calls.agent_id` — quem ligou/atendeu pelo sistema. */
  agentId: string | null;
  /** `calls.answered_by`. */
  answeredBy: string | null;
  /** `calls.end_reason` — motivo do fim. */
  endReason: string | null;
  /**
   * Existe gravação? É o que o banco diz: `calls.recording_status = 'available'` — o mesmo sinal
   * que o detalhe da ligação usa para oferecer o player. `calls.recording_url` não é pedida ao
   * banco nem existe neste tipo, por decisão do plano: o histórico só precisa saber SE há
   * gravação.
   */
  hasRecording: boolean;
}

/** E-mail do contato (`email_messages`), com o que a conversa (`email_threads`) acrescenta. */
export interface RawEmail {
  /** `email_messages.id`. */
  id: string;
  /** `email_messages.thread_id` — agrupa os e-mails da mesma conversa. */
  threadId: string;
  /** `email_messages.direction`. */
  direction: string;
  /** `email_messages.subject`. */
  subject: string;
  /** `email_messages.snippet` — trecho; o corpo (`body_html`/`body_text`) nunca é lido. */
  snippet: string;
  /** `email_messages.internal_date` — o instante do e-mail (não o `created_at` da linha). */
  at: string;
  /** `email_messages.from_name`. */
  fromName: string | null;
  /** `email_threads.assigned_to` — responsável pela conversa. */
  assignedTo: string | null;
}

/** Nota do contato (`contact_notes`). */
export interface RawNote {
  /** `contact_notes.id`. */
  id: string;
  /** `contact_notes.author_id` — quem escreveu a nota. */
  authorId: string | null;
  /** `contact_notes.content`. */
  content: string;
  /** `contact_notes.category`. */
  category: string;
  /** `contact_notes.due_date`. */
  dueDate: string | null;
  /** `contact_notes.is_done`. */
  isDone: boolean;
  /** `contact_notes.created_at`. */
  createdAt: string;
}

/** Tarefa da conversa (`conversation_tasks`). */
export interface RawTask {
  /** `conversation_tasks.id`. */
  id: string;
  /** `conversation_tasks.title`. */
  title: string;
  /** `conversation_tasks.description`. */
  description: string | null;
  /** `conversation_tasks.status`. */
  status: string;
  /** `conversation_tasks.created_by` — quem criou. */
  createdBy: string | null;
  /** `conversation_tasks.assigned_to` — para quem ficou. */
  assignedTo: string | null;
  /** `conversation_tasks.due_date` — prazo. */
  dueDate: string | null;
  /** `conversation_tasks.completed_at` — carimbo da conclusão. */
  completedAt: string | null;
  /** `conversation_tasks.started_at` — quando saiu de "a fazer". */
  startedAt: string | null;
  /** `conversation_tasks.created_at`. */
  createdAt: string;
}

/** Evento da conversa (`conversation_events`): transferência, atribuição, encerramento, reabertura. */
export interface RawEvent {
  /** `conversation_events.id`. */
  id: string;
  /** `conversation_events.event_type`. */
  eventType: string;
  /** `conversation_events.from_agent_id`. */
  fromAgentId: string | null;
  /** `conversation_events.to_agent_id`. */
  toAgentId: string | null;
  /** `conversation_events.from_queue_id`. */
  fromQueueId: string | null;
  /** `conversation_events.to_queue_id`. */
  toQueueId: string | null;
  /** `conversation_events.performed_by` — quem executou a ação. */
  performedBy: string | null;
  /** `conversation_events.closure_id` — liga o evento ao encerramento. */
  closureId: string | null;
  /** `conversation_events.created_at`. */
  createdAt: string;
}

/** Proposta comercial (`sales_deals`). */
export interface RawDeal {
  /** `sales_deals.id`. */
  id: string;
  /** `sales_deals.title`. */
  title: string;
  /** `sales_deals.value`. */
  value: number | null;
  /** `sales_deals.status`. */
  status: string | null;
  /** `sales_deals.assigned_to` — responsável. */
  assignedTo: string | null;
  /** `sales_deals.created_at`. */
  createdAt: string | null;
  /** `sales_deals.won_at`. */
  wonAt: string | null;
  /** `sales_deals.lost_at`. */
  lostAt: string | null;
  /** `sales_deals.lost_reason`. */
  lostReason: string | null;
}

/** Atividade de uma proposta (`deal_activities`). */
export interface RawActivity {
  /** `deal_activities.id`. */
  id: string;
  /** `deal_activities.deal_id` — a proposta a que pertence. */
  dealId: string;
  /** `deal_activities.activity_type`. */
  activityType: string;
  /** `deal_activities.description`. */
  description: string | null;
  /** `deal_activities.performed_by`. */
  performedBy: string | null;
  /** `deal_activities.created_at`. */
  createdAt: string | null;
}

/**
 * Recorte de período que TODAS as fontes recebem: instantes em UTC (ISO), já prontos para o
 * `gte`/`lte` das consultas, com `null` no lado aberto.
 *
 * O hook NÃO resolve o período — quem resolve é o seletor da aba, uma vez só, para que a MESMA
 * janela valha para todas as fontes (e para o período anterior da tendência). Recortar por dia
 * de CALENDÁRIO é responsabilidade de quem produz estas pontas; aqui elas chegam prontas.
 */
export interface JourneyRangeIso {
  sinceIso: string | null;
  untilIso: string | null;
}
