import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, jsonResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { verifyGmailOidcRequest, type WebhookAuthVerdict } from "../_shared/hmac-validation.ts";
import { ensureValidToken, runGmailIncrementalSync } from "../_shared/gmail-helpers.ts";

const PubSubSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    messageId: z.string().optional(),
    publishTime: z.string().optional(),
  }),
  subscription: z.string().optional(),
});

// O handler exportado aceita o client service_role e o verificador OIDC
// injetados para o teste offline exercitar o fluxo real sem Supabase nem JWKS
// (o gate bloqueante com JWT real é provado em webhook-auth-gates.test.ts).
export interface GmailWebhookDeps {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  verifyOidc?: (headers: Headers) => Promise<WebhookAuthVerdict>;
}

export async function handleGmailWebhook(req: Request, deps: GmailWebhookDeps = {}): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const log = new Logger("gmail-webhook");

  try {
    // R2-API-021: verificação OIDC BLOQUEANTE antes de qualquer efeito — o
    // Bearer do Pub/Sub é validado de verdade (assinatura RS256 contra o JWKS
    // do Google + iss/aud/exp/email) ANTES de criar o client com service role
    // ou ler o corpo. GMAIL_OIDC_AUDIENCE e GMAIL_OIDC_EMAIL são OBRIGATÓRIOS:
    // sem qualquer um deles a requisição é recusada (falha fechada). O e-mail
    // exato é o que prova a origem — qualquer service account de outro projeto
    // GCP emite JWT válido com aud arbitrária (a URL pública é conhecida).
    // GMAIL_OIDC_JWKS_URL só existe para teste/diagnóstico — em produção usa
    // o endpoint oficial do Google.
    const oidc = await (deps.verifyOidc ?? ((headers: Headers) => verifyGmailOidcRequest(headers, {
      audience: Deno.env.get("GMAIL_OIDC_AUDIENCE"),
      expectedEmail: Deno.env.get("GMAIL_OIDC_EMAIL"),
      jwksUrl: Deno.env.get("GMAIL_OIDC_JWKS_URL") || undefined,
    })))(req.headers);
    if (!oidc.ok) {
      log.warn(`token OIDC recusado (${oidc.reason})`);
      return jsonResponse({ error: "Unauthorized" }, 401, req);
    }

    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = deps.supabase ?? createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    const rawBody = await req.json();
    const parsed = PubSubSchema.safeParse(rawBody);
    if (!parsed.success) {
      log.warn("Invalid PubSub payload", { errors: parsed.error.message });
      return jsonResponse({ acknowledged: true, error: "Invalid payload" }, 200, req);
    }

    const decodedData = JSON.parse(atob(parsed.data.message.data));
    const { emailAddress, historyId: newHistoryId } = decodedData;

    log.info("Notification received", { email: emailAddress, historyId: newHistoryId });

    // Find the gmail account (without token columns)
    const { data: account, error: accountError } = await supabase
      .from("gmail_accounts")
      .select("id, email_address, is_active, token_expires_at, history_id, user_id")
      .eq("email_address", emailAddress)
      .eq("is_active", true)
      .single();

    if (accountError || !account) {
      log.info("No active Gmail account found", { email: emailAddress });
      return jsonResponse({ acknowledged: true }, 200, req);
    }

    if (!account.history_id) {
      log.info("No history_id stored, skipping incremental sync");
      return jsonResponse({ acknowledged: true }, 200, req);
    }

    const accessToken = await ensureValidToken(supabase, account, log);

    // R2-API-011: o MESMO pipeline incremental canônico do cron e do
    // gmail-sync. O webhook não grava history_id por conta própria — o cursor
    // só avança dentro do pipeline, depois de TODOS os efeitos aplicados e com
    // compare-and-swap.
    const result = await runGmailIncrementalSync(supabase, account, accessToken, log);

    if (result.status === "history_expired") {
      return jsonResponse({ acknowledged: true, resync_needed: true }, 200, req);
    }

    log.done(200, { processed: result.synced, failed: result.failed, status: result.status });
    return jsonResponse({
      acknowledged: true,
      processed: result.synced,
      failed: result.failed,
      cursor_advanced: result.cursor_advanced,
      status: result.status,
    }, 200, req);
  } catch (error) {
    log.error("Gmail Webhook error", { error: error instanceof Error ? error.message : String(error) });
    log.done(200);
    return jsonResponse({ acknowledged: true, error: error instanceof Error ? error.message : "Unknown error" }, 200, req);
  }
}

if (import.meta.main) {
  serve((req) => handleGmailWebhook(req));
}
