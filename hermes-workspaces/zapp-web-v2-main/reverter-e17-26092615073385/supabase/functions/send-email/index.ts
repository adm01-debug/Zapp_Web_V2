import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { SendEmailSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("send-email");

  const ip = getClientIP(req);
  const rl = checkRateLimit(`send-email:${ip}`, 30, 60_000);
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

  try {
    const RESEND_API_KEY = requireEnv("RESEND_API_KEY");

    const parsed = parseBody(SendEmailSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const body = parsed.data;

    const payload: Record<string, unknown> = {
      from: body.from || "ZAPP System <noreply@zapp.com>",
      to: Array.isArray(body.to) ? body.to : [body.to],
      subject: body.subject,
    };

    if (body.html) payload.html = body.html;
    if (body.text) payload.text = body.text;
    if (body.reply_to) payload.reply_to = body.reply_to;
    if (body.cc) payload.cc = body.cc;
    if (body.bcc) payload.bcc = body.bcc;
    if (body.attachments) payload.attachments = body.attachments;

    log.info("Sending email", { to: payload.to, subject: body.subject });

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
});
