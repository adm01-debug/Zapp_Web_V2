import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  getClientIP,
  internalErrorResponse,
} from "../_shared/validation.ts";
import { DetectNewDeviceSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { EMAIL_FONT_STACK } from "../_shared/email-font-stack.ts";

// R2-AUTH-004 (item 6): inventário de sessões vinculado à sessão Auth real.
// O `session_id` do claim JWT (validado no servidor por getUser()) mapeia a visita
// para a sessão Auth e é usado como chave de UPSERT da linha pública em
// `user_sessions` por (user_id, auth_session_id) — nunca se insere uma linha nova a
// cada visita e nunca se recebe/confia em session_id vindo do browser. Nenhum token
// é persistido: só o UUID da sessão Auth entra no inventário.

// ─── Helpers puros (testáveis, sem rede) ──────────────────────────────────────

/** Decodifica o payload (base64url) de um JWT de acesso, sem validar assinatura —
 * a assinatura já foi validada pelo getUser(). Serve só para extrair o claim. */
export function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Extrai o `session_id` do claim JWT já validado no servidor. O schema
 * DetectNewDeviceSchema não tem campo `session_id`, então nada do corpo da
 * requisição é aceito aqui — a sessão Auth é sempre derivada do token.
 */
export function extractAuthSessionId(token: string): string | null {
  const claims = decodeJwtClaims(token);
  const sid = claims.session_id;
  return typeof sid === "string" && sid.length > 0 ? sid : null;
}

export type SessionUpsertDecision =
  | { kind: "update"; sessionId: string }
  | { kind: "insert" };

/**
 * Decide se a linha pública desta sessão Auth já existe. Mesma sessão Auth
 * (mesmo auth_session_id) → atualiza a linha existente (sem duplicar); primeira
 * visita desta sessão Auth → insere. A unicidade é reforçada no banco pelo índice
 * parcial idx_user_sessions_auth_session_id (migration do cartão backend).
 */
export function decideSessionUpsert(existingSessionId: string | null): SessionUpsertDecision {
  return existingSessionId ? { kind: "update", sessionId: existingSessionId } : { kind: "insert" };
}

/** Monta a linha de inventário. Só o UUID auth_session_id entra — nunca o token. */
export function buildSessionInsert(args: {
  userId: string;
  deviceId: string;
  authSessionId: string;
  ipAddress: string;
  userAgent: string;
  now: Date;
}): Record<string, unknown> {
  return {
    user_id: args.userId,
    device_id: args.deviceId,
    auth_session_id: args.authSessionId,
    ip_address: args.ipAddress,
    user_agent: args.userAgent,
    is_active: true,
    expires_at: new Date(args.now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function handleDetectNewDevice(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("detect-new-device");

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Unauthorized", 401, req);
    }

    const supabaseUser = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return errorResponse("Unauthorized", 401, req);
    }

    log.info("User authenticated", { userId: user.id });

    // session_id vem do claim JWT validado no servidor — nunca do corpo.
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const authSessionId = extractAuthSessionId(token);

    const parsed = parseBody(DetectNewDeviceSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { device_fingerprint, browser, os, device_name } = parsed.data;
    const clientIp = getClientIP(req);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if device exists
    const { data: existingDevice, error: deviceError } = await supabaseAdmin
      .from("user_devices")
      .select("*")
      .eq("user_id", user.id)
      .eq("device_fingerprint", device_fingerprint)
      .maybeSingle();

    if (deviceError) throw deviceError;

    let isNewDevice = false;
    let deviceId: string;

    if (!existingDevice) {
      isNewDevice = true;
      log.warn("New device detected");

      const { data: newDevice, error: insertError } = await supabaseAdmin
        .from("user_devices")
        .insert({
          user_id: user.id,
          device_fingerprint,
          device_name,
          browser,
          os,
          ip_address: clientIp,
          is_trusted: false,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      deviceId = newDevice.id;

      // Send email notification
      const userEmail = user.email;
      if (userEmail && RESEND_API_KEY) {
        try {
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="font-family: ${EMAIL_FONT_STACK}; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Alerta de Segurança</h1>
              </div>
              <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef; border-top: none;">
                <p style="font-size: 16px;">Detectamos um <strong>novo login</strong> na sua conta a partir de um dispositivo desconhecido.</p>
                <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #667eea;">Detalhes do Dispositivo:</h3>
                  <table style="width: 100%; font-size: 14px;">
                    <tr><td style="padding: 8px 0; color: #666;"><strong>Dispositivo:</strong></td><td>${device_name}</td></tr>
                    <tr><td style="padding: 8px 0; color: #666;"><strong>Navegador:</strong></td><td>${browser}</td></tr>
                    <tr><td style="padding: 8px 0; color: #666;"><strong>Sistema:</strong></td><td>${os}</td></tr>
                    <tr><td style="padding: 8px 0; color: #666;"><strong>IP:</strong></td><td>${clientIp}</td></tr>
                    <tr><td style="padding: 8px 0; color: #666;"><strong>Data/Hora:</strong></td><td>${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td></tr>
                  </table>
                </div>
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px;">
                  <p style="margin: 0; font-size: 14px; color: #856404;"><strong>⚠️ Não reconhece este acesso?</strong><br>Altere sua senha e habilite a autenticação em duas etapas (2FA).</p>
                </div>
              </div>
            </body>
            </html>`;

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
              from: "ZAPP Segurança <seguranca@promobrindes.com.br>",
              to: [userEmail],
              subject: "🔐 Novo dispositivo detectado na sua conta",
              html: emailHtml,
            }),
          });
          log.info("Security email sent");
        } catch (emailError) {
          log.error("Error sending email", { error: emailError instanceof Error ? emailError.message : String(emailError) });
        }
      }

      // Create security alert
      await supabaseAdmin.from("security_alerts").insert({
        user_id: user.id,
        alert_type: "new_device",
        severity: "medium",
        title: "Novo dispositivo detectado",
        description: `Login realizado a partir de ${browser} em ${os} (IP: ${clientIp})`,
        ip_address: clientIp,
        metadata: { device_fingerprint, browser, os, device_name },
      });
    } else {
      deviceId = existingDevice.id;
      log.info("Known device, updating last_seen");

      await supabaseAdmin
        .from("user_devices")
        .update({ last_seen_at: new Date().toISOString(), ip_address: clientIp })
        .eq("id", deviceId);
    }

    // Inventário da sessão por (user_id, auth_session_id) — UPSERT, não insert por visita.
    let sessionId: string | null = null;
    if (authSessionId) {
      const { data: existingSession, error: existingErr } = await supabaseAdmin
        .from("user_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("auth_session_id", authSessionId)
        .maybeSingle();

      if (existingErr) throw existingErr;

      const decision = decideSessionUpsert(existingSession?.id ?? null);
      const userAgent = req.headers.get("user-agent") || "unknown";

      if (decision.kind === "update") {
        const { error: updateErr } = await supabaseAdmin
          .from("user_sessions")
          .update({
            device_id: deviceId,
            ip_address: clientIp,
            user_agent: userAgent,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", decision.sessionId);

        if (updateErr) throw updateErr;
        sessionId = decision.sessionId;
      } else {
        const { data: created, error: insertErr } = await supabaseAdmin
          .from("user_sessions")
          .insert(buildSessionInsert({
            userId: user.id,
            deviceId,
            authSessionId,
            ipAddress: clientIp,
            userAgent,
            now: new Date(),
          }))
          .select()
          .single();

        if (insertErr) throw insertErr;
        sessionId = created?.id ?? null;
      }
    } else {
      log.warn("JWT sem claim session_id; inventário de sessão não foi criado/atualizado");
    }

    log.done(200);
    return jsonResponse({
      is_new_device: isNewDevice,
      device_id: deviceId,
      session_id: sessionId,
      message: isNewDevice ? "New device detected and email sent" : "Known device updated"
    }, 200, req);

  } catch (error: unknown) {
    log.error("Error", { error: error instanceof Error ? error.message : String(error) });
    return internalErrorResponse(error, req);
  }
}

if (import.meta.main) Deno.serve(handleDetectNewDevice);
