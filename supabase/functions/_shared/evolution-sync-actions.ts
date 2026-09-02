// Shared sync action handlers for evolution-sync/index.ts
import { evoFetch } from './evolution-send.ts';

const isGoFlavor = () => (Deno.env.get('EVOLUTION_API_FLAVOR') ?? 'go') !== 'v2';

// Normaliza contato v2 ({id|remoteJid, pushName, profilePictureUrl}) e
// GO /user/contacts ({Jid, FullName, PushName, BusinessName}) num shape único.
// deno-lint-ignore no-explicit-any
function normalizeEvoContact(contact: any): { remoteJid: string; name: string; avatarUrl: string | null } {
  const remoteJid: string = contact.id || contact.remoteJid || contact.Jid || contact.jid || '';
  const name: string = contact.pushName || contact.name || contact.verifiedName ||
    contact.FullName || contact.PushName || contact.BusinessName || contact.FirstName || '';
  const avatarUrl: string | null = contact.profilePictureUrl || contact.profilePicUrl || null;
  return { remoteJid, name, avatarUrl };
}

// Busca contatos na Evolution (v2: POST /chat/findContacts · GO: GET /user/contacts via tradutor).
// deno-lint-ignore no-explicit-any
async function fetchEvolutionContacts(evolutionApiUrl: string, evolutionApiKey: string, instanceName: string): Promise<any[]> {
  const resp = await evoFetch(evolutionApiUrl, evolutionApiKey,
    `/chat/findContacts/${instanceName}`, { where: {} });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Evolution API error [${resp.status}]: ${errText}`);
  }
  const json = await resp.json();
  if (Array.isArray(json)) return json;            // v2
  if (Array.isArray(json?.data)) return json.data; // GO {message:'success', data:[…]}
  return [];
}

// deno-lint-ignore no-explicit-any
export async function syncContacts(
  supabase: any, evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, corsHeaders: Record<string, string>, page: number, offset: number
): Promise<Response> {
  console.log(`[Sync] Fetching contacts from instance ${instanceName}`);

  const contacts = await fetchEvolutionContacts(evolutionApiUrl, evolutionApiKey, instanceName);
  if (contacts.length === 0) {
    return jsonRes({ success: true, message: 'No more contacts to sync', synced: 0, page }, corsHeaders);
  }

  let { data: connection } = await supabase.from('whatsapp_connections').select('id').eq('instance_id', instanceName).maybeSingle();
  if (!connection) {
    const { data: newConn } = await supabase.from('whatsapp_connections')
      .insert({ name: instanceName, instance_id: instanceName, status: 'connected', phone_number: '' })
      .select('id').single();
    connection = newConn;
  }
  if (!connection) throw new Error('Could not create/find WhatsApp connection');

  let synced = 0, skipped = 0;
  for (const contact of contacts) {
    const { remoteJid, name: rawName, avatarUrl } = normalizeEvoContact(contact);
    // só JIDs de usuário; exclui grupos, broadcast e @lid (GO expõe contatos LID)
    if (!remoteJid.endsWith('@s.whatsapp.net')) { skipped++; continue; }
    const phone = remoteJid.replace('@s.whatsapp.net', '');
    if (!phone || phone.length < 6) { skipped++; continue; }
    const name = rawName || phone;

    // contacts só tem UNIQUE(phone) — upsert por (phone, connection) dava 42P10
    // e nunca inseria. Padrão insert + fallback 23505 (mesmo do fullSync).
    const { error: insErr } = await supabase.from('contacts').insert(
      { phone, name, avatar_url: avatarUrl, whatsapp_connection_id: connection.id }
    );
    if (!insErr) { synced++; continue; }
    if (insErr.code === '23505') {
      const { error: updErr } = await supabase.from('contacts')
        .update({ name, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('phone', phone);
      if (!updErr) synced++; else skipped++;
    } else {
      skipped++;
    }
  }

  return jsonRes({ success: true, synced, skipped, page, totalFetched: contacts.length, hasMore: contacts.length >= offset }, corsHeaders);
}

// Evolution GO não expõe consulta de histórico (/chat/findMessages não existe;
// mensagens chegam via webhook Message/HistorySync — GO_GAPS D6).
function goHistoryNotSupported(actionName: string, corsHeaders: Record<string, string>): Response {
  return jsonRes({
    success: false, notSupported: true,
    message: `${actionName} não é suportado na Evolution GO: o histórico chega via webhook (Message/HistorySync). Use EVOLUTION_API_FLAVOR=v2 apenas com a Evolution API v2.`,
  }, corsHeaders);
}

// deno-lint-ignore no-explicit-any
export async function syncMessages(
  supabase: any, evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, contactPhone: string, corsHeaders: Record<string, string>
): Promise<Response> {
  if (!contactPhone) throw new Error('contactPhone is required');
  if (isGoFlavor()) return goHistoryNotSupported('sync-messages', corsHeaders);

  const remoteJid = contactPhone.includes('@') ? contactPhone : `${contactPhone}@s.whatsapp.net`;

  const messagesResponse = await fetch(
    `${evolutionApiUrl}/chat/findMessages/${instanceName}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
      body: JSON.stringify({ where: { key: { remoteJid } }, page: 1, offset: 50 }) }
  );
  if (!messagesResponse.ok) throw new Error(`Evolution API error [${messagesResponse.status}]: ${await messagesResponse.text()}`);

  const messagesData = await messagesResponse.json();
  const messages = Array.isArray(messagesData) ? messagesData : messagesData.messages || [];

  const { data: connection2 } = await supabase.from('whatsapp_connections').select('id').eq('instance_id', instanceName).maybeSingle();
  if (!connection2) throw new Error('WhatsApp connection not found');

  const phone = contactPhone.replace('@s.whatsapp.net', '');
  const { data: contact } = await supabase.from('contacts').select('id')
    .eq('phone', phone).eq('whatsapp_connection_id', connection2.id).maybeSingle();
  if (!contact) throw new Error(`Contact not found for phone ${phone}`);

  let synced = 0;
  for (const msg of messages) {
    const key = msg.key || {};
    const externalId = key.id;
    if (!externalId) continue;

    const { data: existing } = await supabase.from('messages').select('id').eq('external_id', externalId).maybeSingle();
    if (existing) continue;

    const { content, messageType } = parseEvolutionMessage(msg.message || {});

    const sender = key.fromMe ? 'agent' : 'contact';
    const createdAt = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString();

    const { error: insertError } = await supabase.from('messages').insert({
      contact_id: contact.id, whatsapp_connection_id: connection2.id, content,
      message_type: messageType, sender, external_id: externalId, is_read: true, status: 'read', created_at: createdAt,
    });
    if (!insertError) synced++;
  }

  return jsonRes({ success: true, synced, totalFetched: messages.length }, corsHeaders);
}

// deno-lint-ignore no-explicit-any
export async function syncAllMessages(
  supabase: any, evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, messagesPerContact: number, corsHeaders: Record<string, string>
): Promise<Response> {
  if (isGoFlavor()) return goHistoryNotSupported('sync-all-messages', corsHeaders);
  const { data: conn } = await supabase.from('whatsapp_connections').select('id').eq('instance_id', instanceName).maybeSingle();
  if (!conn) throw new Error('WhatsApp connection not found for instance ' + instanceName);

  const { data: allContacts, error: contactsErr } = await supabase.from('contacts').select('id, phone')
    .eq('whatsapp_connection_id', conn.id).order('updated_at', { ascending: false }).limit(500);
  if (contactsErr) throw new Error('Failed to fetch contacts: ' + contactsErr.message);
  if (!allContacts?.length) return jsonRes({ success: true, message: 'No contacts found', totalSynced: 0 }, corsHeaders);

  let totalSynced = 0, totalSkipped = 0, totalErrors = 0;
  const batchSize = 20;

  for (let batchStart = 0; batchStart < allContacts.length; batchStart += batchSize) {
    const batch = allContacts.slice(batchStart, batchStart + batchSize);
    for (const contact of batch) {
      try {
        const remoteJid = `${contact.phone}@s.whatsapp.net`;
        const msgResponse = await fetch(`${evolutionApiUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
          body: JSON.stringify({ where: { key: { remoteJid } }, page: 1, offset: messagesPerContact }),
        });
        if (!msgResponse.ok) { totalErrors++; continue; }

        const msgData = await msgResponse.json();
        const messages = Array.isArray(msgData) ? msgData : msgData.messages || [];

        for (const msg of messages) {
          const key = msg.key || {};
          if (!key.id) continue;
          const { data: existing } = await supabase.from('messages').select('id').eq('external_id', key.id).maybeSingle();
          if (existing) { totalSkipped++; continue; }

          const { content, messageType, shouldSkip } = parseEvolutionMessage(msg.message || {});
          if (shouldSkip) continue;

          const sender = key.fromMe ? 'agent' : 'contact';
          const createdAt = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString();

          const { error: insertError } = await supabase.from('messages').insert({
            contact_id: contact.id, whatsapp_connection_id: conn.id, content,
            message_type: messageType, sender, external_id: key.id, is_read: true, status: 'read', created_at: createdAt,
          });
          if (!insertError) totalSynced++;
        }
      } catch { totalErrors++; }
    }
  }

  return jsonRes({ success: true, totalSynced, totalSkipped, totalErrors, totalContacts: allContacts.length }, corsHeaders);
}

// v2: POST /webhook/set · GO: o tradutor converte em POST /instance/connect
// {webhookUrl, subscribe:['ALL'], immediate} com o token da instância (GO_GAPS D1).
// deno-lint-ignore no-explicit-any
export async function setupWebhook(
  evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, supabaseUrl: string, webhookUrlOverride: string | undefined, corsHeaders: Record<string, string>
): Promise<Response> {
  const webhookUrl = webhookUrlOverride || `${supabaseUrl}/functions/v1/evolution-webhook`;
  const webhookResponse = await evoFetch(evolutionApiUrl, evolutionApiKey,
    `/webhook/set/${instanceName}`, {
      enabled: true, url: webhookUrl, webhookByEvents: true, webhookBase64: false,
      events: WEBHOOK_EVENTS,
    });
  const webhookData = await webhookResponse.json();
  return new Response(JSON.stringify({ success: webhookResponse.ok, webhook: webhookData }), {
    status: webhookResponse.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
export async function cleanupMock(supabase: any, corsHeaders: Record<string, string>): Promise<Response> {
  const { data: mockContacts } = await supabase.from('contacts').select('id').like('id', 'c1000001-%');
  if (mockContacts?.length) {
    const mockIds = mockContacts.map((c: { id: string }) => c.id);
    await supabase.from('messages').delete().in('contact_id', mockIds);
    await supabase.from('contact_tags').delete().in('contact_id', mockIds);
    await supabase.from('contact_notes').delete().in('contact_id', mockIds);
    await supabase.from('contacts').delete().in('id', mockIds);
    return jsonRes({ success: true, removed: mockIds.length }, corsHeaders);
  }
  return jsonRes({ success: true, removed: 0, message: 'No mock data found' }, corsHeaders);
}

// deno-lint-ignore no-explicit-any
export async function fullSync(
  supabase: any, evolutionApiUrl: string, evolutionApiKey: string,
  instanceName: string, supabaseUrl: string, corsHeaders: Record<string, string>
): Promise<Response> {
  const results: Record<string, unknown> = {};

  // Cleanup
  const { data: mockContacts } = await supabase.from('contacts').select('id').like('id', 'c1000001-%');
  if (mockContacts?.length) {
    const mockIds = mockContacts.map((c: { id: string }) => c.id);
    await supabase.from('messages').delete().in('contact_id', mockIds);
    await supabase.from('contact_tags').delete().in('contact_id', mockIds);
    await supabase.from('contact_notes').delete().in('contact_id', mockIds);
    await supabase.from('contacts').delete().in('id', mockIds);
    results.cleanup = { removed: mockIds.length };
  } else {
    results.cleanup = { removed: 0 };
  }

  // Connection
  let { data: conn } = await supabase.from('whatsapp_connections').select('id').eq('instance_id', instanceName).maybeSingle();
  if (!conn) {
    const { data: newConn } = await supabase.from('whatsapp_connections')
      .insert({ name: instanceName, instance_id: instanceName, status: 'connected', phone_number: '' })
      .select('id').single();
    conn = newConn;
  }

  // Import contacts (v2 e GO — shapes normalizados)
  let totalSynced = 0, totalSkipped = 0;
  try {
    const contactsList = await fetchEvolutionContacts(evolutionApiUrl, evolutionApiKey, instanceName);
    const validContacts: { phone: string; name: string; avatar_url: string | null; whatsapp_connection_id: string }[] = [];
    for (const c of contactsList) {
      const { remoteJid: jid, name, avatarUrl } = normalizeEvoContact(c);
      if (!jid.endsWith('@s.whatsapp.net') || c.isGroup) { totalSkipped++; continue; }
      const phone = jid.replace('@s.whatsapp.net', '');
      if (!phone || phone.length < 6) { totalSkipped++; continue; }
      validContacts.push({ phone, name: name.trim() || phone, avatar_url: avatarUrl, whatsapp_connection_id: conn!.id });
    }
    const limit = Math.min(validContacts.length, 500);
    for (let i = 0; i < limit; i++) {
      const ct = validContacts[i];
      const { error: insErr } = await supabase.from('contacts').insert(ct);
      if (!insErr) totalSynced++;
      else if (insErr.code === '23505') {
        await supabase.from('contacts').update({ name: ct.name, avatar_url: ct.avatar_url, whatsapp_connection_id: ct.whatsapp_connection_id }).eq('phone', ct.phone);
        totalSynced++;
      }
    }
  } catch { /* contact sync error */ }
  results.contacts = { synced: totalSynced, skipped: totalSkipped };

  // Webhook (v2: /webhook/set · GO: /instance/connect via tradutor)
  const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
  try {
    const webhookResponse = await evoFetch(evolutionApiUrl, evolutionApiKey,
      `/webhook/set/${instanceName}`,
      { enabled: true, url: webhookUrl, webhookByEvents: true, webhookBase64: false, events: WEBHOOK_EVENTS });
    results.webhook = { success: webhookResponse.ok, url: webhookUrl };
  } catch (e) { results.webhook = { success: false, error: String(e) }; }

  return jsonRes({ success: true, results }, corsHeaders);
}

// ─── Shared utilities ───

export const WEBHOOK_EVENTS = [
  'APPLICATION_STARTUP', 'QRCODE_UPDATED', 'CONNECTION_UPDATE',
  'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE',
  'SEND_MESSAGE', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE',
  'PRESENCE_UPDATE', 'CHATS_UPSERT', 'CHATS_UPDATE',
  'GROUPS_UPSERT', 'GROUP_UPDATE', 'GROUP_PARTICIPANTS_UPDATE',
  'LABELS_EDIT', 'LABELS_ASSOCIATION', 'CALL',
];

// deno-lint-ignore no-explicit-any
function parseEvolutionMessage(messageObj: any): { content: string; messageType: string; shouldSkip?: boolean } {
  if (messageObj.conversation) return { content: messageObj.conversation, messageType: 'text' };
  if (messageObj.extendedTextMessage?.text) return { content: messageObj.extendedTextMessage.text, messageType: 'text' };
  if (messageObj.imageMessage) return { content: messageObj.imageMessage.caption || '[Imagem]', messageType: 'image' };
  if (messageObj.videoMessage) return { content: messageObj.videoMessage.caption || '[Vídeo]', messageType: 'video' };
  if (messageObj.audioMessage) return { content: '[Áudio]', messageType: 'audio' };
  if (messageObj.documentMessage) return { content: messageObj.documentMessage.fileName || '[Documento]', messageType: 'document' };
  if (messageObj.stickerMessage) return { content: '[Sticker]', messageType: 'sticker' };
  if (messageObj.reactionMessage) return { content: '', messageType: 'reaction', shouldSkip: true };
  return { content: '[Mensagem não suportada]', messageType: 'text' };
}

function jsonRes(data: unknown, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
