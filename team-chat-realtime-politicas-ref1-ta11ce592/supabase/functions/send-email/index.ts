import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { z, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

// R2-API-022 (P1): o relay `send-email` era um buraco de autorização — qualquer chamador
// admitido pelo gateway podia usar a chave Resend do projeto para conteúdo e destinatários
// arbitrários (subject/html/text/cc/bcc/attachments/from vinham do payload, sem getUser/role).
//
// Correção (somente este relay): o único fluxo é o convite de membro. O cliente informa apenas
// o e-mail do convidado, o nome (opcional) e o cargo; o remetente, o assunto e o corpo derivam
// de um template FIXO do servidor. Antes de tocar em RESEND_API_KEY ou no payload, a chamada
// autentica o JWT e exige papel admin/supervisor (RPC canônica `is_admin_or_supervisor`).
// .strict(): campos fora do contrato (subject/html/text/cc/bcc/attachments/from/to/...)
// são REJEITADOS com 422 — o .strip padrão do zod só descartaria em silêncio.
const InviteAgentSchema = z.object({
  email: z.string().email("Invalid email").max(255),
  name: z.string().max(200).optional(),
  role: z.enum(["agent", "supervisor", "admin"]).optional().default("agent"),
}).strict();

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  agent: "Atendente",
};

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** `name` vem do cliente e é interpolado no HTML — sem escape viraria markup injetado. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

/** Template de convite do servidor: destinatário e conteúdo vinculados ao fluxo autorizado. */
export function buildInvitePayload(input: { email: string; name?: string; role?: string }) {
  const name = escapeHtml(input.name?.trim() || "colega");
  const role = input.role ?? "agent";
  const label = ROLE_LABEL[role] ?? "Atendente";
  return {
    // Remetente fixo no servidor: o cliente nunca escolhe o "from".
    from: "ZAPP System <noreply@promobrindes.com.br>",
    to: [input.email],
    subject: "Convite para a plataforma ZAPP",
    html: [
      "<h2>Você foi convidado!</h2>",
      `<p>Olá ${name},</p>`,
      `<p>Você foi convidado para participar da plataforma ZAPP como <strong>${label}</strong>.</p>`,
      "<p>Acesse a plataforma e crie sua conta para começar.</p>",
    ].join("\n"),
  };
}

export async function handleSendEmailRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("send-email");

  const ip = getClientIP(req);
  const rl = checkRateLimit(`send-email:${ip}`, 30, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    // 1) Identidade obrigatória ANTES de ler o payload ou tocar em RESEND_API_KEY.
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return errorResponse("Missing Authorization bearer token", 401, req);
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const caller = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return errorResponse("Unauthorized", 401, req);

    // 2) Papel privilegiado (admin/supervisor) via RPC canônica já existente.
    const { data: isStaff, error: roleError } = await caller.rpc("is_admin_or_supervisor", {
      _user_id: user.id,
    });
    if (roleError || !isStaff) {
      return errorResponse("Only admins or supervisors can send invites", 403, req);
    }

    // 3) Payload estreito do convite: e-mail/nome/cargo apenas. subject/html/text/cc/bcc/
    //    attachments/from são rejeitados pelo schema (não existem no contrato do convite).
    const parsed = parseBody(InviteAgentSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    // 4) Só agora a chave Resend é lida e o efeito acontece.
    const RESEND_API_KEY = requireEnv("RESEND_API_KEY");
    const payload = buildInvitePayload(parsed.data);

    log.info("Sending invite email", { to: payload.to, role: parsed.data.role });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      log.error("Resend API error", { status: response.status, detail: JSON.stringify(data).substring(0, 300) });
      return errorResponse("Failed to send email", response.status, req);
    }

    log.done(200, { emailId: data.id });
    return jsonResponse({ success: true, id: data.id }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : "Internal error", 500, req);
  }
}

if (import.meta.main) Deno.serve(handleSendEmailRequest);
