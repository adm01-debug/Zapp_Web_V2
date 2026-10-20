/**
 * Evolution API v2 — Type definitions
 * Extracted from useEvolutionApi.ts for maintainability.
 */

export interface SendMessageParams {
  instanceName: string;
  number: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mimetype?: string;
  caption?: string;
  fileName?: string;
  delay?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  locationAddress?: string;
  quoted?: {
    key: { remoteJid: string; fromMe: boolean; id: string };
    message: { conversation: string };
  };
  mentionsEveryOne?: boolean;
  mentioned?: string[];
}

export interface GroupParams {
  instanceName: string;
  groupJid: string;
  subject?: string;
  description?: string;
  participants?: string[];
  action?: 'add' | 'remove' | 'promote' | 'demote';
  image?: string;
  expiration?: number;
  inviteCode?: string;
}

export interface ContactCard {
  fullName: string;
  wuid: string;
  phoneNumber: string;
  organization?: string;
  email?: string;
  url?: string;
}

export interface PollParams {
  instanceName: string;
  number: string;
  name: string;
  selectableCount?: number;
  values: string[];
}

export interface ListSection {
  title: string;
  rows: { title: string; description?: string; rowId: string }[];
}

export interface ButtonItem {
  type: 'reply';
  displayText: string;
  id: string;
}

export interface WebhookConfig {
  instanceName: string;
  enabled?: boolean;
  url: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events?: string[];
}

export interface SettingsConfig {
  instanceName: string;
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

export interface PrivacySettings {
  instanceName: string;
  readreceipts?: string;
  profile?: string;
  status?: string;
  online?: string;
  last?: string;
  groupadd?: string;
}

export interface TypebotConfig {
  instanceName: string;
  enabled?: boolean;
  url: string;
  typebot: string;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  triggerType?: string;
  triggerOperator?: string;
  triggerValue?: string;
}

export interface OpenAIConfig {
  instanceName: string;
  enabled?: boolean;
  openAiApiKey: string;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  speechToText?: boolean;
  botType?: 'chatCompletion' | 'assistant';
  assistantId?: string;
  model?: string;
  systemMessage?: string;
  maxTokens?: number;
  temperature?: number;
  triggerType?: string;
  triggerOperator?: string;
  triggerValue?: string;
  functionUrl?: string;
}

export interface DifyConfig {
  instanceName: string;
  enabled?: boolean;
  apiUrl: string;
  apiKey: string;
  botType?: 'chatBot' | 'textGenerator' | 'agent' | 'workflow';
  expire?: number;
  triggerType?: string;
  keywordFinish?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  speechToText?: boolean;
}

export interface FlowiseConfig {
  instanceName: string;
  enabled?: boolean;
  apiUrl: string;
  apiKey?: string;
  chatflowId: string;
  expire?: number;
  triggerType?: string;
  triggerValue?: string;
}

export interface EvolutionBotConfig {
  instanceName: string;
  enabled?: boolean;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  triggerType?: string;
  triggerOperator?: string;
  triggerValue?: string;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  apiUrl: string;
  apiKey?: string;
}

export interface ChatwootConfig {
  instanceName: string;
  enabled?: boolean;
  accountId: string;
  token: string;
  url: string;
  signMsg?: boolean;
  reopenConversation?: boolean;
  conversationPending?: boolean;
  nameInbox?: string;
  mergeBrazilContacts?: boolean;
  importContacts?: boolean;
  importMessages?: boolean;
  daysLimitImportMessages?: number;
  signDelimiter?: string;
  autoCreate?: boolean;
}

export interface CreateInstanceParams {
  instanceName: string;
  qrcode?: boolean;
  integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS-CLOUD';
  token?: string;
  number?: string;
  businessId?: string;
  wabaId?: string;
  phoneNumberId?: string;
  webhook?: Partial<WebhookConfig>;
  chatwoot?: Partial<ChatwootConfig>;
  typebot?: Partial<TypebotConfig>;
}

// E11 (plano multi-conexão): substitui create-instance — cria a instância na
// GO, a linha em whatsapp_connections e o token no Vault numa operação só
// (o front não insere mais a linha manualmente).
export interface CreateConnectionParams {
  instanceName: string;
  name: string;
  phone_number: string;
  is_default?: boolean;
  number?: string;
  integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS-CLOUD';
}

export interface CreateConnectionResult {
  // Linha completa de whatsapp_connections (select() sem args = '*' no
  // backend) — tipar como Record em vez de duplicar o schema da tabela;
  // o chamador faz o cast para WhatsAppConnection.
  connection: Record<string, unknown>;
  evolution: unknown;
}
