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
 * Este módulo fornece:
 *   1. `validateAiProviderEndpoint` — valida o destino ANTES de qualquer fetch
 *      (texto da URL: https, sem credencial, sem IP literal, sem porta não padrão);
 *   2. `validateAiProviderEndpointResolved` — além do texto, RESOLVE o DNS do
 *      hostname (A + AAAA) e recusa quando QUALQUER endereço resolvido é
 *      privado/loopback/link-local/metadata, ou quando a resolução falha/vem
 *      vazia (fail-closed). É o que fecha o buraco de hostnames que apontam para
 *      IP privado (ex.: `127.0.0.1.nip.io`), invisível para o texto da URL;
 *   3. `validateAiProviderSecretName` — ALLOWLIST explícita de credenciais de
 *      provedor: só nomes conhecidos de chave de provedor passam. Qualquer outro
 *      secret (de infraestrutura ou não enumerado) é recusado;
 *   4. `validatedAiFetch` — fetch com `redirect: "manual"` que resolve e valida
 *      o DNS em CADA requisição e em CADA redirect, e FIXA (pin) o conjunto de
 *      endereços por requisição: uma segunda resolução que devolva endereço
 *      bloqueado ou um conjunto diferente é recusada antes do envio
 *      (proteção contra DNS rebinding — o host não pode "trocar de endereço" no
 *      meio da requisição). Redirect para OUTRA origem (protocolo+host+porta) é
 *      recusado: refazer o `init` em outro host repassaria `Authorization`/
 *      `x-api-key`, coisa que o fetch padrão impede removendo `Authorization` em
 *      redirect cross-origin. Em 303 (ou 301/302 vindo de POST) o método vira GET
 *      e o body é descartado, como manda a especificação.
 *
 * Fail-closed: o que não casar com as regras é rejeitado — inclusive erro de
 * resolução, ausência de registro e host que mude de endereço na requisição.
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

/**
 * ALLOWLIST de credenciais de provedor (IA-EGRESS-001).
 *
 * Só estes nomes de secret podem ser lidos do ambiente como chave de provedor de
 * IA. É uma lista POSITIVA: o que não está aqui é recusado, inclusive secrets de
 * infraestrutura que ninguém lembrou de enumerar (`GITHUB_TOKEN`,
 * `TYPES_SYNC_PR_TOKEN`, `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`...) — uma lista
 * negativa sempre deixaria um buraco para o próximo secret criado.
 *
 * Provedor novo ⇒ acrescente aqui o nome da chave (e no CHECK da migration
 * `*_ai_providers_endpoint_secret_binding.sql`).
 */
export const AI_PROVIDER_SECRET_ALLOWLIST: readonly string[] = [
  "DEEPSEEK_API_KEY",
  "GLM_API_KEY",
  "GROQ_API_KEY",
  "LOVABLE_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
];

export type AiEndpointValidation =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export type AiResolvedEndpointValidation =
  | { ok: true; url: URL; addresses: readonly string[] }
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
 *
 * Só o TEXTO da URL é olhado aqui. Use `validateAiProviderEndpointResolved`
 * antes de uma requisição real — é ela que resolve o DNS.
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
 * Valida o nome do secret de provedor contra a ALLOWLIST de credenciais.
 *
 * Um nome vazio/ausente é recusa — o chamador decide o que fazer com "não há
 * secret" antes de chamar esta função. Nome fora da allowlist (secret de
 * infraestrutura ou qualquer outro) é recusa.
 */
export function validateAiProviderSecretName(
  raw: string | null | undefined,
): AiSecretNameValidation {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "nome de secret ausente" };
  }
  const value = raw.trim();
  if (!AI_PROVIDER_SECRET_ALLOWLIST.includes(value)) {
    return {
      ok: false,
      reason: "nome de secret fora da allowlist de credenciais de provedor",
    };
  }
  return { ok: true, value };
}

/** Resolve um hostname nos endereços (IPv4 e IPv6) a que ele aponta. */
export type AiHostResolver = (hostname: string) => Promise<readonly string[]>;

/**
 * Resolver padrão de produção: A + AAAA via `Deno.resolveDns`. Falha de uma
 * família não derruba a outra; se NENHUMA responder, lança (e a chamada é
 * recusada — fail-closed). Uma resposta vazia não é "sem DNS": é recusa.
 *
 * Nas tarefas de teste/CI o resolver é injetado (o CI roda com
 * `--allow-net=127.0.0.1`, sem resolução DNS pública).
 */
export const denoAiHostResolver: AiHostResolver = async (hostname) => {
  const addresses: string[] = [];
  let answered = false;
  try {
    const ipv4 = await Deno.resolveDns(hostname, "A");
    if (ipv4.length > 0) answered = true;
    addresses.push(...ipv4);
  } catch {
    // família sem registros: só é falha se nenhuma família responder
  }
  try {
    const ipv6 = await Deno.resolveDns(hostname, "AAAA");
    if (ipv6.length > 0) answered = true;
    addresses.push(...ipv6);
  } catch {
    // idem
  }
  if (!answered) {
    throw new Error("DNS sem resposta para o hostname");
  }
  return addresses;
};

/** Chave canônica de um conjunto de endereços (ordem não importa, caixa não importa). */
function canonicalAddressSet(addresses: readonly string[]): string {
  return addresses
    .map((address) => String(address).trim().toLowerCase())
    .sort()
    .join(",");
}

/**
 * Valida o endpoint TEXTO e resolve o DNS do hostname, recusando quando
 * qualquer endereço resolvido é privado/loopback/link-local/metadata ou quando a
 * resolução falha/vem vazia. Devolve a URL e os endereços validados.
 */
export async function validateAiProviderEndpointResolved(
  raw: string,
  resolver: AiHostResolver = denoAiHostResolver,
): Promise<AiResolvedEndpointValidation> {
  const text = validateAiProviderEndpoint(raw);
  if (!text.ok) {
    return { ok: false, reason: text.reason };
  }

  const hostname = text.url.hostname.toLowerCase();
  let addresses: readonly string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    return { ok: false, reason: "não foi possível resolver o DNS do endpoint" };
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return { ok: false, reason: "endpoint não resolve para nenhum endereço" };
  }
  for (const address of addresses) {
    if (
      typeof address !== "string" || address.trim() === "" ||
      isBlockedIpAddress(address)
    ) {
      return {
        ok: false,
        reason: "hostname do endpoint resolve para endereço não público",
      };
    }
  }

  return { ok: true, url: text.url, addresses: [...addresses] };
}

export type AiFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface ValidatedAiFetchOptions {
  /** Transporte usado nos saltos (default: `fetch` global). Injetado nos testes. */
  fetcher?: AiFetch;
  /** Resolver DNS usado na validação (default: `denoAiHostResolver`). */
  resolver?: AiHostResolver;
  /** Teto de redirects seguidos (default: 5). */
  maxRedirects?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch com política de egress: valida o endpoint ANTES da primeira requisição
 * (antes de enviar qualquer cabeçalho), resolve/valida o DNS do host e revalida
 * CADA redirect (`redirect: "manual"`). Destino privado — inclusive hostname que
 * RESOLVE para IP privado — ou fora da política é bloqueado com `throw`: nunca
 * chega a enviar o cabeçalho `Authorization`.
 *
 * Proteção contra DNS rebinding: o conjunto de endereços do host é resolvido em
 * cada requisição/redirect e FIXADO (pin) por requisição. Antes do primeiro
 * envio a resolução é refeita e precisa bater com a primeira (host que alterna
 * respostas ou que devolve endereço privado na segunda consulta é bloqueado); em
 * cada novo envio ao mesmo host o conjunto tem de continuar idêntico. Assim o
 * host não consegue "trocar de endereço" entre a checagem e o uso.
 *
 * Redirect para outra origem (protocolo+host+porta diferentes) é recusado: como
 * reenviamos o `init` inteiro em cada salto, seguir cross-origin mandaria
 * `Authorization`/`x-api-key` para um host sem vínculo com o provedor — pior que
 * o fetch padrão, que remove `Authorization` nesse caso. Em 303, ou em 301/302 de
 * um POST, o método vira GET e o body é descartado (semântica do redirect),
 * nunca reenviando body a um destino que pediu GET.
 */
export async function validatedAiFetch(
  rawEndpoint: string,
  init: RequestInit,
  options: ValidatedAiFetchOptions = {},
): Promise<Response> {
  const fetcher: AiFetch = options.fetcher ?? ((input, reqInit) => fetch(input, reqInit));
  const resolver = options.resolver ?? denoAiHostResolver;
  const maxRedirects = options.maxRedirects ?? 5;

  /** Endereços validados por hostname, fixados nesta requisição (anti-rebinding). */
  const pinnedByHost = new Map<string, string>();

  /**
   * Resolve + valida o host do alvo e confere a fixação. Na primeira vez,
   * reconfere a resolução imediatamente antes do envio: duas consultas seguidas
   * que discordem (ou que tragam endereço bloqueado) derrubam a requisição.
   */
  const resolvePinned = async (target: URL): Promise<void> => {
    const hostname = target.hostname.toLowerCase();
    const first = await validateAiProviderEndpointResolved(target.toString(), resolver);
    if (!first.ok) {
      throw new Error(`Endpoint de provedor de IA inválido: ${first.reason}`);
    }
    const canonical = canonicalAddressSet(first.addresses);

    const pinned = pinnedByHost.get(hostname);
    if (pinned === undefined) {
      const second = await validateAiProviderEndpointResolved(target.toString(), resolver);
      if (!second.ok) {
        throw new Error(`Endpoint de provedor de IA inválido: ${second.reason}`);
      }
      if (canonicalAddressSet(second.addresses) !== canonical) {
        throw new Error(
          "DNS do provedor de IA mudou durante a validação (possível DNS rebinding)",
        );
      }
      pinnedByHost.set(hostname, canonical);
      return;
    }
    if (canonical !== pinned) {
      throw new Error(
        "DNS do provedor de IA mudou durante a requisição (possível DNS rebinding)",
      );
    }
  };

  let nextUrl = rawEndpoint;
  let hopInit: RequestInit = { ...init, redirect: "manual" };
  for (let hop = 0; ; hop++) {
    let targetUrl: URL;
    try {
      targetUrl = new URL(nextUrl);
    } catch {
      throw new Error("Endpoint de provedor de IA inválido: endpoint não é uma URL válida");
    }
    await resolvePinned(targetUrl);

    let response: Response;
    try {
      response = await fetcher(targetUrl.toString(), hopInit);
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

    let redirectUrl: URL;
    try {
      redirectUrl = new URL(location, targetUrl);
    } catch {
      throw new Error("Redirect de provedor de IA para destino inválido");
    }
    const next = await validateAiProviderEndpointResolved(redirectUrl.toString(), resolver);
    if (!next.ok) {
      throw new Error(`Redirect de provedor de IA bloqueado: ${next.reason}`);
    }
    if (next.url.origin !== targetUrl.origin) {
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

    nextUrl = next.url.toString();
  }
}
