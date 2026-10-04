/**
 * Política de egress dos provedores de IA configuráveis (IA-EGRESS-001).
 *
 * O endpoint (`api_endpoint`) e o nome do secret (`api_key_secret_name`) de
 * `ai_providers` são configuráveis pelo painel administrativo e, antes deste
 * módulo, eram usados crus:
 *   - `ai-providers.ts` fazia `fetch(params.endpoint)` sem validar destino,
 *     permitindo SSRF (loopback, link-local/metadata, IP privado, porta não
 *     padrão, redirect) e enviando o cabeçalho `Authorization` para esse alvo;
 *   - `ai-generate.ts`/`ai-proxy` faziam `Deno.env.get(secretName)` com o nome
 *     vindo do banco, permitindo selecionar um secret de INFRAESTRUTURA
 *     (ex.: `SUPABASE_SERVICE_ROLE_KEY`) como credencial de provedor e
 *     exfiltrá-lo para um endpoint controlado.
 *
 * Este módulo é puro (sem Deno.env, sem I/O) e fornece:
 *   1. `validateAiProviderEndpoint` — valida o destino ANTES de qualquer fetch;
 *   2. `validateAiProviderSecretName` — restringe o secret a um nome de chave de
 *      provedor (formato canônico) fora da lista de secrets de infraestrutura;
 *   3. `validatedAiFetch` — fetch com `redirect: "manual"` e revalidação de CADA
 *      redirect (um host permitido não pode empurrar a chamada para um destino
 *      bloqueado). Redirect para OUTRA origem (protocolo+host+porta) é recusado:
 *      refazer o `init` em outro host repassaria `Authorization`/`x-api-key`,
 *      coisa que o fetch padrão impede removendo `Authorization` em redirect
 *      cross-origin. Em 303 (ou 301/302 vindo de POST) o método vira GET e o
 *      body é descartado, como manda a especificação.
 *
 * LIMITAÇÃO conhecida: a validação é sobre o texto da URL. Um hostname que
 * resolve para IP privado (ex.: `127.0.0.1.nip.io`) passa pela validação —
 * resolução DNS + `isBlockedIpAddress` fica registrada como pendência.
 *
 * Fail-closed: o que não casar com as regras é rejeitado.
 */

import { isBlockedIpAddress } from "./ssrf.ts";

/** Teto de caracteres de uma URL de endpoint (mesma família do media-egress). */
const MAX_ENDPOINT_CHARS = 4096;

/** Porta explícita permitida: nenhuma (padrão do https = 443) ou a própria 443. */
const ALLOWED_EXPLICIT_PORTS = new Set(["", "443"]);

/** Sufixos de hostname que nunca são destino externo válido de provedor. */
const BLOCKED_HOSTNAME_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "lan",
  "home",
  "corp",
  "intranet",
] as const;

/** Nomes de secret de INFRAESTRUTURA que jamais podem virar credencial de provedor. */
export const AI_PROVIDER_SECRET_NAME_BLOCKLIST: readonly string[] = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_FUNCTIONS_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE_TOKEN",
  "EVOLUTION_INSTANCE_NAME",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_FLAVOR",
  "CRON_SECRET",
  "INTERNAL_ALERT_SECRET",
  "PREVIEW_EGRESS_SHARED_SECRET",
  "PREVIEW_EGRESS_PROXY_URL",
  "MEDIA_EGRESS_ALLOWED_HOSTS",
  "MEDIA_EGRESS_ALLOWED_ORIGINS",
  "TALKX_ENGINE_JWT",
  "TALKX_ENGINE_ANON_JWT",
  "TALKX_ENGINE_POSTGREST_URL",
  "TALKX_LINK_BASE_URL",
  "RESEND_API_KEY",
  "PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY",
  "PROMOGIFTS_SUPABASE_URL",
  "BITRIX_WEBHOOK_URL",
  "CHATBOT_L1_WEBHOOK_SECRET",
];

export type AiEndpointValidation =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export type AiSecretNameValidation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/** Literal de IP (IPv4 ou IPv6) — endpoint de provedor deve ser nome DNS, não IP. */
function isIpLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

/**
 * Valida o endpoint de um provedor de IA. Só passa HTTPS público, sem
 * credencial embutida, sem IP (privado ou literal), sem porta não padrão e sem
 * hostname interno/localhost. Devolve a URL normalizada ou o motivo da recusa.
 */
export function validateAiProviderEndpoint(raw: string): AiEndpointValidation {
  if (typeof raw !== "string") {
    return { ok: false, reason: "endpoint não é texto" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "endpoint vazio" };
  }
  if (trimmed.length > MAX_ENDPOINT_CHARS) {
    return { ok: false, reason: "endpoint excede o tamanho máximo" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "endpoint não é uma URL válida" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "endpoint precisa ser https" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "endpoint não pode conter credencial embutida" };
  }
  if (!ALLOWED_EXPLICIT_PORTS.has(url.port)) {
    return { ok: false, reason: "endpoint usa porta não permitida" };
  }

  const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (hostname.length === 0) {
    return { ok: false, reason: "endpoint sem hostname" };
  }
  if (isBlockedIpAddress(hostname) || isIpLiteral(hostname)) {
    return { ok: false, reason: "endpoint aponta para IP privado/literal" };
  }
  if (!hostname.includes(".")) {
    return { ok: false, reason: "endpoint usa hostname sem domínio público" };
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
      return { ok: false, reason: "endpoint aponta para hostname interno" };
    }
  }

  return { ok: true, url };
}

/**
 * Valida o nome do secret de provedor: formato canônico de variável de
 * ambiente (maiúsculas, dígitos e `_`) e FORA da lista de secrets de
 * infraestrutura. Um nome vazio/ausente é recusa — o chamador decide o que
 * fazer com "não há secret" antes de chamar esta função.
 */
export function validateAiProviderSecretName(
  raw: string | null | undefined,
): AiSecretNameValidation {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "nome de secret ausente" };
  }
  const value = raw.trim();
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(value)) {
    return { ok: false, reason: "nome de secret com formato inválido" };
  }
  if (AI_PROVIDER_SECRET_NAME_BLOCKLIST.includes(value)) {
    return { ok: false, reason: "secret de infraestrutura não pode ser credencial de provedor" };
  }
  return { ok: true, value };
}

export type AiFetch = (input: string, init: RequestInit) => Promise<Response>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch com política de egress: valida o endpoint ANTES da primeira requisição
 * (antes de enviar qualquer cabeçalho) e revalida CADA redirect
 * (`redirect: "manual"`). Destino privado/fora da política é bloqueado com
 * `throw` — nunca chega a enviar o cabeçalho `Authorization`.
 *
 * Redirect para outra origem (protocolo+host+porta diferentes) é recusado:
 * como reenviamos o `init` inteiro em cada salto, seguir cross-origin mandaria
 * `Authorization`/`x-api-key` para um host sem vínculo com o provedor — pior
 * que o fetch padrão, que remove `Authorization` nesse caso. Em 303, ou em
 * 301/302 de um POST, o método vira GET e o body é descartado (semântica do
 * redirect), nunca reenviando body a um destino que pediu GET.
 */
export async function validatedAiFetch(
  rawEndpoint: string,
  init: RequestInit,
  fetcher: AiFetch = (input, reqInit) => fetch(input, reqInit),
  maxRedirects = 5,
): Promise<Response> {
  const first = validateAiProviderEndpoint(rawEndpoint);
  if (!first.ok) {
    throw new Error(`Endpoint de provedor de IA inválido: ${first.reason}`);
  }

  let current = first;
  let hopInit: RequestInit = { ...init, redirect: "manual" };
  for (let hop = 0; ; hop++) {
    let response: Response;
    try {
      response = await fetcher(current.url.toString(), hopInit);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    if (!location || hop >= maxRedirects) {
      throw new Error("Redirect de provedor de IA sem destino válido ou em excesso");
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, current.url);
    } catch {
      throw new Error("Redirect de provedor de IA para destino inválido");
    }
    const next = validateAiProviderEndpoint(nextUrl.toString());
    if (!next.ok) {
      throw new Error(`Redirect de provedor de IA bloqueado: ${next.reason}`);
    }
    if (next.url.origin !== current.url.origin) {
      throw new Error("Redirect de provedor de IA para outra origem bloqueado");
    }

    // Semântica de redirect: 303 sempre vira GET (fora GET/HEAD); 301/302 de um
    // POST também. O body e os cabeçalhos de conteúdo morrem com o método.
    const method = (hopInit.method ?? "GET").toUpperCase();
    if (
      (response.status === 303 && method !== "GET" && method !== "HEAD") ||
      ((response.status === 301 || response.status === 302) && method === "POST")
    ) {
      const headers = new Headers(hopInit.headers);
      headers.delete("content-type");
      headers.delete("content-length");
      hopInit = { ...hopInit, method: "GET", body: null, headers };
    }

    current = next;
  }
}
