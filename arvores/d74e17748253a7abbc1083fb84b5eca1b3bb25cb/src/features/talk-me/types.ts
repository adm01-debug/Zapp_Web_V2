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
