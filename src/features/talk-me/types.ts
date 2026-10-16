export interface TalkMeQueue {
  queueId: string;
  name: string;
  color: string | null;
  waitingCount: number;
  oldestWaitingAt: string | null;
}

export interface TalkMeWaitingContact {
  contactId: string;
  name: string;
  avatarUrl: string | null;
  company: string | null;
  jobTitle: string | null;
  queueId: string;
  queueName: string;
  queueColor: string | null;
  waitingSince: string;
  pendingMessageCount: number;
  lastMessageId: string;
  lastMessageContent: string;
  lastMessageType: string;
  lastMessageMediaUrl: string | null;
  lastMessageCaption: string | null;
  lastMessageAt: string;
  totalCount: number;
  position: number;
}

export interface TalkMeClaimResult {
  contactId: string;
  queueId: string;
  assignedTo: string;
  conversationStatus: string;
  claimedAt: string;
}

export class TalkMeConflictError extends Error {
  constructor() {
    super('Este atendimento não está mais disponível.');
    this.name = 'TalkMeConflictError';
  }
}

/**
 * O aceite não voltou (rede/proxy) ou voltou sem corpo utilizável: o commit pode
 * ter acontecido no servidor mesmo assim. É um estado recuperável, não uma falha
 * definitiva — a confirmação reusa `talk_me_claim`, que é idempotente para o
 * vencedor e não duplica auditoria.
 */
export class TalkMeOutcomeUnknownError extends Error {
  constructor() {
    super('Não foi possível confirmar o aceite do atendimento.');
    this.name = 'TalkMeOutcomeUnknownError';
  }
}

/** Sem conexão: o aceite nem chega a sair do navegador. */
export class TalkMeOfflineError extends Error {
  constructor() {
    super('Sem conexão para assumir o atendimento.');
    this.name = 'TalkMeOfflineError';
  }
}
