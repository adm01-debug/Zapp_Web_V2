import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, enforceRateLimit, getClientIP } from "../_shared/validation.ts";
import { WebAuthnActionSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { verifyAuthenticationAssertion, extractCredentialPublicKey, bytesToBase64url } from "./verify.ts";

const RP_NAME = 'ZAPP Web';
// Rate limit por IP dos passos anônimos (o login com passkey não tem sessão).
const AUTH_OPTIONS_MAX = 30;
const VERIFY_AUTH_MAX = 30;
const RATE_WINDOW_MS = 60_000;

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

/** Lê `clientDataJSON` (base64url) sem lançar; devolve null quando ilegível. */
function parseClientDataJSON(clientDataJSON: unknown): Record<string, unknown> | null {
  if (typeof clientDataJSON !== 'string' || clientDataJSON.length === 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64URLDecode(clientDataJSON)));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Busca direta do usuário pelo e-mail (`profiles.email`), em vez de
 * `auth.admin.listUsers()`, que só devolve a PRIMEIRA página do GoTrue (50
 * usuários por default) e por isso não encontra quem está depois — o login com
 * e-mail falhava silenciosamente para esses usuários.
 */
async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await admin
    .from('profiles')
    .select('user_id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

// ── Seams de injeção (mesmo padrão de auth-login / R2-AUTH-022) ──────────────
// O login com passkey é público e não passa por requireAuth; o handler recebe
// as dependências que fazem efeito (cliente service_role, cliente anônimo para
// validar o Bearer e o rate limit) para que o teste prove, sem tocar banco, o
// fluxo descobrível (sem e-mail) e o desafio de uso único.

export interface WebAuthnCallerClient {
  auth: {
    getClaims: (token: string) => PromiseLike<{
      data: { claims?: { sub?: string } } | null;
      error: unknown;
    }>;
  };
}

export interface WebAuthnDeps {
  admin: SupabaseClient;
  createCallerClient: (authHeader: string) => WebAuthnCallerClient;
  enforceRateLimit: (
    key: string,
    maxRequests: number,
    windowMs: number,
  ) => PromiseLike<{ allowed: boolean }>;
}

export async function handleWebAuthn(req: Request, deps: WebAuthnDeps): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("webauthn");

  try {
    const rawBody = await req.json();
    const parsed = parseBody(WebAuthnActionSchema, rawBody);
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { action, userId, userEmail, userName, credential, friendlyName } = parsed.data;
    const origin = req.headers.get('origin') || 'https://localhost';
    const rpId = getRpId(origin);

    // Verify caller identity for actions that require authentication
    const authHeader = req.headers.get('Authorization');
    let authenticatedUserId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const caller = deps.createCallerClient(authHeader);
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await caller.auth.getClaims(token);
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

        const { data: existingCredentials } = await deps.admin.from('passkey_credentials').select('credential_id').eq('user_id', userId);
        const excludeCredentials = (existingCredentials || []).map((cred: { credential_id: string }) => ({
          id: cred.credential_id, type: 'public-key', transports: ['internal', 'hybrid', 'usb', 'ble', 'nfc'],
        }));

        const challenge = generateChallenge();
        await deps.admin.from('webauthn_challenges').insert({ user_id: userId, challenge, type: 'registration' });
        await deps.admin.rpc('cleanup_expired_challenges');

        const options = {
          challenge, rp: { name: RP_NAME, id: rpId },
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

        const { data: challengeData, error: challengeError } = await deps.admin
          .from('webauthn_challenges').select('id, challenge, expires_at').eq('user_id', userId).eq('type', 'registration')
          .order('created_at', { ascending: false }).limit(1).single();

        if (challengeError || !challengeData) return errorResponse('Challenge not found or expired', 400, req);
        if (challengeData.expires_at && new Date(challengeData.expires_at).getTime() < Date.now()) {
          return errorResponse('Challenge expired', 400, req);
        }

        const { id, response: credResponse, type, authenticatorAttachment } = credential as Record<string, unknown>;
        if (type !== 'public-key') return errorResponse('Invalid credential type', 400, req);

        const cr = credResponse as Record<string, string>;
        const clientData = parseClientDataJSON(cr.clientDataJSON);
        if (!clientData || clientData.type !== 'webauthn.create') return errorResponse('Invalid client data type', 400, req);
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

        const { error: insertError } = await deps.admin.from('passkey_credentials').insert({
          user_id: userId, credential_id: id, public_key: publicKeyB64,
          counter: 0, device_type: authenticatorAttachment || 'platform',
          backed_up: cr.publicKeyAlgorithm === '-7', transports: (credential as Record<string, unknown>).transports || ['internal'],
          friendly_name: friendlyName || 'Passkey',
        });

        if (insertError) return errorResponse('Failed to store credential', 500, req);
        // Uso único: consome exatamente o desafio verificado.
        await deps.admin.from('webauthn_challenges').delete().eq('id', challengeData.id);

        log.done(200, { action });
        return jsonResponse({ success: true, credentialId: id }, 200, req);
      }

      case 'authentication-options': {
        const rl = await deps.enforceRateLimit(`webauthn-auth-options:${getClientIP(req)}`, AUTH_OPTIONS_MAX, RATE_WINDOW_MS);
        if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

        const challenge = generateChallenge();
        let allowCredentials: { id: string; type: 'public-key'; transports: string[] }[] = [];
        let authUserId: string | null = null;

        if (userEmail) {
          authUserId = await findUserIdByEmail(deps.admin, userEmail);
          if (authUserId) {
            const { data: credentials } = await deps.admin.from('passkey_credentials').select('credential_id, transports').eq('user_id', authUserId);
            allowCredentials = (credentials || []).map((cred: { credential_id: string; transports: string[] | null }) => ({
              id: cred.credential_id, type: 'public-key', transports: cred.transports || ['internal', 'hybrid'],
            }));
          }
        }

        // user_id fica NULO no login sem e-mail (credencial descobrível). O desafio
        // é resolvido, na verificação, pelo VALOR assinado — não pelo user_id.
        const { error: insertError } = await deps.admin.from('webauthn_challenges').insert({ user_id: authUserId, challenge, type: 'authentication' });
        if (insertError) return errorResponse('Failed to create challenge', 500, req);
        await deps.admin.rpc('cleanup_expired_challenges');

        log.done(200, { action });
        return jsonResponse({
          options: { challenge, rpId, timeout: 60000, userVerification: 'preferred', allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined },
        }, 200, req);
      }

      case 'verify-authentication': {
        const rl = await deps.enforceRateLimit(`webauthn-verify-auth:${getClientIP(req)}`, VERIFY_AUTH_MAX, RATE_WINDOW_MS);
        if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

        if (!credential) return errorResponse('credential is required', 400, req);

        const cred = credential as Record<string, unknown>;
        const { id, response: credResponse } = cred;
        if (!id || !credResponse) return errorResponse('invalid credential payload', 400, req);

        const cr = credResponse as Record<string, string>;

        // O desafio é localizado pelo valor que o autenticador assinou
        // (clientDataJSON.challenge), não por user_id: no login descobrível
        // (sem e-mail) o desafio foi gravado com user_id nulo, então procurar
        // por user_id — como antes — nunca o encontrava e o login falhava.
        const clientData = parseClientDataJSON(cr.clientDataJSON);
        if (!clientData || typeof clientData.challenge !== 'string' || clientData.challenge.length === 0) {
          return errorResponse('Invalid client data', 400, req);
        }
        const challengeValue = clientData.challenge;

        const { data: challengeData } = await deps.admin.from('webauthn_challenges')
          .select('id, challenge, user_id, expires_at').eq('challenge', challengeValue).eq('type', 'authentication')
          .order('created_at', { ascending: false }).limit(1).single();

        if (!challengeData) return errorResponse('Challenge not found or expired', 400, req);
        if (challengeData.expires_at && new Date(challengeData.expires_at).getTime() < Date.now()) {
          return errorResponse('Challenge expired', 400, req);
        }

        const { data: storedCred, error: credError } = await deps.admin.from('passkey_credentials').select('*').eq('credential_id', id).single();
        if (credError || !storedCred) return errorResponse('Credential not found', 400, req);

        // Desafio de fluxo com e-mail é vinculado à conta; o descobrível (user_id
        // nulo) vale para a credencial que provar posse. Um desafio de OUTRA conta
        // nunca é aceito.
        if (challengeData.user_id && challengeData.user_id !== storedCred.user_id) {
          return errorResponse('Challenge mismatch', 400, req);
        }

        // Uso único: consome o desafio ANTES de verificar. Reutilizar o mesmo
        // clientDataJSON/challenge falha mesmo com a assinatura válida.
        await deps.admin.from('webauthn_challenges').delete().eq('id', challengeData.id);

        // R2-AUTH-001: verificação criptográfica completa (falha fechada). Só aceita
        // quando signature, authenticatorData e clientDataJSON são válidos em conjunto,
        // com challenge, origem, RP ID e assinatura conferidos contra a chave guardada.
        const result = await verifyAuthenticationAssertion({
          clientDataJSON: cr.clientDataJSON,
          authenticatorData: cr.authenticatorData,
          signature: cr.signature,
          storedPublicKey: storedCred.public_key,
          storedCounter: Number(storedCred.counter ?? 0),
          challenge: challengeData.challenge,
          rpId,
          expectedOrigin: origin,
        });

        if (!result.ok) {
          log.warn('WebAuthn authentication rejected', { reason: result.reason });
          return errorResponse('WebAuthn authentication failed', 400, req);
        }

        await deps.admin.from('passkey_credentials').update({ last_used_at: new Date().toISOString(), counter: result.newCounter }).eq('id', storedCred.id);

        const { data: userData } = await deps.admin.auth.admin.getUserById(storedCred.user_id);
        log.done(200, { action });
        return jsonResponse({ success: true, userId: storedCred.user_id, userEmail: userData?.user?.email }, 200, req);
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
  Deno.serve(async (req) => {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
    const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    return handleWebAuthn(req, {
      admin,
      createCallerClient: (authHeader) => createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: authHeader } },
      }) as unknown as WebAuthnCallerClient,
      enforceRateLimit,
    });
  });
}
