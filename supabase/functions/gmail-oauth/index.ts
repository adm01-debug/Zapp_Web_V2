import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { GmailOAuthActionSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import {
  GMAIL_REAUTH_HTTP_STATUS,
  gmailReauthErrorPayload,
  isGmailReauthError,
  recordGmailAccountFailure,
  requestGmailTokenRefresh,
} from "../_shared/gmail-helpers.ts";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Máscara de e-mail para a trilha de auditoria: guarda só a 1ª letra da caixa
 * local e o domínio. O e-mail completo nunca entra em log nem em `details`.
 */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

async function getAuthUrl(clientId: string, redirectUri: string, state?: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${await response.text()}`);
  return response.json();
}

// Adaptador do seam de DI para a cópia ÚNICA do refresh (requestGmailTokenRefresh,
// em _shared/gmail-helpers.ts) — não há fetch próprio de token aqui.
async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<TokenResponse> {
  const tokens = await requestGmailTokenRefresh(refreshToken, clientId, clientSecret);
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    token_type: "Bearer",
    scope: GMAIL_SCOPES,
  };
}

async function getGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Failed to get Gmail profile");
  return response.json();
}

// deno-lint-ignore no-explicit-any
async function getTokens(supabase: any, accountId: string): Promise<{ access_token: string; refresh_token: string }> {
  const { data, error } = await supabase.rpc("get_gmail_tokens", { p_account_id: accountId });
  if (error || !data?.length) throw new Error("Failed to retrieve tokens");
  return data[0];
}

// deno-lint-ignore no-explicit-any
async function storeTokens(supabase: any, accountId: string, accessToken: string, refreshToken?: string | null) {
  await supabase.rpc("store_gmail_tokens", {
    p_account_id: accountId,
    p_access_token: accessToken,
    p_refresh_token: refreshToken ?? null,
  });
}

// ── Seams de injeção (R2-COM-009) ─────────────────────────────────────────
// O handler exportado recebe tudo o que faz efeito (client service_role, quem
// resolve o usuário do JWT e as chamadas ao Google) para o teste provar a
// validação do `state` no servidor SEM tocar banco nem a API do Google.

export interface GmailOAuthDeps {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  getUser: () => Promise<{ user: { id: string } | null; error: unknown }>;
  google: {
    clientId: string;
    redirectUri: string;
    exchangeCode: (code: string) => Promise<TokenResponse>;
    refreshToken: (refreshToken: string) => Promise<TokenResponse>;
    fetchProfile: (accessToken: string) => Promise<{ emailAddress: string }>;
    revoke: (token: string) => Promise<Response>;
  };
}

export async function handleGmailOAuth(req: Request, deps: GmailOAuthDeps): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("gmail-oauth");
  const { supabase } = deps;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("Missing authorization header", 401, req);

    const { user, error: authError } = await deps.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401, req);

    const parsed = parseBody(GmailOAuthActionSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { action, code, account_id, state } = parsed.data;

    switch (action) {
      case "get-auth-url": {
        // CSRF (RFC 6749 §10.12): a tentativa só existe se for registrada aqui,
        // vinculada ao usuário autenticado. O retorno sem state registrado é
        // recusado no exchange-code.
        if (!state) return errorResponse("Missing OAuth state", 400, req);
        const { error: stateError } = await supabase
          .from("gmail_oauth_states")
          .insert({ user_id: user.id, state });
        if (stateError) throw stateError;

        const url = await getAuthUrl(deps.google.clientId, deps.google.redirectUri, state);
        log.done(200, { action });
        return jsonResponse({ url }, 200, req);
      }

      case "exchange-code": {
        if (!code) return errorResponse("Missing authorization code", 400, req);
        if (!state) return errorResponse("Missing OAuth state", 400, req);

        // O state é consumido ANTES de qualquer chamada ao Google: só passa se
        // existir, pertencer a este usuário, não estar expirado e não ter sido
        // usado (uso único atômico — replay e troca de sessão caem aqui).
        const { data: stateOk, error: consumeError } = await supabase.rpc("consume_gmail_oauth_state", {
          p_user_id: user.id,
          p_state: state,
        });
        if (consumeError) throw consumeError;
        if (!stateOk) return errorResponse("Invalid or expired OAuth state", 403, req);

        const tokens = await deps.google.exchangeCode(code);
        const gmailProfile = await deps.google.fetchProfile(tokens.access_token);
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        // Guarda de account takeover: um e-mail JÁ VINCULADO E ATIVO de outro
        // usuário é recusado. A linha INATIVA (conexão desfeita pelo dono, ou
        // dono que saiu da empresa) é reaproveitada — ninguém fica preso a um
        // vínculo morto —, mas a assunção deixa trilha em `audit_logs`.
        const { data: existingAccount } = await supabase
          .from("gmail_accounts")
          .select("id, user_id, is_active")
          .eq("email_address", gmailProfile.emailAddress)
          .maybeSingle();

        if (existingAccount && existingAccount.user_id !== user.id) {
          if (existingAccount.is_active) {
            return errorResponse("This Gmail address is already linked to another account", 409, req);
          }

          const emailMasked = maskEmail(gmailProfile.emailAddress);
          // A trilha é gravada ANTES do upsert e com a service_role: sem rastro
          // não há assunção (fail-closed). `action` nomeada, e o e-mail entra
          // só mascarado em `details`.
          const { error: auditError } = await supabase.from("audit_logs").insert({
            user_id: user.id,
            action: "gmail_account_taken_over",
            entity_type: "gmail_account",
            entity_id: existingAccount.id,
            details: { previous_user_id: existingAccount.user_id, email_masked: emailMasked },
          });
          if (auditError) {
            log.error("Falha ao registrar auditoria da assuncao da conta Gmail", {
              error: auditError.message ?? "erro desconhecido",
              accountId: existingAccount.id,
            });
            return errorResponse("Nao foi possivel registrar a reconexao desta conta Gmail", 500, req);
          }

          log.warn("Conta Gmail inativa de outro usuario assumida na reconexao", {
            emailMasked,
            previousUserId: existingAccount.user_id,
            accountId: existingAccount.id,
          });
        }

        const { data: account, error: upsertError } = await supabase
          .from("gmail_accounts")
          .upsert({
            user_id: user.id,
            email_address: gmailProfile.emailAddress,
            token_expires_at: expiresAt,
            is_active: true,
            sync_status: "pending",
            // reconectar a mesma conta (onConflict email_address) limpa o erro
            // anterior — inclusive 'reauth_required' de token revogado — e zera
            // a espera crescente das falhas transitórias.
            last_error: null,
            error_count: 0,
            next_attempt_at: null,
          }, { onConflict: "email_address" })
          .select()
          .single();

        if (upsertError) throw upsertError;

        // Store tokens encrypted
        await storeTokens(supabase, account.id, tokens.access_token, tokens.refresh_token || "");

        log.done(200, { action });
        return jsonResponse({
          success: true,
          account: { id: account.id, email_address: account.email_address, is_active: account.is_active },
        }, 200, req);
      }

      case "refresh-token": {
        if (!account_id) return errorResponse("Missing account_id", 400, req);
        const { data: account } = await supabase.from("gmail_accounts").select("id, user_id, token_expires_at").eq("id", account_id).eq("user_id", user.id).single();
        if (!account) return errorResponse("Gmail account not found", 404, req);

        const storedTokens = await getTokens(supabase, account.id);

        let tokens: TokenResponse;
        try {
          tokens = await deps.google.refreshToken(storedTokens.refresh_token);
        } catch (refreshError) {
          if (!isGmailReauthError(refreshError)) throw refreshError;
          // Token revogado: marca a conta e devolve 409 com code reauth_required
          // (o app converte em kind:'reauth' e abre a reconexão).
          await recordGmailAccountFailure(supabase, account.id, refreshError, 1);
          log.done(GMAIL_REAUTH_HTTP_STATUS, { action });
          return jsonResponse(gmailReauthErrorPayload(), GMAIL_REAUTH_HTTP_STATUS, req);
        }
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        await storeTokens(supabase, account.id, tokens.access_token, tokens.refresh_token || null);
        await supabase.from("gmail_accounts").update({ token_expires_at: expiresAt }).eq("id", account_id);

        log.done(200, { action });
        return jsonResponse({ success: true, access_token: tokens.access_token, expires_at: expiresAt }, 200, req);
      }

      case "disconnect": {
        if (!account_id) return errorResponse("Missing account_id", 400, req);
        const { data: account, error: accountError } = await supabase
          .from("gmail_accounts")
          .select("id, user_id")
          .eq("id", account_id)
          .eq("user_id", user.id)
          .single();
        if (accountError) {
          if (accountError.code === "PGRST116") return errorResponse("Gmail account not found", 404, req);
          log.error("Falha ao buscar a conta Gmail para desconexao", {
            error: accountError.message ?? "erro desconhecido",
          });
          return errorResponse("Falha ao buscar a conta Gmail", 500, req);
        }
        if (!account) return errorResponse("Gmail account not found", 404, req);

        let revoked: boolean | null = null;
        let revokeStatus: number | null = null;
        const { data: tokenRows, error: tokenError } = await supabase.rpc("get_gmail_tokens", {
          p_account_id: account.id,
        });
        if (tokenError) {
          log.error("Falha ao ler tokens Gmail para desconexao", {
            error: tokenError.message ?? "erro desconhecido",
          });
          return jsonResponse({
            success: false,
            disconnected: false,
            revoked: false,
            partial: true,
            warning: "Nao foi possivel ler os tokens do Gmail para revogar o acesso no Google; a conta local foi preservada para nova tentativa.",
          }, 500, req);
        }

        const storedTokens = tokenRows?.[0] as { access_token: string; refresh_token: string } | undefined;
        if (storedTokens) {
          try {
            const revokeRes = await deps.google.revoke(storedTokens.access_token);
            revokeStatus = revokeRes.status;
            revoked = revokeRes.ok;
          } catch {
            revoked = false;
          }
        }

        // Clear encrypted tokens and deactivate: never call store_gmail_tokens with empty string (raises EXCEPTION)
        const { data: deactivated, error: deactivateError } = await supabase.from("gmail_accounts").update({
          is_active: false,
          access_token_encrypted: null,
          refresh_token_encrypted: null,
        }).eq("id", account_id).select("id");
        if (deactivateError) throw deactivateError;
        // Zero linhas afetadas = nada foi desconectado: nao pode virar success.
        if (!deactivated?.length) throw new Error("Desconexao do Gmail nao aplicada");

        if (revoked === false) {
          // Desconexão parcial: a conta saiu daqui, mas o Google não confirmou a
          // revogação — o cliente precisa saber que sobrou credencial ativa lá.
          log.error("Revogacao Google nao confirmada", { status: revokeStatus });
          log.done(200, { action });
          return jsonResponse({
            success: true,
            disconnected: true,
            revoked: false,
            partial: true,
            warning: "A conta foi desconectada aqui, mas a revogacao do acesso no Google nao foi confirmada.",
          }, 200, req);
        }

        log.done(200, { action });
        return jsonResponse({ success: true, disconnected: true, revoked }, 200, req);
      }

      case "list-accounts": {
        const { data: accounts } = await supabase
          .from("gmail_accounts")
          .select("id, user_id, email_address, is_active, sync_status, last_sync_at, last_error, created_at")
          .eq("user_id", user.id)
          .eq("is_active", true);

        log.done(200, { action, count: accounts?.length });
        return jsonResponse({ accounts: accounts || [] }, 200, req);
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400, req);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    const cors = handleCors(req);
    if (cors) return cors;

    const GOOGLE_CLIENT_ID = requireEnv("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = requireEnv("GOOGLE_CLIENT_SECRET");
    const GOOGLE_REDIRECT_URI = requireEnv("GOOGLE_REDIRECT_URI");
    const SUPABASE_URL = requireEnv("SUPABASE_URL");

    const authHeader = req.headers.get("authorization") ?? "";
    const anonClient = createClient(SUPABASE_URL, requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });

    return handleGmailOAuth(req, {
      supabase: createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY")),
      getUser: async () => {
        const { data, error } = await anonClient.auth.getUser();
        return { user: data.user, error };
      },
      google: {
        clientId: GOOGLE_CLIENT_ID,
        redirectUri: GOOGLE_REDIRECT_URI,
        exchangeCode: (code) => exchangeCode(code, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI),
        refreshToken: (refreshToken) => refreshAccessToken(refreshToken, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET),
        fetchProfile: getGmailProfile,
        revoke: (token) => fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
      },
    });
  });
}
