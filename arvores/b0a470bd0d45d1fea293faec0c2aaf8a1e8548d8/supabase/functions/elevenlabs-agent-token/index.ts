import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-agent-token");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`elevenlabs-agent-token:${auth.userId}`, 30, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const ELEVENLABS_API_KEY = requireEnv('ELEVENLABS_API_KEY');
    const ELEVENLABS_AGENT_ID = requireEnv('ELEVENLABS_AGENT_ID');

    log.info("Requesting ElevenLabs conversation token", { agentId: ELEVENLABS_AGENT_ID });

    const iniciadoEm = Date.now();
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      }
    );

    // SL-013 / IA-003 B6 — toda chamada ao provedor PAGO deixa rastro no ledger.
    // Esta emite a credencial da sessão de conversa: não há unidade de cobrança
    // AQUI (o consumo da conversa é cobrado no uso), então a linha declara
    // `usage_unknown: true` e `billing_unit: "none"` — nem zero, nem invenção.
    await logAiUsageDetached({
      functionName: "elevenlabs-agent-token",
      userId: auth.userId,
      model: null,
      durationMs: Date.now() - iniciadoEm,
      status: response.ok ? "success" : "error",
      errorMessage: response.ok ? null : `ElevenLabs HTTP ${response.status}`,
      usageUnknown: true,
      metadata: {
        provider: "elevenlabs",
        endpoint: "/v1/convai/conversation/token",
        billing_unit: "none",
        billing_quantity: null,
        http_status: response.status,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("ElevenLabs token error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 401) return errorResponse('Invalid ElevenLabs API key', 401, req);
      if (response.status === 429) return errorResponse('Rate limit exceeded', 429, req);
      return errorResponse('Failed to get conversation token', 500, req);
    }

    const data = await response.json();
    log.done(200);
    return jsonResponse({ token: data.token }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
