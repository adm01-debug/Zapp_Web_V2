// Shared proxy logic for Evolution API edge function
import { translateV2ToGo } from "./evolution-go-routes.ts";

// GO responde envios como { message:'success', data:{ Info:{ ID, Chat, IsFromMe,… }, Message } }.
// O frontend (messageSender, useChatMediaSending, useSendProduct) lê key.id/messageId (shape v2).
// Injeta os campos v2 no topo sem remover o payload GO — normalização única para todos os consumidores.
// deno-lint-ignore no-explicit-any
export function normalizeGoSendResponse(data: any): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (data.key?.id) return data; // já é shape v2
  const info = data.data?.Info;
  const id = info?.ID;
  if (typeof id !== 'string' || !id) return data;
  return {
    ...data,
    key: { id, remoteJid: info?.Chat, fromMe: info?.IsFromMe ?? true },
    messageId: id,
  };
}

const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function proxyToEvolution(
  evolutionApiUrl: string,
  evolutionApiKey: string,
  corsHeaders: Record<string, string>,
  path: string,
  method: string = 'POST',
  body?: unknown,
  instanceInPath?: string
): Promise<Response> {
  let apikey = evolutionApiKey;
  if ((Deno.env.get("EVOLUTION_API_FLAVOR") ?? "go") !== "v2") {
    const v2Path = instanceInPath ? `${path}/${instanceInPath}` : path;
    const go = translateV2ToGo(v2Path, method, body);
    if (go) {
      path = go.path; method = go.method; body = go.body; instanceInPath = undefined;
      if (go.auth === "instance") apikey = Deno.env.get("EVOLUTION_INSTANCE_TOKEN") ?? evolutionApiKey;
      console.log(`[Evolution GO] translated → ${method} ${path}`);
    }
  }

  const fullUrl = instanceInPath
    ? `${evolutionApiUrl}${path}/${instanceInPath}`
    : `${evolutionApiUrl}${path}`;

  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': apikey,
    },
  };
  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  let lastError: Error | null = null;
  const isIdempotent = method === 'GET' || method === 'PUT' || method === 'DELETE';
  const maxAttempts = isIdempotent ? MAX_RETRIES + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Evolution API] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms for ${method} ${fullUrl}`);
        await sleep(delay);
      }

      console.log(`[Evolution API] ${method} ${fullUrl} (attempt ${attempt + 1})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(fullUrl, { ...opts, signal: controller.signal });
      clearTimeout(timeoutId);

      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts - 1) {
        console.warn(`[Evolution API] Got ${response.status}, will retry...`);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      let data: unknown;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try { data = JSON.parse(text); } catch { data = { rawResponse: text, status: response.status }; }
      }

      if (!response.ok) {
        const errorData = data as Record<string, unknown>;
        // deno-lint-ignore no-explicit-any
        const responseMsg = (errorData?.response as any)?.message;
        let friendlyMessage = 'Erro na API Evolution';
        // deno-lint-ignore no-explicit-any
        if (Array.isArray(responseMsg) && responseMsg.some((m: any) => m.exists === false)) {
          friendlyMessage = 'Número não encontrado no WhatsApp. Verifique se o número está correto e registrado.';
        } else if (response.status === 401) {
          friendlyMessage = 'Chave de API inválida ou sem permissão.';
        } else if (response.status === 404) {
          friendlyMessage = 'Instância não encontrada na API Evolution.';
        }
        return new Response(JSON.stringify({ error: true, status: response.status, message: friendlyMessage, details: data }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(normalizeGoSendResponse(data)), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') {
        lastError = new Error(`Timeout após ${TIMEOUT_MS / 1000}s aguardando a API Evolution`);
      }
      if (attempt >= maxAttempts - 1) break;
    }
  }

  return new Response(JSON.stringify({
    error: true, status: 504,
    message: `Falha ao conectar com a API Evolution: ${lastError?.message || 'Erro desconhecido'}`,
    retries: maxAttempts - 1,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper to generate signed URLs for private storage buckets
// deno-lint-ignore no-explicit-any
export async function resolvePrivateBucketUrl(supabase: any, url: string, buckets: string[] = ['whatsapp-media', 'audio-messages']): Promise<string> {
  if (typeof url !== 'string') return url;
  for (const bucket of buckets) {
    if (url.includes(`/storage/v1/object/public/${bucket}/`)) {
      const storagePath = url.split(`/storage/v1/object/public/${bucket}/`)[1];
      if (storagePath) {
        const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 300);
        if (signedData?.signedUrl) {
          console.log(`[Evolution API] Using signed URL for private bucket ${bucket}`);
          return signedData.signedUrl;
        }
      }
      break;
    }
  }
  return url;
}
