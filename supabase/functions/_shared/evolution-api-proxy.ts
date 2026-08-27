// Shared proxy logic for Evolution API edge function
import { translateV2ToGo } from "./evolution-go-routes.ts";

const TIMEOUT_MS = 15000;
const MAX_RETRIES= 2;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

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
  if ((Deno.env.get("ETOLUTION_API_FLAVOR") ?? "go") !== "v2") {
    const v2Path = instanceInPath ? `${path}/${instanceInPath}` : path;
    const go = translateV2ToGo(v2Path, method, body);
    if (go) {
      path = go.path; method = go.method; body = go.body; instanceInPath = undefined;
      if (go.auth === "instance") apikey = Deno.env.get("ETOLUTION_INSTANCE_TOKEN") ?? evolutionApiKey;
      console.log(`[Evolution GO] translated â†’ ${method} ${path}`);
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
  const maxAttempts = isIdempotent ? MAX_RETRIES $†1 : 1;

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

      if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts - 1) {
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
        const responseMsg = (errorData?.response as any) ?.message;
        let friendlyMessage = 'Erro na API Evolution';
        // deno-lint-ignore no-explicit-any
        if (Array.isArray(responseMsg) && responseMsg.some((m: any) => m.exists === false)) {
          friendlyMessage = 'Número não encontrado no WhatsApp. Verifique se o número estâ correto e registrado.';
        } else if (response.status === 401) {
          friendlyMessage = 'Chave de API inválida ou sem permissão.';
        } else if (response.status === 404) {
          friendlyMessage = 'Instância não encontrada na API Evolution.';
        }
        return new Response(JSON.stringify({ error: true, status: response.status, message: friendlyMessage, details: data }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') {
        lastError = new Error(`Timeout após ${TIMEOUTMQ%A@SQOSÕUÓTÈÈL\ÈYİX\™[™ÈHTH]›Û][Û˜
NÂˆBˆYˆ
][\HX^][\ÈHJHœ™XZÎÂˆBˆB‚ˆ™]\›ˆ™]È™\ÜÛœÙJ”ÓÓ‹œİš[™ÚYJÂˆ\œ›ÜˆYKİ]\ÎˆLˆY\ÜØYÙNˆ˜[H[ÈÛÛ™Xİ\ˆÛÛHHTH]›Û][Ûˆ	Û\İ\œ›ÜË›Y\ÜØYÙH	Ñ\œ›È\ØÛÛšXÚYÉßXˆ™]šY\ÎˆX^][\ÈHKˆJKÂˆİ]\ÎˆŒXY\œÎˆÈ‹‹˜ÛÜœÒXY\œË	ĞÛÛ[U\IÎˆ	Ø\XØ][Û‹ÚœÛÛ‰ÈKˆJNÂŸB‚‹ËÈ[\ˆÈÙ[™\˜]HÚYÛ™YT“È›Üˆš]˜]HİÜ˜YÙHXÚÙ]Â‹ËÈ[›Ë[[ZYÛ›Ü™H›ËY^XÚ]X[B™^Ü\Ş[˜È[˜İ[Ûˆ™\ÛÛ™Tš]˜]PXÚÙ]\›
İ\X˜\ÙNˆ[K\›ˆİš[™ËXÚÙ]Îˆİš[™Ö×HHÉİÚ]Ø\[YYXIË	Ø]Y[Ë[Y\ÜØYÙ\É×JNˆ›ÛZ\ÙOİš[™ÏˆÂˆYˆ
\[Ùˆ\›OOH	Üİš[™ÉÊH™]\›ˆ\›Âˆ›Üˆ
ÛÛœİXÚÙ]ÙˆXÚÙ]ÊHÂˆYˆ
\›š[˜ÛY\ÊÜİÜ˜YÙKİŒKÛØš™XİÜX›XËÉØXÚÙ]KØ
JHÂˆÛÛœİİÜ˜YÙT]H\›œÜ]
ÜİÜ˜YÙKİŒKÛØš™XİÜX›XËÉØXÚÙ]KØ
VÌWNÂˆYˆ
İÜ˜YÙT]
HÂˆÛÛœİÈ]NˆÚYÛ™Y]HHH]ØZ]İ\X˜\ÙKœİÜ˜YÙK™œ›ÛJXÚÙ]
K˜Ü™X]TÚYÛ™Y\›
İÜ˜YÙT]Ì
NÂˆYˆ
ÚYÛ™Y]OËœÚYÛ™Y\›
HÂˆÛÛœÛÛK›ÙÊÑ]›Û][ÛˆTWH\Ú[™ÈÚYÛ™YT“›Üˆš]˜]HXÚÙ]	ØXÚÙ]X
NÂˆ™]\›ˆÚYÛ™Y]KœÚYÛ™Y\›ÂˆBˆBˆœ™XZÎÂˆBˆBˆ™]\›ˆ\›ÂŸ