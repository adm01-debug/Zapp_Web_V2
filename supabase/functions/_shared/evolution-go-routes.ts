// evolution-go-routes.ts — traduz chamadas outbound Evolution API v2 → Evolution GO.
// Ativo quando EVOLUTION_API_FLAVOR != 'v2' (default: go).
// Rotas não mapeadas passam intactas (paths nativos do GO continuam funcionando;
// endpoints v2 sem equivalente no GO retornam 404 do próprio GO — falha explícita).
// Shapes validados contra swagger/doc.json da instância evolution-go-rxj2 e o
// código-fonte evolution-foundation/evolution-go (handlers/structs).

// deno-lint-ignore-file no-explicit-any

export interface GoRoute {
  path: string;
  method: string;
  body?: unknown;
  auth: 'instance' | 'admin';
}

const jidToNumber = (jid?: string): string | undefined =>
  typeof jid === 'string' ? jid.replace(/:\d+(?=@)/, '').replace(/@.*$/, '') : undefined;

// presence v2 ('composing'|'recording'|'paused') → GO {state, isAudio}
const presenceToGo = (presence: unknown, delay?: unknown) => ({
  state: presence === 'recording' ? 'composing' : (presence ?? 'composing'),
  ...(presence === 'recording' ? { isAudio: true } : {}),
  ...(typeof delay === 'number' && delay > 0 ? { delay } : {}),
});

export function translateV2ToGo(fullPath: string, method: string, body: any): GoRoute | null {
  const [path, qs] = fullPath.split('?');
  const q = new URLSearchParams(qs ?? '');
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
      number: b.number, url: b.audio ?? b.media, type: 'audio',
      ...(b.delay ? { delay: b.delay } : {}),
    }};
  }
  if (m(/^\/message\/sendPtv\/[^/]+$/))
    return { path: '/send/media', method: 'POST', auth: 'instance', body: {
      number: b.number, url: b.video, type: 'video',
      ...(b.delay ? { delay: b.delay } : {}),
    }};
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
  if (m(/^\/message\/sendStatus\/[^/]+$/)) {
    const type = b.type ?? (b.content && !/^https?:\/\//.test(String(b.content)) ? 'text' : 'media');
    if (type === 'text')
      return { path: '/send/status/text', method: 'POST', auth: 'instance', body: { text: b.content ?? b.text } };
    return { path: '/send/status/media', method: 'POST', auth: 'instance', body: { url: b.content ?? b.media, type: b.type ?? 'image', ...(b.caption ? { caption: b.caption } : {}) } };
  }
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
  if (m(/^\/message\/update\/[^/]+$/) || m(/^\/chat\/updateMessage\/[^/]+$/))
    return { path: '/message/edit', method: 'POST', auth: 'instance', body: {
      chat: b.key?.remoteJid ?? b.number, message: b.text, messageId: b.key?.id,
    }};
  if (m(/^\/chat\/deleteMessageForEveryone\/[^/]+$/))
    return { path: '/message/delete', method: 'POST', auth: 'instance', body: {
      chat: b.remoteJid, messageId: b.id,
    }};
  if (m(/^\/chat\/markMessageAsRead\/[^/]+$/)) {
    const msgs = Array.isArray(b.readMessages) ? b.readMessages : [];
    return { path: '/message/markread', method: 'POST', auth: 'instance', body: {
      id: msgs.map((x: any) => x?.id).filter(Boolean),
      number: jidToNumber(msgs[0]?.remoteJid),
    }};
  }
  // GO exige o waE2E.Message com os nós de mídia (URL/mediaKey/directPath).
  // Lookup só por key (v2 store) não tem equivalente no GO.
  if (m(/^\/chat\/getBase64FromMediaMessage\/[^/]+$/))
    return { path: '/message/downloadmedia', method: 'POST', auth: 'instance', body: {
      message: b.message?.message ?? b.message,
    }};
  if (m(/^\/chat\/updatePresence\/[^/]+$/) || m(/^\/chat\/sendPresence\/[^/]+$/))
    return { path: '/message/presence', method: 'POST', auth: 'instance', body: {
      number: b.number, ...presenceToGo(b.presence, b.delay),
    }};
  if (m(/^\/chat\/updateBlockStatus\/[^/]+$/))
    return { path: b.status === 'unblock' ? '/user/unblock' : '/user/block', method: 'POST', auth: 'instance', body: { number: b.number } };
  if (m(/^\/chat\/fetchProfilePictureUrl\/[^/]+$/))
    return { path: '/user/avatar', method: 'POST', auth: 'instance', body: { number: b.number, preview: false } };

  // ── Instância ──
  if (m(/^\/instance\/connectionState\/[^/]+$/))
    return { path: '/instance/status', method: 'GET', auth: 'instance' };
  if (m(/^\/instance\/fetchInstances/))
    return { path: '/instance/all', method: 'GET', auth: 'admin' };
  if (m(/^\/instance\/connect\/[^/]+$/))
    return { path: '/instance/connect', method: 'POST', auth: 'instance', body: {} };
  if (m(/^\/instance\/restart\/[^/]+$/))
    return { path: '/instance/reconnect', method: 'POST', auth: 'instance', body: {} };
  if (m(/^\/instance\/logout\/[^/]+$/))
    return { path: '/instance/logout', method: 'DELETE', auth: 'instance' };
  if (m(/^\/instance\/qr(code)?\/[^/]+$/) || m(/^\/instance\/qr$/))
    return { path: '/instance/qr', method: 'GET', auth: 'instance' };

  // ── Verificação de número ──
  if (m(/^\/chat\/whatsappNumbers\/[^/]+$/))
    return { path: '/user/check', method: 'POST', auth: 'instance', body: { number: b.numbers } };

  // ── Grupos ──
  if (m(/^\/group\/create\/[^/]+$/))
    return { path: '/group/create', method: 'POST', auth: 'instance', body: { groupName: b.subject, participants: b.participants } };
  if (m(/^\/group\/fetchAllGroups\/[^/]+$/))
    return { path: '/group/myall', method: 'GET', auth: 'instance' };
  if (m(/^\/group\/findGroupInfos\/[^/]+$/) || m(/^\/group\/participants\/[^/]+$/))
    return { path: '/group/info', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid ?? q.get('groupJid') } };
  if (m(/^\/group\/updateGroupSubject\/[^/]+$/))
    return { path: '/group/name', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid, name: b.subject } };
  if (m(/^\/group\/updateGroupDescription\/[^/]+$/))
    return { path: '/group/description', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid, description: b.description } };
  if (m(/^\/group\/updateParticipant\/[^/]+$/))
    return { path: '/group/participant', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid, action: b.action, participants: b.participants } };
  if (m(/^\/group\/updateSetting\/[^/]+$/))
    return { path: '/group/settings', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid, action: b.action } };
  if (m(/^\/group\/inviteCode\/[^/]+$/))
    return { path: '/group/invitelink', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid ?? q.get('groupJid'), reset: false } };
  if (m(/^\/group\/revokeInviteCode\/[^/]+$/))
    return { path: '/group/invitelink', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid, reset: true } };
  if (m(/^\/group\/acceptInviteCode\/[^/]+$/))
    return { path: '/group/join', method: 'POST', auth: 'instance', body: { code: b.inviteCode ?? q.get('inviteCode') } };
  if (m(/^\/group\/leaveGroup\/[^/]+$/))
    return { path: '/group/leave', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid } };
  if (m(/^\/group\/updateGroupPicture\/[^/]+$/))
    return { path: '/group/photo', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid, image: b.image } };

  // ── Perfil ──
  if (m(/^\/profile\/updateProfilePicture\/[^/]+$/))
    return { path: '/user/profilePicture', method: 'POST', auth: 'instance', body: { image: b.picture } };

  // Não mapeado: passa intacto (paths GO nativos ou endpoints sem equivalente:
  // findChats/findMessages/findContacts, webhook/find|set, markMessageAsUnread,
  // inviteInfo, toggleEphemeral, rabbitmq/sqs/template/business/proxy/evoai/n8n/
  // kafka/nats/pusher, profile/fetchProfile — GO responde 404).
  return null;
}
