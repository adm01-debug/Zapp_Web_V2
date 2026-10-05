import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders } from "../_shared/validation.ts";
import { WebAuthnActionSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { verifyAuthenticationAssertion, extractCredentialPublicKey, bytesToBase64url } from "./verify.ts";

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

// ── Seams de injeção (item 71 / R2-AUTH-002) ──────────────────────────────
// O handler é exportado e recebe o client admin e os valores de env como
// dependências: o teste exerce a lógica inteira (a localização do challenge
// por VALOR no verify-authentication) sem subir servidor, sem banco e sem
// rede. Tipos estruturais mínimos — o client real do supabase-js é convertido
// uma única vez na borda (import.meta.main).

export interface QueryOutcome {
  data: unknown;
  error: unknown;
}

export interface PostgrestBuilderLike extends PromiseLike<QueryOutcome> {
  select(columns?: string): PostgrestBuilderLike;
  insert(values: unknown): PostgrestBuilderLike;
  update(values: unknown): PostgrestBuilderLike;
  delete(): PostgrestBuilderLike;
  eq(column: string, value: unknown): PostgrestBuilderLike;
  is(column: string, value: unknown): PostgrestBuilderLike;
  or(filters: string): PostgrestBuilderLike;
  order(column: string, opts?: { ascending?: boolean }): PostgrestBuilderLike;
  limit(count: number): PostgrestBuilderLike;
  single(): PromiseLike<QueryOutcome>;
  maybeSingle(): PromiseLike<QueryOutcome>;
}

export interface AdminUserLike {
  id: string;
  email?: string | null;
}

export interface SupabaseAdminLike {
  from(table: string): PostgrestBuilderLike;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<QueryOutcome>;
  auth: {
    admin: {
      listUsers(): PromiseLike<{ data: { users: AdminUserLike[] }; error: unknown }>;
      getUserById(id: string): PromiseLike<{ data: { user: AdminUserLike | null }; error: unknown }>;
    };
  };
}

export interface WebAuthnDeps {
  supabaseAdmin: SupabaseAdminLike;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Override do origin (testes); por padrão vem do header `origin` da Request. */
  origin?: string;
}

interface ChallengeRow {
  id: string;
  challenge: string;
  user_id: string | null;
  expires_at: string | null;
}

interface StoredCredentialRow {
  id: string;
  user_id: string;
  public_key: string;
  counter: number | null;
}

export async function handleWebAuthn(req: Request, deps: WebAuthnDeps): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("webauthn");

  try {
    const supabaseAdmin = deps.supabaseAdmin;

    const rawBody = await req.json();
    const parsed = parseBody(WebAuthnActionSchema, rawBody);
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { action, userId, userEmail, userName, credential, friendlyName } = parsed.data;
    const origin = deps.origin ?? req.headers.get('origin') ?? 'https://localhost';
    const rpId = getRpId(origin);
    const rpName = 'ZAPP Web';

    // Verify caller identity for actions that require authentication
    const authHeader = req.headers.get('Authorization');
    let authenticatedUserId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const supabaseAuth = createClient(deps.supabaseUrl, deps.supabaseAnonKey, {
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

        const { data: existingCredentials } = await supabaseAdmin.from('passkey_credentials').select('credential_id').eq('user_id', userId);
        const excludeCredentials = ((existingCredentials ?? []) as Array<{ credential_id: string }>).map(cred => ({
          id: cred.credential_id, type: 'public-key', transports: ['internal', 'hybrid', 'usb', 'ble', 'nfc'],
        }));

        const challenge = generateChallenge();
        await supabaseAdmin.from('webauthn_challenges').insert({ user_id: userId, challenge, type: 'registration' });
        await supabaseAdmin.rpc('cleanup_expired_challenges');

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

        const { data: challengeRow, error: challengeError } = await supabaseAdmin
          .from('webauthn_challenges').select('challenge').eq('user_id', userId).eq('type', 'registration')
          .order('created_at', { ascending: false }).limit(1).single();
        const challengeData = challengeRow as { challenge: string } | null;

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

        const { error: insertError } = await supabaseAdmin.from('passkey_credentials').insert({
          user_id: userId, credential_id: id, public_key: publicKeyB64,
          counter: 0, device_type: authenticatorAttachment || 'platform',
          backed_up: cr.publicKeyAlgorithm === '-7', transports: (credential as Record<string, unknown>).transports || ['internal'],
          friendly_name: friendlyName || 'Passkey',
        });

        if (insertError) return errorResponse('Failed to store credential', 500, req);
        await supabaseAdmin.from('webauthn_challenges').delete().eq('user_id', userId).eq('type', 'registration');

        log.done(200, { action });
        return jsonResponse({ success: true, credentialId: id }, 200, req);
      }

      case 'authentication-options': {
        const challenge = generateChallenge();
        let allowCredentials: { id: string; type: 'public-key'; transports: string[] }[] = [];
        let authUserId: string | null = null;

        if (userEmail) {
          const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
          const user = userData?.users?.find(u => u.email === userEmail);
          if (user) {
            authUserId = user.id;
            const { data: credentials } = await supabaseAdmin.from('passkey_credentials').select('credential_id, transports').eq('user_id', user.id);
            allowCredentials = ((credentials ?? []) as Array<{ credential_id: string; transports: string[] | null }>).map(cred => ({
              id: cred.credential_id, type: 'public-key', transports: cred.transports || ['internal', 'hybrid'],
            }));
          }
        }

        await supabaseAdmin.from('webauthn_challenges').insert({ user_id: authUserId, challenge, type: 'authentication' });

        log.done(200, { action });
        return jsonResponse({
          options: { challenge, rpId, timeout: 60000, userVerification: 'preferred', allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined },
        }, 200, req);
      }

      case 'verify-authentication': {
        if (!credential) return errorResponse('credential is required', 400, req);

        const cred = credential as Record<string, unknown>;
        const { id, response: credResponse } = cred;
        if (!id || !credResponse) return errorResponse('invalid credential payload', 400, req);

        const { data: storedCredData, error: credError } = await supabaseAdmin.from('passkey_credentials').select('*').eq('credential_id', id).single();
        const storedCred = storedCredData as StoredCredentialRow | null;
        if (credError || !storedCred) return errorResponse('Credential not found', 400, req);

        const cr = credResponse as Record<string, string>;

        // O challenge vem do clientDataJSON assinado — não da linha "mais
        // recente". Buscar por recência deixava um challenge antigo do próprio
        // usuário (fluxo com e-mail abandonado) encobrir o anônimo e fazia
        // logins simultâneos disputarem a mesma linha. A linha exata é a que
        // guarda o valor que o autenticador assinou, do dono da credencial ou
        // anônima (login discoverable grava com user_id NULL).
        let clientChallenge: unknown;
        try {
          clientChallenge = (JSON.parse(new TextDecoder().decode(base64URLDecode(cr.clientDataJSON))) as { challenge?: unknown }).challenge;
        } catch {
          clientChallenge = undefined;
        }
        if (typeof clientChallenge !== 'string' || clientChallenge.length === 0) {
          return errorResponse('Challenge not found or expired', 400, req);
        }

        const { data: challengeRow } = await supabaseAdmin.from('webauthn_challenges')
          .select('id, challenge, user_id, expires_at')
          .eq('type', 'authentication')
          .eq('challenge', clientChallenge)
          .or(`user_id.eq.${storedCred.user_id},user_id.is.null`)
          .maybeSingle();
        const challengeData = challengeRow as ChallengeRow | null;

        if (!challengeData) return errorResponse('Challenge not found or expired', 400, req);
        if (challengeData.expires_at && new Date(challengeData.expires_at).getTime() < Date.now()) {
          return errorResponse('Challenge expired', 400, req);
        }

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

        await supabaseAdmin.from('passkey_credentials').update({ last_used_at: new Date().toISOString(), counter: result.newCounter }).eq('id', storedCred.id);
        // Consome somente a linha localizada pelo challenge assinado.
        await supabaseAdmin.from('webauthn_challenges').delete().eq('id', challengeData.id);

        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(storedCred.user_id);
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
    const supabaseAdmin = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
    return handleWebAuthn(req, {
      supabaseAdmin: supabaseAdmin as unknown as SupabaseAdminLike,
      supabaseUrl,
      supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
    });
  });
}
