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
  // Content-Type alternativo (workaround do jid_validation_middleware do GO,
  // que corrompe arrays em application/json; o handler faz o bind normalmente).
  contentType?: string;
}

// Remove só o sufixo de device (:NN@) preservando o domínio: o ParseJID do GO
// aceita JID completo, e é o único jeito de @g.us/@lid/@broadcast chegarem
// corretos (número puro perde o domínio e corrompe grupos e chats LID).
const jidWithoutDevice = (jid?: string): string | undefined =>
  typeof jid === 'string' ? jid.replace(/:\d+(?=@)/, '') : undefined;


// /user/avatar e /user/info do GO PENDURAM (sem resposta ate o timeout do caller)
// quando number vem sem dominio; com JID completo respondem em ~1s. Validado ao
// vivo em 28/08/2026 na instancia evolution-go-rxj2 (0.7.2).
// LID (identificador interno do WhatsApp) tem >= 14 digitos e so resolve com @lid;
// com @s.whatsapp.net a GO devolve 500 "no profile picture" e a foto se perde.
// Telefone real (BR: 12-13 digitos) usa @s.whatsapp.net. Quem ja tem dominio
// (@lid, @g.us) passa intacto. Confirmado ao vivo em 28/08: mesmo LID => 500 com
// @s.whatsapp.net, 200 com @lid.
const toUserJid = (n?: unknown): string | undefined => {
  if (typeof n !== 'string' || !n) return undefined;
  if (n.includes('@')) return n;
  return /^\d{14,}$/.test(n) ? `${n}@lid` : `${n}@s.whatsapp.net`;
};

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

  // quoted v2 {key:{id, participant}} → GO {messageId, participant}
  const quotedToGo = (quoted: any) =>
    quoted?.key?.id ? { quoted: { messageId: quoted.key.id, participant: quoted.key.participant ?? '' } } : {};

  // ── Mensagens ──
  if (m(/^\/message\/sendText\/[^/]+$/)) {
    return { path: '/send/text', method: 'POST', auth: 'instance', body: {
      number: b.number, text: b.text,
      ...(b.delay ? { delay: b.delay } : {}),
      ...quotedToGo(b.quoted),
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
      ...quotedToGo(b.quoted),
    }};
  }
  if (m(/^\/message\/sendWhatsAppAudio\/[^/]+$/)) {
    return { path: '/send/media', method: 'POST', auth: 'instance', body: {
      number: b.number, url: b.audio ?? b.media, type: 'ptt',
      ...(b.delay ? { delay: b.delay } : {}),
      ...quotedToGo(b.quoted),
    }};
  }
  if (m(/^\/message\/sendPtv\/[^/]+$/))
    // GO tem PTV nativo (nota redonda de vídeo) via type 'ptv' no /send/media
    return { path: '/send/media', method: 'POST', auth: 'instance', body: {
      number: b.number, url: b.video, type: 'ptv',
      ...(b.delay ? { delay: b.delay } : {}),
    }};
  if (m(/^\/message\/sendSticker\/[^/]+$/))
    return { path: '/send/sticker', method: 'POST', auth: 'instance', body: { number: b.number, sticker: b.sticker, ...quotedToGo(b.quoted) } };
  if (m(/^\/message\/sendLocation\/[^/]+$/))
    return { path: '/send/location', method: 'POST', auth: 'instance', body: { number: b.number, name: b.name, address: b.address, latitude: b.latitude, longitude: b.longitude } };
  if (m(/^\/message\/sendContact\/[^/]+$/)) {
    // v2 {contact:[{fullName, organization, phoneNumber|wuid}]} → GO {vcard:{fullName, organization, phone}}
    const c = Array.isArray(b.contact) ? b.contact[0] : b.contact;
    return { path: '/send/contact', method: 'POST', auth: 'instance', body: {
      number: b.number,
      vcard: {
        fullName: c?.fullName ?? c?.name ?? '',
        ...(c?.organization ? { organization: c.organization } : {}),
        phone: c?.phoneNumber ?? c?.wuid ?? c?.phone ?? '',
      },
    }};
  }
  if (m(/^\/message\/sendPoll\/[^/]+$/))
    return { path: '/send/poll', method: 'POST', auth: 'instance', body: {
      number: b.number, question: b.name, maxAnswer: b.selectableCount ?? 1, options: b.values,
    }};
  if (m(/^\/message\/sendList\/[^/]+$/))
    // v2 footer → GO footerText; rows {title, description, rowId} batem.
    // O GO rejeita footer vazio ("footer is required") — v2 tratava como opcional.
    return { path: '/send/list', method: 'POST', auth: 'instance', body: {
      number: b.number, title: b.title, description: b.description,
      buttonText: b.buttonText, sections: b.sections,
      footerText: b.footer || ' ',
      ...(b.delay ? { delay: b.delay } : {}),
    }};
  if (m(/^\/message\/sendButtons\/[^/]+$/))
    return { path: '/send/button', method: 'POST', auth: 'instance', body: {
      ...b, footer: b.footer || ' ',
    }};
  if (m(/^\/message\/sendStatus\/[^/]+$/)) {
    const type = b.type ?? (b.content && !/^https?:\/\//.test(String(b.content)) ? 'text' : 'media');
    if (type === 'text')
      return { path: '/send/status/text', method: 'POST', auth: 'instance', body: { text: b.content ?? b.text } };
    return { path: '/send/status/media', method: 'POST', auth: 'instance', body: { url: b.content ?? b.media, type: b.type ?? 'image', ...(b.caption ? { caption: b.caption } : {}) } };
  }
  if (m(/^\/message\/sendReaction\/[^/]+$/)) {
    if (!b.key?.remoteJid || !b.key?.id) return null;
    return { path: '/message/react', method: 'POST', auth: 'instance', body: {
      number: jidWithoutDevice(b.key.remoteJid), reaction: b.reaction, id: b.key.id,
      fromMe: b.key?.fromMe === true,
      ...(b.key?.participant ? { participant: b.key.participant } : {}),
    }};
  }
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
    if (msgs.length === 0 || !msgs[0]?.remoteJid) return null;
    return { path: '/message/markread', method: 'POST', auth: 'instance', body: {
      id: msgs.map((x: any) => x?.id).filter(Boolean),
      number: jidWithoutDevice(msgs[0].remoteJid),
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
    return { path: '/user/avatar', method: 'POST', auth: 'instance', body: { number: toUserJid(b.number), preview: false } };
  if (m(/^\/(chat|message)\/archiveChat\/[^/]+$/))
    return { path: b.archive === false ? '/chat/unarchive' : '/chat/archive', method: 'POST', auth: 'instance', body: { chat: b.chat ?? b.lastMessage?.key?.remoteJid } };
  if (m(/^\/chat\/findContacts\/[^/]+$/))
    return { path: '/user/contacts', method: 'GET', auth: 'instance' };
  if (m(/^\/chat\/fetchProfile\/[^/]+$/))
    return { path: '/user/info', method: 'POST', auth: 'instance', body: {
      number: (Array.isArray(b.number) ? b.number : [b.number]).map(toUserJid).filter(Boolean),
    }};

  // ── Instância ──
  if (m(/^\/instance\/connectionState\/[^/]+$/))
    return { path: '/instance/status', method: 'GET', auth: 'instance' };
  if (m(/^\/instance\/fetchInstances/))
    return { path: '/instance/all', method: 'GET', auth: 'admin' };
  if (m(/^\/instance\/create$/))
    // v2 {instanceName, integration, qrcode,…} → GO {name, token, instanceId?}.
    // O GO exige token; a edge gera um default (tradutor fica determinístico).
    return { path: '/instance/create', method: 'POST', auth: 'admin', body: {
      name: b.instanceName ?? b.name,
      ...(b.token ? { token: b.token } : {}),
      ...(b.instanceId ? { instanceId: b.instanceId } : {}),
    }};
  if (m(/^\/instance\/connect\/[^/]+$/)) {
    // NUNCA conectar com body vazio: o GO PERSISTE webhook/subscribe do body —
    // {} apaga o webhook da instância e derruba a entrega de eventos (o guard
    // instance.Webhook != "" também bloqueia o WEBHOOK_URL global). Reafirma
    // a configuração a cada connect (auto-reparo).
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
    return { path: '/instance/connect', method: 'POST', auth: 'instance', body: {
      subscribe: ['ALL'], immediate: true,
      ...(supabaseUrl ? { webhookUrl: `${supabaseUrl}/functions/v1/evolution-webhook` } : {}),
    }};
  }
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
    // /group/list = GetJoinedGroups (todos os grupos). /group/myall filtra por
    // dono com JID mutilado e está "TODO: not working" no fonte — retornava vazio.
    return { path: '/group/list', method: 'GET', auth: 'instance' };
  if (m(/^\/group\/findGroupInfos\/[^/]+$/) || m(/^\/group\/participants\/[^/]+$/))
    return { path: '/group/info', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid ?? q.get('groupJid') } };
  if (m(/^\/group\/updateGroupSubject\/[^/]+$/))
    return { path: '/group/name', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid, name: b.subject } };
  if (m(/^\/group\/updateGroupDescription\/[^/]+$/))
    return { path: '/group/description', method: 'POST', auth: 'instance', body: { groupJid: b.groupJid, description: b.description } };
  if (m(/^\/group\/updateParticipant\/[^/]+$/))
    // contentType text/json contorna o jid_validation_middleware do GO, que em
    // application/json zera arrays (participants) e aborta 400; o handler faz
    // ShouldBindBodyWithJSON e aceita normalmente.
    return { path: '/group/participant', method: 'POST', auth: 'instance', contentType: 'text/json', body: { groupJid: b.groupJid, action: b.action, participants: b.participants } };
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
  if (m(/^\/profile\/removeProfilePicture\/[^/]+$/))
    return { path: '/user/profilePicture', method: 'POST', auth: 'instance', body: { image: '' } };
  if (m(/^\/profile\/updateProfileName\/[^/]+$/))
    return { path: '/user/profileName', method: 'POST', auth: 'instance', body: { name: b.name } };
  if (m(/^\/profile\/updateProfileStatus\/[^/]+$/))
    return { path: '/user/profileStatus', method: 'POST', auth: 'instance', body: { status: b.status } };
  if (m(/^\/profile\/fetchProfilePicture\/[^/]+/))
    return { path: '/user/avatar', method: 'POST', auth: 'instance', body: {
      number: toUserJid(b.number ?? q.get('number')), preview: false,
    }};
  if (m(/^\/profile\/fetchBusinessProfile\/[^/]+$/))
    return { path: '/user/info', method: 'POST', auth: 'instance', body: {
      number: (Array.isArray(b.number) ? b.number : [b.number]).map(toUserJid).filter(Boolean),
    }};
  if (m(/^\/profile\/updatePrivacySettings\/[^/]+$/))
    // v2 lowercase → GO camelCase (valores PrivacySetting são os mesmos: all/contacts/none/…)
    return { path: '/user/privacy', method: 'POST', auth: 'instance', body: {
      ...(b.readreceipts ? { readReceipts: b.readreceipts } : {}),
      ...(b.profile ? { profile: b.profile } : {}),
      ...(b.status ? { status: b.status } : {}),
      ...(b.online ? { online: b.online } : {}),
      ...(b.last ? { lastSeen: b.last } : {}),
      ...(b.groupadd ? { groupAdd: b.groupadd } : {}),
      ...(b.calladd ? { callAdd: b.calladd } : {}),
    }};

  // ── Labels ──
  if (m(/^\/label\/findLabels\/[^/]+$/))
    return { path: '/label/list', method: 'GET', auth: 'instance' };
  if (m(/^\/label\/handleLabel\/[^/]+$/)) {
    const raw = String(b.number ?? '');
    const jid = raw.includes('@') ? raw : raw + '@s.whatsapp.net';
    return { path: b.action === 'remove' ? '/unlabel/chat' : '/label/chat', method: 'POST', auth: 'instance', body: {
      jid, labelId: b.labelId,
    }};
  }

  // ── Webhook por instância (D1 do GO_GAPS: reconecta com webhookUrl) ──
  if (m(/^\/webhook\/set\/[^/]+$/)) {
    const url = b.webhook?.url ?? b.url;
    return { path: '/instance/connect', method: 'POST', auth: 'instance', body: {
      ...(url ? { webhookUrl: url } : {}),
      subscribe: ['ALL'],
      immediate: true,
    }};
  }

  // Não mapeado: passa intacto (paths GO nativos ou endpoints v2 sem equivalente:
  // findChats/findMessages, webhook/find, markMessageAsUnread, sendTemplate,
  // instance/setPresence, settings/set|find, inviteInfo, toggleEphemeral, call/offerCall,
  // chatwoot/typebot/openai/dify/flowise/evolutionBot/rabbitmq/sqs/kafka/nats/pusher/
  // template/business/proxy/evoai/n8n — GO responde 404, falha explícita).
  return null;
}
