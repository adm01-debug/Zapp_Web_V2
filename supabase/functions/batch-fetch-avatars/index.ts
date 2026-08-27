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

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, phone, name, avatar_url, whatsapp_connection_id')
      .not('whatsapp_connection_id', 'is', null)
      .not('phone', 'like', '%@lid')
      .or('avatar_url.is.null,avatar_url.like.%pps.whatsapp.net%')
      .order('created_at', { ascending: false })
      .limit(500);

    if (contactsError) throw contactsError;
    if (!contacts?.length) {
      return jsonResponse({ success: true, processed: 0, updated: 0, message: 'Todos os contatos já possuem avatar.' }, 200, req);
    }

    log.info("Found contacts needing avatars", { count: contacts.length });

    const connectionIds = [...new Set(contacts.map(c => c.whatsapp_connection_id).filter(Boolean))];
    const { data: connections } = await supabase
      .from('whatsapp_connections').select('id, instance_id').in('id', connectionIds).eq('status', 'connected');

    if (!connections?.length) {
      return jsonResponse({ success: false, message: 'Nenhuma conexão WhatsApp ativa encontrada.' }, 200, req);
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

        try {
          const baseUrl = evolutionUrl.replace(/\/+$/, '');
          const resp = await evoFetch(baseUrl, evolutionKey,
            `/chat/fetchProfilePictureUrl/${instanceId}`, { number: contact.phone },
            (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(5000) }));
          if (!resp.ok) { failed++; return; }
          const result = await resp.json();
          const picUrl = extractAvatarUrl(result);
          if (!picUrl) { failed++; return; }

          const imgResp = await fetch(picUrl, { signal: AbortSignal.timeout(8000) });
          if (!imgResp.ok) { failed++; return; }
          const blob = await imgResp.arrayBuffer();
          const bytes = new Uint8Array(blob);
          if (bytes.length < 100) { failed++; return; }

          const fileName = `${contact.phone}_${Date.now()}.jpg`;
          const storagePath = `avatars/${fileName}`;
          const { error } = await supabase.storage.from('avatars').upload(storagePath, bytes, {
            contentType: 'image/jpeg', cacheControl: '604800', upsert: true,
          });
          if (error) { failed++; return; }

          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
          await supabase.from('contacts').update({ avatar_url: urlData.publicUrl }).eq('id', contact.id);
          updated++;
        } catch { failed++; }
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
