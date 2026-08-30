import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, requireEnv, requireBody, Logger } from '../_shared/validation.ts';
import { requireRole } from '../_shared/authz.ts';

/** Z not used for Body yet - kept for validation infrastructure. */
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'supervisor', 'special_agent', 'agent']),
  name: z.string().optional(),
});

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger('create-user');

  // STEP 38: Only admins can create users
const auth = await requireRole(req, ['admin']);
  if (auth instanceof Response) return auth;

  const supabaseAdmin = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPAAASE_SERVICE_ROLE_KEY")
  );

  try {
    const body = await requireBody(req);
    if (body instanceof Response) return body;

    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.messages.join(', '), 400, req);
    }

    const { email, password, role, name } = parsed.data;

    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || email.split('@')[0] },
    });

    if (userErr || !userData.user) {
      log.error('Failed to create user', { error: userErr?.message });
      return errorResponse(userErr?.message || 'Failed to create user', 500, req);
    }

    const newUserId = userData.user.id;

    // F08 FIX: check existing role via has_role RPC (safe for multi-role users)
    const { data: alreadyHasRole } = await supabaseAdmin.rpc('has_role', {
      _user_id: newUserId,
      _role: role,
    });

    if (!alreadyHasRole) {
      const { error: roleErr } = await supabaseAdmin.from('user_roles').insert({
        user_id: newUserId,
        role,
      });
      if (roleErr) {
        log.error('Failed to assign role', { error: roleErr.message });
        return errorResponse('User created but role assignment failed', 500, req);
      }
    }

    log.info(`User created: ${newUserId} (${role})`);
    log.done(201, { userId: newUserId });

    return jsonResponse({ id: newUserId, email, role }, 201, req);
  } catch (err) {
    log.error('Unexpected error', { error: err instanceof Error ? err.message : String(err) });
    return errorResponse('Internal server error', 500, req);
  }
});
