// evolution-send.ts — fetch outbound à Evolution com tradução v2→GO aplicada.
// Para functions que chamam a API direto, sem passar pelo evolution-api-proxy.
import { translateV2ToGo } from "./evolution-go-routes.ts";

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

export function evoFetch(
  evolutionUrl: string,
  evolutionKey: string,
  v2Path: string,
  body: unknown,
  fetcher: Fetcher = (u, o) => fetch(u, o),
  v2Method = "POST",
): Promise<Response> {
  let path = v2Path;
  let method = v2Method;
  let finalBody = body;
  let apikey = evolutionKey;
  let contentType = "application/json";
  if ((Deno.env.get("EVOLUTION_API_FLAVOR") ?? "go") !== "v2") {
    const go = translateV2ToGo(v2Path, method, body);
    if (go?.invalid) {
      console.error(`[Evolution GO] payload invalido em ${v2Path}: ${go.invalid}`);
      return new Response(JSON.stringify({ error: go.invalid }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
    if (go) {
      path = go.path;
      method = go.method;
      finalBody = go.body;
      if (go.contentType) contentType = go.contentType;
      if (go.auth === "instance") {
        const instToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
        if (!instToken) console.error(`[Evolution GO] EVOLUTION_INSTANCE_TOKEN ausente — usando a key global em rota de instância (${go.path}); o GO responderá 401.`);
        apikey = instToken ?? evolutionKey;
      }
    }
  }
  return fetcher(`${evolutionUrl}${path}`, {
    method,
    headers: { "Content-Type": contentType, apikey },
    ...(method !== "GET" && finalBody ? { body: JSON.stringify(finalBody) } : {}),
  });
}

// v2 retorna key.id; GO retorna data.Info.ID.
// deno-lint-ignore no-explicit-any
export function extractMessageId(data: any): string | undefined {
  return data?.key?.id ?? data?.data?.Info?.ID;
}

// ── Extractors de resposta (v2 e GO) ─────────────────────────────────────────
// GO envelopa tudo em { message: 'success', data: {...} }.

// getBase64FromMediaMessage (v2): { base64, mimetype }
// downloadmedia (GO): { data: { base64: 'data:<mime>;base64,<raw>', timestamp } }
// deno-lint-ignore no-explicit-any
export function extractBase64Media(json: any): { base64: string; mimetype: string } | null {
  const b64 = json?.base64
    ?? json?.data?.base64
    ?? (typeof json?.data === 'string' ? json.data : undefined)
    ?? json?.media;
  if (typeof b64 !== 'string' || !b64) return null;
  let mimetype = typeof json?.mimetype === 'string' ? json.mimetype : '';
  if (!mimetype && b64.startsWith('data:')) {
    mimetype = b64.slice(5, b64.indexOf(';')) || '';
  }
  return { base64: b64, mimetype: mimetype || 'application/octet-stream' };
}

// fetchProfilePictureUrl (v2): { profilePictureUrl } | { picture } | { url }
// /user/avatar (GO): { data: types.ProfilePictureInfo } → campo URL (sem json tag).
// deno-lint-ignore no-explicit-any
export function extractAvatarUrl(json: any): string | null {
  return json?.profilePictureUrl
    ?? json?.picture
    ?? json?.url
    ?? json?.data?.URL
    ?? json?.data?.url
    ?? null;
}

// connectionState (v2): { instance: { state } } | { state } → 'open'|'close'|'connecting'
// /instance/status (GO): { data: { Connected, LoggedIn, Name } }
// deno-lint-ignore no-explicit-any
export function extractConnectionState(json: any): string {
  const v2 = json?.instance?.state ?? json?.state;
  if (typeof v2 === 'string' && v2) return v2;
  const d = json?.data;
  if (d && typeof d === 'object' && ('LoggedIn' in d || 'Connected' in d)) {
    return (d.LoggedIn ?? d.loggedIn) ? 'open' : 'close';
  }
  return 'unknown';
}
