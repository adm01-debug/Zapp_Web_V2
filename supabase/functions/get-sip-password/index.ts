import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";

// T15: o front não conhece mais a linha — host e porta vêm daqui. Os defaults
// são os valores que estavam hardcoded no front; a variável de ambiente só é
// necessária se a linha mudar. `Number(...) || 8089` cobre env ausente, vazia ou
// não-numérica (nunca `wss://host:NaN/ws`). Exportada para o teste travar o
// contrato. O RAMAL saiu daqui: era o `phone1` compartilhado por todo mundo; hoje
// ele vem da credencial do atendente logado (ver `credencialSipPorAtendente`).
export function provisionamentoSip(
  getEnv: (key: string) => string | undefined = (k) => Deno.env.get(k),
): { server: string; wsPort: number } {
  return {
    server: getEnv('SIP_SERVER') ?? 'ip.b24-9441-1552764901.bitrixphone.com',
    wsPort: Number(getEnv('SIP_WS_PORT')) || 8089,
  };
}

/** Cliente service_role (ou dublê no teste): a leitura do segredo é uma RPC e a
 *  trilha é um INSERT — a tabela `voip_profile_credentials` não tem GRANT ao
 *  PostgREST, então o único caminho é a RPC `get_voip_profile_credentials`. */
export interface SipAdminClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

/** Cliente do chamador (anon key + o Bearer dele): só valida o token e acha o
 *  próprio perfil. O perfil NUNCA vem do corpo — é o do token. */
export interface SipAuthClient {
  auth: {
    getClaims: (token: string) => PromiseLike<{
      data: { claims: { sub?: string } | null } | null;
      error: unknown;
    }>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => PromiseLike<{ data: { id: string; is_active: boolean } | null; error: unknown }>;
      };
    };
  };
}

export interface GetSipDeps {
  /** provider de env (default: Deno.env.get). */
  getEnv?: (name: string) => string | undefined;
  checkRateLimit?: (key: string, maxRequests: number, windowMs: number) => { allowed: boolean };
  authClient?: SipAuthClient;
  admin?: SipAdminClient;
}

export type CredencialSip =
  | { ok: true; ramal: string; password: string }
  | { ok: false; motivo: "sem_ramal" | "falha_leitura" };

/**
 * Credencial do atendente (ramal + senha decifrada do Vault) via RPC
 * `get_voip_profile_credentials` — que é SECURITY DEFINER, só `service_role` e
 * devolve ZERO linhas para "sem credencial" E "perfil inexistente" (sem oráculo).
 * Esta função separa os dois casos de fracasso: `falha_leitura` (a chamada
 * falhou — não sabemos) de `sem_ramal` (resposta vazia — não há credencial).
 */
export async function credencialSipPorAtendente(
  admin: SipAdminClient,
  profileId: string,
): Promise<CredencialSip> {
  const { data, error } = await admin.rpc("get_voip_profile_credentials", { p_profile_id: profileId });
  if (error) return { ok: false, motivo: "falha_leitura" };

  const linhas = Array.isArray(data) ? data : data == null ? [] : [data];
  const linha = linhas[0] as { ramal?: unknown; sip_password?: unknown } | undefined;
  if (
    typeof linha?.ramal !== "string" || linha.ramal.length === 0 ||
    typeof linha.sip_password !== "string" || linha.sip_password.length === 0
  ) {
    return { ok: false, motivo: "sem_ramal" };
  }
  return { ok: true, ramal: linha.ramal, password: linha.sip_password };
}

export async function handleGetSipPassword(req: Request, deps: GetSipDeps = {}): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("get-sip-password");
  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const rateLimit = deps.checkRateLimit ?? checkRateLimit;

  try {
    const ip = getClientIP(req);
    const rl = rateLimit(`sip-pwd:${ip}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401, req);
    }

    const authClient: SipAuthClient = deps.authClient ?? (createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authHeader } } },
    ) as unknown as SipAuthClient);

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) {
      return errorResponse('Invalid or expired token', 401, req);
    }

    const { data: profile, error: profileError } = await authClient
      .from('profiles').select('id, is_active').eq('user_id', userId).maybeSingle();

    if (profileError || !profile) return errorResponse('User profile not found', 403, req);
    if (!profile.is_active) return errorResponse('User account is inactive', 403, req);

    // A senha NÃO mora mais em env: ela é a credencial DESTE atendente, cifrada
    // no Vault. O segredo SIP compartilhado deixou de existir — não há caminho
    // de fallback que entregue a mesma linha para todo mundo.
    const admin: SipAdminClient = deps.admin ?? createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );

    const credencial = await credencialSipPorAtendente(admin, profile.id);
    if ("motivo" in credencial) {
      if (credencial.motivo === 'sem_ramal') {
        log.warn('Perfil sem credencial SIP provisionada', { profileId: profile.id });
        log.done(409);
        return jsonResponse(
          { error: 'Ramal não provisionado para este atendente', code: 'VOIP_NOT_PROVISIONED' },
          409,
          req,
        );
      }
      log.error('Falha ao ler a credencial SIP no Vault', { profileId: profile.id });
      log.done(500);
      return errorResponse('Falha ao ler a credencial SIP', 500, req);
    }

    // Trilha de leitura do segredo — SEM a senha (só o ramal e quem leu). A
    // tabela bloqueia INSERT de `authenticated` (policy WITH CHECK false): quem
    // grava é o client service_role, como nos outros consumidores de audit_logs.
    const { error: auditError } = await admin.from('audit_logs').insert({
      user_id: userId,
      action: 'sip_credentials_read',
      entity_type: 'voip_profile_credentials',
      entity_id: profile.id,
      details: { ramal: credencial.ramal },
      ip_address: ip,
    });
    if (auditError) {
      // Sem trilha não há entrega do segredo: uma leitura sem rastro de quem leu
      // é justamente o que esta função existe para não permitir. Falha FECHADA.
      log.error('Falha ao registrar a auditoria da leitura da credencial SIP', { profileId: profile.id });
      log.done(500);
      return errorResponse('Falha ao registrar a trilha da credencial SIP', 500, req);
    }

    const { server, wsPort } = provisionamentoSip(getEnv);
    log.done(200, { profileId: profile.id, ramal: credencial.ramal });
    return jsonResponse(
      { server, user: credencial.ramal, wsPort, password: credencial.password, profileId: profile.id },
      200,
      req,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

// Convenção do repo para funções testáveis: o handler é exportado e o servidor
// só sobe quando o módulo é o entrypoint (o runtime do Supabase é o entrypoint).
if (import.meta.main) {
  Deno.serve((req) => handleGetSipPassword(req));
}
