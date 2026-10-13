import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";
import { aiCapabilityFlagKey, readCapabilityFlag } from "../_shared/ai-feature-flags.ts";

// `import.meta.main` (mesmo padrão de `elevenlabs-tts`/`elevenlabs-sts`): o handler
// pode ser importado por teste sem subir o servidor.
export async function handleElevenLabsAgentToken(req: Request): Promise<Response> {
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
    // IA-009 / SL-010b (decisão do cartão t_98090b40): kill switch de voz lido no
    // SERVIDOR antes de tocar o provedor pago. Emitir o token de conversa é o que
    // permite a sessão de voz começar: flag desligada (ou leitura não confiável)
    // NEGA — nenhuma chamada à ElevenLabs e nenhum token emitido. `jsonResponse`
    // (nunca `errorResponse` em 5xx: acima de 500 o corpo vira "Internal server
    // error" e o consumidor perderia o código).
    const voiceEnabled = await readCapabilityFlag(aiCapabilityFlagKey("voice"));
    if (voiceEnabled !== true) {
      log.warn("IA de voz desativada por flag — token nao emitido e provedor nao chamado");
      return jsonResponse(
        { error: { code: "AI_DISABLED", message: "IA de voz desativada por flag." } },
        503,
        req,
      );
    }

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
}

if (import.meta.main) {
  Deno.serve(handleElevenLabsAgentToken);
}
