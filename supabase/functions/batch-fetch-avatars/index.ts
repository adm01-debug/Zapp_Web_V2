import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evoFetch, extractAvatarUrl } from '../_shared/evolution-send.ts';
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("batch-fetch-avatars");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`batch-avatars:${ip}`, 5, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

    // Backoff: nao reprocessar ocultos/sem-foto por 7 dias.
    // NULL = nunca tentado (sempre entra); contatos novos entram automaticamente.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, phone, name, avatar_url, avatar_fetch_attempted_at, whatsapp_connection_id')
      .not('whatsapp_connection_id', 'is', null)
      .not('phone', 'like', '%@lid')
      .or('avatar_url.is.null,avatar_url.like.%pps.whatsapp.net%')
      .or(`avatar_fetch_attempted_at.is.null,avatar_fetch_attempted_at.lt.${sevenDaysAgo}`)
      .order('created_at', { ascending: false })
      .limit(500);

    if (contactsError) throw contactsError;
    if (!contacts?.length) {
      return jsonResponse({ success: true, processed: 0, updated: 0, message: 'Todos os contatos j\u00e1 possuem avatar.' }, 200, req);
    }

    log.info("Found contacts needing avatars", { count: contacts.length });

    const connectionIds = [...new Set(contacts.map(c => c.whatsapp_connection_id).filter(Boolean))];
    const { data: connections } = await supabase
      .from('whatsapp_connections').select('id, instance_id').in('id', connectionIds).eq('status', 'connected');

    if (!connections?.length) {
      return jsonResponse({ success: false, message: 'Nenhuma conex\u00e3o WhatsApp ativa encontrada.' }, 200, req);
    }

    const connectionMap = new Map(connections.map(c => [c.id, c.instance_id]));
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

    let updated = 0, failed = 0, skipped = 0;

    for (let i = 0; i < contacts.length; i += 5) {
      const batch = contacts.slice(i, i + 5);

      await Promise.allSettled(batch.map(async (contact) => {
        const instanceId = connectionMap.get(contact.whatsapp_connection_id);
        if (!instanceId || !evolutionUrl || !evolutionKey) { skipped++; return; }

        // Marca attempted_at em todos os tentados (sucesso E falha) para o
        // backoff de 7d funcionar nos contatos ocultos/sem-foto.
        const markAttempted = () =>
          supabase.from('contacts')
            .update({ avatar_fetch_attempted_at: new Date().toISOString() })
            .eq('id', contact.id);

        try {
          const baseUrl = evolutionUrl.replace(/\/+$/, '');
          const resp = await evoFetch(baseUrl, evolutionKey,
            `/chat/fetchProfilePictureUrl/${instanceId}`, { number: contact.phone },
            (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(5000) }));
          if (!resp.ok) { failed++; await markAttempted(); return; }
          const result = await resp.json();
          const picUrl = extractAvatarUrl(result);
          if (!picUrl) { failed++; await markAttempted(); return; }

          const imgResp = await fetch(picUrl, { signal: AbortSignal.timeout(8000) });
          if (!imgResp.ok) { failed++; await markAttempted(); return; }
          const blob = await imgResp.arrayBuffer();
          const bytes = new Uint8Array(blob);
          if (bytes.length < 100) { failed++; await markAttempted(); return; }

          const fileName = `${contact.phone}_${Date.now()}.jpg`;
          const storagePath = `avatars/${fileName}`;
          const { error } = await supabase.storage.from('avatars').upload(storagePath, bytes, {
            contentType: 'image/jpeg', cacheControl: '604800', upsert: true,
          });
          if (error) { failed++; await markAttempted(); return; }

          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
          await supabase.from('contacts').update({
            avatar_url: urlData.publicUrl,
            avatar_fetch_attempted_at: new Date().toISOString(),
          }).eq('id', contact.id);
          updated++;
        } catch { failed++; await markAttempted(); }
      }));

      if (i + 5 < contacts.length) await new Promise(r => setTimeout(r, 1000));
    }

    log.done(200, { processed: contacts.length, updated, failed, skipped });
    return jsonResponse({
      success: true, processed: contacts.length, updated, failed, skipped,
      message: `${updated} avatares atualizados de ${contacts.length} contatos processados.`,
    }, 200, req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log.error("Batch avatar error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
