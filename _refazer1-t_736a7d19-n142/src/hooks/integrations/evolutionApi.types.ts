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

// SL-075 E43: os tipos das integrações que a Evolution GO não suporta
// (TypebotConfig, OpenAIConfig, DifyConfig, FlowiseConfig, EvolutionBotConfig,
// ChatwootConfig) foram removidos junto com o hook que os usava.

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
