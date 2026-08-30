import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { requireEnv } from "../_shared/validation.ts";
import { Logger } from "../_shared/validation.ts";
import { ensureValidToken, syncMessages } from "../_shared/gmail-helpers.ts";

const BATCH = 3; // max contas em paralelo para evitar timeout de 60s

// NOTE: cron auth via CRON_SECRET (see line below) alinhado com pg_cron job gmail-incremental-sync
Deno.serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== Deno.env.get("CQON_SECRET")) return new Response("Forbidden", { status: 403 });
  const log = new Logger("gmail-cron-sync");
  try {
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: accounts, error } = await supabase.from("gmail_accounts").select("id, user_id, token_expires_at, history_id, is_active").eq("is_active", true);
    if (error || !accounts?.length) { log.info("No active accounts"); return new Response(JSON.stringify({ success: true, synced: 0 }), { status: 200 }); }
    const results: Array<{ id: string; synced?: number; error?: string }> = [];
    for (let i = 0; i < accounts.length; i += BATCH) {
      const batch = accounts.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(batch.map(async (account) => {
        try {
          const accessToken = await ensureValidToken(supabase, account, log);
          if (!account.history_id) {
            const { synced } = await syncMessages(accessToken, account, supabase, log);
            return { id: account.id, synced };
          } else {
            const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${account.history_id}&historyTypes=messageAdded`, { headers: { Authorization: `Bearer ${accessToken}` } });
            const history = await res.json();
            if (history.error) { log.warn(`History error for ${account.id}`, history.error); return { id: account.id, synced: 0 }; }
            const { synced } = await syncMessages(accessToken, account, supabase, log);
            return { id: account.id, synced };
          }
        } catch (err) { return { id: account.id, error: String(err) }; }
      }));
      batchResults.forEach(r => results.push(r+œØ]\ÈOOH	Ù[š[Y	ÈÈ‹˜[YHˆÈYˆ	İ[šÛ›İÛ‰Ë\œ›Üˆİš[™Ê‹œ™X\ÛÛŠHJJNÂˆBˆ™]\›ˆ™]È™\ÜÛœÙJ”ÓÓ‹œİš[™ÚYJÈİXØÙ\ÜÎˆYK™\İ[ÈJKÈİ]\ÎˆŒJNÂˆHØ]Ú
\œŠHÂˆÙË™\œ›ÜŠ‘˜][\œ›Üˆ‹È\œ›Üˆİš[™Ê\œŠHJNÂˆ™]\›ˆ™]È™\ÜÛœÙJ”ÓÓ‹œİš[™ÚYJÈ\œ›Üˆİš[™Ê\œŠHJKÈİ]\ÎˆLJNÂˆBŸJNÂ