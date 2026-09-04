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

// waCommon.MessageKey serializa ID/remoteJID/fromMe (tags do pb.go) — os handlers
// v2 leem id/remoteJid. Normaliza no lugar, preservando o que já estiver correto.
function normalizeWaKey(k: unknown): Record<string, unknown> | undefined {
  if (!isRecord(k)) return undefined;
  const fromMe = typeof k.fromMe === 'boolean' ? k.fromMe : typeof k.FromMe === 'boolean' ? k.FromMe : undefined;
  return {
    ...k,
    id: str(k.id) ?? str(k.ID),
    remoteJid: str(k.remoteJid) ?? str(k.remoteJID),
    ...(typeof fromMe === 'boolean' ? { fromMe } : {}),
    ...(str(k.participant) ? { participant: str(k.participant) } : {}),
  };
}

// Paleta oficial das 20 cores de label do WhatsApp (índice → hex).
// LabelEdit.Action.color é o índice numérico; tags.color espera hex.
const WA_LABEL_COLORS = [
  '#FF9485', '#64C4FF', '#FFD429', '#DFAEF0', '#99B6C1',
  '#55CCB3', '#D3A91D', '#6D7CCE', '#D98ADC', '#00D0E2',
  '#FFC5C7', '#93CEAC', '#F74848', '#00A0F2', '#83E422',
  '#FFAF04', '#B5EBFF', '#9BA6FF', '#9368CF', '#D6A700',
];

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
    const msgNode = isRecord(data.Message) ? data.Message : {};
    const key = {
      id: str(info.ID),
      remoteJid: chat,
      fromMe: info.IsFromMe === true,
      ...(senderBase && chat && senderBase !== chat ? { participant: sender } : {}),
    };

    // Edit/revoke chegam como Message com protocolMessage (waE2E); o pb.go
    // serializa a key como ID/remoteJID e o type como número (REVOKE=0,
    // MESSAGE_EDIT=14). Roteia para os eventos v2 corretos em vez de deixar
    // virar uma linha vazia em messages.upsert.
    const pm = isRecord(msgNode.protocolMessage) ? msgNode.protocolMessage : undefined;
    if (pm) {
      const pmKey = normalizeWaKey(pm.key);
      const pmType = pm.type;
      const isEdit = pmType === 14 || pmType === 'MESSAGE_EDIT' || isRecord(pm.editedMessage);
      const isRevoke = pmType === 0 || pmType === 'REVOKE';
      if (isEdit && pmKey?.id) {
        out.event = 'messages.edited';
        out.data = { key: pmKey, message: isRecord(pm.editedMessage) ? pm.editedMessage : {} };
        return out;
      }
      if (isRevoke && pmKey?.id) {
        out.event = 'messages.delete';
        out.data = { key: pmKey };
        return out;
      }
      // Outros protocolMessage (ephemeral, app-state etc.): sem handler, sem fantasma.
      out.event = 'protocol.message';
      out.data = { key, protocolType: pmType };
      return out;
    }

    // waCommon.MessageKey dentro de reactionMessage usa ID/remoteJID — os
    // handlers de reação leem key.id; normaliza no nó antes de repassar.
    if (isRecord(msgNode.reactionMessage)) {
      const rm = msgNode.reactionMessage as Record<string, unknown>;
      msgNode.reactionMessage = { ...rm, key: normalizeWaKey(rm.key) ?? rm.key };
    }

    out.data = {
      key,
      pushName: str(info.PushName),
      message: msgNode,
      // WEBHOOKFILES=true: o GO injeta o binário/base64 e a URL do MinIO
      // dentro do nó Message — sobe para o topo no formato v2 (data.base64/
      // data.mediaUrl) para o pipeline de mídia usar sem novo download.
      ...(str(msgNode.base64) ? { base64: msgNode.base64 } : {}),
      ...(str(msgNode.mediaUrl) ? { mediaUrl: msgNode.mediaUrl } : {}),
      ...(ts && Number.isFinite(ts) ? { messageTimestamp: ts } : {}),
      source: 'evolution-go',
    };
  }

  // B3: Receipt → {MessageIDs:[]} → {updates:[{key:{id},status}]}
  if (v2Event === 'messages.update' && (rawEvent === 'receipt' || rawEvent === 'readreceipt')) {
    const rawState = str(payload.state as unknown) ?? str((data as Record<string, unknown>).Type as unknown) ?? '';
    const statusMap: Record<string, string> = {
      read: 'READ', readself: 'READ',
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
    // Shape real do GO (whatsmeow.go:758-765): {qrcode: dataURI, code: "2@…"}.
    // data.code é a string de pareamento, NÃO imagem — nunca usar como base64.
    const qr = str(data.qrcode) ?? str(data.qrCodeBase64) ??
      (Array.isArray(data.Codes) ? str(data.Codes[0]) : undefined);
    if (qr) out.data = { qrcode: { base64: qr } };
    else out.data = {}; // QRTimeout: sem QR novo — o handler limpa o QR vencido
  }

  // ── Shapes whatsmeow → v2 (o GO serializa o evento inteiro em `data`) ──

  // HistorySync {Data:{conversations:[{id, messages:[{message: WebMessageInfo}]}]}}
  // → messages.set {messages:[{key, message, messageTimestamp, pushName}]}.
  // Keys do WebMessageInfo vêm do pb.go (ID/remoteJID) — normalizadas; campos
  // aceitos nas duas grafias porque o :latest pode variar. Cap de 500 mensagens
  // por evento para a function não estourar tempo (GO pagina o restante).
  if (rawEvent === 'historysync') {
    const sync = isRecord(data.Data) ? data.Data : data;
    const conversations = (Array.isArray(sync.conversations) ? sync.conversations
      : Array.isArray(sync.Conversations) ? sync.Conversations : []) as unknown[];
    const messages: Record<string, unknown>[] = [];
    for (const convRaw of conversations) {
      if (!isRecord(convRaw)) continue;
      const convJid = str(convRaw.id) ?? str(convRaw.ID);
      const items = (Array.isArray(convRaw.messages) ? convRaw.messages : []) as unknown[];
      for (const itemRaw of items) {
        if (messages.length >= 500) break;
        if (!isRecord(itemRaw)) continue;
        const wmi = isRecord(itemRaw.message) ? itemRaw.message : itemRaw;
        const key = normalizeWaKey(wmi.key);
        if (!key?.id) continue;
        if (!key.remoteJid && convJid) key.remoteJid = convJid;
        const tsRaw2 = wmi.messageTimestamp;
        const tsNum = typeof tsRaw2 === 'number' ? tsRaw2 : Number(tsRaw2);
        messages.push({
          key,
          message: isRecord(wmi.message) ? wmi.message : {},
          ...(Number.isFinite(tsNum) && tsNum > 0 ? { messageTimestamp: tsNum } : {}),
          ...(str(wmi.pushName) ? { pushName: wmi.pushName } : {}),
        });
      }
      if (messages.length >= 500) break;
    }
    out.data = { messages };
  }

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
    const colorIdx = typeof action.color === 'number' ? action.color : undefined;
    out.data = {
      id: str(data.LabelID),
      name: str(action.name),
      // v2 mandava hex; o GO manda o índice da paleta do WhatsApp
      color: str(action.color) ?? (colorIdx !== undefined ? WA_LABEL_COLORS[colorIdx] : undefined),
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
