// evolution-send.ts — fetch outbound à Evolution com tradução v2→GO aplicada.
// Para functions que chamam a API direto, sem passar pelo evolution-api-proxy.
import { translateV2ToGo } from "./evolution-go-routes.ts";

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

export async function evoFetch(
  evolutionUrl: string,
  evolutionKey: string,
  v2Path: string,
  body: unknown,
  fetcher: Fetcher = (u, o) => fetch(u, o),
  v2Method = "POST",
  signal?: AbortSignal,
  // E15 (plano multi-conexão): token da instância, resolvido pelo chamador
  // (hoje ninguém resolve por instância ainda — isso chega com E16/E18/E19,
  // depois que E09/E10 existirem no banco). Enquanto nenhum chamador passar
  // isto, cai no fallback EVOLUTION_INSTANCE_TOKEN abaixo — comportamento
  // idêntico ao de antes desta etapa.
  instanceToken?: string,
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
        const fallbackToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
        if (instanceToken) {
          apikey = instanceToken;
        } else if (fallbackToken) {
          console.error(`[Evolution GO] instanceToken não informado para rota de instância (${go.path}) — usando fallback EVOLUTION_INSTANCE_TOKEN (remover após E10/E21).`);
          apikey = fallbackToken;
        } else {
          // Nunca cair silenciosamente na key global (admin): ela não é a
          // credencial da instância e a GO devolveria um 401 confuso.
          return new Response(JSON.stringify({ error: "instance token ausente" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
      }
    }
  }
  return fetcher(`${evolutionUrl}${path}`, {
    method,
    headers: { "Content-Type": contentType, apikey },
    ...(method !== "GET" && finalBody ? { body: JSON.stringify(finalBody) } : {}),
    ...(signal ? { signal } : {}),
  });
}

// v2 retorna key.id; GO retorna data.Info.ID.
export function extractMessageId(data: unknown): string | undefined {
  const d = data as { key?: { id?: string }; data?: { Info?: { ID?: string } } };
  return d?.key?.id ?? d?.data?.Info?.ID;
}

// ── Extractors de resposta (v2 e GO) ─────────────────────────────────────────
// GO envelopa tudo em { message: 'success', data: {...} }.

// getBase64FromMediaMessage (v2): { base64, mimetype }
// downloadmedia (GO): { data: { base64: 'data:<mime>;base64,<raw>', timestamp } }
export function extractBase64Media(json: unknown): { base64: string; mimetype: string } | null {
  const j = json as {
    base64?: unknown;
    media?: unknown;
    mimetype?: unknown;
    data?: unknown;
  };
  const b64 = j?.base64
    ?? (j?.data as { base64?: unknown } | undefined)?.base64
    ?? (typeof j?.data === 'string' ? j.data : undefined)
    ?? j?.media;
  if (typeof b64 !== 'string' || !b64) return null;
  let mimetype = typeof j?.mimetype === 'string' ? j.mimetype : '';
  if (!mimetype && b64.startsWith('data:')) {
    mimetype = b64.slice(5, b64.indexOf(';')) || '';
  }
  return { base64: b64, mimetype: mimetype || 'application/octet-stream' };
}

// fetchProfilePictureUrl (v2): { profilePictureUrl } | { picture } | { url }
// /user/avatar (GO): { data: types.ProfilePictureInfo } → campo URL (sem json tag).
export function extractAvatarUrl(json: unknown): string | null {
  const j = json as {
    profilePictureUrl?: string;
    picture?: string;
    url?: string;
    data?: { URL?: string; url?: string };
  };
  return j?.profilePictureUrl
    ?? j?.picture
    ?? j?.url
    ?? j?.data?.URL
    ?? j?.data?.url
    ?? null;
}

// connectionState (v2): { instance: { state } } | { state } → 'open'|'close'|'connecting'
// /instance/status (GO): { data: { Connected, LoggedIn, Name } }
export function extractConnectionState(json: unknown): string {
  const j = json as {
    instance?: { state?: unknown };
    state?: unknown;
    data?: { LoggedIn?: unknown; loggedIn?: unknown; Connected?: unknown };
  };
  const v2 = j?.instance?.state ?? j?.state;
  if (typeof v2 === 'string' && v2) return v2;
  const d = j?.data;
  if (d && typeof d === 'object' && ('LoggedIn' in d || 'Connected' in d)) {
    return (d.LoggedIn ?? d.loggedIn) ? 'open' : 'close';
  }
  return 'unknown';
}
