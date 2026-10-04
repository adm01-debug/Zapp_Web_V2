/**
 * Módulo compartilhado de decisão de política de rede (R2-AUTH-022, item 27.2).
 *
 * Converte (Request + endpoint canônico) na decisão da RPC
 * `public.resolve_network_policy` — a fronteira SQL do cartão 27.1 — e produz
 * negação HTTP consistente: 403 para política negada, 503 para impossibilidade
 * de decidir. Este cartão NÃO liga o módulo aos handlers (27.3 requireAuth e
 * 27.4 auth-login fazem isso); aqui só nasce a primitiva testável.
 *
 * Regras fixadas pelo coordenador (2026-10-04-r2-auth-022-decomposicao.md):
 * - IP: `getClientIP` existente (x-forwarded-for, IP mais à direita). Webhooks e
 *   cron internos ficam fora — não chamam este módulo.
 * - País: só header de infraestrutura confiável (allowlist centralizada), com
 *   valor normalizado para ISO alpha-2. Header ausente (ou inválido) vira país
 *   ausente e a RPC falha fechado quando geo está ativo; nenhuma geolocalização
 *   é inventada no app.
 * - Whitelist de IP NÃO isenta país: o módulo sempre encaminha IP E país à RPC e
 *   respeita a decisão combinada que ela devolve (a isenção só vale para bloqueio
 *   por IP, dentro da RPC).
 * - Endpoint: explícito no chamador e validado aqui, nunca derivado de body
 *   controlado pelo cliente.
 * - Falha/erro da RPC falha fechado (503); a resposta nunca revela listas/regras.
 */

import { errorResponse, getClientIP } from "./validation.ts";

/**
 * Cabeçalhos confiáveis que podem carregar o país do chamador, em ordem de
 * precedência. Só entra aqui header que a infraestrutura em frente às Edge
 * Functions SOBRESCREVE (nunca algo que o cliente consegue forjar). As Edge
 * Functions do projeto rodam atrás do gateway Supabase/Cloudflare, que define
 * `cf-ipcountry`; qualquer outro header de país é ignorado para não virar
 * porta de bypass via spoofing.
 */
export const TRUSTED_COUNTRY_HEADER_NAMES: readonly string[] = ["cf-ipcountry"];

/**
 * Formato do identificador canônico de endpoint: 1..128 caracteres ASCII
 * imprimíveis (`!` a `~`), sem espaço, sem controle e sem quebra de linha.
 * Aceita tanto o estilo de caminho dos padrões padrão (`/auth/login`, `/api/*`)
 * quanto o estilo de chave (`auth-login`, `ai:transcribe:audio`).
 */
const ENDPOINT_RE = /^[!-~]{1,128}$/;

/** ISO alpha-2 (dois caracteres de A a Z). */
const ISO_ALPHA2_RE = /^[A-Z]{2}$/;

/**
 * Normaliza um valor bruto de país para ISO alpha-2 (trim + maiúsculas).
 * Valor vazio/inválido vira `null` (país ausente) — nunca um código inventado,
 * para que a RPC falhe fechado em geo ativo em vez de deixar passar um valor
 * que não casa com lista alguma.
 */
export function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return ISO_ALPHA2_RE.test(normalized) ? normalized : null;
}

/** País do chamador vindo apenas de header confiável, normalizado ISO alpha-2. */
export function extractCountryCode(req: Request): string | null {
  for (const name of TRUSTED_COUNTRY_HEADER_NAMES) {
    const value = req.headers.get(name);
    if (value !== null) {
      const normalized = normalizeCountryCode(value);
      if (normalized !== null) return normalized;
    }
  }
  return null;
}

/**
 * Identificador canônico de endpoint é explícito no chamador e validado aqui —
 * nunca derivado de body controlado pelo cliente. Aceita apenas strings curtas
 * de caracteres seguros (letras, dígitos e `._:/ -`), sem espaços ou controle.
 */
export function isValidEndpoint(endpoint: unknown): endpoint is string {
  return typeof endpoint === "string" && ENDPOINT_RE.test(endpoint);
}

/**
 * O que o módulo precisa do client Supabase: só o `rpc`. Tipo estrutural de
 * propósito — o cliente service_role real (criado pelo chamador, 27.3/27.4) e o
 * mock do teste satisfazem a mesma forma sem acoplar a uma versão específica de
 * `@supabase/supabase-js`.
 */
export interface NetworkPolicyRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

/** Opções obrigatórias do chamador: o client e os limites padrão atuais. */
export interface NetworkPolicyOptions {
  rpc: NetworkPolicyRpcClient;
  defaultMaxRequests: number;
  defaultWindowSeconds: number;
}

/**
 * Decisão de política de rede. `reason` (só a categoria) existe para LOG
 * server-side; o corpo enviado ao cliente nunca a carrega.
 */
export type NetworkPolicyDecision =
  | { allowed: true; rateLimitMaxRequests: number; rateLimitWindowSeconds: number }
  | { allowed: false; status: 403; reason: "ip_blocked" | "country_blocked" }
  | { allowed: false; status: 503 };

/**
 * Converte Request + endpoint canônico na decisão da RPC de política de rede.
 *
 * `rpc` deve ser um client service_role (única role com EXECUTE na função);
 * o segredo nunca circula por este módulo — o chamador cria o client.
 */
export async function resolveNetworkPolicy(
  req: Request,
  endpoint: string,
  opts: NetworkPolicyOptions,
): Promise<NetworkPolicyDecision> {
  // Endpoint explícito e validado ANTES de qualquer chamada: identificador
  // inválido é indecidível (503), sem tocar o banco.
  if (!isValidEndpoint(endpoint)) {
    return { allowed: false, status: 503 };
  }

  const ip = getClientIP(req);
  const countryCode = extractCountryCode(req);

  try {
    const { data, error } = await opts.rpc.rpc("resolve_network_policy", {
      p_ip: ip,
      p_country_code: countryCode,
      p_endpoint: endpoint,
      p_default_max_requests: opts.defaultMaxRequests,
      p_default_window_seconds: opts.defaultWindowSeconds,
    });

    if (error) {
      return { allowed: false, status: 503 };
    }

    const row = (Array.isArray(data) ? data[0] : data) as {
      allowed?: unknown;
      reason?: unknown;
      rate_limit_max_requests?: unknown;
      rate_limit_window_seconds?: unknown;
    } | null;

    if (!row || typeof row.allowed !== "boolean") {
      // Sem decisão booleana da fonte canônica: impossível decidir → 503.
      return { allowed: false, status: 503 };
    }

    if (row.allowed) {
      const rateLimitMaxRequests =
        typeof row.rate_limit_max_requests === "number" && row.rate_limit_max_requests >= 1
          ? row.rate_limit_max_requests
          : opts.defaultMaxRequests;
      const rateLimitWindowSeconds =
        typeof row.rate_limit_window_seconds === "number" && row.rate_limit_window_seconds >= 1
          ? row.rate_limit_window_seconds
          : opts.defaultWindowSeconds;
      return { allowed: true, rateLimitMaxRequests, rateLimitWindowSeconds };
    }

    // Negada: a RPC só devolve categorias ('ip_blocked' | 'country_blocked').
    // Qualquer outra grafia cai na categoria genérica — nunca vaza regra/lista.
    const reason: "ip_blocked" | "country_blocked" =
      row.reason === "ip_blocked" ? "ip_blocked" : "country_blocked";
    return { allowed: false, status: 403, reason };
  } catch {
    return { allowed: false, status: 503 };
  }
}

/**
 * Resposta HTTP consistente para uma decisão de negação (403/503). O corpo é
 * genérico de propósito: não distingue IP de país nem revela listas/regras.
 */
export function networkPolicyDenialResponse(
  decision: Extract<NetworkPolicyDecision, { allowed: false }>,
  req?: Request,
): Response {
  const message = decision.status === 403 ? "Access denied" : "Service unavailable";
  return errorResponse(message, decision.status, req);
}
