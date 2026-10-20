import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, enforceRateLimit, getClientIP } from "../_shared/validation.ts";
import { WebAuthnActionSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import {
  verifyAuthenticationAssertion,
  extractCredentialPublicKey,
  bytesToBase64url,
  type AssertionInput,
  type AssertionResult,
} from "./verify.ts";
import {
  resolveNetworkPolicy,
  networkPolicyDenialResponse,
  type NetworkPolicyRpcClient,
} from "../_shared/request-policy.ts";

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64URLDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer);
}

function getRpId(origin: string): string {
  try { return new URL(origin).hostname; } catch { return 'localhost'; }
}

/**
 * Desafio que o autenticador assinou. O login sem e-mail depende disso: a
 * cerimônia NÃO é buscada por usuário (não há usuário conhecido antes da
 * asserção), mas pelo VALOR de `clientDataJSON.challenge`. Devolve null quando o
 * campo falta ou é inválido (falha fechada, sem lançar).
 */
function extractClientChallenge(clientDataJSONB64: string | undefined): string | null {
  if (!clientDataJSONB64) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64URLDecode(clientDataJSONB64)));
    return typeof parsed?.challenge === 'string' && parsed.challenge.length > 0 ? parsed.challenge : null;
  } catch {
    return null;
  }
}

/**
 * UV obrigatório: a flag 0x04 (User Verified) precisa estar no byte 32 do
 * `authenticatorData`. Presença (0x01) sozinha não basta para entrar por passkey.
 */
function hasUserVerification(authenticatorDataB64: string | undefined): boolean {
  if (!authenticatorDataB64) return false;
  try {
    const flags = base64URLDecode(authenticatorDataB64);
    return flags.length >= 37 && (flags[32] & 0x04) !== 0;
  } catch {
    return false;
  }
}

// ── Seams de injeção (paridade com auth-login) ─────────────────────────────
// `verify-authentication` é o caminho de ENTRADA (login) da passkey: o handler
// recebe as dependências que fazem efeito (client service_role, rate limit e a
// verificação criptográfica) para que o teste prove, sem tocar banco nem o
// GoTrue, a ORDEM e o curto-circuito das MESMAS travas do login por senha.

/** Conta vista pelo admin do Auth (o que basta para ativo/banido/baneamento). */
export interface WebAuthnAccount {
  id: string;
  email?: string | null;
  banned_until?: string | null;
}

export interface WebAuthnAdminClient {
  rpc: NetworkPolicyRpcClient["rpc"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  auth: {
    admin: {
      getUserById: (id: string) => PromiseLike<{ data: { user: WebAuthnAccount | null } | null; error: unknown }>;
      generateLink: (params: { type: string; email: string }) => PromiseLike<{
        data: { properties?: { hashed_token?: string } } | null;
        error: unknown;
      }>;
    };
  };
}

export type VerifyAssertionFn = (input: AssertionInput) => PromiseLike<AssertionResult>;

export interface WebAuthnDeps {
  admin?: WebAuthnAdminClient;
  enforceRateLimit?: (key: string, maxRequests: number, windowMs: number) => PromiseLike<{ allowed: boolean }>;
  verifyAuthenticationAssertion?: VerifyAssertionFn;
  now?: () => number;
}

// Limites hardcoded do login por passkey — os MESMOS defaults do auth-login.
const IP_LIMIT_DEFAULT_MAX = 10; // requisições por IP
const IP_LIMIT_DEFAULT_WINDOW_SECONDS = 60;

type LockRow = { is_locked: boolean; locked_until: string | null; attempts: number };
type LockPayload = { isLocked: boolean; lockedUntil: string | null; attempts: number; remainingTime: number };

/** Mesmo envelope de lockout do auth-login (o cliente não distingue os fluxos). */
function lockPayload(row: LockRow | null | undefined): LockPayload {
  if (!row) return { isLocked: false, lockedUntil: null, attempts: 0, remainingTime: 0 };
  const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
  const remainingTime = lockedUntil
    ? Math.max(0, Math.floor((lockedUntil.getTime() - Date.now()) / 1000))
    : 0;
  return {
    isLocked: row.is_locked,
    lockedUntil: lockedUntil?.toISOString() ?? null,
    attempts: row.attempts,
    remainingTime,
  };
}

/** Código do erro da RPC para log (o `error` é `unknown` por contrato). */
function rpcErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: unknown }).code as string | undefined;
  }
  return undefined;
}

/** A RPC devolve TABLE(...) — o driver pode entregar array ou objeto. */
function first<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] ?? null) as T | null;
  return (data ?? null) as T | null;
}

/** Conta do Auth, ou null quando o usuário não existe / a consulta falhou. */
async function fetchAccount(admin: WebAuthnAdminClient, userId: string): Promise<WebAuthnAccount | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  return data?.user ?? null;
}

/**
 * Conta desativada é BANIDA no Auth (trigger `trg_profile_deactivate_ban`, PD-03):
 * `banned_until` no futuro barra o login. O caminho da passkey não passa pelo
 * GoTrue, então a mesma trava é conferida aqui.
 */
function isBanned(account: WebAuthnAccount, nowMs: number): boolean {
  if (!account.banned_until) return false;
  const until = new Date(account.banned_until).getTime();
  return Number.isFinite(until) && until > nowMs;
}

/**
 * Mesma trava de lockout do auth-login: uma recusa de credencial registra a
 * tentativa no e-mail da conta e devolve o estado do bloqueio. Sem e-mail
 * conhecido, nada é registrado e o envelope sai zerado (não vaza existência).
 */
async function recordFailedAttempt(
  admin: WebAuthnAdminClient,
  userId: string,
  ip: string,
  userAgent: string | null,
  log: Logger,
): Promise<LockPayload> {
  const account = await fetchAccount(admin, userId);
  if (!account?.email) return lockPayload(null);
  const { data, error } = await admin.rpc("record_failed_login", {
    p_email: account.email,
    p_ip_address: ip === "unknown" ? null : ip,
    p_user_agent: userAgent,
  });
  if (error) {
    log.error("record_failed_login failed", { code: rpcErrorCode(error) });
    return lockPayload(null);
  }
  return lockPayload(first<LockRow>(data));
}

/** Recusa genérica: MESMO corpo/código do auth-login para não vazar se a conta existe. */
function credentialRefusalResponse(req: Request, lock: LockPayload): Response {
  return jsonResponse({ error: "Invalid login credentials", ...lock }, 401, req);
}

export async function handleWebAuthn(req: Request, deps: WebAuthnDeps = {}): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("webauthn");
  const rateLimit = deps.enforceRateLimit ?? enforceRateLimit;
  const verifyAssertion = deps.verifyAuthenticationAssertion ?? verifyAuthenticationAssertion;

  try {
    const admin: WebAuthnAdminClient = deps.admin
      ?? (createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY')) as unknown as WebAuthnAdminClient);

    // R2-AUTH-022: MESMA trava de rede do auth-login, na fronteira do endpoint e
    // ANTES de ler o body — negação 403 (ou 503 indecidível) curto-circuita tudo.
    const policy = await resolveNetworkPolicy(req, 'webauthn', {
      rpc: admin,
      defaultMaxRequests: IP_LIMIT_DEFAULT_MAX,
      defaultWindowSeconds: IP_LIMIT_DEFAULT_WINDOW_SECONDS,
    });
    if (!policy.allowed) {
      log.done(policy.status, policy.status === 403 ? { reason: policy.reason } : {});
      return networkPolicyDenialResponse(policy, req);
    }

    const rawBody = await req.json();
    const parsed = parseBody(WebAuthnActionSchema, rawBody);
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { action, userId, userEmail, userName, credential, friendlyName } = parsed.data;
    const origin = req.headers.get('origin') || 'https://localhost';
    const rpId = getRpId(origin);
    const rpName = 'ZAPP Web';

    // Verify caller identity for actions that require authentication
    const authHeader = req.headers.get('Authorization');
    let authenticatedUserId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const supabaseUrl = requireEnv('SUPABASE_URL');
      const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (!claimsError && claimsData?.claims) {
        authenticatedUserId = claimsData.claims.sub as string;
      }
    }

    log.info("WebAuthn action", { action, rpId });

    switch (action) {
      case 'registration-options': {
        if (!userId || !userEmail) return errorResponse('userId and userEmail are required', 400, req);
        if (!authenticatedUserId || authenticatedUserId !== userId) {
          return errorResponse('Unauthorized: you can only register passkeys for your own account', 403, req);
        }

        const { data: existingCredentials } = await admin.from('passkey_credentials').select('credential_id').eq('user_id', userId);
        const excludeCredentials = (existingCredentials || []).map((cred: { credential_id: string }) => ({
          id: cred.credential_id, type: 'public-key', transports: ['internal', 'hybrid', 'usb', 'ble', 'nfc'],
        }));

        const challenge = generateChallenge();
        await admin.from('webauthn_challenges').insert({ user_id: userId, challenge, type: 'registration' });
        await admin.rpc('cleanup_expired_challenges', {});

        const options = {
          challenge, rp: { name: rpName, id: rpId },
          user: { id: base64URLEncode(new TextEncoder().encode(userId).buffer), name: userEmail, displayName: userName || userEmail },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'preferred', residentKey: 'preferred', requireResidentKey: false },
          timeout: 60000, attestation: 'none', excludeCredentials,
        };

        log.done(200, { action });
        return jsonResponse({ options }, 200, req);
      }

      case 'verify-registration': {
        if (!userId || !credential) return errorResponse('userId and credential are required', 400, req);
        if (!authenticatedUserId || authenticatedUserId !== userId) {
          return errorResponse('Unauthorized: you can only verify passkeys for your own account', 403, req);
        }

        const { data: challengeData, error: challengeError } = await admin
          .from('webauthn_challenges').select('challenge').eq('user_id', userId).eq('type', 'registration')
          .order('created_at', { ascending: false }).limit(1).single();

        if (challengeError || !challengeData) return errorResponse('Challenge not found or expired', 400, req);

        const { id, response: credResponse, type, authenticatorAttachment } = credential as Record<string, unknown>;
        if (type !== 'public-key') return errorResponse('Invalid credential type', 400, req);

        const cr = credResponse as Record<string, string>;
        const clientData = JSON.parse(new TextDecoder().decode(base64URLDecode(cr.clientDataJSON)));
        if (clientData.type !== 'webauthn.create') return errorResponse('Invalid client data type', 400, req);
        if (clientData.challenge !== challengeData.challenge) return errorResponse('Challenge mismatch', 400, req);

        // R2-AUTH-001: guarda a chave pública COSE da credencial (extraída do
        // attestationObject), não o attestationObject inteiro — sem a chave real a
        // autenticação não teria o que verificar na assinatura.
        let publicKeyB64: string;
        try {
          publicKeyB64 = bytesToBase64url(extractCredentialPublicKey(base64URLDecode(cr.attestationObject)));
        } catch {
          return errorResponse('Invalid attestation object', 400, req);
        }

        const { error: insertError } = await admin.from('passkey_credentials').insert({
          user_id: userId, credential_id: id, public_key: publicKeyB64,
          counter: 0, device_type: authenticatorAttachment || 'platform',
          backed_up: cr.publicKeyAlgorithm === '-7', transports: (credential as Record<string, unknown>).transports || ['internal'],
          friendly_name: friendlyName || 'Passkey',
        });

        if (insertError) return errorResponse('Failed to store credential', 500, req);
        await admin.from('webauthn_challenges').delete().eq('user_id', userId).eq('type', 'registration');

        log.done(200, { action });
        return jsonResponse({ success: true, credentialId: id }, 200, req);
      }

      case 'authentication-options': {
        // Login por passkey SEM e-mail (R2-AUTH-024). A resposta é SEMPRE a mesma,
        // exista ou não passkey/usuário para o e-mail informado: NÃO devolvemos
        // `allowCredentials`, que revelava quem tem passkey (enumeração). Sem
        // `allowCredentials` o navegador usa credenciais descobríveis (residentes),
        // que é o que permite entrar sem digitar nada. O desafio é gravado sem
        // usuário e resolvido na asserção pelo VALOR em `clientDataJSON.challenge`.
        const ip = getClientIP(req);
        const ipRl = await rateLimit(
          `webauthn:${ip}`,
          policy.rateLimitMaxRequests,
          policy.rateLimitWindowSeconds * 1000,
        );
        if (!ipRl.allowed) return errorResponse('Rate limit exceeded', 429, req);

        const challenge = generateChallenge();
        await admin.from('webauthn_challenges').insert({ user_id: null, challenge, type: 'authentication' });
        await admin.rpc('cleanup_expired_challenges', {});

        log.done(200, { action });
        return jsonResponse({
          options: { challenge, rpId, timeout: 60000, userVerification: 'required' },
        }, 200, req);
      }

      case 'verify-authentication': {
        // Login por passkey: MESMAS travas do auth-login (ADR-006).
        // 1. política de rede (R2-AUTH-022) DEPOIS de CORS e ANTES de ler/validar a
        //    credencial, consultar usuário, registrar tentativa ou emitir sessão;
        // 2. rate limit por IP (limite efetivo da regra ativa, senão hardcoded);
        // 3. asserção inválida -> recusa genérica que registra a tentativa (lockout);
        // 4. conta banida/desativada (PD-03) -> 403, sem emitir sessão;
        // 5. conta travada por tentativas -> 423;
        // 6. sessão por `admin.generateLink({type:'magiclink'})` — NÃO envia e-mail;
        //    devolve só `token_hash`, que o cliente troca por sessão. O `userEmail`
        //    nunca volta ao cliente;
        // 7. login auditado em `audit_logs` (sem e-mail/token em claro).
        //
        // AAL: a sessão emitida é `aal1`, EXATAMENTE como a do login por senha; quem
        // tem TOTP verificado continua devendo o segundo fator no gate de rota
        // (`ProtectedRoute`, R2-AUTH-003). A passkey não rebaixa nem fura esse gate.
        const nowMs = deps.now ? deps.now() : Date.now();

        const ip = getClientIP(req);
        const ipRl = await rateLimit(
          `webauthn:${ip}`,
          policy.rateLimitMaxRequests,
          policy.rateLimitWindowSeconds * 1000,
        );
        if (!ipRl.allowed) return errorResponse('Rate limit exceeded', 429, req);

        if (!credential) return errorResponse('credential is required', 400, req);

        const cred = credential as Record<string, unknown>;
        const { id, response: credResponse } = cred;
        if (!id || !credResponse) return errorResponse('invalid credential payload', 400, req);

        const credentialId = String(id);
        const { data: storedCred, error: credError } = await admin
          .from('passkey_credentials').select('*').eq('credential_id', credentialId).single();

        // Credencial desconhecida: mesma recusa do auth-login, sem consultar conta
        // nem registrar tentativa (o e-mail da conta nem é conhecido).
        if (credError || !storedCred) {
          log.done(401, { reason: 'unknown_credential' });
          return credentialRefusalResponse(req, lockPayload(null));
        }

        const cr = credResponse as Record<string, string>;

        // Conta: consulta pontual por id (nunca listagem) — necessária para o
        // limite por e-mail e para as travas de conta.
        const account = await fetchAccount(admin, storedCred.user_id);

        // Rate limit PERSISTENTE por e-mail: além do teto por IP, a mesma conta não
        // pode ser bombardeada depois que a credencial é conhecida.
        if (account?.email) {
          const emailRl = await rateLimit(
            `webauthn:email:${account.email.toLowerCase()}`,
            policy.rateLimitMaxRequests,
            policy.rateLimitWindowSeconds * 1000,
          );
          if (!emailRl.allowed) return errorResponse('Rate limit exceeded', 429, req);
        }

        // Desafio pelo VALOR assinado (`clientDataJSON.challenge`), não por usuário:
        // é o que faz o login sem e-mail funcionar. TTL de 5 min via `expires_at`.
        const challengeValue = extractClientChallenge(cr.clientDataJSON);
        let challengeRow: { challenge?: string; expires_at?: string | null } | null = null;
        if (challengeValue) {
          const { data } = await admin.from('webauthn_challenges')
            .select('challenge, expires_at').eq('challenge', challengeValue).eq('type', 'authentication')
            .single();
          challengeRow = data as { challenge?: string; expires_at?: string | null } | null;
        }
        const challengeUsable = !!challengeRow && !!challengeValue
          && (!challengeRow.expires_at || new Date(challengeRow.expires_at).getTime() >= nowMs);

        // UV obrigatório (flag 0x04): presença (0x01) sozinha não entra.
        const uvOk = hasUserVerification(cr.authenticatorData);

        let assertion: AssertionResult;
        if (challengeUsable && uvOk && challengeValue) {
          assertion = await verifyAssertion({
            clientDataJSON: cr.clientDataJSON,
            authenticatorData: cr.authenticatorData,
            signature: cr.signature,
            storedPublicKey: storedCred.public_key,
            storedCounter: Number(storedCred.counter ?? 0),
            challenge: challengeValue,
            rpId,
            expectedOrigin: origin,
          });
        } else {
          assertion = { ok: false, reason: !challengeUsable ? 'challenge missing or expired' : 'user verification flag not set' };
        }

        // Uso ÚNICO: o desafio é consumido aqui, dê certo ou não a asserção.
        if (challengeValue) {
          await admin.from('webauthn_challenges').delete().eq('challenge', challengeValue);
        }

        if (assertion.ok === false) {
          const reason = assertion.reason;
          log.warn('WebAuthn authentication rejected', { reason });
          const lock = await recordFailedAttempt(admin, storedCred.user_id, ip, req.headers.get('user-agent'), log);
          log.done(401, { isLocked: lock.isLocked, attempts: lock.attempts, reason });
          return credentialRefusalResponse(req, lock);
        }

        // Conta ativa: usuário existe e não está banido/desativado no Auth.
        if (!account) {
          log.done(401, { reason: 'account_not_found' });
          return credentialRefusalResponse(req, lockPayload(null));
        }
        if (isBanned(account, nowMs)) {
          log.done(403, { reason: 'account_disabled' });
          return errorResponse('Account disabled', 403, req);
        }

        // profiles.is_active (R2-AUTH-023): cobre a janela em que o PD-03 ainda não
        // refletiu o banimento no Auth. MESMO 403 do banido, sem emitir sessão.
        const { data: profileData } = await admin.from('profiles')
          .select('is_active').eq('user_id', storedCred.user_id).single();
        if ((profileData as { is_active?: boolean } | null)?.is_active === false) {
          log.done(403, { reason: 'account_inactive' });
          return errorResponse('Account disabled', 403, req);
        }

        // Lockout por tentativas (mesma RPC do auth-login).
        const { data: lockData, error: lockError } = await admin.rpc('is_account_locked', { check_email: account.email });
        if (lockError) {
          log.error('is_account_locked failed', { code: rpcErrorCode(lockError) });
          return errorResponse('Internal error', 500, req);
        }
        const lockRow = first<LockRow>(lockData);
        if (lockRow?.is_locked) {
          log.done(423, { attempts: lockRow.attempts });
          return jsonResponse({ error: 'Account locked', ...lockPayload(lockRow) }, 423, req);
        }

        await admin.from('passkey_credentials')
          .update({ last_used_at: new Date(nowMs).toISOString(), counter: assertion.newCounter })
          .eq('id', storedCred.id);
        await admin.from('webauthn_challenges').delete().eq('user_id', storedCred.user_id).eq('type', 'authentication');

        const { error: clearError } = await admin.rpc('clear_login_attempts', { p_email: account.email });
        if (clearError) log.error('clear_login_attempts failed', { code: rpcErrorCode(clearError) });

        if (!account.email) {
          log.error('account has no email');
          return errorResponse('Internal error', 500, req);
        }

        // Sessão: `generateLink` NÃO envia e-mail — gera o token para o cliente
        // trocar por sessão. Só o `token_hash` sai daqui.
        const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: account.email,
        });
        const tokenHash = linkData?.properties?.hashed_token;
        if (linkError || !tokenHash) {
          log.error('generateLink failed', { code: rpcErrorCode(linkError) });
          log.done(503, { reason: 'session_issue_failed' });
          return errorResponse('Auth service unavailable', 503, req);
        }

        // Auditoria obrigatória, falha fechada: sem trilha, a sessão não sai.
        const { error: auditError } = await admin.from('audit_logs').insert({
          user_id: storedCred.user_id,
          action: 'passkey_login',
          entity_type: 'login',
          details: { method: 'passkey' },
          ip_address: ip === 'unknown' ? null : ip,
          user_agent: req.headers.get('user-agent'),
        });
        if (auditError) {
          log.error('passkey_login audit failed', { code: rpcErrorCode(auditError) });
          log.done(500, { reason: 'audit_failed' });
          return errorResponse('Internal error', 500, req);
        }

        log.done(200, { action, userId: storedCred.user_id });
        return jsonResponse({ success: true, token_hash: tokenHash, type: 'magiclink' }, 200, req);
      }

      default:
        return errorResponse('Invalid action', 400, req);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleWebAuthn(req));
}
