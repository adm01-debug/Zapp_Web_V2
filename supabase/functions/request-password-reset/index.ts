/**
 * Edge Function: request-password-reset (pública)
 *
 * Ponto de ENTRADA público do fluxo de redefinição (/forgot-password): o
 * visitante está deslogado e não tem JWT. Por que existe em vez do insert
 * direto do cliente:
 *   - `password_reset_requests` tem RLS de INSERT autenticado (a policy
 *     "Authenticated can request own reset" exige user_id = auth.uid()),
 *     então o insert client-side de um anônimo não grava nada;
 *   - `profiles` não é legível por anon — o lookup de existência do e-mail
 *     precisa do service role.
 *
 * Fluxo:
 *   1. Gate zod (422 canônico) — `email` obrigatório e válido; `reason` e
 *      `userAgent` opcionais. O e-mail é normalizado (trim + caixa baixa).
 *   2. Limite de 3 pedidos por e-mail/hora e 10 por IP/hora, medido no próprio
 *      histórico de `password_reset_requests` (a V2 não tem limiter próprio
 *      nesta função). O contador falha ABERTO e marca degradação explícita.
 *   3. Lookup do usuário por e-mail com service role (profiles.user_id).
 *   4. Grava um pedido `pending` (user_id, e-mail, motivo truncado, user_agent,
 *      IP do cabeçalho). A aprovação do admin é a única porta do link.
 *
 * Anti-enumeração: a resposta é SEMPRE `{ success: true }` com o MESMO status —
 * e-mail existente, e-mail inexistente ou limite atingido devolvem o payload
 * idêntico. Nada de conteúdo pessoal (e-mail, IP, motivo) entra no log.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  internalErrorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  getClientIP,
  markDegraded,
} from "../_shared/validation.ts";
import { z, EmailSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

/** No máximo 3 pedidos por e-mail na mesma hora (anti-spam por conta). */
export const MAX_REQUESTS_PER_EMAIL_HOUR = 3;
/** No máximo 10 pedidos por IP na mesma hora (anti-spam por origem). */
export const MAX_REQUESTS_PER_IP_HOUR = 10;
/** O motivo guardado é truncado (não rejeitado) neste tamanho. */
export const MAX_REASON_LENGTH = 500;
/** O user_agent guardado é truncado neste tamanho. */
export const MAX_USER_AGENT_LENGTH = 500;

export const RequestPasswordResetSchema = z.object({
  email: EmailSchema,
  reason: z.string().max(20000).optional(),
  userAgent: z.string().max(5000).optional(),
});

export interface PasswordResetRequestRow {
  user_id: string;
  email: string;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: "pending";
}

/**
 * Só o `code` do erro entra no log (PostgREST/Supabase). NUNCA a mensagem: ela
 * pode trazer a linha que falhou — e a linha tem e-mail/IP/motivo, dado pessoal.
 */
function errorCodeOf(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return err instanceof Error ? err.name : null;
}

export async function handleRequestPasswordReset(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("request-password-reset");

  try {
    // Trim do e-mail ANTES do gate: colar " user@x.com " é normal, não payload
    // inválido (o zod `.email()` recusaria o espaço em volta).
    const rawBody = await req.json().catch(() => null);
    const normalizedBody = rawBody && typeof rawBody === "object" &&
        typeof (rawBody as Record<string, unknown>).email === "string"
      ? { ...(rawBody as Record<string, unknown>), email: ((rawBody as Record<string, unknown>).email as string).trim() }
      : rawBody;
    const parsed = parseBody(RequestPasswordResetSchema, normalizedBody);
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const email = parsed.data.email.toLowerCase();
    const rawReason = parsed.data.reason?.trim();
    const reason = rawReason ? rawReason.slice(0, MAX_REASON_LENGTH) : null;
    const clientIp = getClientIP(req);
    const rawUserAgent = parsed.data.userAgent || req.headers.get("user-agent") || "";
    const userAgent = rawUserAgent.slice(0, MAX_USER_AGENT_LENGTH) || null;

    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Resposta GENÉRICA — idêntica exista ou não o e-mail, e também quando o
    // limite é atingido: nunca confirma a existência de uma conta.
    const genericSuccess = () => jsonResponse({ success: true }, 200, req);

    const since = new Date(Date.now() - 3_600_000).toISOString();

    /**
     * Conta os pedidos recentes na coluna indicada (`email` ou `ip_address`).
     * Limita a consulta a `max` linhas: acima do teto basta saber que chegou lá.
     * Falha ABERTO (como o limiter da V2) — consulta indisponível marca
     * degradação explícita em vez de derrubar um pedido legítimo.
     */
    const overLimit = async (
      column: "email" | "ip_address",
      value: string,
      max: number,
    ): Promise<boolean> => {
      try {
        const { data, error } = await admin
          .from("password_reset_requests")
          .select("id")
          .eq(column, value)
          .gte("created_at", since)
          .limit(max);
        if (error) throw error;
        return (data?.length ?? 0) >= max;
      } catch (err) {
        markDegraded("reset_request_limit_check_unavailable");
        log.warn("Limit check unavailable — failing open", { column, code: errorCodeOf(err) });
        return false;
      }
    };

    if (await overLimit("email", email, MAX_REQUESTS_PER_EMAIL_HOUR)) {
      log.info("Email rate limit reached — generic response");
      return genericSuccess();
    }
    if (clientIp !== "unknown" && await overLimit("ip_address", clientIp, MAX_REQUESTS_PER_IP_HOUR)) {
      log.info("IP rate limit reached — generic response");
      return genericSuccess();
    }

    // Lookup do usuário com service role (profiles não é legível por anon).
    const { data: profile, error: lookupError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (!profile?.user_id) {
      // Sem e-mail no log: a linha sairia como confirmação de inexistência.
      log.info("No profile — generic response");
      return genericSuccess();
    }

    const row: PasswordResetRequestRow = {
      user_id: profile.user_id,
      email,
      reason,
      ip_address: clientIp === "unknown" ? null : clientIp,
      user_agent: userAgent,
      status: "pending",
    };
    const { error: insertError } = await admin.from("password_reset_requests").insert(row);
    if (insertError) throw insertError;

    log.done(200, { created: true });
    return genericSuccess();
  } catch (error: unknown) {
    log.error("Unhandled request", { code: errorCodeOf(error) });
    return internalErrorResponse(error, req);
  }
}

if (import.meta.main) {
  Deno.serve(handleRequestPasswordReset);
}
