import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { evoFetch, extractAvatarUrl } from '../_shared/evolution-send.ts';
import { persistProfilePicture } from '../_shared/evolution-helpers.ts';
import { errorResponse, jsonResponse, requireEnv, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { isAuthorizedCronOrUser, unauthorizedResponse } from '../_shared/cron-secret-auth.ts';
import { bootEdge, type EdgeInjected } from '../_shared/edge-boot.ts';

export async function handleBatchFetchAvatars(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _injected?: EdgeInjected<any>,
): Promise<Response> {
  // O `??` do boot e PREGUICOSO de proposito: com `_injected.supabase` (testes) o
  // requireEnv('SUPABASE_URL') nem roda. O generico de bootEdge e a anotacao
  // `as SupabaseClient` — sem ela o receiver `any` faria o TS perder a inferencia dos
  // callbacks das queries abaixo (TS7006 em contacts.map/connections.map/batch.map).
  const { cors, log, headers, supabase, serviceKey } = bootEdge<SupabaseClient>(req, {
    fnName: 'batch-fetch-avatars',
    injected: _injected,
    makeClient: () => createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY')),
  });
  if (cors) return cors;

  try {

    // L5 da matriz IA-004: credencial de maquina do cron (x-cron-secret, segredo
    // DEDICADO no Vault, lido por RPC SECURITY DEFINER) OU JWT de usuario autenticado.
    // A ANON KEY deixa de entrar: ela e publica (vai no bundle do front) e o gateway a
    // aceitava como "um JWT valido". O caminho de Bearer e o consumidor legitimo do front
    // (useNewConversation e useInboxBulkActions chamam via functions.invoke com o JWT da
    // sessao). O guard vive em _shared/cron-secret-auth.ts (as duas edges usam o mesmo);
    // o literal da RPC fica AQUI de proposito, para o guard de catalogo
    // (scripts/db-audit/supabase-usage-guard.mjs) continuar validando o alvo.
    const authorized = await isAuthorizedCronOrUser(req, supabase, {
      serviceKey,
      readVaultSecret: async () => {
        const { data, error } = await supabase.rpc('get_avatars_refresh_cron_secret');
        return !error && typeof data === 'string' ? data : null;
      },
    });
    if (!authorized) return unauthorizedResponse(headers);

    const ip = getClientIP(req);
    const rl = checkRateLimit(`batch-avatars:${ip}`, 5, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    // Backoff: nao reprocessar ocultos/sem-foto por 7 dias.
    // NULL = nunca tentado (sempre entra); contatos novos entram automaticamente.
    // Contatos com avatar no caminho LEGADO por telefone entram SEMPRE, mesmo
    // com backoff recente: a migracao precisa remove-los (item do cartao).
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const LEGACY_AVATAR_LIKE = '%/object/public/avatars/avatars/%';

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, phone, name, avatar_url, avatar_fetch_attempted_at, whatsapp_connection_id')
      .not('whatsapp_connection_id', 'is', null)
      .not('phone', 'like', '%@lid')
      .or(`avatar_url.is.null,avatar_url.like.%pps.whatsapp.net%,avatar_url.like.${LEGACY_AVATAR_LIKE}`)
      .or(`avatar_fetch_attempted_at.is.null,avatar_fetch_attempted_at.lt.${sevenDaysAgo},avatar_url.like.${LEGACY_AVATAR_LIKE}`)
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

    // Sem conexao ativa ainda ha o que fazer: os avatares legados sao
    // re-hospedados do proprio bucket (nao dependem da Evolution).
    const hasLegacy = contacts.some((c) =>
      typeof c.avatar_url === 'string' && c.avatar_url.includes('/object/public/avatars/avatars/'));
    if (!connections?.length && !hasLegacy) {
      return jsonResponse({ success: false, message: 'Nenhuma conex\u00e3o WhatsApp ativa encontrada.' }, 200, req);
    }

    const connectionMap = new Map((connections ?? []).map(c => [c.id, c.instance_id]));
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

    let updated = 0, failed = 0, skipped = 0;

    for (let i = 0; i < contacts.length; i += 5) {
      const batch = contacts.slice(i, i + 5);

      await Promise.allSettled(batch.map(async (contact) => {
        // Marca attempted_at em todos os tentados (sucesso E falha) para o
        // backoff de 7d funcionar nos contatos ocultos/sem-foto.
        const markAttempted = () =>
          supabase.from('contacts')
            .update({ avatar_fetch_attempted_at: new Date().toISOString() })
            .eq('id', contact.id);

        // Caminho legado por telefone (avatars/<ddd>.jpg): re-hospeda o proprio
        // arquivo no caminho imprevisivel do contato — nao depende de a Evolution
        // ainda servir a foto — e remove o antigo do bucket.
        const legacyUrl = typeof contact.avatar_url === 'string'
            && contact.avatar_url.includes('/object/public/avatars/avatars/')
          ? contact.avatar_url
          : null;

        try {
          let newUrl: string | null;

          if (legacyUrl) {
            newUrl = await persistProfilePicture(supabase, contact.id, legacyUrl, legacyUrl);
          } else {
            const instanceId = connectionMap.get(contact.whatsapp_connection_id);
            if (!instanceId || !evolutionUrl || !evolutionKey) { skipped++; return; }

            const baseUrl = evolutionUrl.replace(/\/+$/, '');
            const resp = await evoFetch(baseUrl, evolutionKey,
              `/chat/fetchProfilePictureUrl/${instanceId}`, { number: contact.phone },
              (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(5000) }));
            if (!resp.ok) { failed++; await markAttempted(); return; }
            const result = await resp.json();
            const picUrl = extractAvatarUrl(result);
            if (!picUrl) { failed++; await markAttempted(); return; }

            newUrl = await persistProfilePicture(supabase, contact.id, picUrl, contact.avatar_url);
          }

          if (!newUrl) { failed++; await markAttempted(); return; }

          await supabase.from('contacts').update({
            avatar_url: newUrl,
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
}

if (import.meta.main) {
  Deno.serve((req) => handleBatchFetchAvatars(req));
}
