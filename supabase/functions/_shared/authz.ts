/**
 * Authorization helpers for edge functions. (STEP 33)
 *
 * Builds on the JWT verification in validation.ts to add role and
 * permission checks. Every function returns { userId } on success
 * or a Response (401/403) that the caller returns immediately.
 *
 * Usage:
 *   const auth = await requireRole(req, ['admin', 'supervisor']);
 *   if (auth instanceof Response) return auth;
 *   // auth.userId is now available
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { requireEnv } from "./validation.ts";

export type AuthResult = { userId: string } | Response;

/** Resolve caller identity from Bearer JWT. Returns userId or 401 Response. */
async function resolveUser(req: Request): Promise<{ userId: string; adminClient: ReturnType<typeof createClient> } | Response> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization bearer token" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  return { userId: user.id, adminClient: createClient(supabaseUrl, serviceKey) };
}

/**
 * Requires the caller to have at least one of the given roles.
 * Reads user_roles via service_role (bypasses RLS — intentional for authz).
 */
export async function requireRole(req: Request, roles: string[]): Promise<AuthResult> {
  const resolved = await resolveUser(req);
  if (resolved instanceof Response) return resolved;

  const { userId, adminClient } = resolved;

  const { data: roleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const userRoles = (roleRows || []).map((r: { role: string }) => r.role);
  if (!roles.some((r) => userRoles.includes(r))) {
    return new Response(
      JSON.stringify({
        error: "Forbidden",
        required_one_of: roles,
        actual: userRoles,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  return { userId };
}

/**
 * Requires the caller to have a named permission via user_has_permission().
 * The RPC is SECURITY DEFINER so it works for all roles.
 */
export async function requirePermission(req: Request, permission: string): Promise<AuthResult> {
  const resolved = await resolveUser(req);
  if (resolved instanceof Response) return resolved;

  const { userId, adminClient } = resolved;

  const { data: hasPerm } = await adminClient.rpc("user_has_permission", {
    _user_id: userId,
    _permission_name: permission,
  });

  if (!hasPerm) {
    return new Response(
      JSON.stringify({
        error: "Forbidden",
        required_permission: permission,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  return { userId };
}

/**
 * Validates an internal cron secret header.
 * The cron job net.http_post call must include:
 *   headers: '{"x-cron-secret": "<INTERNAL_CRON_SECRET>"}'
 * Returns false if secret is not configured (fail-closed) or header mismatches.
 */
export function requireCronSecret(req: Request): boolean {
  const secret = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret;
}

/**
 * Validates Evolution GO webhook identity via its Global API Key.
 * Evolution GO sends the key in the 'apikey' header on all webhook deliveries.
 * Returns false if the key is absent or mismatches EVOLUTION_API_KEY env var.
 */
export function requireEvolutionWebhookKey(req: Request): boolean {
  const expectedKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!expectedKey) return false; // fail-closed: misconfigured
  const incomingKey = req.headers.get("apikey") || req.headers.get("x-api-key");
  return incomingKey === expectedKey;
}
