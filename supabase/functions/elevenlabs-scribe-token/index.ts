import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, enforceRateLimit } from "../_shared/validation.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";

// LAC P2 (doc 07, achado de voz): a chamada ao provedor PAGO não tinha prazo —
// uma rede travada deixava a request pendurada até o gateway cortar, e a
// exceção caía num 500 genérico ("Internal server error") sem registrar o custo.
// O teto abaixo aborta a chamada, devolve 504 claro e registra o custo no ledger
// mesmo quando o provedor não responde.
const ELEVENLABS_SCRIBE_TIMEOUT_MS = 10_000;

/** O estouro de prazo chega como `AbortError` ou `TimeoutError` — mesma causa. */
function isTimeoutError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;
    return name === "AbortError" || name === "TimeoutError";
  }
  return false;
}

/**
 * `fetch` com prazo: devolve a resposta OU a causa da falha sem resposta
 * (`timedOut`: prazo estourado × erro de rede). Não engole o erro — só o
 * classifica, para o chamador decidir o status e o ledger.
 */
async function fetchComPrazo(
  input: string,
  init: RequestInit,
): Promise<{ response: Response } | { timedOut: boolean }> {
  try {
    return { response: await fetch(input, init) };
  } catch (err) {
    return { timedOut: isTimeoutError(err) };
  }
}

export async function handleElevenLabsScribeToken(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-scribe-token");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rl = await enforceRateLimit(`elevenlabs-scribe-token:${auth.userId}`, 30, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const ELEVENLABS_API_KEY = requireEnv('ELEVENLABS_API_KEY');

    log.info("Requesting ElevenLabs realtime scribe token");

    const iniciadoEm = Date.now();
    const envio = await fetchComPrazo('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      signal: AbortSignal.timeout(ELEVENLABS_SCRIBE_TIMEOUT_MS),
    });
    const response = "response" in envio ? envio.response : null;
    const prazoEstourou = "timedOut" in envio ? envio.timedOut : false;

    // SL-013 / IA-003 B6 — chamada ao provedor PAGO com rastro no ledger. Este
    // endpoint emite a credencial de transcrição em tempo real: não há unidade
    // de cobrança nesta chamada (o consumo é cobrado no uso), então a linha
    // declara `usage_unknown: true` e `billing_unit: "none"`. A linha é escrita
    // TAMBÉM quando o provedor não responde (timeout/rede): assim o custo não
    // some do ledger no caminho de erro.
    await logAiUsageDetached({
      functionName: "elevenlabs-scribe-token",
      userId: auth.userId,
      model: null,
      durationMs: Date.now() - iniciadoEm,
      status: response?.ok ? "success" : "error",
      errorMessage: response === null
        ? (prazoEstourou
          ? `ElevenLabs timeout (${ELEVENLABS_SCRIBE_TIMEOUT_MS}ms)`
          : "ElevenLabs network error")
        : (response.ok ? null : `ElevenLabs HTTP ${response.status}`),
      usageUnknown: true,
      metadata: {
        provider: "elevenlabs",
        endpoint: "/v1/single-use-token/realtime_scribe",
        billing_unit: "none",
        billing_quantity: null,
        http_status: response?.status ?? null,
      },
    });

    if (response === null) {
      log.error("ElevenLabs unreachable", { timeout: prazoEstourou });
      // 504 claro e SEM vazar detalhe interno (`errorResponse` mascararia o corpo
      // de um 5xx para "Internal server error").
      if (prazoEstourou) {
        return jsonResponse(
          { error: { code: "AI_TIMEOUT", message: "O provedor de voz demorou para responder. Tente novamente." } },
          504,
          req,
        );
      }
      return jsonResponse(
        { error: { code: "AI_PROVIDER_UNREACHABLE", message: "Não foi possível falar com o provedor de voz. Tente novamente." } },
        502,
        req,
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      log.error("ElevenLabs token error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 401) return errorResponse('Invalid ElevenLabs API key', 401, req);
      if (response.status === 429) return errorResponse('Rate limit exceeded', 429, req);
      return errorResponse('Failed to get transcription token', 500, req);
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
  Deno.serve(handleElevenLabsScribeToken);
}
