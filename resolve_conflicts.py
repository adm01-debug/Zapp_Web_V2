import re

with open('supabase/functions/_shared/validation.ts', 'r') as f:
    content = f.read()

# Resolve conflict 1: keep the import from 56d656112
old1 = """<<<<<<< HEAD
=======
// Política de rede (R2-AUTH-022 / 27.2): converte Request + endpoint canônico
// na decisão da RPC public.resolve_network_policy e produz negação HTTP
// consistente (403 negado / 503 indecidível). Integrada aqui no fluxo requireAuth.
import {
  resolveNetworkPolicy,
  networkPolicyDenialResponse,
  type NetworkPolicyDecision,
  type NetworkPolicyRpcClient,
} from './request-policy.ts';

>>>>>>> 56d656112 (fix(auth): requireAuth devolve 503 quando o client de política não é criado)"""

new1 = """// Política de rede (R2-AUTH-022 / 27.2): converte Request + endpoint canônico
// na decisão da RPC public.resolve_network_policy e produz negação HTTP
// consistente (403 negado / 503 indecidível). Integrada aqui no fluxo requireAuth.
import {
  resolveNetworkPolicy,
  networkPolicyDenialResponse,
  type NetworkPolicyDecision,
  type NetworkPolicyRpcClient,
} from './request-policy.ts';"""

content = content.replace(old1, new1)

# Resolve conflict 2: keep the 56d656112 side (new types + modified signature)
old2 = """<<<<<<< HEAD
export async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
=======
/** Resultado de `auth.getUser()` (estrutural — não acopla a uma versão do supabase-js). */
export type AuthUserResult = {
  data: { user: { id: string } | null } | null;
  error: unknown;
};

/**
 * Dependências injetáveis de `requireAuth` (para teste offline). Em produção
 * ficam ausentes e `requireAuth` usa o caminho real (esm.sh + env + service_role).
 */
export interface RequireAuthOptions {
  /** Valida o bearer e devolve o usuário (ou erro). Injectable p/ testar sem esm.sh/Deno.env. */
  getUser?: (authHeader: string) => PromiseLike<AuthUserResult>;
  /** Client service_role p/ a política de rede (R2-AUTH-022). Injectable p/ teste. */
  policyRpc?: NetworkPolicyRpcClient;
  /** Obtém o client de política quando `policyRpc` não é injetado (padrão: o
   *  client service_role compartilhado de `getServiceClient`). Injectable p/
   *  testar a falha de CRIAÇÃO do client sem tocar rede/env real. */
  policyRpcFactory?: () => PromiseLike<NetworkPolicyRpcClient>;
  /** Fallback de rate limit quando a RPC não tem regra p/ o endpoint (máximos atuais). */
  defaultMaxRequests?: number;
  defaultWindowSeconds?: number;
}

/**
 * Endpoint canônico derivado de forma estável da URL da Edge Function
 * (R2-AUTH-022 / 27.3). A rota do gateway Supabase é `/functions/v1/<nome>`
 * (ou `/functions/v1/<nome>/...`); o identificador canônico é o NOME da função,
 * nunca algo derivado de body controlado pelo cliente. Domínio sem a barra
 * `functions/v1`: o primeiro segmento do path é o nome. Path sem segmento
 * devolve string vazia — `resolveNetworkPolicy` a trata como endpoint inválido
 * e falha fechado (503).
 */
export function canonicalEndpointFromUrl(req: Request): string {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  let idx = 0;
  if (segments[0] === "functions" && segments[1] === "v1") idx = 2;
  return segments[idx] ?? "";
}

export async function requireAuth(
  req: Request,
  opts: RequireAuthOptions = {},
): Promise<{ userId: string } | Response> {
>>>>>>> 56d656112 (fix(auth): requireAuth devolve 503 quando o client de política não é criado)"""

new2 = """/** Resultado de `auth.getUser()` (estrutural — não acopla a uma versão do supabase-js). */
export type AuthUserResult = {
  data: { user: { id: string } | null } | null;
  error: unknown;
};

/**
 * Dependências injetáveis de `requireAuth` (para teste offline). Em produção
 * ficam ausentes e `requireAuth` usa o caminho real (esm.sh + env + service_role).
 */
export interface RequireAuthOptions {
  /** Valida o bearer e devolve o usuário (ou erro). Injectable p/ testar sem esm.sh/Deno.env. */
  getUser?: (authHeader: string) => PromiseLike<AuthUserResult>;
  /** Client service_role p/ a política de rede (R2-AUTH-022). Injectable p/ teste. */
  policyRpc?: NetworkPolicyRpcClient;
  /** Obtém o client de política quando `policyRpc` não é injetado (padrão: o
   *  client service_role compartilhado de `getServiceClient`). Injectable p/
   *  testar a falha de CRIAÇÃO do client sem tocar rede/env real. */
  policyRpcFactory?: () => PromiseLike<NetworkPolicyRpcClient>;
  /** Fallback de rate limit quando a RPC não tem regra p/ o endpoint (máximos atuais). */
  defaultMaxRequests?: number;
  defaultWindowSeconds?: number;
}

/**
 * Endpoint canônico derivado de forma estável da URL da Edge Function
 * (R2-AUTH-022 / 27.3). A rota do gateway Supabase é `/functions/v1/<nome>`
 * (ou `/functions/v1/<nome>/...`); o identificador canônico é o NOME da função,
 * nunca algo derivado de body controlado pelo cliente. Domínio sem a barra
 * `functions/v1`: o primeiro segmento do path é o nome. Path sem segmento
 * devolve string vazia — `resolveNetworkPolicy` a trata como endpoint inválido
 * e falha fechado (503).
 */
export function canonicalEndpointFromUrl(req: Request): string {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  let idx = 0;
  if (segments[0] === "functions" && segments[1] === "v1") idx = 2;
  return segments[idx] ?? "";
}

export async function requireAuth(
  req: Request,
  opts: RequireAuthOptions = {},
): Promise<{ userId: string } | Response> {"""

content = content.replace(old2, new2)

# Resolve conflict 3: keep the network policy check from 56d656112
old3 = """<<<<<<< HEAD
=======

  // 2. Política de rede (R2-AUTH-022 / 27.3): JWT válido não basta quando a
  //    política nega — 403 para bloqueio, 503 para decisão indisponível. A
  //    consulta acontece aqui, uma única vez por requisição, ANTES de qualquer
  //    efeito privilegiado do handler; consumidores de requireAuth herdam a
  //    trava sem edição individual.
  const endpoint = canonicalEndpointFromUrl(req);
  // Criação do client de política (import dinâmico + env) e execução da RPC
  // sob o mesmo guarda-chuva: qualquer exceção/rejeição aqui vira negação
  // fechada 503 — requireAuth nunca rejeita a Promise por causa da política.
  let decision: NetworkPolicyDecision;
  try {
    const rpc = opts.policyRpc ?? (await (opts.policyRpcFactory ?? getServiceClient)());
    decision = await resolveNetworkPolicy(req, endpoint, {
      rpc,
      defaultMaxRequests: opts.defaultMaxRequests ?? 30,
      defaultWindowSeconds: opts.defaultWindowSeconds ?? 60,
    });
  } catch {
    decision = { allowed: false, status: 503 };
  }
  if (!decision.allowed) {
    return networkPolicyDenialResponse(decision, req);
  }
  return { userId };
>>>>>>> 56d656112 (fix(auth): requireAuth devolve 503 quando o client de política não é criado)"""

new3 = """
  // 2. Política de rede (R2-AUTH-022 / 27.3): JWT válido não basta quando a
  //    política nega — 403 para bloqueio, 503 para decisão indisponível. A
  //    consulta acontece aqui, uma única vez por requisição, ANTES de qualquer
  //    efeito privilegiado do handler; consumidores de requireAuth herdam a
  //    trava sem edição individual.
  const endpoint = canonicalEndpointFromUrl(req);
  // Criação do client de política (import dinâmico + env) e execução da RPC
  // sob o mesmo guarda-chuva: qualquer exceção/rejeição aqui vira negação
  // fechada 503 — requireAuth nunca rejeita a Promise por causa da política.
  let decision: NetworkPolicyDecision;
  try {
    const rpc = opts.policyRpc ?? (await (opts.policyRpcFactory ?? getServiceClient)());
    decision = await resolveNetworkPolicy(req, endpoint, {
      rpc,
      defaultMaxRequests: opts.defaultMaxRequests ?? 30,
      defaultWindowSeconds: opts.defaultWindowSeconds ?? 60,
    });
  } catch {
    decision = { allowed: false, status: 503 };
  }
  if (!decision.allowed) {
    return networkPolicyDenialResponse(decision, req);
  }
  return { userId };"""

content = content.replace(old3, new3)

with open('supabase/functions/_shared/validation.ts', 'w') as f:
    f.write(content)

# Verify no conflict markers remain
remaining = content.count('<<<<<<<') + content.count('=======') + content.count('>>>>>>>')
print(f'Conflict markers remaining: {remaining}')
