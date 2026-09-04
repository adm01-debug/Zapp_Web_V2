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

// Normalizações GO→v2 dependentes da rota traduzida (goPath):
// /instance/all → remove `token` de cada instância (credencial de instância
//   do GO; o da instância padrão é o EVOLUTION_INSTANCE_TOKEN). A edge
//   evolution-api é chamável por qualquer usuário logado e nenhum consumidor
//   do front precisa desse campo — com token + URL pública da GO dá pra
//   operar a instância fora do app ·
// /label/list → [{id,name,color}] (o front espera o array v2) ·
// /user/check → [{exists,jid,number,name}] (contrato whatsappNumbers do v2) ·
// demais respostas: injeção aditiva de key/messageId nos envios.
// deno-lint-ignore no-explicit-any
export function normalizeGoResponse(goPath: string | null, data: any): unknown {
  if (goPath === '/label/list' && Array.isArray(data?.data)) {
    // deno-lint-ignore no-explicit-any
    return data.data.map((l: any) => ({
      id: l.label_id ?? l.id, name: l.label_name ?? l.name, color: l.label_color ?? l.color,
    }));
  }
  if (goPath === '/user/check' && Array.isArray(data?.data?.Users)) {
    // deno-lint-ignore no-explicit-any
    return data.data.Users.map((u: any) => ({
      exists: u.IsInWhatsapp === true, jid: u.JID ?? u.RemoteJID ?? null,
      number: u.Query ?? null, ...(u.VerifiedName ? { name: u.VerifiedName } : {}),
    }));
  }
  if (goPath === '/instance/all' && Array.isArray(data?.data)) {
    const instances = data.data.map((instance: Record<string, unknown>) => {
      const safe = { ...instance };
      delete safe.token;
      return safe;
    });
    return { ...data, data: instances };
  }
  return normalizeGoSendResponse(data);
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
  let goPath: string | null = null;
  let contentType = 'application/json';
  if ((Deno.env.get("EVOLUTION_API_FLAVOR") ?? "go") !== "v2") {
    const v2Path = instanceInPath ? `${path}/${instanceInPath}` : path;
    const go = translateV2ToGo(v2Path, method, body);
    if (go?.invalid) {
      console.error(`[Evolution GO] payload invalido em ${v2Path}: ${go.invalid}`);
      // Convencao do proxy: 200 com { error: true, message } — e o que o
      // useEvolutionApiCore le para mostrar toast. Um 400 cru cairia no ramo de
      // erro de rede. Sem corsHeaders o browser nem entrega o corpo.
      return new Response(JSON.stringify({ error: true, message: go.invalid }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (go) {
      path = go.path; method = go.method; body = go.body; instanceInPath = undefined;
      goPath = go.path;
      if (go.contentType) contentType = go.contentType;
      if (go.auth === "instance") {
        const instToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
        if (!instToken) console.error(`[Evolution GO] EVOLUTION_INSTANCE_TOKEN ausente — usando a key global em rota de instância (${go.path}); o GO responderá 401.`);
        apikey = instToken ?? evolutionApiKey;
      }
      console.log(`[Evolution GO] translated → ${method} ${path}`);
    }
  }

  const fullUrl = instanceInPath
    ? `${evolutionApiUrl}${path}/${instanceInPath}`
    : `${evolutionApiUrl}${path}`;

  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': contentType,
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
        const goError = typeof errorData?.error === 'string' ? errorData.error : '';
        let friendlyMessage = 'Erro na API Evolution';
        // deno-lint-ignore no-explicit-any
        if (Array.isArray(responseMsg) && responseMsg.some((m: any) => m.exists === false)) {
          friendlyMessage = 'Número não encontrado no WhatsApp. Verifique se o número está correto e registrado.';
        } else if (response.status === 401) {
          friendlyMessage = 'Chave de API inválida ou sem permissão.';
        } else if (response.status === 404) {
          // No GO um 404 quase sempre é endpoint v2 sem equivalente (gap
          // intencional), não instância inexistente — mensagem honesta.
          friendlyMessage = 'Recurso não suportado pela Evolution GO ou instância não encontrada.';
        } else if (goError) {
          // Shape de erro do GO: {"error":"..."} — expõe a causa real
          friendlyMessage = `Erro na API Evolution: ${goError}`;
        }
        return new Response(JSON.stringify({ error: true, status: response.status, message: friendlyMessage }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(normalizeGoResponse(goPath, data)), {
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

const PRIVATE_STORAGE_URL_PREFIXES = [
  '/storage/v1/object/sign/',
  '/storage/v1/object/public/',
  '/storage/v1/object/authenticated/',
];

function parsePrivateStorageObject(url: string, buckets: string[], expectedOrigin?: string): { bucket: string; path: string } | null {
  try {
    const unsafeRawSegment = url.split(/[?#]/, 1)[0].split('/').some((rawSegment) => {
      const decodedSegment = decodeURIComponent(decodeURIComponent(rawSegment));
      return decodedSegment === '.' || decodedSegment === '..' ||
        decodedSegment.includes('\\') || decodedSegment.includes('\0');
    });
    if (unsafeRawSegment) return null;

    const parsedUrl = new URL(url);
    if (expectedOrigin && parsedUrl.origin !== new URL(expectedOrigin).origin) return null;
    const prefix = PRIVATE_STORAGE_URL_PREFIXES.find((candidate) =>
      parsedUrl.pathname.startsWith(candidate)
    );
    if (!prefix) return null;

    const encodedLocation = parsedUrl.pathname.slice(prefix.length);
    const separatorIndex = encodedLocation.indexOf('/');
    if (separatorIndex <= 0 || separatorIndex === encodedLocation.length - 1) return null;

    const bucket = decodeURIComponent(encodedLocation.slice(0, separatorIndex));
    const path = decodeURIComponent(encodedLocation.slice(separatorIndex + 1));
    const safePath = Boolean(path) && !path.includes('\\') && !path.includes('\0') &&
      path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

    if (!buckets.includes(bucket) || !safePath) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

// Generate a short-lived delivery URL from either a stable private-object
// locator or a legacy (possibly expired) signed URL.
interface PrivateStorageSigner {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number
      ) => PromiseLike<{
        data?: { signedUrl?: string } | null;
        error?: unknown;
      }>;
    };
  };
}

export async function resolvePrivateBucketUrl(
  supabase: PrivateStorageSigner,
  url: string,
  buckets: string[] = ['whatsapp-media', 'audio-messages'],
  expectedOrigin?: string
): Promise<string> {
  if (typeof url !== 'string') return url;
  const objectReference = parsePrivateStorageObject(url, buckets, expectedOrigin);
  if (!objectReference) return url;

  const { data: signedData, error } = await supabase.storage
    .from(objectReference.bucket)
    .createSignedUrl(objectReference.path, 300);

  if (error) throw error;
  if (!signedData?.signedUrl) {
    throw new Error(`Unable to sign private object from bucket ${objectReference.bucket}`);
  }

  return signedData.signedUrl;
}
