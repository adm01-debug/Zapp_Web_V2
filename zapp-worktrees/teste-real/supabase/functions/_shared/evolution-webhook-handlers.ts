// Event handlers: connection, contacts, presence, chats, labels, calls, startup
// Message-specific handlers moved to evolution-webhook-msg-handlers.ts

import {
  isRecord, normalizePhone, toEventRecords,
  getConnectionByInstance, getContactByPhone, persistProfilePicture,
  invalidateConnectionCache,
} from "./evolution-helpers.ts";
import {
  normalizeEvolutionCallVideo,
  normalizeEvolutionCallStatus,
  shouldNotifyIncomingCall,
  direcaoDaChamada,
  deveNotificarChamada,
} from "./notification-events.ts";
import type { EvolutionDbClient } from "./evolution-types.ts";

// Re-export message handlers for backward compatibility
export {
  handleSendMessage, handleMessagesUpdate, handleMessagesDelete,
  handleMessagesSet, handleMessagesEdited,
} from "./evolution-webhook-msg-handlers.ts";

// deno-lint-ignore no-explicit-any
export async function handleConnectionUpdate(supabase: EvolutionDbClient, instance: string, baseData: Record<string, unknown>) {
  const rawState = (baseData.status ?? baseData.state) as string;
  const incoming = rawState === 'open' ? 'connected' :
    rawState === 'close' ? 'disconnected' :
    rawState === 'connecting' ? 'connecting' : 'qr_pending';

  const { data: prevConn } = await supabase.from('whatsapp_connections')
    .select('status, phone_number').eq('instance_id', instance).single();

  // 'connecting' transitório: não sobrescrever 'connected' (próximo 'close' perderia alerta).
  // 'disconnected' durante QR ativo: GO emite close por soluço de rede; QR ainda é válido.
  // Expiração real do QR chega via qrcode.updated com qrCode=null → W11 transiciona corretamente.
  // P2: apenas eventos transientes preservam qr_pending — motivos terminais (logout, ban,
  // falha de auth) devem transicionar para disconnected. O campo disconnect_reason é injetado
  // pelo evolution-go-adapter (GO) ou enviado nativamente pelo Evolution API v2.
  const TERMINAL_DISCONNECT_REASONS: ReadonlySet<string> = new Set([
    'loggedOut', 'Banned', 'TempBanned', 'connectFailure',
    'unauthorized_403', 'replaced', 'Replaced',
    'streamReplaced', 'StreamReplaced',
    '401', '403', '405',
  ]);
  const disconnectReason = typeof baseData.disconnect_reason === 'string'
    ? baseData.disconnect_reason
    : typeof baseData.reason === 'string' ? baseData.reason
    : (typeof baseData.statusReason === 'number' || typeof baseData.statusReason === 'string')
      ? String(baseData.statusReason) : '';
  const preserveQrPending = incoming === 'disconnected'
    && prevConn?.status === 'qr_pending'
    && !TERMINAL_DISCONNECT_REASONS.has(disconnectReason);
  const status = incoming === 'connecting' && prevConn?.status === 'connected'
    ? 'connected'
    : preserveQrPending
      ? 'qr_pending'
      : incoming;

  // Evolution GO envia jid/pushName no Connected — aproveita para preencher
  // o número quando ainda não temos (paridade com o que o v2 preenchia).
  const connectedPhone = status === 'connected' && typeof baseData.jid === 'string'
    ? normalizePhone(baseData.jid) : null;
  await supabase.from('whatsapp_connections')
    .update({
      status,
      // Não zera o QR enquanto status permanece qr_pending (QR ativo protegido)
      ...(status !== 'qr_pending' ? { qr_code: null } : {}),
      updated_at: new Date().toISOString(),
      ...(connectedPhone && !prevConn?.phone_number ? { phone_number: connectedPhone } : {}),
    })
    .eq('instance_id', instance);

  // Invalidate cache so next message processing fetches fresh connection data.
  // This is the correct invalidation point: after every status change.
  invalidateConnectionCache(instance);

  console.log(`Connection ${instance} status: ${status}`);

  if (status === 'disconnected' && prevConn?.status === 'connected') {
    const phone = prevConn.phone_number ? ` (${prevConn.phone_number})` : '';
    await supabase.from('warroom_alerts').insert({
      alert_type: 'critical',
      title: `🔴 Conexão ${instance} desconectou`,
      message: `A instância ${instance}${phone} perdeu conexão com o WhatsApp. Reconecte imediatamente para evitar perda de mensagens.`,
      source: 'evolution-webhook',
    });
  }

  // F60 (gatilho): motivo TERMINAL nao e soluço de rede — a instancia esta fora e nao volta
  // sozinha. Pausa todos os dispatches ativos da conexao (a funcao decide; aqui so
  // reportamos o sinal). O mapeamento e EXPLICITO: casar por nome parecido entre o
  // vocabulario do Evolution e o da funcao seria o jeito de o gatilho nunca disparar.
  if (status === 'disconnected' && TERMINAL_DISCONNECT_REASONS.has(disconnectReason)) {
    const signalByReason: Record<string, string> = {
      Banned: 'banned',
      TempBanned: 'TemporaryBan',
      connectFailure: 'ConnectFailure',
    };
    const { data: riskConn } = await supabase.from('whatsapp_connections')
      .select('id').eq('instance_id', instance).maybeSingle();
    if (riskConn?.id) {
      const { error: riskError } = await supabase.rpc('register_multiplix_connection_failure', {
        p_connection_id: riskConn.id,
        p_signal: signalByReason[disconnectReason] ?? 'connection_lost',
        p_error_class: 'permanent',
      });
      if (riskError) console.error(`multiplix_connection_risk_failed: ${riskError.message}`);
    }
  }

  if (status === 'connected' && prevConn?.status !== 'connected') {
    await supabase.from('warroom_alerts').insert({
      alert_type: 'info',
      title: `🟢 Conexão ${instance} restaurada`,
      message: `A instância ${instance} reconectou com sucesso ao WhatsApp.`,
      source: 'evolution-webhook',
    });
  }
}

// deno-lint-ignore no-explicit-any
export async function handleContactsUpsert(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const contacts = Array.isArray(data) ? data : [data];
  for (const contact of contacts) {
    const contactData = contact as Record<string, unknown>;
    const jid = (contactData.id || contactData.remoteJid) as string;
    if (!jid) continue;

    if (jid.endsWith('@lid')) continue; // @lid JIDs have no real phone number
    const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const pushName = contactData.pushName as string || contactData.name as string;
    const profilePicUrl = contactData.profilePictureUrl as string || contactData.imgUrl as string;
    const connection = await getConnectionByInstance(supabase, instance);

    if (connection && pushName) {
      let permanentAvatarUrl: string | null = null;
      if (typeof profilePicUrl === 'string' && profilePicUrl) {
        // Comparacao por hostname para nao cair em bypass de path
        // (e.g. evil.com/pps.whatsapp.net/...). URL invalida e descartada: o
        // catch antes devolvia '' e o else gravava o valor malformado.
        try {
          const picHost = new URL(profilePicUrl).hostname.toLowerCase();
          permanentAvatarUrl = picHost === 'pps.whatsapp.net'
            ? await persistProfilePicture(supabase, phone, profilePicUrl)
            : profilePicUrl;
        } catch {
          permanentAvatarUrl = null;
        }
      }

      const existing = await getContactByPhone(supabase, phone, connection.id);
      if (existing) {
        const updateData: Record<string, unknown> = { name: pushName, updated_at: new Date().toISOString() };
        if (permanentAvatarUrl) updateData.avatar_url = permanentAvatarUrl;
        await supabase.from('contacts').update(updateData).eq('id', existing.id);
      } else {
        const { error: insertErr } = await supabase.from('contacts').insert({
          phone, name: pushName, avatar_url: permanentAvatarUrl || null, whatsapp_connection_id: connection.id,
        });
        if (insertErr && insertErr.code === '23505') {
          await supabase.from('contacts').update({
            name: pushName, avatar_url: permanentAvatarUrl || null,
            whatsapp_connection_id: connection.id, updated_at: new Date().toISOString(),
          }).eq('phone', phone);
        }
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handlePresenceUpdate(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const presenceData = isRecord(data) ? data : {};
  const jid = (presenceData.id as string) || (presenceData.remoteJid as string);
  const presences = presenceData.presences as Record<string, Record<string, unknown>> | undefined;

  if (jid && !jid.endsWith('@g.us')) {
    let isComposing = false;
    if (presences) {
      for (const [, pState] of Object.entries(presences)) {
        if (pState?.lastKnownPresence === 'composing' || pState?.status === 'composing') { isComposing = true; break; }
      }
    } else {
      const directStatus = presenceData.status as string || presenceData.lastKnownPresence as string;
      isComposing = directStatus === 'composing';
    }

    const phone = normalizePhone(jid);
    if (phone) {
      const connection = await getConnectionByInstance(supabase, instance);
      if (connection) {
        const contact = await getContactByPhone(supabase, phone, connection.id);
        if (contact) {
          const channel = supabase.channel(`typing:${contact.id}`);
          await channel.send({ type: 'broadcast', event: 'contact_typing', payload: { isTyping: isComposing, contactId: contact.id, timestamp: new Date().toISOString() } });
          supabase.removeChannel(channel);
        }
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleChatsUpdate(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const chats = Array.isArray(data) ? data : [data];
  for (const chat of chats) {
    const chatData = chat as Record<string, unknown>;
    const jid = chatData.id as string;
    if (!jid || jid.endsWith('@g.us')) continue;

    const phone = jid.replace('@s.whatsapp.net', '');
    const unreadCount = chatData.unreadCount as number;

    if (unreadCount !== undefined) {
      const connection = await getConnectionByInstance(supabase, instance);
      if (connection) {
        const contact = await getContactByPhone(supabase, phone, connection.id);
        if (contact && unreadCount === 0) {
          await supabase.from('messages').update({ is_read: true })
            .eq('contact_id', contact.id).eq('sender', 'contact').eq('is_read', false);
        }
      }
    }
  }
}

export async function handleLabelsEdit(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const labelData = isRecord(data) ? data : {};
  const labelId = labelData.id as string;
  const labelName = labelData.name as string;
  const deleted = labelData.deleted as boolean;
  if (!labelId) return;

  // O id de label é por instância (cada conta renumera de 0..N). Sem escopo, o
  // prefixo wa:<id>: renomearia/apagaria o label homônimo de OUTRAS conexões.
  // Resolve a conexão pela instância; sem conexão, não há contatos para tocar.
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  const prefix = `wa:${labelId}:`;
  if (deleted) {
    await supabase.rpc('remove_wa_label_from_all_contacts', { p_connection_id: connection.id, p_label_prefix: prefix });
  } else {
    const tagName = `wa:${labelId}:${labelName || `Label ${labelId}`}`;
    await supabase.rpc('rename_wa_label_on_all_contacts', { p_connection_id: connection.id, p_label_prefix: prefix, p_new_tag: tagName });
  }
}

// deno-lint-ignore no-explicit-any
export async function handleLabelsAssociation(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const assocData = isRecord(data) ? data : {};
  const labelId = assocData.labelId as string || (assocData.label as Record<string, unknown>)?.id as string;
  const chatId = assocData.chatId as string;
  const type = assocData.type as string;
  if (!labelId || !chatId) return;

  const phone = chatId.replace('@s.whatsapp.net', '').replace('@g.us', '');
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  const contact = await getContactByPhone(supabase, phone, connection.id);
  if (!contact) return;

  const prefix = `wa:${labelId}:`;
  if (type === 'remove') {
    await supabase.rpc('remove_wa_tag_by_prefix', { p_contact_id: contact.id, p_prefix: prefix });
  } else {
    const labelName = (assocData.label as Record<string, unknown>)?.name as string || `Label ${labelId}`;
    const tagValue = `wa:${labelId}:${labelName}`;
    await supabase.rpc('add_wa_tag_if_not_exists', { p_contact_id: contact.id, p_prefix: prefix, p_tag: tagValue });
  }
}

// deno-lint-ignore no-explicit-any
export async function handleCallEvent(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const callData = isRecord(data) ? data : {};
  const from = callData.from as string;
  const isVideo = normalizeEvolutionCallVideo(callData.isVideo);
  const callStatus = typeof callData.status === 'string' ? callData.status : '';
  // T25: direcao pelo payload (`fromMe`/`isOutgoing`). A RPC `record_incoming_call_event`
  // ainda grava 'inbound' fixo; persistir a direcao depende do T26 (migration propria).
  const direcao = direcaoDaChamada(callData);
  if (!from) return;

  const phone = from.replace('@s.whatsapp.net', '');
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  let contact = await getContactByPhone(supabase, phone, connection.id);
  if (!contact) {
    const { data: newContact, error: insertErr } = await supabase.from('contacts')
      .insert({ phone, name: phone, whatsapp_connection_id: connection.id })
      .select('id, avatar_url, assigned_to, name').single();
    if (insertErr && insertErr.code === '23505') {
      const phonesVariants = [phone, `+${phone}`, phone.replace(/^\+/, '')];
      const { data: existing, error: existingError } = await supabase.from('contacts').select('id, avatar_url, assigned_to, name')
        .in('phone', [...new Set(phonesVariants)]).limit(1).maybeSingle();
      if (existingError) throw new Error('Unable to recover concurrent call contact');
      if (existing) {
        contact = existing as NonNullable<typeof contact>;
        const { error: updateError } = await supabase.from('contacts')
          .update({ whatsapp_connection_id: connection.id, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (updateError) throw new Error('Unable to associate concurrent call contact');
      }
    } else if (insertErr) {
      throw new Error('Unable to persist incoming call contact');
    } else {
      contact = newContact as NonNullable<typeof contact>;
    }
  }
  if (!contact) throw new Error('Unable to resolve incoming call contact');

  // calls.status tem CHECK (ringing/answered/ended/missed/busy/failed).
  // O Evolution emite nomes fora da lista; normalize antes de persistir.
  const normalizedStatus = normalizeEvolutionCallStatus(callStatus);
  const rawEventId = callData.id ?? callData.callId ?? callData.call_id;
  const eventId = typeof rawEventId === 'string' && rawEventId.length <= 200 ? rawEventId : null;
  const { error: persistError } = await supabase.rpc('record_incoming_call_event', {
    p_contact_id: contact.id,
    p_whatsapp_connection_id: connection.id,
    p_status: normalizedStatus,
    p_is_video: isVideo,
    p_provider_event_id: eventId,
    p_should_notify: deveNotificarChamada(callStatus, direcao),
    // T26: a RPC passou a receber a direcao; sem ela gravava 'inbound' fixo.
    p_direction: direcao,
  });
  if (persistError) throw new Error('Unable to persist incoming call event');
}

// deno-lint-ignore no-explicit-any
export async function handleChatsDelete(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const chats = Array.isArray(data) ? data : [data];
  for (const chat of chats) {
    const chatData = isRecord(chat) ? chat : {};
    const jid = (chatData.id as string) || (chatData.remoteJid as string);
    if (!jid || jid.endsWith('@g.us')) continue;
    const phone = normalizePhone(jid);
    if (!phone) continue;
    const connection = await getConnectionByInstance(supabase, instance);
    if (!connection) continue;
    const contact = await getContactByPhone(supabase, phone, connection.id);
    if (contact) {
      const now = new Date().toISOString();
      await supabase.from('messages')
        .update({ is_deleted: true, status: 'deleted', status_updated_at: now })
        .eq('contact_id', contact.id);
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleApplicationStartup(supabase: EvolutionDbClient, instance: string) {
  console.log(`Application startup event from instance: ${instance}`);
  // Also invalidate cache on startup so stale connection data is refreshed.
  invalidateConnectionCache(instance);
  const { data: conn } = await supabase.from('whatsapp_connections')
    .select('id, status').eq('instance_id', instance).maybeSingle();
  if (conn && conn.status === 'disconnected') {
    await supabase.from('whatsapp_connections')
      .update({ status: 'qr_pending', updated_at: new Date().toISOString() }).eq('id', conn.id);
  }
}

// deno-lint-ignore no-explicit-any
export async function handleContactsSet(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const contacts = toEventRecords(data, ['contacts']);
  if (contacts.length === 0) return;

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  let synced = 0, skipped = 0;
  for (const contactData of contacts) {
    const jid = (contactData.id as string) || (contactData.remoteJid as string);
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) { skipped++; continue; }
    const phone = normalizePhone(jid);
    if (!phone) { skipped++; continue; }
    const pushName = (contactData.pushName as string) || (contactData.name as string) || (contactData.notify as string);
    if (!pushName) { skipped++; continue; }
    const existing = await getContactByPhone(supabase, phone, connection.id);
    if (existing) { skipped++; continue; }

    const { error: insertErr } = await supabase.from('contacts').insert({ phone, name: pushName, whatsapp_connection_id: connection.id });
    if (insertErr && insertErr.code === '23505') { skipped++; continue; }
    if (insertErr) { skipped++; continue; }
    synced++;
  }
  console.log(`contacts.set: synced ${synced}, skipped ${skipped} for ${instance}`);
}

// deno-lint-ignore no-explicit-any
export async function handleChatsSet(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const chats = toEventRecords(data, ['chats']);
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection || chats.length === 0) return;

  let processed = 0;
  for (const chat of chats) {
    const jid = chat.id as string;
    if (!jid || jid.endsWith('@g.us')) continue;
    const phone = normalizePhone(jid);
    if (!phone) continue;
    const unreadCount = chat.unreadCount as number;
    if (unreadCount === 0) {
      const contact = await getContactByPhone(supabase, phone, connection.id);
      if (contact) {
        await supabase.from('messages').update({ is_read: true })
          .eq('contact_id', contact.id).eq('sender', 'contact').eq('is_read', false);
        processed++;
      }
    }
  }
  console.log(`chats.set: processed ${processed} of ${chats.length} for ${instance}`);
}
