# 📡 EVOLUTION API - DOCUMENTAÇÃO COMPLETA DE WEBHOOKS
## Para Integração Frontend Lovable

**Versão:** 1.0  
**Data:** 13 de Abril de 2026  
**Projeto:** Promo Brindes  

---

# 📋 ÍNDICE

1. [Visão Geral](#1-visão-geral)
2. [Configuração do Webhook](#2-configuração-do-webhook)
3. [Estrutura Base dos Eventos](#3-estrutura-base-dos-eventos)
4. [TypeScript Types Completos](#4-typescript-types-completos)
5. [Eventos de Mensagens](#5-eventos-de-mensagens)
6. [Eventos de Conexão](#6-eventos-de-conexão)
7. [Eventos de Contatos](#7-eventos-de-contatos)
8. [Eventos de Chats](#8-eventos-de-chats)
9. [Eventos de Grupos](#9-eventos-de-grupos)
10. [Eventos de Labels](#10-eventos-de-labels)
11. [Eventos de Presença](#11-eventos-de-presença)
12. [Eventos de Chamadas](#12-eventos-de-chamadas)
13. [Integração com Supabase Realtime](#13-integração-com-supabase-realtime)
14. [Exemplos de Código Frontend](#14-exemplos-de-código-frontend)
15. [Tabela de Referência Rápida](#15-tabela-de-referência-rápida)

---

# 1. VISÃO GERAL

## 1.1 Fluxo de Dados

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────┐
│  WhatsApp   │────▶│  Evolution API  │────▶│     Webhook     │────▶│  Supabase   │
│             │     │     (wpp2)      │     │  (Edge Function)│     │  Database   │
└─────────────┘     └─────────────────┘     └─────────────────┘     └──────┬──────┘
                                                                          │
                                                                          ▼
                                                                   ┌─────────────┐
                                                                   │  Supabase   │
                                                                   │  Realtime   │
                                                                   └──────┬──────┘
                                                                          │
                                                                          ▼
                                                                   ┌─────────────┐
                                                                   │   Lovable   │
                                                                   │  Frontend   │
                                                                   └─────────────┘
```

## 1.2 Eventos Ativos (26)

| Categoria | Eventos | Quantidade |
|-----------|---------|:----------:|
| Sistema | APPLICATION_STARTUP, CONNECTION_UPDATE, QRCODE_UPDATED, STATUS_INSTANCE, LOGOUT_INSTANCE | 5 |
| Mensagens | MESSAGES_UPSERT, MESSAGES_UPDATE, MESSAGES_DELETE, MESSAGES_EDITED, SEND_MESSAGE, SEND_MESSAGE_UPDATE, MESSAGES_SET | 7 |
| Contatos | CONTACTS_UPSERT, CONTACTS_UPDATE, CONTACTS_SET | 3 |
| Chats | CHATS_UPSERT, CHATS_UPDATE, CHATS_DELETE, CHATS_SET | 4 |
| Grupos | GROUPS_UPSERT, GROUP_UPDATE, GROUP_PARTICIPANTS_UPDATE | 3 |
| Labels | LABELS_EDIT, LABELS_ASSOCIATION | 2 |
| Outros | PRESENCE_UPDATE, CALL | 2 |

---

# 2. CONFIGURAÇÃO DO WEBHOOK

## 2.1 URL e Autenticação

```
Webhook URL: https://allrjhkpuscmgbsnmjlv.supabase.co/functions/v1/evolution-webhook

Header de Autenticação:
  x-webhook-secret: promo-brindes-evolution-4d4565def0706d8ab270066754a2de95d11cf95cfd7da0b8e20221791bf08058
```

## 2.2 Configuração Atual

```json
{
  "url": "https://allrjhkpuscmgbsnmjlv.supabase.co/functions/v1/evolution-webhook",
  "enabled": true,
  "webhookByEvents": false,
  "webhookBase64": false,
  "events": [
    "APPLICATION_STARTUP",
    "QRCODE_UPDATED",
    "CONNECTION_UPDATE",
    "MESSAGES_SET",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "MESSAGES_EDITED",
    "SEND_MESSAGE",
    "SEND_MESSAGE_UPDATE",
    "CONTACTS_SET",
    "CONTACTS_UPSERT",
    "CONTACTS_UPDATE",
    "PRESENCE_UPDATE",
    "CHATS_SET",
    "CHATS_UPSERT",
    "CHATS_UPDATE",
    "CHATS_DELETE",
    "GROUPS_UPSERT",
    "GROUP_UPDATE",
    "GROUP_PARTICIPANTS_UPDATE",
    "LABELS_EDIT",
    "LABELS_ASSOCIATION",
    "CALL",
    "STATUS_INSTANCE",
    "LOGOUT_INSTANCE"
  ]
}
```

---

# 3. ESTRUTURA BASE DOS EVENTOS

## 3.1 Payload Genérico

Todo evento do webhook segue esta estrutura:

```typescript
interface WebhookPayload {
  event: string;           // Nome do evento (ex: "MESSAGES_UPSERT")
  instance: string;        // Nome da instância ("wpp2")
  data: object;            // Dados específicos do evento (varia)
  destination?: string;    // URL de destino
  date_time?: string;      // ISO timestamp do evento
  sender?: string;         // JID do remetente (quando aplicável)
  server_url?: string;     // URL do servidor Evolution
  apikey?: string;         // API key (parcial, para validação)
}
```

## 3.2 Exemplo Real

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0F92CAB0D0C54F4DC65"
    },
    "pushName": "Cliente João",
    "message": {
      "conversation": "Olá, preciso de um orçamento"
    },
    "messageType": "conversation",
    "messageTimestamp": 1776092932
  },
  "destination": "https://allrjhkpuscmgbsnmjlv.supabase.co/functions/v1/evolution-webhook",
  "date_time": "2026-04-13T15:08:52.000Z",
  "sender": "5511999999999@s.whatsapp.net",
  "server_url": "https://evolution.atomicabr.com.br",
  "apikey": "EDA4459..."
}
```

---

# 4. TYPESCRIPT TYPES COMPLETOS

```typescript
// ============================================
// TIPOS BASE
// ============================================

/** JID (WhatsApp ID) - Identificador único */
type ContactJid = `${string}@s.whatsapp.net`;
type GroupJid = `${string}@g.us`;
type BroadcastJid = 'status@broadcast';
type Jid = ContactJid | GroupJid | BroadcastJid;

/** Chave única de mensagem */
interface MessageKey {
  remoteJid: Jid;
  fromMe: boolean;
  id: string;
  participant?: string; // Em grupos: JID do autor
}

/** Status de entrega da mensagem */
type MessageStatus = 
  | 'ERROR'
  | 'PENDING'
  | 'SERVER_ACK'
  | 'DELIVERY_ACK'
  | 'READ'
  | 'PLAYED';

/** Tipo de mensagem */
type MessageType =
  | 'conversation'
  | 'extendedTextMessage'
  | 'imageMessage'
  | 'videoMessage'
  | 'audioMessage'
  | 'documentMessage'
  | 'stickerMessage'
  | 'reactionMessage'
  | 'locationMessage'
  | 'contactMessage'
  | 'contactsArrayMessage'
  | 'liveLocationMessage'
  | 'pollCreationMessage'
  | 'pollUpdateMessage'
  | 'buttonsMessage'
  | 'buttonsResponseMessage'
  | 'listMessage'
  | 'listResponseMessage'
  | 'templateMessage'
  | 'protocolMessage';

// ============================================
// CONTEÚDO DE MENSAGENS
// ============================================

/** Mensagem de texto simples */
interface ConversationContent {
  conversation: string;
}

/** Mensagem de texto com formatação/links */
interface ExtendedTextContent {
  extendedTextMessage: {
    text: string;
    matchedText?: string;
    canonicalUrl?: string;
    title?: string;
    description?: string;
    jpegThumbnail?: string;
    contextInfo?: ContextInfo;
  };
}

/** Mensagem de imagem */
interface ImageContent {
  imageMessage: {
    url: string;
    mimetype: string;
    caption?: string;
    fileSha256: Uint8Array;
    fileLength: Long;
    height: number;
    width: number;
    mediaKey: Uint8Array;
    jpegThumbnail?: string;
    contextInfo?: ContextInfo;
  };
}

/** Mensagem de vídeo */
interface VideoContent {
  videoMessage: {
    url: string;
    mimetype: string;
    caption?: string;
    fileSha256: Uint8Array;
    fileLength: Long;
    seconds: number;
    height: number;
    width: number;
    mediaKey: Uint8Array;
    jpegThumbnail?: string;
    gifPlayback?: boolean;
    contextInfo?: ContextInfo;
  };
}

/** Mensagem de áudio */
interface AudioContent {
  audioMessage: {
    url: string;
    mimetype: string;
    fileSha256: Uint8Array;
    fileLength: Long;
    seconds: number;
    ptt: boolean; // true = áudio gravado (PTT)
    mediaKey: Uint8Array;
    waveform?: Uint8Array;
    contextInfo?: ContextInfo;
  };
}

/** Mensagem de documento */
interface DocumentContent {
  documentMessage: {
    url: string;
    mimetype: string;
    title: string;
    fileSha256: Uint8Array;
    fileLength: Long;
    pageCount?: number;
    fileName: string;
    jpegThumbnail?: string;
    contextInfo?: ContextInfo;
  };
}

/** Mensagem de sticker */
interface StickerContent {
  stickerMessage: {
    url: string;
    mimetype: string;
    fileSha256: Uint8Array;
    fileLength: Long;
    height: number;
    width: number;
    isAnimated: boolean;
    mediaKey: Uint8Array;
    contextInfo?: ContextInfo;
  };
}

/** Mensagem de reação */
interface ReactionContent {
  reactionMessage: {
    key: MessageKey;
    text: string; // Emoji ou "" para remover
    senderTimestampMs: Long;
  };
}

/** Mensagem de localização */
interface LocationContent {
  locationMessage: {
    degreesLatitude: number;
    degreesLongitude: number;
    name?: string;
    address?: string;
    url?: string;
    jpegThumbnail?: string;
    contextInfo?: ContextInfo;
  };
}

/** Mensagem de contato */
interface ContactContent {
  contactMessage: {
    displayName: string;
    vcard: string;
    contextInfo?: ContextInfo;
  };
}

/** Mensagem de enquete */
interface PollCreationContent {
  pollCreationMessage: {
    name: string;
    options: Array<{ optionName: string }>;
    selectableOptionsCount: number;
  };
}

/** Atualização de enquete */
interface PollUpdateContent {
  pollUpdateMessage: {
    pollCreationMessageKey: MessageKey;
    vote: {
      selectedOptions: number[];
    };
    senderTimestampMs: Long;
  };
}

/** Informações de contexto (reply, mention, etc) */
interface ContextInfo {
  stanzaId?: string;           // ID da mensagem citada
  participant?: string;        // Autor da mensagem citada
  quotedMessage?: MessageContent;
  mentionedJid?: string[];     // JIDs mencionados
  isForwarded?: boolean;
  forwardingScore?: number;
  expiration?: number;         // TTL em segundos (mensagens temporárias)
  ephemeralSettingTimestamp?: Long;
  disappearingMode?: {
    initiator: number;
  };
}

/** União de todos os tipos de conteúdo */
type MessageContent =
  | ConversationContent
  | ExtendedTextContent
  | ImageContent
  | VideoContent
  | AudioContent
  | DocumentContent
  | StickerContent
  | ReactionContent
  | LocationContent
  | ContactContent
  | PollCreationContent
  | PollUpdateContent;

/** Long number (BigInt wrapper) */
interface Long {
  low: number;
  high: number;
  unsigned: boolean;
}

// ============================================
// EVENTOS DE WEBHOOK
// ============================================

/** Evento base */
interface BaseWebhookEvent {
  event: string;
  instance: string;
  destination?: string;
  date_time?: string;
  server_url?: string;
  apikey?: string;
}

// ============================================
// EVENTOS DE MENSAGENS
// ============================================

/** MESSAGES_UPSERT - Nova mensagem recebida */
interface MessagesUpsertEvent extends BaseWebhookEvent {
  event: 'MESSAGES_UPSERT';
  data: {
    key: MessageKey;
    pushName?: string;
    message: MessageContent;
    messageType: MessageType;
    messageTimestamp: number;
    owner: string;
    source: 'web' | 'android' | 'ios';
    instanceId?: string;
    contextInfo?: ContextInfo;
  };
  sender?: string;
}

/** MESSAGES_UPDATE - Atualização de status da mensagem */
interface MessagesUpdateEvent extends BaseWebhookEvent {
  event: 'MESSAGES_UPDATE';
  data: {
    key: MessageKey;
    update: {
      status?: MessageStatus;
      starred?: boolean;
      pollUpdates?: object;
    };
    instanceId?: string;
  };
}

/** MESSAGES_DELETE - Mensagem deletada */
interface MessagesDeleteEvent extends BaseWebhookEvent {
  event: 'MESSAGES_DELETE';
  data: {
    key: MessageKey;
    instanceId?: string;
  };
}

/** MESSAGES_EDITED - Mensagem editada */
interface MessagesEditedEvent extends BaseWebhookEvent {
  event: 'MESSAGES_EDITED';
  data: {
    key: MessageKey;
    editedMessage: MessageContent;
    editedTimestamp: number;
    instanceId?: string;
  };
}

/** SEND_MESSAGE - Mensagem enviada pela instância */
interface SendMessageEvent extends BaseWebhookEvent {
  event: 'SEND_MESSAGE';
  data: {
    key: MessageKey;
    pushName?: string;
    status: MessageStatus;
    message: MessageContent;
    messageType: MessageType;
    messageTimestamp: number;
    instanceId?: string;
    source: 'web';
  };
}

/** SEND_MESSAGE_UPDATE - Atualização de mensagem enviada */
interface SendMessageUpdateEvent extends BaseWebhookEvent {
  event: 'SEND_MESSAGE_UPDATE';
  data: {
    key: MessageKey;
    status: MessageStatus;
    instanceId?: string;
  };
}

// ============================================
// EVENTOS DE CONEXÃO
// ============================================

/** CONNECTION_UPDATE - Mudança no status da conexão */
interface ConnectionUpdateEvent extends BaseWebhookEvent {
  event: 'CONNECTION_UPDATE';
  data: {
    instance: string;
    state: 'open' | 'close' | 'connecting';
    statusReason?: number;
  };
}

/** QRCODE_UPDATED - QR Code atualizado (para login) */
interface QrcodeUpdatedEvent extends BaseWebhookEvent {
  event: 'QRCODE_UPDATED';
  data: {
    instance: string;
    qrcode: {
      base64: string;
      code: string;
    };
  };
}

/** APPLICATION_STARTUP - API iniciada */
interface ApplicationStartupEvent extends BaseWebhookEvent {
  event: 'APPLICATION_STARTUP';
  data: {
    status: 'running';
    version?: string;
  };
}

/** STATUS_INSTANCE - Status da instância */
interface StatusInstanceEvent extends BaseWebhookEvent {
  event: 'STATUS_INSTANCE';
  data: {
    instance: string;
    status: 'created' | 'deleted' | 'connected' | 'disconnected';
  };
}

/** LOGOUT_INSTANCE - Logout detectado */
interface LogoutInstanceEvent extends BaseWebhookEvent {
  event: 'LOGOUT_INSTANCE';
  data: {
    instance: string;
    logout: boolean;
  };
}

// ============================================
// EVENTOS DE CONTATOS
// ============================================

/** CONTACTS_UPSERT - Contato adicionado/atualizado */
interface ContactsUpsertEvent extends BaseWebhookEvent {
  event: 'CONTACTS_UPSERT';
  data: {
    id: string;
    remoteJid: string;
    pushName?: string;
    profilePicUrl?: string;
    status?: string;
    instanceId?: string;
  }[];
}

/** CONTACTS_UPDATE - Contato atualizado */
interface ContactsUpdateEvent extends BaseWebhookEvent {
  event: 'CONTACTS_UPDATE';
  data: {
    id: string;
    remoteJid: string;
    pushName?: string;
    profilePicUrl?: string;
    status?: string;
    instanceId?: string;
  }[];
}

// ============================================
// EVENTOS DE CHATS
// ============================================

/** CHATS_UPSERT - Chat criado/atualizado */
interface ChatsUpsertEvent extends BaseWebhookEvent {
  event: 'CHATS_UPSERT';
  data: {
    id: string;
    remoteJid: string;
    name?: string;
    unreadCount?: number;
    conversationTimestamp?: number;
    archived?: boolean;
    pinned?: number;
    mute?: number;
    instanceId?: string;
  }[];
}

/** CHATS_UPDATE - Chat atualizado */
interface ChatsUpdateEvent extends BaseWebhookEvent {
  event: 'CHATS_UPDATE';
  data: {
    id: string;
    remoteJid: string;
    unreadCount?: number;
    conversationTimestamp?: number;
    archived?: boolean;
    pinned?: number;
    mute?: number;
    instanceId?: string;
  }[];
}

/** CHATS_DELETE - Chat deletado */
interface ChatsDeleteEvent extends BaseWebhookEvent {
  event: 'CHATS_DELETE';
  data: {
    id: string;
    remoteJid: string;
    instanceId?: string;
  };
}

// ============================================
// EVENTOS DE GRUPOS
// ============================================

/** GROUPS_UPSERT - Grupo criado */
interface GroupsUpsertEvent extends BaseWebhookEvent {
  event: 'GROUPS_UPSERT';
  data: {
    id: string;
    subject: string;
    subjectOwner?: string;
    subjectTime?: number;
    owner?: string;
    desc?: string;
    descOwner?: string;
    descId?: string;
    restrict?: boolean;
    announce?: boolean;
    size?: number;
    participants?: Array<{
      id: string;
      admin?: 'admin' | 'superadmin';
    }>;
    instanceId?: string;
  };
}

/** GROUP_UPDATE - Grupo atualizado */
interface GroupUpdateEvent extends BaseWebhookEvent {
  event: 'GROUP_UPDATE';
  data: {
    id: string;
    subject?: string;
    desc?: string;
    restrict?: boolean;
    announce?: boolean;
    profilePicture?: string;
    instanceId?: string;
  };
}

/** GROUP_PARTICIPANTS_UPDATE - Participantes alterados */
interface GroupParticipantsUpdateEvent extends BaseWebhookEvent {
  event: 'GROUP_PARTICIPANTS_UPDATE';
  data: {
    id: string;
    participants: string[];
    action: 'add' | 'remove' | 'promote' | 'demote';
    instanceId?: string;
  };
}

// ============================================
// EVENTOS DE LABELS
// ============================================

/** LABELS_EDIT - Label editada */
interface LabelsEditEvent extends BaseWebhookEvent {
  event: 'LABELS_EDIT';
  data: {
    id: string;
    name: string;
    color: string;
    predefinedId?: string;
    deleted?: boolean;
    instanceId?: string;
  };
}

/** LABELS_ASSOCIATION - Label associada/desassociada */
interface LabelsAssociationEvent extends BaseWebhookEvent {
  event: 'LABELS_ASSOCIATION';
  data: {
    chatId: string;        // JID do chat
    labelId: string;       // ID da label
    action: 'add' | 'remove';
    instanceId?: string;
  };
}

// ============================================
// EVENTOS DE PRESENÇA
// ============================================

/** PRESENCE_UPDATE - Status de presença */
interface PresenceUpdateEvent extends BaseWebhookEvent {
  event: 'PRESENCE_UPDATE';
  data: {
    id: string;
    presence: 'composing' | 'recording' | 'paused' | 'available' | 'unavailable';
    participant?: string; // Em grupos
    instanceId?: string;
  };
}

// ============================================
// EVENTOS DE CHAMADAS
// ============================================

/** CALL - Chamada recebida */
interface CallEvent extends BaseWebhookEvent {
  event: 'CALL';
  data: {
    id: string;
    callId: string;
    from: string;
    date: string;
    status: 'offer' | 'ringing' | 'timeout' | 'reject' | 'accept';
    isVideo: boolean;
    isGroup: boolean;
    instanceId?: string;
  };
}

// ============================================
// UNIÃO DE TODOS OS EVENTOS
// ============================================

type WebhookEvent =
  | MessagesUpsertEvent
  | MessagesUpdateEvent
  | MessagesDeleteEvent
  | MessagesEditedEvent
  | SendMessageEvent
  | SendMessageUpdateEvent
  | ConnectionUpdateEvent
  | QrcodeUpdatedEvent
  | ApplicationStartupEvent
  | StatusInstanceEvent
  | LogoutInstanceEvent
  | ContactsUpsertEvent
  | ContactsUpdateEvent
  | ChatsUpsertEvent
  | ChatsUpdateEvent
  | ChatsDeleteEvent
  | GroupsUpsertEvent
  | GroupUpdateEvent
  | GroupParticipantsUpdateEvent
  | LabelsEditEvent
  | LabelsAssociationEvent
  | PresenceUpdateEvent
  | CallEvent;

// ============================================
// DADOS ARMAZENADOS NO SUPABASE
// ============================================

/** Registro na tabela evolution_webhook_events */
interface WebhookEventRecord {
  id: string;                    // UUID
  event_type: string;            // Nome do evento
  instance_name: string;         // "wpp2"
  remote_jid: string | null;     // JID do contato/grupo
  from_me: boolean;              // Se a mensagem é nossa
  message_type: string | null;   // Tipo da mensagem
  push_name: string | null;      // Nome do contato
  payload: object;               // Payload completo (raw_data)
  processed: boolean;            // Se foi processado
  processed_at: string | null;   // Quando foi processado
  error_message: string | null;  // Erro, se houver
  created_at: string;            // Timestamp
}

// ============================================
// EXPORT PARA USO NO FRONTEND
// ============================================

export type {
  // Base
  Jid,
  ContactJid,
  GroupJid,
  MessageKey,
  MessageStatus,
  MessageType,
  MessageContent,
  ContextInfo,
  Long,
  
  // Conteúdos
  ConversationContent,
  ExtendedTextContent,
  ImageContent,
  VideoContent,
  AudioContent,
  DocumentContent,
  StickerContent,
  ReactionContent,
  LocationContent,
  ContactContent,
  PollCreationContent,
  PollUpdateContent,
  
  // Eventos
  BaseWebhookEvent,
  WebhookEvent,
  MessagesUpsertEvent,
  MessagesUpdateEvent,
  MessagesDeleteEvent,
  MessagesEditedEvent,
  SendMessageEvent,
  SendMessageUpdateEvent,
  ConnectionUpdateEvent,
  QrcodeUpdatedEvent,
  ApplicationStartupEvent,
  StatusInstanceEvent,
  LogoutInstanceEvent,
  ContactsUpsertEvent,
  ContactsUpdateEvent,
  ChatsUpsertEvent,
  ChatsUpdateEvent,
  ChatsDeleteEvent,
  GroupsUpsertEvent,
  GroupUpdateEvent,
  GroupParticipantsUpdateEvent,
  LabelsEditEvent,
  LabelsAssociationEvent,
  PresenceUpdateEvent,
  CallEvent,
  
  // Database
  WebhookEventRecord,
};
```

---

# 5. EVENTOS DE MENSAGENS

## 5.1 MESSAGES_UPSERT (Nova Mensagem)

**Dispara quando:** Uma nova mensagem é recebida no WhatsApp

### Payload - Mensagem de Texto

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0F92CAB0D0C54F4DC65"
    },
    "pushName": "Cliente João",
    "message": {
      "conversation": "Olá, preciso de um orçamento para 500 canetas"
    },
    "messageType": "conversation",
    "messageTimestamp": 1776092932,
    "owner": "551146375517@s.whatsapp.net",
    "source": "android"
  },
  "sender": "5511999999999@s.whatsapp.net",
  "date_time": "2026-04-13T15:08:52.000Z"
}
```

### Payload - Mensagem com Imagem

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0A12345678901234567"
    },
    "pushName": "Cliente Maria",
    "message": {
      "imageMessage": {
        "url": "https://mmg.whatsapp.net/o1/v/t24/f2/...",
        "mimetype": "image/jpeg",
        "caption": "Esse é o modelo que quero",
        "fileSha256": { "0": 123, "1": 45, ... },
        "fileLength": { "low": 45678, "high": 0, "unsigned": true },
        "height": 1080,
        "width": 1920,
        "mediaKey": { "0": 12, "1": 34, ... },
        "jpegThumbnail": "/9j/4AAQSkZJRgABAQAA..."
      }
    },
    "messageType": "imageMessage",
    "messageTimestamp": 1776093000,
    "owner": "551146375517@s.whatsapp.net",
    "source": "ios"
  }
}
```

### Payload - Mensagem de Áudio (PTT)

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0B98765432109876543"
    },
    "pushName": "Cliente Pedro",
    "message": {
      "audioMessage": {
        "url": "https://mmg.whatsapp.net/o1/v/t24/...",
        "mimetype": "audio/ogg; codecs=opus",
        "fileSha256": { ... },
        "fileLength": { "low": 12345, "high": 0, "unsigned": true },
        "seconds": 15,
        "ptt": true,
        "mediaKey": { ... },
        "waveform": { "0": 10, "1": 25, "2": 40, ... }
      }
    },
    "messageType": "audioMessage",
    "messageTimestamp": 1776093100
  }
}
```

### Payload - Mensagem em Grupo

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "120363260666804232@g.us",
      "fromMe": false,
      "id": "3EB0C11111111111111111",
      "participant": "5511888888888@s.whatsapp.net"
    },
    "pushName": "Membro do Grupo",
    "message": {
      "conversation": "Alguém tem fornecedor de canetas?"
    },
    "messageType": "conversation",
    "messageTimestamp": 1776093200
  }
}
```

### Payload - Reação a Mensagem

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0D22222222222222222"
    },
    "pushName": "Cliente",
    "message": {
      "reactionMessage": {
        "key": {
          "remoteJid": "5511999999999@s.whatsapp.net",
          "fromMe": true,
          "id": "3EB0F92CAB0D0C54F4DC65"
        },
        "text": "👍",
        "senderTimestampMs": { "low": 1776093300000, "high": 0, "unsigned": true }
      }
    },
    "messageType": "reactionMessage",
    "messageTimestamp": 1776093300
  }
}
```

### Payload - Resposta/Quote

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0E33333333333333333"
    },
    "pushName": "Cliente",
    "message": {
      "extendedTextMessage": {
        "text": "Sim, pode ser esse modelo!",
        "contextInfo": {
          "stanzaId": "3EB0F92CAB0D0C54F4DC65",
          "participant": "551146375517@s.whatsapp.net",
          "quotedMessage": {
            "conversation": "Você prefere o modelo A ou B?"
          }
        }
      }
    },
    "messageType": "extendedTextMessage",
    "messageTimestamp": 1776093400
  }
}
```

---

## 5.2 MESSAGES_UPDATE (Atualização de Status)

**Dispara quando:** O status de uma mensagem muda (entregue, lido, etc)

```json
{
  "event": "MESSAGES_UPDATE",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": true,
      "id": "3EB0F92CAB0D0C54F4DC65"
    },
    "update": {
      "status": "READ"
    },
    "instanceId": "bd3ee04a-9054-4879-af90-84da3843fd27"
  }
}
```

**Status possíveis:**
- `PENDING` - Enviando
- `SERVER_ACK` - Entregue ao servidor (✓)
- `DELIVERY_ACK` - Entregue ao destinatário (✓✓)
- `READ` - Lido (✓✓ azul)
- `PLAYED` - Reproduzido (para áudios)
- `ERROR` - Erro no envio

---

## 5.3 MESSAGES_DELETE (Mensagem Deletada)

**Dispara quando:** Uma mensagem é deletada para todos

```json
{
  "event": "MESSAGES_DELETE",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0F92CAB0D0C54F4DC65"
    },
    "instanceId": "bd3ee04a-9054-4879-af90-84da3843fd27"
  }
}
```

---

## 5.4 MESSAGES_EDITED (Mensagem Editada)

**Dispara quando:** Uma mensagem é editada

```json
{
  "event": "MESSAGES_EDITED",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0F92CAB0D0C54F4DC65"
    },
    "editedMessage": {
      "conversation": "Texto corrigido da mensagem"
    },
    "editedTimestamp": 1776094000
  }
}
```

---

## 5.5 SEND_MESSAGE (Mensagem Enviada)

**Dispara quando:** Você envia uma mensagem (via API ou app)

```json
{
  "event": "SEND_MESSAGE",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": true,
      "id": "3EB0F92CAB0D0C54F4DC65"
    },
    "pushName": "Promo Brindes",
    "status": "PENDING",
    "message": {
      "conversation": "Olá! Segue o orçamento solicitado."
    },
    "messageType": "conversation",
    "messageTimestamp": 1776094100,
    "instanceId": "bd3ee04a-9054-4879-af90-84da3843fd27",
    "source": "web"
  }
}
```

---

## 5.6 SEND_MESSAGE_UPDATE (Status do Envio)

**Dispara quando:** O status de uma mensagem enviada muda

```json
{
  "event": "SEND_MESSAGE_UPDATE",
  "instance": "wpp2",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": true,
      "id": "3EB0F92CAB0D0C54F4DC65"
    },
    "status": "DELIVERY_ACK"
  }
}
```

---

# 6. EVENTOS DE CONEXÃO

## 6.1 CONNECTION_UPDATE

**Dispara quando:** O status da conexão WhatsApp muda

### Conexão Estabelecida
```json
{
  "event": "CONNECTION_UPDATE",
  "instance": "wpp2",
  "data": {
    "instance": "wpp2",
    "state": "open"
  }
}
```

### Conexão Perdida
```json
{
  "event": "CONNECTION_UPDATE",
  "instance": "wpp2",
  "data": {
    "instance": "wpp2",
    "state": "close",
    "statusReason": 401
  }
}
```

### Reconectando
```json
{
  "event": "CONNECTION_UPDATE",
  "instance": "wpp2",
  "data": {
    "instance": "wpp2",
    "state": "connecting"
  }
}
```

**⚠️ IMPORTANTE:** Este evento dispara ALERTA CRÍTICO quando `state = "close"`

---

## 6.2 QRCODE_UPDATED

**Dispara quando:** Um novo QR Code é gerado para login

```json
{
  "event": "QRCODE_UPDATED",
  "instance": "wpp2",
  "data": {
    "instance": "wpp2",
    "qrcode": {
      "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "code": "2@ABC123DEF456,GHI789,JKL012..."
    }
  }
}
```

**Uso:** Exibir QR Code no frontend para reconexão

---

## 6.3 APPLICATION_STARTUP

**Dispara quando:** A Evolution API é iniciada

```json
{
  "event": "APPLICATION_STARTUP",
  "instance": "wpp2",
  "data": {
    "status": "running",
    "version": "2.3.7"
  }
}
```

---

## 6.4 STATUS_INSTANCE

**Dispara quando:** O status da instância muda

```json
{
  "event": "STATUS_INSTANCE",
  "instance": "wpp2",
  "data": {
    "instance": "wpp2",
    "status": "connected"
  }
}
```

**Status possíveis:** `created`, `deleted`, `connected`, `disconnected`

---

## 6.5 LOGOUT_INSTANCE

**Dispara quando:** Um logout é detectado

```json
{
  "event": "LOGOUT_INSTANCE",
  "instance": "wpp2",
  "data": {
    "instance": "wpp2",
    "logout": true
  }
}
```

**⚠️ IMPORTANTE:** Este evento dispara ALERTA CRÍTICO

---

# 7. EVENTOS DE CONTATOS

## 7.1 CONTACTS_UPSERT

**Dispara quando:** Contatos são adicionados ou atualizados

```json
{
  "event": "CONTACTS_UPSERT",
  "instance": "wpp2",
  "data": [
    {
      "id": "cmfzfpayk80wamk6ov1xkob3e",
      "remoteJid": "5511999999999@s.whatsapp.net",
      "pushName": "João Silva",
      "profilePicUrl": "https://pps.whatsapp.net/v/...",
      "status": "Hey there! I am using WhatsApp.",
      "instanceId": "bd3ee04a-9054-4879-af90-84da3843fd27"
    },
    {
      "id": "cmg6riuc0ddbemk6ohhvf5y5j",
      "remoteJid": "5511888888888@s.whatsapp.net",
      "pushName": "Maria Santos",
      "instanceId": "bd3ee04a-9054-4879-af90-84da3843fd27"
    }
  ]
}
```

---

## 7.2 CONTACTS_UPDATE

**Dispara quando:** Dados de contatos são atualizados

```json
{
  "event": "CONTACTS_UPDATE",
  "instance": "wpp2",
  "data": [
    {
      "id": "cmfzfpayk80wamk6ov1xkob3e",
      "remoteJid": "5511999999999@s.whatsapp.net",
      "pushName": "João Silva - Empresa X",
      "profilePicUrl": "https://pps.whatsapp.net/v/t61.24694-24/..."
    }
  ]
}
```

---

# 8. EVENTOS DE CHATS

## 8.1 CHATS_UPSERT

**Dispara quando:** Chats são criados ou atualizados

```json
{
  "event": "CHATS_UPSERT",
  "instance": "wpp2",
  "data": [
    {
      "id": "chat_001",
      "remoteJid": "5511999999999@s.whatsapp.net",
      "name": "João Silva",
      "unreadCount": 3,
      "conversationTimestamp": 1776094200,
      "archived": false,
      "pinned": 0,
      "mute": 0,
      "instanceId": "bd3ee04a-9054-4879-af90-84da3843fd27"
    }
  ]
}
```

---

## 8.2 CHATS_UPDATE

**Dispara quando:** Propriedades de chats são atualizadas

```json
{
  "event": "CHATS_UPDATE",
  "instance": "wpp2",
  "data": [
    {
      "id": "chat_001",
      "remoteJid": "5511999999999@s.whatsapp.net",
      "unreadCount": 0,
      "conversationTimestamp": 1776094300,
      "archived": true
    }
  ]
}
```

---

## 8.3 CHATS_DELETE

**Dispara quando:** Um chat é deletado

```json
{
  "event": "CHATS_DELETE",
  "instance": "wpp2",
  "data": {
    "id": "chat_001",
    "remoteJid": "5511999999999@s.whatsapp.net"
  }
}
```

---

# 9. EVENTOS DE GRUPOS

## 9.1 GROUPS_UPSERT

**Dispara quando:** Um grupo é criado ou você entra em um grupo

```json
{
  "event": "GROUPS_UPSERT",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999-1680000000@g.us",
    "subject": "Fornecedores de Brindes 2026",
    "subjectOwner": "5511888888888@s.whatsapp.net",
    "subjectTime": 1680000000,
    "owner": "5511888888888@s.whatsapp.net",
    "desc": "Grupo para discussão entre fornecedores",
    "descOwner": "5511888888888@s.whatsapp.net",
    "descId": "abc123",
    "restrict": false,
    "announce": false,
    "size": 15,
    "participants": [
      {
        "id": "5511999999999@s.whatsapp.net",
        "admin": null
      },
      {
        "id": "5511888888888@s.whatsapp.net",
        "admin": "superadmin"
      },
      {
        "id": "5511777777777@s.whatsapp.net",
        "admin": "admin"
      }
    ]
  }
}
```

---

## 9.2 GROUP_UPDATE

**Dispara quando:** Dados do grupo são atualizados

```json
{
  "event": "GROUP_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999-1680000000@g.us",
    "subject": "Fornecedores de Brindes 2026 [OFICIAL]",
    "desc": "Nova descrição do grupo",
    "restrict": true,
    "announce": false,
    "profilePicture": "https://pps.whatsapp.net/v/..."
  }
}
```

---

## 9.3 GROUP_PARTICIPANTS_UPDATE

**Dispara quando:** Participantes entram, saem ou são promovidos/rebaixados

### Adição de Participante
```json
{
  "event": "GROUP_PARTICIPANTS_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999-1680000000@g.us",
    "participants": [
      "5511666666666@s.whatsapp.net",
      "5511555555555@s.whatsapp.net"
    ],
    "action": "add"
  }
}
```

### Remoção de Participante
```json
{
  "event": "GROUP_PARTICIPANTS_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999-1680000000@g.us",
    "participants": ["5511666666666@s.whatsapp.net"],
    "action": "remove"
  }
}
```

### Promoção a Admin
```json
{
  "event": "GROUP_PARTICIPANTS_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999-1680000000@g.us",
    "participants": ["5511666666666@s.whatsapp.net"],
    "action": "promote"
  }
}
```

### Rebaixamento de Admin
```json
{
  "event": "GROUP_PARTICIPANTS_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999-1680000000@g.us",
    "participants": ["5511666666666@s.whatsapp.net"],
    "action": "demote"
  }
}
```

---

# 10. EVENTOS DE LABELS

## 10.1 LABELS_EDIT

**Dispara quando:** Uma label é criada, editada ou deletada

### Criação/Edição
```json
{
  "event": "LABELS_EDIT",
  "instance": "wpp2",
  "data": {
    "id": "12",
    "name": "Urgente",
    "color": "11",
    "predefinedId": null,
    "deleted": false
  }
}
```

### Deleção
```json
{
  "event": "LABELS_EDIT",
  "instance": "wpp2",
  "data": {
    "id": "12",
    "name": "Urgente",
    "color": "11",
    "deleted": true
  }
}
```

---

## 10.2 LABELS_ASSOCIATION

**Dispara quando:** Uma label é associada ou removida de um chat

### Associação
```json
{
  "event": "LABELS_ASSOCIATION",
  "instance": "wpp2",
  "data": {
    "chatId": "5511999999999@s.whatsapp.net",
    "labelId": "2",
    "action": "add"
  }
}
```

### Remoção
```json
{
  "event": "LABELS_ASSOCIATION",
  "instance": "wpp2",
  "data": {
    "chatId": "5511999999999@s.whatsapp.net",
    "labelId": "2",
    "action": "remove"
  }
}
```

**⚠️ IMPORTANTE:** Este evento é usado para sincronizar o Pipeline de Vendas!

**Mapeamento Label → Pipeline:**
| Label ID | Label Name | Pipeline Stage |
|:--------:|------------|----------------|
| 1 | Novo cliente | `novo_cliente` |
| 2 | Novo pedido | `novo_pedido` |
| 3 | Pagamento pendente | `pagamento_pendente` |
| 4 | Pago | `pago` |
| 5 | Pedido finalizado | `pedido_finalizado` |

---

# 11. EVENTOS DE PRESENÇA

## 11.1 PRESENCE_UPDATE

**Dispara quando:** O status de presença de um contato muda

### Digitando
```json
{
  "event": "PRESENCE_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999@s.whatsapp.net",
    "presence": "composing"
  }
}
```

### Gravando Áudio
```json
{
  "event": "PRESENCE_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999@s.whatsapp.net",
    "presence": "recording"
  }
}
```

### Parou de Digitar
```json
{
  "event": "PRESENCE_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999@s.whatsapp.net",
    "presence": "paused"
  }
}
```

### Em Grupo
```json
{
  "event": "PRESENCE_UPDATE",
  "instance": "wpp2",
  "data": {
    "id": "5511999999999-1680000000@g.us",
    "presence": "composing",
    "participant": "5511888888888@s.whatsapp.net"
  }
}
```

**Presences possíveis:**
- `composing` - Digitando
- `recording` - Gravando áudio
- `paused` - Parou de digitar
- `available` - Online
- `unavailable` - Offline

---

# 12. EVENTOS DE CHAMADAS

## 12.1 CALL

**Dispara quando:** Uma chamada é recebida

### Chamada de Voz Recebida
```json
{
  "event": "CALL",
  "instance": "wpp2",
  "data": {
    "id": "call_001",
    "callId": "ABC123DEF456",
    "from": "5511999999999@s.whatsapp.net",
    "date": "2026-04-13T15:30:00.000Z",
    "status": "offer",
    "isVideo": false,
    "isGroup": false
  }
}
```

### Chamada de Vídeo Recebida
```json
{
  "event": "CALL",
  "instance": "wpp2",
  "data": {
    "id": "call_002",
    "callId": "GHI789JKL012",
    "from": "5511888888888@s.whatsapp.net",
    "date": "2026-04-13T15:35:00.000Z",
    "status": "offer",
    "isVideo": true,
    "isGroup": false
  }
}
```

### Chamada Rejeitada (automática)
```json
{
  "event": "CALL",
  "instance": "wpp2",
  "data": {
    "id": "call_001",
    "callId": "ABC123DEF456",
    "from": "5511999999999@s.whatsapp.net",
    "date": "2026-04-13T15:30:05.000Z",
    "status": "reject",
    "isVideo": false,
    "isGroup": false
  }
}
```

**Status possíveis:**
- `offer` - Chamada chegando
- `ringing` - Chamando
- `timeout` - Tempo esgotado
- `reject` - Rejeitada
- `accept` - Atendida

**Nota:** A instância está configurada com `rejectCall: true`, então todas as chamadas são automaticamente rejeitadas.

---

# 13. INTEGRAÇÃO COM SUPABASE REALTIME

## 13.1 Configuração Inicial

```typescript
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabase = createClient(
  'https://allrjhkpuscmgbsnmjlv.supabase.co',
  'YOUR_ANON_KEY'
);
```

## 13.2 Escutar Todos os Eventos

```typescript
interface WebhookEventRecord {
  id: string;
  event_type: string;
  instance_name: string;
  remote_jid: string | null;
  from_me: boolean;
  message_type: string | null;
  push_name: string | null;
  payload: object;
  processed: boolean;
  created_at: string;
}

const channel = supabase
  .channel('all-webhook-events')
  .on<WebhookEventRecord>(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'evolution_webhook_events'
    },
    (payload) => {
      console.log('Novo evento:', payload.new);
      handleWebhookEvent(payload.new);
    }
  )
  .subscribe();
```

## 13.3 Escutar Apenas Mensagens

```typescript
const messagesChannel = supabase
  .channel('messages-only')
  .on<WebhookEventRecord>(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'evolution_webhook_events',
      filter: 'event_type=in.(MESSAGES_UPSERT,SEND_MESSAGE)'
    },
    (payload) => {
      handleNewMessage(payload.new);
    }
  )
  .subscribe();
```

## 13.4 Escutar Alertas Críticos

```typescript
interface AlertRecord {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  payload: object;
  acknowledged: boolean;
  created_at: string;
}

const alertsChannel = supabase
  .channel('critical-alerts')
  .on<AlertRecord>(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'evolution_alerts',
      filter: 'severity=eq.critical'
    },
    (payload) => {
      showCriticalAlert(payload.new);
    }
  )
  .subscribe();
```

## 13.5 Escutar Mudanças no Pipeline

```typescript
interface PipelineRecord {
  id: string;
  remote_jid: string;
  push_name: string;
  current_stage: string;
  previous_stage: string;
  stage_changed_at: string;
}

const pipelineChannel = supabase
  .channel('pipeline-changes')
  .on<PipelineRecord>(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'evolution_sales_pipeline'
    },
    (payload) => {
      handlePipelineChange(payload.old, payload.new);
    }
  )
  .subscribe();
```

## 13.6 Escutar por Chat Específico

```typescript
function subscribeToChat(remoteJid: string) {
  return supabase
    .channel(`chat-${remoteJid}`)
    .on<WebhookEventRecord>(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'evolution_webhook_events',
        filter: `remote_jid=eq.${remoteJid}`
      },
      (payload) => {
        handleChatEvent(payload.new);
      }
    )
    .subscribe();
}
```

## 13.7 Cleanup

```typescript
// Ao desmontar componente
function cleanup() {
  supabase.removeChannel(channel);
  supabase.removeChannel(messagesChannel);
  supabase.removeChannel(alertsChannel);
  supabase.removeChannel(pipelineChannel);
}
```

---

# 14. EXEMPLOS DE CÓDIGO FRONTEND

## 14.1 React Hook para Eventos em Tempo Real

```typescript
import { useEffect, useState, useCallback } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabase = createClient(
  'https://allrjhkpuscmgbsnmjlv.supabase.co',
  'YOUR_ANON_KEY'
);

interface WebhookEvent {
  id: string;
  event_type: string;
  remote_jid: string | null;
  from_me: boolean;
  message_type: string | null;
  push_name: string | null;
  payload: any;
  created_at: string;
}

type EventHandler = (event: WebhookEvent) => void;

export function useWebhookEvents(options?: {
  eventTypes?: string[];
  remoteJid?: string;
  onEvent?: EventHandler;
}) {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    // Construir filtro
    let filter: string | undefined;
    if (options?.eventTypes && options.eventTypes.length > 0) {
      filter = `event_type=in.(${options.eventTypes.join(',')})`;
    }
    if (options?.remoteJid) {
      filter = filter 
        ? `${filter},remote_jid=eq.${options.remoteJid}`
        : `remote_jid=eq.${options.remoteJid}`;
    }

    // Criar canal
    const newChannel = supabase
      .channel('webhook-events-' + Math.random())
      .on<WebhookEvent>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'evolution_webhook_events',
          filter
        },
        (payload) => {
          const newEvent = payload.new as WebhookEvent;
          setEvents(prev => [newEvent, ...prev].slice(0, 100)); // Manter últimos 100
          options?.onEvent?.(newEvent);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    setChannel(newChannel);

    return () => {
      supabase.removeChannel(newChannel);
    };
  }, [options?.eventTypes?.join(','), options?.remoteJid]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isConnected, clearEvents };
}
```

## 14.2 Componente de Chat com Tempo Real

```typescript
import React, { useEffect, useState } from 'react';
import { useWebhookEvents } from './useWebhookEvents';

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  status?: string;
}

interface ChatProps {
  remoteJid: string;
}

export function Chat({ remoteJid }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);

  // Escutar eventos do chat específico
  const { events, isConnected } = useWebhookEvents({
    remoteJid,
    eventTypes: ['MESSAGES_UPSERT', 'SEND_MESSAGE', 'MESSAGES_UPDATE', 'PRESENCE_UPDATE'],
    onEvent: (event) => {
      handleEvent(event);
    }
  });

  function handleEvent(event: any) {
    switch (event.event_type) {
      case 'MESSAGES_UPSERT':
      case 'SEND_MESSAGE':
        handleNewMessage(event);
        break;
      case 'MESSAGES_UPDATE':
        handleMessageUpdate(event);
        break;
      case 'PRESENCE_UPDATE':
        handlePresence(event);
        break;
    }
  }

  function handleNewMessage(event: any) {
    const payload = event.payload;
    const message = payload.message || {};
    
    const newMessage: Message = {
      id: payload.key?.id || event.id,
      text: extractText(message),
      fromMe: payload.key?.fromMe || event.from_me,
      timestamp: payload.messageTimestamp || Date.now() / 1000,
      type: payload.messageType || event.message_type || 'unknown',
    };

    setMessages(prev => {
      // Evitar duplicatas
      if (prev.some(m => m.id === newMessage.id)) return prev;
      return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
    });

    // Parar indicador de digitação
    setIsTyping(false);
  }

  function handleMessageUpdate(event: any) {
    const payload = event.payload;
    const update = payload.update || {};
    const key = payload.key;

    if (update.status) {
      setMessages(prev => prev.map(m => 
        m.id === key?.id ? { ...m, status: update.status } : m
      ));
    }
  }

  function handlePresence(event: any) {
    const payload = event.payload;
    
    if (payload.presence === 'composing' || payload.presence === 'recording') {
      setIsTyping(true);
      
      // Auto-reset após 5 segundos
      if (typingTimeout) clearTimeout(typingTimeout);
      setTypingTimeout(setTimeout(() => setIsTyping(false), 5000));
    } else if (payload.presence === 'paused') {
      setIsTyping(false);
    }
  }

  function extractText(message: any): string {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return `📷 ${message.imageMessage.caption}`;
    if (message.imageMessage) return '📷 Imagem';
    if (message.videoMessage?.caption) return `🎥 ${message.videoMessage.caption}`;
    if (message.videoMessage) return '🎥 Vídeo';
    if (message.audioMessage) return message.audioMessage.ptt ? '🎤 Áudio' : '🎵 Áudio';
    if (message.documentMessage) return `📄 ${message.documentMessage.fileName || 'Documento'}`;
    if (message.stickerMessage) return '🎨 Sticker';
    if (message.locationMessage) return '📍 Localização';
    if (message.contactMessage) return `👤 ${message.contactMessage.displayName}`;
    if (message.reactionMessage) return `${message.reactionMessage.text} Reação`;
    return '[Mensagem]';
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <span className={`status ${isConnected ? 'online' : 'offline'}`} />
        {isTyping && <span className="typing">Digitando...</span>}
      </div>
      
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.fromMe ? 'sent' : 'received'}`}>
            <div className="text">{msg.text}</div>
            <div className="meta">
              <span className="time">
                {new Date(msg.timestamp * 1000).toLocaleTimeString()}
              </span>
              {msg.fromMe && msg.status && (
                <span className={`status ${msg.status.toLowerCase()}`}>
                  {getStatusIcon(msg.status)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'PENDING': return '🕐';
    case 'SERVER_ACK': return '✓';
    case 'DELIVERY_ACK': return '✓✓';
    case 'READ': return '✓✓'; // azul no CSS
    case 'PLAYED': return '▶';
    case 'ERROR': return '❌';
    default: return '';
  }
}
```

## 14.3 Hook para Pipeline de Vendas

```typescript
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://allrjhkpuscmgbsnmjlv.supabase.co',
  'YOUR_ANON_KEY'
);

interface PipelineContact {
  id: string;
  remote_jid: string;
  push_name: string;
  current_stage: string;
  previous_stage: string;
  stage_changed_at: string;
  total_messages: number;
}

interface PipelineSummary {
  novo_cliente: number;
  novo_pedido: number;
  pagamento_pendente: number;
  pago: number;
  pedido_finalizado: number;
}

export function usePipeline() {
  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Carregar dados iniciais
  useEffect(() => {
    loadPipeline();
    loadSummary();
  }, []);

  // Escutar mudanças em tempo real
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'evolution_sales_pipeline'
        },
        () => {
          // Recarregar dados quando houver mudança
          loadPipeline();
          loadSummary();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadPipeline() {
    const { data, error } = await supabase
      .from('evolution_sales_pipeline')
      .select('*')
      .order('stage_changed_at', { ascending: false });

    if (!error && data) {
      setContacts(data);
    }
    setLoading(false);
  }

  async function loadSummary() {
    const { data, error } = await supabase
      .from('v_sales_pipeline_summary')
      .select('*');

    if (!error && data) {
      const summaryObj: PipelineSummary = {
        novo_cliente: 0,
        novo_pedido: 0,
        pagamento_pendente: 0,
        pago: 0,
        pedido_finalizado: 0
      };

      data.forEach(row => {
        if (row.current_stage in summaryObj) {
          summaryObj[row.current_stage as keyof PipelineSummary] = row.total;
        }
      });

      setSummary(summaryObj);
    }
  }

  function getContactsByStage(stage: string): PipelineContact[] {
    return contacts.filter(c => c.current_stage === stage);
  }

  return {
    contacts,
    summary,
    loading,
    getContactsByStage,
    refresh: () => { loadPipeline(); loadSummary(); }
  };
}
```

## 14.4 Componente de Alertas

```typescript
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://allrjhkpuscmgbsnmjlv.supabase.co',
  'YOUR_ANON_KEY'
);

interface Alert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    // Carregar alertas iniciais
    loadAlerts();

    // Escutar novos alertas
    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'evolution_alerts'
        },
        (payload) => {
          const newAlert = payload.new as Alert;
          setAlerts(prev => [newAlert, ...prev]);
          
          // Notificação do browser para alertas críticos
          if (newAlert.severity === 'critical') {
            showBrowserNotification(newAlert);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadAlerts() {
    const { data } = await supabase
      .from('evolution_alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setAlerts(data);
  }

  async function acknowledgeAlert(id: string) {
    await supabase
      .from('evolution_alerts')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', id);

    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  function showBrowserNotification(alert: Alert) {
    if (Notification.permission === 'granted') {
      new Notification('⚠️ Alerta WhatsApp', {
        body: alert.message,
        icon: '/whatsapp-icon.png'
      });
    }
  }

  return (
    <div className="alerts-panel">
      <h3>Alertas ({alerts.length})</h3>
      
      {alerts.map(alert => (
        <div 
          key={alert.id} 
          className={`alert alert-${alert.severity}`}
        >
          <div className="alert-icon">
            {alert.severity === 'critical' ? '🚨' : 
             alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
          </div>
          <div className="alert-content">
            <div className="alert-message">{alert.message}</div>
            <div className="alert-time">
              {new Date(alert.created_at).toLocaleString()}
            </div>
          </div>
          <button 
            className="alert-dismiss"
            onClick={() => acknowledgeAlert(alert.id)}
          >
            ✓
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

# 15. TABELA DE REFERÊNCIA RÁPIDA

## 15.1 Eventos por Categoria

| Categoria | Evento | Frequência | Criticidade |
|-----------|--------|:----------:|:-----------:|
| **Mensagens** | MESSAGES_UPSERT | Alta | Normal |
| | MESSAGES_UPDATE | Alta | Normal |
| | MESSAGES_DELETE | Baixa | Normal |
| | MESSAGES_EDITED | Baixa | Normal |
| | SEND_MESSAGE | Média | Normal |
| | SEND_MESSAGE_UPDATE | Média | Normal |
| **Conexão** | CONNECTION_UPDATE | Baixa | 🔴 Alta |
| | QRCODE_UPDATED | Rara | 🟡 Média |
| | LOGOUT_INSTANCE | Rara | 🔴 Alta |
| | STATUS_INSTANCE | Baixa | Normal |
| | APPLICATION_STARTUP | Rara | Normal |
| **Contatos** | CONTACTS_UPSERT | Média | Normal |
| | CONTACTS_UPDATE | Média | Normal |
| **Chats** | CHATS_UPSERT | Média | Normal |
| | CHATS_UPDATE | Média | Normal |
| | CHATS_DELETE | Baixa | Normal |
| **Grupos** | GROUPS_UPSERT | Baixa | Normal |
| | GROUP_UPDATE | Baixa | Normal |
| | GROUP_PARTICIPANTS_UPDATE | Baixa | Normal |
| **Labels** | LABELS_EDIT | Rara | Normal |
| | LABELS_ASSOCIATION | Baixa | Normal |
| **Presença** | PRESENCE_UPDATE | Alta | Normal |
| **Chamadas** | CALL | Baixa | Normal |

## 15.2 Mapa de Tipos de Mensagem

| messageType | Descrição | Campo do Texto |
|-------------|-----------|----------------|
| `conversation` | Texto simples | `message.conversation` |
| `extendedTextMessage` | Texto com link/formatação | `message.extendedTextMessage.text` |
| `imageMessage` | Imagem | `message.imageMessage.caption` |
| `videoMessage` | Vídeo | `message.videoMessage.caption` |
| `audioMessage` | Áudio | `message.audioMessage.ptt` (bool) |
| `documentMessage` | Documento | `message.documentMessage.fileName` |
| `stickerMessage` | Sticker | - |
| `reactionMessage` | Reação | `message.reactionMessage.text` |
| `locationMessage` | Localização | `message.locationMessage.name` |
| `contactMessage` | Contato | `message.contactMessage.displayName` |
| `pollCreationMessage` | Enquete | `message.pollCreationMessage.name` |
| `pollUpdateMessage` | Voto em enquete | - |

## 15.3 Códigos de Cor das Labels

| Color ID | Cor | Hex |
|:--------:|-----|-----|
| 0 | Cinza | `#808080` |
| 1 | Azul Claro | `#64B5F6` |
| 2 | Amarelo | `#FFEB3B` |
| 3 | Verde | `#4CAF50` |
| 5 | Marrom | `#795548` |
| 6 | Rosa | `#E91E63` |
| 7 | Roxo | `#9C27B0` |
| 8 | Laranja | `#FF9800` |
| 11 | Vermelho | `#F44336` |
| 12 | Cinza Escuro | `#607D8B` |
| 18 | Amarelo Escuro | `#FFC107` |

## 15.4 Labels do Pipeline (Promo Brindes)

| Label ID | Nome | Stage Key | Ordem |
|:--------:|------|-----------|:-----:|
| 1 | Novo cliente | `novo_cliente` | 1 |
| 2 | Novo pedido | `novo_pedido` | 2 |
| 3 | Pagamento pendente | `pagamento_pendente` | 3 |
| 4 | Pago | `pago` | 4 |
| 5 | Pedido finalizado | `pedido_finalizado` | 5 |

---

# 📞 SUPORTE

## Recursos Úteis

| Recurso | URL |
|---------|-----|
| MCP Server | https://evolution-mcp.adm01.workers.dev |
| Supabase Dashboard | https://supabase.com/dashboard |
| Evolution API Docs | https://doc.evolution-api.com |

## Credenciais

```
Supabase URL: https://allrjhkpuscmgbsnmjlv.supabase.co
Instance: wpp2
Webhook Secret: promo-brindes-evolution-...
```

---

*Documentação gerada em 13 de Abril de 2026*  
*Evolution API v2.3.7 | Promo Brindes*
