// Shared helpers for Evolution API webhook and sync functions
import { evoFetch, extractAvatarUrl } from './evolution-send.ts';

export interface WebhookPayload {
  event: string;
  instance: string;
  data: Record<string, unknown> | Record<string, unknown>[];
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeEventName(event?: string): string {
  return (event || '').trim().toLowerCase().replace(/_/g, '.');
}

export function toEventRecords(data: unknown, collectionKeys: string[] = []): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of collectionKeys) {
    const collection = data[key];
    if (Array.isArray(collection)) return collection.filter(isRecord);
  }
  return [data];
}

export function normalizePhone(rawJid?: string): string | null {
  if (!rawJid) return null;

  // LIDs usam sufixo @lid — identificador de dispositivo vinculado, nao numero E.164.
  // Rejeitar antes de strip para nao criar contatos-LID fragmentados (E35).
  if (rawJid.includes('@lid')) {
    const lidDigits = rawJid.replace(/@lid.*/, '').replace(/\D/g, '');
    console.warn(`[normalizePhone] LID rejeitado (${lidDigits.length} digitos): ${lidDigits.substring(0, 6)}***`);
    return null;
  }

  const sanitized = rawJid
    .trim()
    .replace(/:\d+(?=@)/, '')
    .replace('@s.whatsapp.net', '')
    .replace('@g.us', '')
    .replace('@broadcast', '')
    .replace(/^\+/, '');

  const digitsOnly = sanitized.replace(/\D/g, '');

  // Fallback: LIDs que chegam sem sufixo @lid tem >= 14 digitos sem DDI E.164 valido.
  // Grupos WhatsApp (prefixo 120363/120392/120415/120496) sao excecoes validas.
  if (digitsOnly.length >= 14 && !/^12(0363|0392|0415|0496)/.test(digitsOnly)) {
    console.warn(`[normalizePhone] ${digitsOnly.length} digitos sem DDI valido rejeitado como possivel LID: ${digitsOnly.substring(0, 6)}***`);
    return null;
  }

  return digitsOnly || sanitized || null;
}

export function resolveBestJid(...candidates: Array<string | null | undefined>): string | null {
  const valid = candidates
    .map((candidate) => candidate?.trim())
    .filter((candidate): candidate is string => Boolean(candidate));

  if (valid.length === 0) return null;

  return valid.find((jid) => jid.includes('@s.whatsapp.net'))
    ?? valid.find((jid) => /^\+?\d{10,15}$/.test(jid))
    ?? valid.find((jid) => jid.includes('@g.us'))
    ?? valid.find((jid) => !jid.includes('@lid'))
    ?? valid[0]
    ?? null;
}

export function resolveEventJid(...sources: unknown[]): string | null {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const directFields = [
    'remoteJid', 'remoteJidAlt', 'participant', 'participantAlt',
    'sender', 'senderAlt', 'senderJid', 'senderLid',
    'from', 'fromAlt', 'fromJid',
    'chatId', 'chatJid', 'jid', 'jidAlt',
    'author', 'authorAlt', 'user', 'userJid', 'owner', 'recipient',
  ];

  const pushCandidate = (value: unknown) => {
    if (typeof value !== 'string') return;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const collectFields = (record: Record<string, unknown>) => {
    for (const field of directFields) pushCandidate(record[field]);
  };

  const collectSource = (source: unknown) => {
    if (typeof source === 'string') {
      pushCandidate(source);
      return;
    }

    if (!isRecord(source)) return;

    collectFields(source);

    const nestedRecords = [
      source.key,
      source.contextInfo,
      source.messageContextInfo,
      source.message,
    ];

    for (const nested of nestedRecords) {
      if (!isRecord(nested)) continue;
      collectFields(nested);

      for (const value of Object.values(nested)) {
        if (!isRecord(value)) continue;
        collectFields(value);
        if (isRecord(value.contextInfo)) collectFields(value.contextInfo);
        if (isRecord(value.messageContextInfo)) collectFields(value.messageContextInfo);
        if (isRecord(value.message)) collectFields(value.message);
      }
    }
  };

  for (const source of sources) collectSource(source);

  return resolveBestJid(...candidates);
}

export const STATUS_PRIORITY: Record<string, number> = {
  'sending': 0, 'sent': 1, 'delivered': 2, 'read': 3, 'played': 3,
  'failed': -1, 'deleted': 99, 'received': 1,
};

export function shouldUpdateStatus(currentStatus: string | null, newStatus: string): boolean {
  if (!currentStatus) return true;
  if (newStatus === 'deleted' || newStatus === 'failed') return true;
  const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
  const newPriority = STATUS_PRIORITY[newStatus] ?? 0;
  return newPriority > currentPriority;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION CACHE
//
// whatsapp_connections has exactly 2 rows but was receiving 37.9M seq scans
// because getConnectionByInstance() queried it on every single message.
//
// Deno isolates are stateful between warm invocations (module-level state
// persists). A module-level Map acts as an L1 cache: lookup is O(1) vs a
// network round-trip to Postgres.
//
// TTL: 5 minutes. Low enough that connection changes propagate in reasonable
// time; high enough to absorb thousands of webhook bursts per minute.
//
// Invalidation: call invalidateConnectionCache(instance) whenever a
// connection.update or disconnect event is received (done in
// evolution-webhook-handlers.ts → handleConnectionUpdate).
// ─────────────────────────────────────────────────────────────────────────────
const CONNECTION_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

interface CachedConnection {
  data: { id: string } | null;
  expiresAt: number;
}

// Shared across warm invocations within the same isolate.
const connectionCache = new Map<string, CachedConnection>();

export function invalidateConnectionCache(instance?: string): void {
  if (instance) {
    connectionCache.delete(instance);
  } else {
    connectionCache.clear();
  }
}

// deno-lint-ignore no-explicit-any
export async function getConnectionByInstance(
  supabase: any,
  instance: string,
): Promise<{ id: string } | null> {
  const now = Date.now();
  const cached = connectionCache.get(instance);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const { data } = await supabase
    .from('whatsapp_connections')
    .select('id')
    .eq('instance_id', instance)
    .maybeSingle();

  connectionCache.set(instance, {
    data,
    expiresAt: now + CONNECTION_CACHE_TTL_MS,
  });

  return data;
}

// deno-lint-ignore no-explicit-any
export async function getContactByPhone(
  supabase: any,
  phone: string,
  connectionId: string
): Promise<{ id: string; avatar_url: string | null; assigned_to: string | null; name: string | null } | null> {
  const phonesVariants = generatePhoneVariants(phone);
  const { data } = await supabase
    .from('contacts')
    .select('id, avatar_url, assigned_to, name')
    .in('phone', phonesVariants)
    .eq('whatsapp_connection_id', connectionId)
    .limit(1)
    .maybeSingle();
  
  // If not found with connection filter, try without it (contact may belong to another connection)
  if (!data) {
    const { data: anyConnection } = await supabase
      .from('contacts')
      .select('id, avatar_url, assigned_to, name')
      .in('phone', phonesVariants)
      .limit(1)
      .maybeSingle();
    if (anyConnection) {
      // Update the contact's connection to the current one
      await supabase.from('contacts')
        .update({ whatsapp_connection_id: connectionId, updated_at: new Date().toISOString() })
        .eq('id', anyConnection.id);
      console.log(`[CONTACT] Found contact ${anyConnection.id} via phone variant, relinked to connection ${connectionId}`);
      return anyConnection;
    }
  }
  
  return data;
}

/**
 * Generate phone number variants to handle Brazilian 9th digit discrepancy.
 * WhatsApp/Evolution may use numbers with or without the 9th digit for mobile numbers.
 * E.g., 5564984450900 (with 9) vs 556484450900 (without 9)
 */
export function generatePhoneVariants(phone: string): string[] {
  const clean = phone.replace(/\D/g, '').replace(/^\+/, '');
  const variants = new Set<string>([clean, `+${clean}`, phone]);
  
  // Brazilian number handling (country code 55)
  if (clean.startsWith('55') && clean.length >= 12) {
    const ddd = clean.substring(2, 4);
    const rest = clean.substring(4);
    
    // If has 9th digit (9 digits after DDD = total 13 with country code)
    if (clean.length === 13 && rest.startsWith('9')) {
      // Add variant WITHOUT 9th digit
      const without9 = `55${ddd}${rest.substring(1)}`;
      variants.add(without9);
    }
    
    // If missing 9th digit (8 digits after DDD = total 12 with country code)
    if (clean.length === 12) {
      // Add variant WITH 9th digit
      const with9 = `55${ddd}9${rest}`;
      variants.add(with9);
    }
  }
  
  return [...variants];
}

export async function fetchProfilePicFromApi(instance: string, phone: string): Promise<string | null> {
  try {
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionUrl || !evolutionKey) return null;
    const baseUrl = evolutionUrl.replace(/\/+$/, '');
    const resp = await evoFetch(baseUrl, evolutionKey,
      `/chat/fetchProfilePictureUrl/${instance}`, { number: phone },
      (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(5000) }));
    if (!resp.ok) return null;
    const result = await resp.json();
    return extractAvatarUrl(result);
  } catch { return null; }
}

// deno-lint-ignore no-explicit-any
export async function persistProfilePicture(supabase: any, phone: string, profilePicUrl: string): Promise<string | null> {
  try {
    const response = await fetch(profilePicUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const blob = await response.arrayBuffer();
    const bytes = new Uint8Array(blob);
    if (bytes.length < 100) return null;

    const fileName = `${phone}_${Date.now()}.jpg`;
    const storagePath = `avatars/${fileName}`;

    const { data: oldFiles } = await supabase.storage.from('avatars').list('avatars', { search: phone });
    if (oldFiles?.length) {
      await supabase.storage.from('avatars').remove(oldFiles.map((f: { name: string }) => `avatars/${f.name}`));
    }

    const { error } = await supabase.storage.from('avatars').upload(storagePath, bytes, {
      contentType: 'image/jpeg', cacheControl: '604800', upsert: true,
    });
    if (error) { console.error('Avatar upload error:', error); return null; }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
    return urlData.publicUrl;
  } catch (err) { console.error('Avatar persist error:', err); return null; }
}

// deno-lint-ignore no-explicit-any
export async function handleReactionEvent(supabase: any, reactionMessage: Record<string, unknown>, actorFromMe: boolean) {
  const emoji = (reactionMessage.text as string) || '';
  const reactKey = reactionMessage.key as Record<string, unknown> | undefined;
  if (!reactKey?.id) return;

  const targetExternalId = reactKey.id as string;
  const { data: targetMessage } = await supabase
    .from('messages').select('id, contact_id').eq('external_id', targetExternalId).maybeSingle();
  if (!targetMessage) { console.log(`Reaction target not found: ${targetExternalId}`); return; }
  // Stub sem contact_id (linha criada por recibo adiantado): o CHECK
  // reaction_author_check exige autor — reagir aqui só geraria 23514.
  if (!targetMessage.contact_id) { console.log(`Reaction target ${targetExternalId} has no contact — skipping`); return; }

  if (emoji === '') {
    if (!actorFromMe) {
      await supabase.from('message_reactions').delete()
        .eq('message_id', targetMessage.id).eq('contact_id', targetMessage.contact_id);
      await supabase.from('messages').update({ updated_at: new Date().toISOString() }).eq('id', targetMessage.id);
      console.log(`Reaction removed on message ${targetExternalId}`);
    }
  } else if (!actorFromMe) {
    const { error: upsertErr } = await supabase.from('message_reactions').upsert(
      { message_id: targetMessage.id, contact_id: targetMessage.contact_id, emoji },
      { onConflict: 'message_id,contact_id,emoji' }
    );
    if (upsertErr) { console.error('Error upserting reaction:', upsertErr); }
    else {
      await supabase.from('messages').update({ updated_at: new Date().toISOString() }).eq('id', targetMessage.id);
      console.log(`Reaction synced: ${emoji} on message ${targetExternalId}`);
    }
  }
}
