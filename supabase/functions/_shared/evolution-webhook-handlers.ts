// Event handlers: connection, contacts, presence, chats, labels, calls, startup
// Message-specific handlers moved to evolution-webhook-msg-handlers.ts

import {
  isRecord, normalizePhone, toEventRecords,
  getConnectionByInstance, getContactByPhone, persistProfilePicture,
  invalidateConnectionCache,
} from "./evolution-helpers.ts";

// Re-export message handlers for backward compatibility
export {
  handleSendMessage, handleMessagesUpdate, handleMessagesDelete,
  handleMessagesSet, handleMessagesEdited,
} from "./evolution-webhook-msg-handlers.ts";

// deno-lint-ignore no-explicit-any
export async function handleConnectionUpdate(supabase: any, instance: string, baseData: Record<string, unknown>) {
  const status = (baseData.status as string) === 'open' ? 'connected' :
    (baseData.status as string) === 'close' ? 'disconnected' : 'qr_pending';

  const { data: prevConn } = await supabase.from('whatsapp_connections')
    .select('status, phone_number').eq('instance_id', instance).single();

  // Evolution GO envia jid/pushName no Connected — aproveita para preencher
  // o número quando ainda não temos (paridade com o que o v2 preenchia).
  const connectedPhone = status === 'connected' && typeof baseData.jid === 'string'
    ? normalizePhone(baseData.jid) : null;
  await supabase.from('whatsapp_connections')
    .update({
      status, qr_code: null, updated_at: new Date().toISOString(),
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
export async function handleContactsUpsert(supabase: any, instance: string, data: unknown) {
  const contacts = Array.isArray(data) ? data : [data];
  for (const contact of contacts) {
    const contactData = contact as Record<string, unknown>;
    const jid = (contactData.id || contactData.remoteJid) as string;
    if (!jid) continue;

    const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const pushName = contactData.pushName as string || contactData.name as string;
    const profilePicUrl = contactData.profilePictureUrl as string || contactData.imgUrl as string;
    const connection = await getConnectionByInstance(supabase, instance);

    if (connection && pushName) {
      let permanentAvatarUrl: string | null = null;
      if (profilePicUrl && profilePicUrl.includes('pps.whatsapp.net')) {
        permanentAvatarUrl = await persistProfilePicture(supabase, phone, profilePicUrl);
      } else if (profilePicUrl) {
        permanentAvatarUrl = profilePicUrl;
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
export async function handlePresenceUpdate(supabase: any, instance: string, data: unknown) {
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
export async function handleChatsUpdate(supabase: any, instance: string, data: unknown) {
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

// deno-lint-ignore no-explicit-any
export async function handleLabelsEdit(supabase: any, instance: string, data: unknown) {
  const labelData = isRecord(data) ? data : {};
  const labelId = labelData.id as string;
  const labelName = labelData.name as string;
  const labelColor = labelData.color as string;
  const deleted = labelData.deleted as boolean;
  if (!labelId) return;

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  if (deleted) {
    // GO pode mandar delete sem name; casa pelo prefixo estável wa:{id}:
    await supabase.from('tags').delete().ilike('name', `wa:${labelId}:%`);
  } else {
    const tagName = labelName || `Label ${labelId}`;
    const { data: existingTag } = await supabase.from('tags').select('id').ilike('name', `wa:${labelId}:%`).maybeSingle();
    if (existingTag) {
      await supabase.from('tags').update({ name: `wa:${labelId}:${tagName}`, color: labelColor || '#3B82F6' }).eq('id', existingTag.id);
    } else {
      await supabase.from('tags').insert({ name: `wa:${labelId}:${tagName}`, color: labelColor || '#3B82F6' });
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleLabelsAssociation(supabase: any, instance: string, data: unknown) {
  const assocData = isRecord(data) ? data : {};
  const labelId = assocData.labelId as string || (assocData.label as Record<string, unknown>)?.id as string;
  const chatId = assocData.chatId as string;
  const type = assocData.type as string;
  if (!labelId || !chatId) return;

  const phone = chatId.replace('@s.whatsapp.net', '').replace('@g.us', '');
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  const contact = await getContactByPhone(supabase, phone, connection.id);
  const { data: tag } = await supabase.from('tags').select('id').ilike('name', `wa:${labelId}:%`).maybeSingle();

  if (contact && tag) {
    if (type === 'remove') {
      await supabase.from('contact_tags').delete().eq('contact_id', contact.id).eq('tag_id', tag.id);
    } else {
      const { data: existing } = await supabase.from('contact_tags').select('id')
        .eq('contact_id', contact.id).eq('tag_id', tag.id).maybeSingle();
      if (!existing) {
        await supabase.from('contact_tags').insert({ contact_id: contact.id, tag_id: tag.id });
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleCallEvent(supabase: any, instance: string, data: unknown) {
  const callData = isRecord(data) ? data : {};
  const from = callData.from as string;
  const isVideo = callData.isVideo as boolean;
  const callStatus = callData.status as string;
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
      const { data: existing } = await supabase.from('contacts').select('id, avatar_url, assigned_to, name')
        .in('phone', [...new Set(phonesVariants)]).limit(1).maybeSingle();
      if (existing) {
        contact = existing;
        await supabase.from('contacts').update({ whatsapp_connection_id: connection.id, updated_at: new Date().toISOString() }).eq('id', existing.id);
      }
    } else {
      contact = newContact;
    }
  }
  if (!contact) return;

  // calls.status tem CHECK (ringing/answered/ended/missed/busy/failed);
  // o v2 emite nomes fora da lista (offer/reject/timeout…) — mapeia antes.
  const CALL_STATUS_MAP: Record<string, string> = {
    offer: 'ringing', ringing: 'ringing', answered: 'answered', accept: 'answered',
    ended: 'ended', terminate: 'ended', reject: 'missed', timeout: 'missed',
    missed: 'missed', busy: 'busy', failed: 'failed',
  };
  const agentId = contact.assigned_to || null;
  await supabase.from('calls').insert({
    contact_id: contact.id, whatsapp_connection_id: connection.id, agent_id: agentId,
    direction: 'inbound', status: CALL_STATUS_MAP[(callStatus || '').toLowerCase()] ?? 'ringing',
    started_at: new Date().toISOString(),
    notes: isVideo ? 'Chamada de vídeo' : 'Chamada de voz',
  });

  if (agentId) {
    const { data: agentProfile } = await supabase.from('profiles')
      .select('user_id, name').eq('id', agentId).single();
    if (agentProfile?.user_id) {
      await supabase.from('notifications').insert({
        user_id: agentProfile.user_id, type: 'incoming_call',
        title: isVideo ? '📹 Chamada de vídeo recebida' : '📞 Chamada de voz recebida',
        message: `${contact.name || phone} está ligando para você`,
        metadata: { contact_id: contact.id, phone, is_video: isVideo, call_status: callStatus, whatsapp_connection_id: connection.id, agent_profile_id: agentId },
      });
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleChatsDelete(supabase: any, instance: string, data: unknown) {
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
export async function handleApplicationStartup(supabase: any, instance: string) {
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
export async function handleContactsSet(supabase: any, instance: string, data: unknown) {
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
export async function handleChatsSet(supabase: any, instance: string, data: unknown) {
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
