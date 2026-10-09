import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, enforceRateLimit, getClientIP } from "../_shared/validation.ts";
import { WebAuthnActionSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { verifyAuthenticationAssertion, extractCredentialPublicKey, bytesToBase64url } from "./verify.ts";

// SEC-EDGE-FUNCTIONS-04 (P2), ação PÚBLICA `authentication-options`: (a) e-mail
// inexistente e conta sem passkey respondem IGUAL (`allowCredentials` vazio nunca
// vai no JSON); (b) a busca da conta passou a ser PAGINADA — `listUsers()` sem
// paginação lia só a primeira página (50 contas) e dava a conta fora dela como
// inexistente; (c) limite por IP antes de qualquer efeito. O teste ao lado
// (`index.test.ts`) chama o handler REAL e prova os três pontos.

// Limite por IP da ação pública. Mesmo desenho do `auth-login`, com teto maior
// porque um login por passkey gasta duas chamadas (`authentication-options` +
// `verify-authentication`) e o cadastro de passkey gasta mais duas.
const IP_LIMIT_MAX = 30; // requisições por IP
const IP_LIMIT_WINDOW_MS = 60_000; // 1 minuto

// Tetos da busca paginada de contas. A varredura para quando o paginador diz que
// não há próxima página — nunca se pede uma página depois da última — e, sem esse
// dado, quando vem uma página incompleta. O teto de páginas limita o custo de uma
// única chamada mesmo com a base de contas muito maior.
export const LIST_USERS_PAGE_SIZE = 200;
export const LIST_USERS_MAX_PAGES = 25; // teto de 5 000 contas por busca

export type UserLookup =
  | { status: "found"; userId: string }
  | { status: "not_found" }
  | { status: "unavailable" };

/**
 * Localiza a conta pelo e-mail percorrendo as páginas de `listUsers`.
 * Sem paginação a resposta era sempre a primeira página — a conta que estivesse
 * fora dela era lida como inexistente. A comparação é case-insensitive, como o
 * e-mail é normalizado no resto do sistema. Falha de consulta devolve
 * `unavailable` (o chamador responde igual a "não existe": falha fechada).
 */
export async function findUserByEmail(
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userEmail: string,
): Promise<UserLookup> {
  const target = userEmail.trim().toLowerCase();
  if (!target) return { status: "not_found" };
  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: LIST_USERS_PAGE_SIZE });
    if (error) return { status: "unavailable" };
    const users: Array<{ id?: unknown; email?: unknown }> = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((u) => String(u?.email ?? "").toLowerCase() === target);
    if (match && typeof match.id === "string") return { status: "found", userId: match.id };
    // O paginador diz qual é a próxima página: `nextPage` nulo significa que esta
    // é a última, e a busca NUNCA pede uma página depois dela — com total múltiplo
    // exato do tamanho da página, a página extra viria vazia (era o caso de pedir
    // a 3ª página num total de 2 páginas cheias). Resposta sem o paginador (campo
    // ausente): a página incompleta é o fim; página cheia segue, limitada pelo
    // teto de páginas.
    const nextPage = data?.nextPage;
    if (nextPage === undefined) {
      if (users.length < LIST_USERS_PAGE_SIZE) return { status: "not_found" };
    } else if (typeof nextPage === "number" && nextPage > page) {
      continue;
    } else {
      return { status: "not_found" };
    }
  }
  return { status: "not_found" };
}

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

// ─── Seam de injeção (SEC-EDGE-FUNCTIONS-04) ─────────────────────────────────
// O handler exportado recebe o que faz efeito (client service_role e limitador)
// para o teste exercitar o handler REAL com um `Request`: nenhuma chamada toca
// banco, GoTrue ou rede.
export interface WebAuthnDeps {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
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
  const supabaseAdmin = deps.admin;

  try {
    // SEC-EDGE-FUNCTIONS-04(c): limite por IP antes de ler o corpo e de qualquer
    // efeito (mesma ordem do `auth-login`). Sem limite, o oráculo de enumeração
    // podia ser repetido indefinidamente.
    const clientIp = getClientIP(req);
    const ipRl = await deps.enforceRateLimit(`webauthn:${clientIp}`, IP_LIMIT_MAX, IP_LIMIT_WINDOW_MS);
    if (!ipRl.allowed) {
      log.done(429, { reason: "rate_limited" });
      return errorResponse("Rate limit exceeded", 429, req);
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
      const supabaseAuth = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
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
        const excludeCredentials = (existingCredentials || []).map((cred: { credential_id: string }) => ({
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

        const { data: challengeData, error: challengeError } = await supabaseAdmin
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
          // SEC-EDGE-FUNCTIONS-04(b): busca paginada/filtrada por e-mail, nunca
          // `listUsers()` sem paginação (que só enxergava a primeira página).
          const lookup = await findUserByEmail(supabaseAdmin, userEmail);
          if (lookup.status === 'unavailable') {
            // Falha fechada: sem a lista de contas a resposta é a MESMA de "não
            // existe" — nada de 5xx que denunciaria a conta ao chamador anônimo.
            log.warn('user lookup unavailable', { action });
          }
          if (lookup.status === 'found') {
            authUserId = lookup.userId;
            const { data: credentials } = await supabaseAdmin.from('passkey_credentials').select('credential_id, transports').eq('user_id', authUserId);
            allowCredentials = (credentials || []).map((cred: { credential_id: string; transports: string[] | null }) => ({
              id: cred.credential_id, type: 'public-key' as const, transports: cred.transports || ['internal', 'hybrid'],
            }));
          }
        }

        await supabaseAdmin.from('webauthn_challenges').insert({ user_id: authUserId, challenge, type: 'authentication' });

        log.done(200, { action });
        // SEC-EDGE-FUNCTIONS-04(a): o corpo de "e-mail inexistente" e o de "conta
        // sem passkey" são idênticos — `allowCredentials` vazio não entra no JSON.
        return jsonResponse({
          options: { challenge, rpId, timeout: 60000, userVerification: 'preferred', allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined },
        }, 200, req);
      }

      case 'verify-authentication': {
        if (!credential) return errorResponse('credential is required', 400, req);

        const cred = credential as Record<string, unknown>;
        const { id, response: credResponse } = cred;
        if (!id || !credResponse) return errorResponse('invalid credential payload', 400, req);

        const { data: storedCred, error: credError } = await supabaseAdmin.from('passkey_credentials').select('*').eq('credential_id', id).single();
        if (credError || !storedCred) return errorResponse('Credential not found', 400, req);

        const { data: challengeData } = await supabaseAdmin.from('webauthn_challenges')
          .select('challenge, expires_at').eq('user_id', storedCred.user_id).eq('type', 'authentication')
          .order('created_at', { ascending: false }).limit(1).single();

        if (!challengeData) return errorResponse('Challenge not found or expired', 400, req);
        if (challengeData.expires_at && new Date(challengeData.expires_at).getTime() < Date.now()) {
          return errorResponse('Challenge expired', 400, req);
        }

        const cr = credResponse as Record<string, string>;
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
        await supabaseAdmin.from('webauthn_challenges').delete().eq('user_id', storedCred.user_id).eq('type', 'authentication');

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
  Deno.serve((req) =>
    handleWebAuthn(req, {
      admin: createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY')),
      enforceRateLimit,
    })
  );
}
