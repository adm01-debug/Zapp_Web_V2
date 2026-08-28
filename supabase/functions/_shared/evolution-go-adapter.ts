// evolution-go-adapter.ts — traduz payloads do Evolution GO (whatsmeow)
// para o formato Evolution API v2 que os handlers existentes esperam.
// Detecção: presença de `instanceName` sem `instance`.
// Payload v2 passa intacto — zero impacto se voltar para Evolution API v2.

import { isRecord } from './evolution-helpers.ts';

const GO_EVENT_MAP: Record<string, string> = {
  // Mensagens
  message: 'messages.upsert',
  sendmessage: 'send.message',           // B2: enviadas pelo celular físico
  // Conexão
  connected: 'connection.update',
  pairsuccess: 'connection.update',
  qrsuccess: 'connection.update',
  loggedout: 'connection.update',
  disconnected: 'connection.update',
  connectfailure: 'connection.update',
  temporaryban: 'connection.update',
  // QR
  qrcode: 'qrcode.updated',
  qrtimeout: 'qrcode.updated',
  // Recibos
  readreceipt: 'messages.update',
  receipt: 'messages.update',
  // Presença
  presence: 'presence.update',
  chatpresence: 'presence.update',
  // Histórico / Contatos
  historysync: 'messages.set',
  contact: 'contacts.upsert',
  pushname: 'contacts.update',           // B4: nome real da GO
  pushnamesetting: 'contacts.update',    // compat
  // Grupos
  groupinfo: 'group.update',
  joinedgroup: 'groups.upsert',
  // Labels
  labeledit: 'labels.edit',
  labelassociation: 'labels.association',
  labelassociationchat: 'labels.association',    // B5
  labelassociationmessage: 'labels.association', // B5
  // Chamadas
  calloffer: 'call',
  calloffernotice: 'call',
  callterminate: 'call',
  callrelaylatency: 'call',
};

const GO_STATE_MAP: Record<string, string> = {
  connected: 'open',
  pairsuccess: 'open',
  qrsuccess: 'open',
  loggedout: 'close',
  disconnected: 'close',
  connectfailure: 'close',
  temporaryban: 'close',
};

export function isGoPayload(payload: unknown): payload is Record<string, unknown> {
  return isRecord(payload) &&
    typeof payload.instanceName === 'string' &&
    typeof payload.instance !== 'string';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

export function translateGoPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const rawEvent = String(payload.event ?? '').toLowerCase();
  const v2Event = GO_EVENT_MAP[rawEvent] ?? rawEvent;
  const data = isRecord(payload.data) ? payload.data : {};
  const info = isRecord(data.Info) ? data.Info : {};

  const out: Record<string, unknown> = {
    event: v2Event,
    instance: payload.instanceName,
    data,
  };

  // B2: SendMessage usa mesma estrutura Info/Message que Message
  if (rawEvent === 'message' || rawEvent === 'sendmessage') {
    const chat = str(info.Chat);
    const sender = str(info.Sender);
    const tsRaw = str(info.Timestamp);
    const ts = tsRaw ? Math.floor(Date.parse(tsRaw) / 1000) : undefined;
    // T2.1d: remover sufixo :device para comparar sender vs chat
    const senderBase = sender?.replace(/:\d+@/, '@');
    out.data = {
      key: {
        id: str(info.ID),
        remoteJid: chat,
        fromMe: info.IsFromMe === true,
        ...(senderBase && chat && senderBase !== chat ? { participant: sender } : {}),
      },
      pushName: str(info.PushName),
      message: isRecord(data.Message) ? data.Message : {},
      ...(ts && Number.isFinite(ts) ? { messageTimestamp: ts } : {}),
      source: 'evolution-go',
    };
  }

  // B3: Receipt → {MessageIDs:[]} → {updates:[{key:{id},status}]}
  if (v2Event === 'messages.update' && (rawEvent === 'receipt' || rawEvent === 'readreceipt')) {
    const rawState = str(payload.state as unknown) ?? str((data as Record<string, unknown>).Type as unknown) ?? '';
    const statusMap: Record<string, string> = {
      read: 'READ', readself: 'DELIVERY_ACK',
      delivered: 'DELIVERY_ACK', delivery_ack: 'DELIVERY_ACK',
    };
    const v2Status = statusMap[rawState.toLowerCase()] ?? 'PLAYED';
    const ids = Array.isArray((data as Record<string, unknown>).MessageIDs)
      ? (data as Record<string, unknown>).MessageIDs as string[] : [];
    const chat = str((data as Record<string, unknown>).Chat as unknown);
    const sender = str((data as Record<string, unknown>).Sender as unknown);
    out.data = { updates: ids.map((id: string) => ({
      key: { id, remoteJid: chat, fromMe: chat === sender }, status: v2Status,
    })) };
  }

  if (v2Event === 'connection.update') {
    const mappedState = GO_STATE_MAP[rawEvent] ?? 'connecting';
    out.data = { ...data, state: mappedState, status: mappedState };
  }

  if (v2Event === 'qrcode.updated') {
    const qr = str(data.qrCodeBase64) ?? str(data.code) ??
      (Array.isArray(data.Codes) ? str(data.Codes[0]) : undefined);
    if (qr) out.data = { qrcode: { base64: qr } };
  }

  // ── Shapes whatsmeow → v2 (o GO serializa o evento inteiro em `data`) ──

  // ChatPresence {Chat, Sender, State: composing|paused} → presence.update {id, status}
  if (rawEvent === 'chatpresence') {
    const state = str(data.State) ?? 'paused';
    const chat = str(data.Chat);
    const sender = str(data.Sender);
    out.data = {
      id: chat,
      status: state,
      ...(sender ? { presences: { [sender]: { lastKnownPresence: state } } } : {}),
    };
  }

  // Presence {From, state top-level online|offline} → presence.update {id, status}
  if (rawEvent === 'presence') {
    out.data = { id: str(data.From), status: str(payload.state as unknown) ?? 'offline' };
  }

  // PushName {JID, NewPushName} → contacts.update {id, pushName}
  if (rawEvent === 'pushname') {
    out.data = { id: str(data.JID), pushName: str(data.NewPushName) };
  }

  // Contact {JID, Action:{fullName|firstName}} → contacts.upsert {id, pushName}
  if (rawEvent === 'contact') {
    const action = isRecord(data.Action) ? data.Action : {};
    out.data = { id: str(data.JID), pushName: str(action.fullName) ?? str(action.firstName) };
  }

  // LabelEdit {LabelID, Action:{name,color,deleted}} → labels.edit {id, name, color, deleted}
  if (rawEvent === 'labeledit') {
    const action = isRecord(data.Action) ? data.Action : {};
    out.data = {
      id: str(data.LabelID),
      name: str(action.name),
      color: action.color,
      deleted: action.deleted === true,
    };
  }

  // LabelAssociationChat/Message {JID, LabelID, Action:{labeled}} →
  // labels.association {labelId, chatId, type}
  if (rawEvent === 'labelassociationchat' || rawEvent === 'labelassociationmessage') {
    const action = isRecord(data.Action) ? data.Action : {};
    out.data = {
      labelId: str(data.LabelID),
      chatId: str(data.JID),
      type: action.labeled === false ? 'remove' : 'add',
      ...(rawEvent === 'labelassociationmessage' ? { messageId: str(data.MessageID) } : {}),
    };
  }

  // CallOffer/CallOfferNotice {From|CallCreator, CallID} → call {from, id, status}.
  // Accept/Terminate/RelayLatency mantêm o data cru (sem `from` v2) — o handler
  // registra chamada/notificação só na oferta, evitando linhas duplicadas.
  if (rawEvent === 'calloffer' || rawEvent === 'calloffernotice') {
    out.data = {
      from: str(data.From) ?? str(data.CallCreator),
      id: str(data.CallID),
      isVideo: false,
      status: 'ringing',
    };
  }

  return out;
}
