import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, requireAuth, enforceRateLimit } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const log = new Logger("get-mapbox-token");
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const rl = await enforceRateLimit(`get-mapbox-token:${auth.userId}`, 60, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);
    const mapboxToken = requireEnv('MAPBOX_PUBLIC_TOKEN');
    log.done(200);
    return jsonResponse({ token: mapboxToken }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
