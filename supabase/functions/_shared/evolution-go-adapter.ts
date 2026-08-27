// evolution-go-adapter.ts — traduz payloads do Evolution GO (whatsmeow)
// para o formato Evolution API v2 que os handlers existentes esperam.
// Detecção: presença de `instanceName` sem `instance`.
// Payload v2 passa intacto — zero impacto se voltar para Evolution API v2.

import { isRecord } from './evolution-helpers.ts';

const GO_EVENT_MAP: Record<string, string> = {
  message: 'messages.upsert',
  connected: 'connection.update',
  pairsuccess: 'connection.update',
  qrsuccess: 'connection.update',
  loggedout: 'connection.update',
  disconnected: 'connection.update',
  qrcode: 'qrcode.updated',
  qrtimeout: 'qrcode.updated',
  readreceipt: 'messages.update',
  receipt: 'messages.update',
  presence: 'presence.update',
  chatpresence: 'presence.update',
  historysync: 'messages.set',
  contact: 'contacts.upsert',
  pushnamesetting: 'contacts.update',
  groupinfo: 'group.update',
  joinedgroup: 'groups.upsert',
  labeledit: 'labels.edit',
  labelassociation: 'labels.association',
  calloffer: 'call',
};

const GO_STATE_MAP: Record<string, string> = {
  connected: 'open',
  pairsuccess: 'open',
  qrsuccess: 'open',
  loggedout: 'close',
  disconnected: 'close',
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

  if (rawEvent === 'message') {
    const chat = str(info.Chat);
    const sender = str(info.Sender);
    const tsRaw = str(info.Timestamp);
    const ts = tsRaw ? Math.floor(Date.parse(tsRaw) / 1000) : undefined;
    out.data = {
      key: {
        id: str(info.ID),
        remoteJid: chat,
        fromMe: info.IsFromMe === true,
        ...(sender && chat && sender !== chat ? { participant: sender } : {}),
      },
      pushName: str(info.PushName),
      message: isRecord(data.Message) ? data.Message : {},
      ...(ts && Number.isFinite(ts) ? { messageTimestamp: ts } : {}),
      source: 'evolution-go',
    };
  }

  if (v2Event === 'connection.update') {
    // FIX: setar tanto `state` (formato GO) quanto `status` (formato que o handler v2 espera)
    const mappedState = GO_STATE_MAP[rawEvent] ?? 'connecting';
    out.data = { ...data, state: mappedState, status: mappedState };
  }

  if (v2Event === 'qrcode.updated') {
    const qr = str(data.qrCodeBase64) ?? str(data.code) ??
      (Array.isArray(data.Codes) ? str(data.Codes[0]) : undefined);
    if (qr) out.data = { qrcode: { base64: qr } };
  }

  return out;
}
