// Message-related webhook handlers: send, update, delete, set, edited

import {
  isRecord, normalizePhone, resolveEventJid, toEventRecords, shouldUpdateStatus,
  getConnectionByInstance, getContactByPhone,
} from "./evolution-helpers.ts";
import type { EvolutionDbClient } from "./evolution-types.ts";

// deno-lint-ignore no-explicit-any
export async function handleSendMessage(supabase: EvolutionDbClient, instance: string, data: unknown, baseData: Record<string, unknown>) {
  // Hoisted: mesmo instance em toda a chamada, evita refetch por entry e
  // permite escopar o dup-check abaixo por whatsapp_connection_id.
  const connection = await getConnectionByInstance(supabase, instance);

  // R2-API-004: sem conexão resolvida não há escopo por
  // whatsapp_connection_id — e sem ele o dup-check abaixo casa por
  // external_id/sender GLOBALMENTE, promovendo a 'sent' a mensagem de outra
  // conexão. Falha de lookup ou instância sem conexão: não muta nada.
  if (!connection?.id) {
    console.warn(`send.message ignored -- instance ${instance} has no resolved connection`);
    return;
  }

  for (const entry of toEventRecords(data, ['messages'])) {
    const keySource = isRecord(entry.key) ? entry.key : isRecord(baseData.key) ? baseData.key : null;
    const key = keySource as { remoteJid?: string; fromMe?: boolean; id?: string } | null;
    const externalId = key?.id;
    if (!externalId) continue;

    let updatedMessageId: string | null = null;
    const now = new Date().toISOString();

    // Use order+limit(1) so concurrent duplicates don't throw on maybeSingle.
    // Escopado por whatsapp_connection_id + sender para bater com o indice unico
    // real (ux_messages_dedup) -- sem isso, uma colisao de external_id entre duas
    // conexoes (ou entre as duas direcoes da conversa) faria este pre-check achar
    // a linha errada e marcar a mensagem do contato como 'sent'.
    let dupCheckQuery = supabase.from('messages')
      .select('id, status').eq('external_id', externalId).eq('sender', 'agent');
    if (connection?.id) dupCheckQuery = dupCheckQuery.eq('whatsapp_connection_id', connection.id);
    const { data: existingMessage } = await dupCheckQuery
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (existingMessage?.id) {
      if (shouldUpdateStatus(existingMessage.status as string | null, 'sent')) {
        await supabase.from('messages')
          .update({ status: 'sent', external_id: externalId, status_updated_at: now })
          .eq('id', existingMessage.id);
      }
      updatedMessageId = existingMessage.id as string;
    }

    if (!updatedMessageId) {
      const phone = normalizePhone(resolveEventJid(key, entry, baseData) ?? undefined);

      if (connection?.id && phone) {
        const contact = await getContactByPhone(supabase, phone, connection.id);
        if (contact?.id) {
          const msgPayload = entry.message || baseData.message;
          let webhookMsgType = 'text';
          if (isRecord(msgPayload)) {
            if (msgPayload.imageMessage) webhookMsgType = 'image';
            else if (msgPayload.videoMessage) webhookMsgType = 'video';
            else if (msgPayload.audioMessage) webhookMsgType = 'audio';
            else if (msgPayload.documentMessage || msgPayload.documentWithCaptionMessage) webhookMsgType = 'document';
            else if (msgPayload.stickerMessage) webhookMsgType = 'sticker';
          }

          const recentCutoff = new Date(Date.now() - 300_000).toISOString();
          const { data: pendingMessage } = await supabase.from('messages')
            .select('id').eq('contact_id', contact.id).eq('sender', 'agent')
            .eq('message_type', webhookMsgType).is('external_id', null)
            .gte('created_at', recentCutoff).order('created_at', { ascending: true })
            .limit(1).maybeSingle();

          if (pendingMessage?.id) {
            await supabase.from('messages')
              .update({ status: 'sent', external_id: externalId, status_updated_at: now })
              .eq('id', pendingMessage.id);
            updatedMessageId = pendingMessage.id as string;
          }
        }
      }
    }

    console.log(`Outgoing message confirmed: ${externalId}${updatedMessageId ? ` (message ${updatedMessageId})` : ' (no local match found)'}`);
  }
}

// deno-lint-ignore no-explicit-any
export async function handleMessagesUpdate(supabase: EvolutionDbClient, instance: string, data: unknown, baseData: Record<string, unknown>) {
  const statusMap: Record<string, string> = {
    'DELIVERY_ACK': 'delivered', 'READ': 'read', 'PLAYED': 'read', 'SERVER_ACK': 'sent', 'ERROR': 'failed',
  };
  const connection = await getConnectionByInstance(supabase, instance);

  // R2-API-004: o lookup por external_id abaixo só é escopado por conexão
  // quando ela existe; sem escopo, um recibo atingiria a linha homônima de
  // outra conexão. Fail-closed: sem conexão resolvida, não muta.
  if (!connection?.id) {
    console.warn(`messages.update ignored -- instance ${instance} has no resolved connection`);
    return;
  }

  for (const entry of toEventRecords(data, ['messages', 'updates', 'statuses'])) {
    const keySource = isRecord(entry.key) ? entry.key : isRecord(baseData.key) ? baseData.key : null;
    const key = keySource as { id?: string; fromMe?: boolean } | null;
    const rawStatus = (entry.status as string) || (baseData.status as string) || '';
    const newStatus = statusMap[rawStatus] || rawStatus.toLowerCase();

    if (newStatus && key?.id) {
      const now = new Date().toISOString();
      // Use order+limit(1) so concurrent duplicates don't throw on maybeSingle.
      // Esta funcao trata receipts das duas direcoes, entao o sender vem de
      // key.fromMe quando o provedor manda o flag; sem ele, cai no
      // comportamento antigo (linha mais recente da conexao).
      let currentMessageQuery = supabase.from('messages')
        .select('id, status, sender').eq('external_id', key.id);
      if (connection?.id) currentMessageQuery = currentMessageQuery.eq('whatsapp_connection_id', connection.id);
      if (typeof key.fromMe === 'boolean') {
        currentMessageQuery = currentMessageQuery.eq('sender', key.fromMe ? 'agent' : 'contact');
      }
      let { data: currentMessage } = await currentMessageQuery
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      // GO receipt fix: no Evolution GO o adaptador infere key.fromMe por
      // Chat === Sender, entao um recibo de mensagem NOSSA chega com
      // fromMe === false e a busca primaria (sender='contact') erra a linha.
      // Para delivered/read, a linha outbound existente com esse external_id
      // NESTA conexao e a evidencia canonica de que o recibo e nosso — sem
      // depender do flag inferido. Escopo estrito (external_id + conexao +
      // sender='agent') impede um recibo inbound de tocar linha de outro id
      // ou de outra conexao.
      if (!currentMessage?.id && key?.fromMe === false && connection?.id &&
          (newStatus === 'delivered' || newStatus === 'read')) {
        const { data: outboundMessage } = await supabase.from('messages')
          .select('id, status, sender')
          .eq('external_id', key.id)
          .eq('whatsapp_connection_id', connection.id)
          .eq('sender', 'agent')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (outboundMessage?.id) currentMessage = outboundMessage;
      }

      // O recibo e NOSSO quando o provedor disse (fromMe === true) ou quando a
      // linha encontrada e outbound — evidencia canonica cobrindo o flag GO
      // inferido errado e o recibo v2 sem flag.
      const receiptIsOurs = key?.fromMe === true || currentMessage?.sender === 'agent';

      if (currentMessage?.id) {
        if (shouldUpdateStatus(currentMessage.status as string | null, newStatus)) {
          await supabase.from('messages').update({ status: newStatus, status_updated_at: now }).eq('id', currentMessage.id);
          console.warn(`Message ${key.id} status: ${currentMessage.status} -> ${newStatus}`);
        }
      }
      // Recibo Talk X (X028): casa pelo external_id do DESTINATARIO na conexao que
      // emitiu o evento — um external_id que so existe para mensagem nossa. Por isso
      // NAO depende de key.fromMe: no Evolution GO o fromMe e inferido por
      // Chat === Sender (evolution-go-adapter) e pode vir falso mesmo num recibo da
      // nossa mensagem, o que mantinha delivered/read em zero. A RPC canonica
      // (record_talkx_recipient_receipt) e idempotente: sem destinatario com esse
      // external_id devolve false e o log registra o nao-casamento.
      let talkxReceiptRecorded = false;
      if ((newStatus === 'delivered' || newStatus === 'read') && connection?.id) {
        const receiptEvent = newStatus === 'delivered' ? 'delivered' : 'read';
        const { data: receiptRecorded, error: receiptError } = await supabase.rpc('record_talkx_recipient_receipt', {
          p_external_id: key.id,
          p_connection_id: connection.id,
          p_event: receiptEvent,
        });
        if (receiptError) {
          console.error(`TalkX ${receiptEvent} acknowledgement failed for ${key.id}: ${receiptError.message}`);
        } else if (receiptRecorded === true) {
          talkxReceiptRecorded = true;
          console.warn(`TalkX ${receiptEvent} acknowledged: ${key.id}`);
        } else {
          console.warn(`TalkX ${receiptEvent} receipt did not match a recipient for ${key.id}`);
        }
      }

      // Recibos do Multiplix continuam restritos a mensagem NOSSA — agora pela
      // evidencia canonica (fromMe declarado ou linha outbound encontrada), nao
      // pelo flag que o GO infere errado: um recibo do contato nunca resolve
      // destinatario nem item nosso.
      if (newStatus === 'delivered' && receiptIsOurs && connection?.id) {
        // O destinatario Multiplix e registro distinto do Talk X: roda sempre que o
        // Talk X nao confirmou (false ou erro) — um erro do TalkX nao prova que nao e
        // destinatario Multiplix. Mesmo padrao de idempotencia via RPC.
        if (!talkxReceiptRecorded) {
          const { data: multiplixRecorded, error: multiplixError } = await supabase.rpc('record_multiplix_recipient_delivered', {
            p_external_id: key.id,
            p_connection_id: connection.id,
          });
          if (multiplixError) {
            console.error(`Multiplix delivery acknowledgement failed for ${key.id}: ${multiplixError.message}`);
          } else if (multiplixRecorded === true) {
            console.warn(`Multiplix delivery acknowledged: ${key.id}`);
          }
        }

        // F58: o recibo tambem resolve o ITEM da fila (multiplix_delivery_items, F32b).
        // E um registro distinto do destinatario e pode existir mesmo quando o TalkX ja
        // confirmou o dele — por isso fica FORA do encadeamento acima, que so roda quando
        // o anterior nao confirmou. A RPC e idempotente e devolve false quando nao ha
        // item com esse external_id (o caso comum enquanto o worker nao migra para a fila).
        const { data: itemRecorded, error: itemError } = await supabase.rpc('record_multiplix_item_delivered', {
          p_external_id: key.id,
          p_connection_id: connection.id,
        });
        if (itemError) {
          console.error(`Multiplix item delivery acknowledgement failed for ${key.id}: ${itemError.message}`);
        } else if (itemRecorded === true) {
          console.warn(`Multiplix item delivery acknowledged: ${key.id}`);
        }
      } else if (newStatus === 'read' && receiptIsOurs && connection?.id) {
        // F58: o READ resolve o ITEM da fila do Multiplix — um READ do provedor nunca marcava
        // read_at no ITEM do Multiplix. Mesmo encadeamento do delivered, com o evento
        // explicito; a RPC so eleva (item ja em 'read' devolve false, sem rebaixar).
        const { data: itemReadRecorded, error: itemReadError } = await supabase.rpc('record_multiplix_item_delivered', {
          p_external_id: key.id,
          p_connection_id: connection.id,
          p_event: 'read',
        });
        if (itemReadError) {
          console.error(`Multiplix item read acknowledgement failed for ${key.id}: ${itemReadError.message}`);
        } else if (itemReadRecorded === true) {
          console.warn(`Multiplix item read acknowledged: ${key.id}`);
        }
      } else if (receiptIsOurs) {
        // Recibo de mensagem NOSSA que o frontend ainda nao estampou com
        // external_id (corrida envio x webhook): criar stub aqui duplicaria a
        // mensagem -- o eco send.message / o frontend resolvem em seguida.
        console.warn(`Receipt for own message ${key.id} before external_id landed -- skipping stub`);
      } else {
        // GAP-1 FIX (2026-09-01): so cria stub quando o contato eh resolvivel.
        // Antes: criava '[Mensagem recebida]' com contact_id=null para receipts
        // de mensagens LID nao resolvidas -- gerava ~500 orphans/hora (~12k/dia).
        // Agora: resolve o contato; sem contato, loga e continua sem inserir.
        let contactId: string | null = null;
        if (connection?.id) {
          const remoteJid = resolveEventJid(entry, baseData);
          if (remoteJid) {
            const phone = normalizePhone(remoteJid);
            if (phone) {
              const contact = await getContactByPhone(supabase, phone, connection.id);
              contactId = contact?.id ?? null;
            }
          }
        }

        if (contactId === null) {
          // Sem contato resolvivel nao ha inbox onde mostrar -- skip silencioso.
          console.warn(`Receipt for unresolvable message ${key.id} (status=${newStatus}) -- no contact, skipping stub`);
          continue;
        }

        await supabase.from('messages').upsert({
          content: '[Mensagem recebida]', message_type: 'text', sender: 'contact',
          external_id: key.id, status: newStatus, status_updated_at: now, created_at: now,
          contact_id: contactId, whatsapp_connection_id: connection?.id ?? null,
        }, { ignoreDuplicates: true });
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
export async function handleMessagesDelete(supabase: EvolutionDbClient, instance: string, data: unknown, baseData: Record<string, unknown>) {
  const connection = await getConnectionByInstance(supabase, instance);

  // R2-API-004: o UPDATE de soft-delete abaixo só ganha o filtro de conexão
  // quando ela existe; sem o filtro ele apaga por external_id em QUALQUER
  // conexão. Fail-closed: sem conexão resolvida, não muta.
  if (!connection?.id) {
    console.warn(`messages.delete ignored -- instance ${instance} has no resolved connection`);
    return;
  }

  for (const entry of toEventRecords(data, ['messages', 'keys'])) {
    const keySource = isRecord(entry.key)
      ? entry.key : (typeof entry.id === 'string' ? entry : null) ?? (isRecord(baseData.key) ? baseData.key : null);
    const key = keySource as { id?: string; remoteJid?: string; fromMe?: boolean } | null;
    if (!key?.id) continue;

    const now = new Date().toISOString();
    // Escopado por whatsapp_connection_id (+ sender quando key.fromMe vem no
    // evento) para bater com o indice unico real (ux_messages_dedup): sem isso
    // um delete de uma direcao marcaria tambem a mensagem da outra direcao que
    // compartilha o mesmo external_id.
    let deleteUpdateQuery = supabase.from('messages')
      .update({ is_deleted: true, status: 'deleted', status_updated_at: now })
      .eq('external_id', key.id);
    if (connection?.id) deleteUpdateQuery = deleteUpdateQuery.eq('whatsapp_connection_id', connection.id);
    if (typeof key.fromMe === 'boolean') {
      deleteUpdateQuery = deleteUpdateQuery.eq('sender', key.fromMe ? 'agent' : 'contact');
    }
    const { data: updatedMessages } = await deleteUpdateQuery.select('id');

    if (!updatedMessages?.length) {
      let contactId: string | null = null;
      const bestJid = resolveEventJid(key, entry, baseData);
      if (connection?.id && bestJid) {
        const phone = normalizePhone(bestJid);
        if (phone) { const contact = await getContactByPhone(supabase, phone, connection.id); contactId = contact?.id ?? null; }
      }

      // GAP-1 FIX: so insere tombstone quando ha contato resolvivel.
      // Sem contato nao ha inbox onde exibir '[Mensagem apagada]'.
      if (contactId === null) {
        console.warn(`Delete event for unresolvable message ${key.id} -- no contact, skipping tombstone`);
        continue;
      }

      await supabase.from('messages').upsert({
        content: '[Mensagem apagada]', message_type: 'text', sender: key.fromMe === true ? 'agent' : 'contact',
        external_id: key.id, status: 'deleted', is_deleted: true, status_updated_at: now,
        created_at: now, contact_id: contactId, whatsapp_connection_id: connection?.id ?? null,
      }, { ignoreDuplicates: true });
    }
    console.log(`Message deleted: ${key.id}`);
  }
}

// deno-lint-ignore no-explicit-any
export async function handleMessagesSet(supabase: EvolutionDbClient, instance: string, data: unknown) {
  const messages = toEventRecords(data, ['messages']);
  if (messages.length === 0) return;

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  let synced = 0, skipped = 0;
  for (const entry of messages) {
    const keySource = isRecord(entry.key) ? entry.key : null;
    const key = keySource as { remoteJid?: string; fromMe?: boolean; id?: string } | null;
    const bestJid = resolveEventJid(key, entry);
    if (!key?.id || !bestJid || bestJid.endsWith('@g.us')) { skipped++; continue; }

    // Use order+limit(1) so concurrent duplicates don't throw on maybeSingle.
    // Escopado por whatsapp_connection_id + sender para bater com o indice unico
    // real (ux_messages_dedup); connection ja garantido non-null pelo early
    // return acima. Sem o sender, uma mensagem real seria descartada quando a
    // direcao oposta ja ocupa o mesmo external_id.
    const senderDirection = key.fromMe ? 'agent' : 'contact';
    const { data: existing } = await supabase.from('messages').select('id')
      .eq('whatsapp_connection_id', connection.id).eq('external_id', key.id)
      .eq('sender', senderDirection)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) { skipped++; continue; }

    const phone = normalizePhone(bestJid);
    if (!phone) { skipped++; continue; }
    const contact = await getContactByPhone(supabase, phone, connection.id);
    if (!contact) { skipped++; continue; }

    const msg = entry.message as Record<string, unknown> | undefined;
    let content = '', messageType = 'text';
    if (msg?.conversation) content = msg.conversation as string;
    else if ((msg?.extendedTextMessage as Record<string, unknown>)?.text) content = (msg!.extendedTextMessage as Record<string, unknown>).text as string;
    else if (msg?.imageMessage) { messageType = 'image'; content = ((msg.imageMessage as Record<string, unknown>).caption as string) || '[Imagem]'; }
    else if (msg?.videoMessage) { messageType = 'video'; content = ((msg.videoMessage as Record<string, unknown>).caption as string) || '[Vídeo]'; }
    else if (msg?.audioMessage) { messageType = 'audio'; content = '[Áudio]'; }
    else if (msg?.documentMessage) { messageType = 'document'; content = ((msg.documentMessage as Record<string, unknown>).fileName as string) || '[Documento]'; }
    else if (msg?.stickerMessage) { messageType = 'sticker'; content = '[Sticker]'; }
    else { skipped++; continue; }
    if (!content && messageType === 'text') { skipped++; continue; }

    const ts = (entry.messageTimestamp as number) ? new Date((entry.messageTimestamp as number) * 1000).toISOString() : new Date().toISOString();
    await supabase.from('messages').upsert({
      content, message_type: messageType, sender: senderDirection,
      external_id: key.id, contact_id: contact.id, whatsapp_connection_id: connection.id,
      status: key.fromMe ? 'sent' : null, is_read: key.fromMe ? true : false, created_at: ts,
    }, { ignoreDuplicates: true });
    synced++;
  }
  console.log(`messages.set: synced ${synced}, skipped ${skipped} for ${instance}`);
}

// deno-lint-ignore no-explicit-any
export async function handleMessagesEdited(supabase: EvolutionDbClient, instance: string, data: unknown, baseData: Record<string, unknown>) {
  const connection = await getConnectionByInstance(supabase, instance);
  for (const entry of toEventRecords(data, ['messages'])) {
    const keySource = isRecord(entry.key) ? entry.key : isRecord(baseData.key) ? baseData.key : null;
    const key = keySource as { id?: string } | null;
    if (!key?.id) continue;

    const msg = (entry.message || baseData.message) as Record<string, unknown> | undefined;
    const editedContent = (msg?.conversation as string) ||
      ((msg?.extendedTextMessage as Record<string, unknown>)?.text as string) ||
      ((entry.editedMessage as Record<string, unknown>)?.conversation as string) || null;

    if (!editedContent) continue;

    // Escopado por whatsapp_connection_id: o mesmo external_id existe em outras
    // conexoes — sem o filtro a edicao gravava na mensagem de outra conexao.
    // Sem conexao resolvida nao ha escopo seguro: pula (fail-closed).
    if (!connection?.id) {
      console.warn(`Edit event for ${key.id} skipped -- instance ${instance} has no connection`);
      continue;
    }
    // Use order+limit(1) so concurrent duplicates don't throw on maybeSingle
    const { data: existing } = await supabase.from('messages').select('id')
      .eq('external_id', key.id).eq('whatsapp_connection_id', connection.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      await supabase.from('messages').update({ content: editedContent, is_edited: true, updated_at: new Date().toISOString() }).eq('id', existing.id);
      console.log(`Message edited: ${key.id}`);
    }
  }
}
