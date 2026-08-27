// evolution-go-routes.ts — traduz chamadas outbound Evolution API v2 → Evolution GO.
// Ativo quando EVOLUTION_API_FLAVOR != 'v2' (default: go).
// Rotas não mapeadas passam intactas (paths nativos do GO continuam funcionando).

// deno-lint-ignore-file no-explicit-any

export interface GoRoute {
  path: string;
  method: string;
  body?: unknown;
  auth: 'instance' | 'admin';
}

const jidToNumber = (jid?: string): string | undefined =>
  typeof jid === 'string' ? jid.replace(/:\d+(?=@)/, '').replace(/@.*$/, '') : undefined;

export function translateV2ToGo(path: string, method: string, body: any): GoRoute | null {
  const b = (body ?? {}) as Record<string, any>;
  const m = (re: RegExp) => re.test(path);

  // ── Mensagens ──
  if (m(/^\/message\/sendText\/[^/]+$/)) {
    return { path: '/send/text', method: 'POST', auth: 'instance', body: {
      number: b.number, text: b.text,
      ...(b.delay ? { delay: b.delay } : {}),
      ...(b.quoted?.key?.id ? { quoted: { messageId: b.quoted.key.id, participant: b.quoted.key.participant ?? '' } } : {}),
      ...(b.mentionsEveryOne ? { mentionAll: true } : {}),
      ...(Array.isArray(b.mentioned) && b.mentioned.length ? { mentionedJid: b.mentioned } : {}),
    }};
  }
  if (m(/^\/message\/sendMedia\/[^/]+$/)) {
    return { path: '/send/media', method: 'POST', auth: 'instance', body: {
      number: b.number, url: b.media, type: b.mediatype,
      ...(b.caption ? { caption: b.caption } : {}),
      ...(b.fileName ? { filename: b.fileName } : {}),
      ...(b.delay ? { delay: b.delay } : {}),
    }};
  }
  if (m(/^\/message\/sendWhatsAppAudio\/[^/]+$/)) {
    return { path: '/send/media', method: 'POST', auth: 'instance', body: {
      number: b.number, url: b.audio, type: 'audio',
      ...(b.delay ? { delay: b.delay } : {}),
    }};
  }
  if (m(/^\/message\/sendSticker\/[^/]+$/))
    return { path: '/send/sticker', method: 'POST', auth: 'instance', body: { number: b.number, sticker: b.sticker } };
  if (m(/^\/message\/sendLocation\/[^/]+$/))
    return { path: '/send/location', method: 'POST', auth: 'instance', body: { number: b.number, name: b.name, address: b.address, latitude: b.latitude, longitude: b.longitude } };
  if (m(/^\/message\/sendContact\/[^/]+$/))
    return { path: '/send/contact', method: 'POST', auth: 'instance', body: b };
  if (m(/^\/message\/sendPoll\/[^/]+$/))
    return { path: '/send/poll', method: 'POST', auth: 'instance', body: {
      number: b.number, question: b.name, maxAnswer: b.selectableCount ?? 1, options: b.values,
    }};
  if (m(/^\/message\/sendList\/[^/]+$/))
    return { path: '/send/list', method: 'POST', auth: 'instance', body: b };
  if (m(/^\/message\/sendButtons\/[^/]+$/))
    return { path: '/send/button', method: 'POST', auth: 'instance', body: b };
  if (m(/^\/message\/sendReaction\/[^/]+$/))
    return { path: '/message/react', method: 'POST', auth: 'instance', body: {
      number: jidToNumber(b.key?.remoteJid), reaction: b.reaction, id: b.key?.id,
      fromMe: b.key?.fromMe === true,
      ...(b.key?.participant ? { participant: b.key.participant } : {}),
    }};
  if (m(/^\/message\/delete\/[^/]+$/))
    return { path: '/message/delete', method: 'POST', auth: 'instance', body: {
      chat: b.remoteJid, messageId: b.id,
    }};
  if (m(/^\/message\/update\/[^/]+$/))
    return { path: '/message/edit', method: 'POST', auth: 'instance', body: {
      chat: b.key?.remoteJid ?? b.number, message: b.text, messageId: b.key?.id,
    }};
  if (m(/^\/chat\/markMessageAsRead\/[^/]+$/)) {
    const msgs = Array.isArray(b.readMessages) ? b.readMessages : [];
    return { path: '/message/markread', method: 'POST', auth: 'instance', body: {
      id: msgs.map((x: any) => x?.id).filter(Boolean),
      number: jidToNumber(msgs[0]?.remoteJid),
    }};
  }

  // ── Instância ──
  if (m(/^\/instance\/connectionState\/[^/]+$/))
    return { path: '/instance/status', method: 'GET', auth: 'instance' };
  if (m(/^\/instance\/fetchInstances/))
    return { path: '/instance/all', method: 'GET', auth: 'admin' };
  if (m(/^\/instance\/connect\/[^/]+$/))
    return { path: '/instance/connect', method: 'POST', auth: 'instance', body: {} };
  if (m(/^\/instance\/logout\/[^/]+$/))
    return { path: '/instance/logout', method: 'DELETE', auth: 'instance' };
  if (m(/^\/instance\/qr(code)?\/[^/]+$/) || m(/^\/instance\/qr$/))
    return { path: '/instance/qr', method: 'GET', auth: 'instance' };

  // ── Verificação de número ──
  if (m(/^\/chat\/whatsappNumbers\/[^/]+$/))
    return { path: '/user/check', method: 'POST', auth: 'instance', body: { numbers: b.numbers } };

  // Não mapeado: passa intacto (paths GO nativos ou endpoints sem equivalente).
  return null;
}
