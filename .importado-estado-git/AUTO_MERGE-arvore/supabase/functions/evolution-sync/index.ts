import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, enforceRateLimit, requireEnv } from "../_shared/validation.ts";
import {
  syncContacts, syncMessages, syncAllMessages,
  setupWebhook, cleanupMock, fullSync,
} from "../_shared/evolution-sync-actions.ts";
import type { EvolutionDbClient } from "../_shared/evolution-types.ts";

// Mesma regex de nome de instância usada nas outras Edges de instância
// (evolution-api/index.ts): minúsculas, números e "_", 3 a 40 caracteres.
// Sem isso, um nome com "/" ou ".." injetaria segmento de caminho na URL da
// Evolution (o nome entra no path de /chat/findContacts/<instance>).
const INSTANCE_NAME_RE = /^[a-z0-9_]{3,40}$/;

// Tetos de entrada. `page`/`offset` viram page/offset da consulta à Evolution;
// `messagesPerContact` vira o offset do histórico por contato — sem teto, um
// chamador pediria milhões de mensagens de uma vez.
export const MAX_PAGE = 1000;
export const MAX_OFFSET = 1000;
export const MAX_MESSAGES_PER_CONTACT = 1000;

/** Inteiro dentro de [min, max]; valor ausente/não numérico cai no fallback. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(n, min), max);
}

/** Client anon do chamador: valida o JWT e consulta o papel (admin/supervisor). */
export interface EvolutionSyncUserClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown }>;
}

/**
 * O que os testes injetam. Em produção nada é passado e cada dependência é
 * construída a partir do ambiente, preguiçosamente.
 */
export interface EvolutionSyncInjected {
  makeUserClient?: (authHeader: string) => EvolutionSyncUserClient;
  supabase?: EvolutionDbClient;
  enforceRateLimit?: (key: string, maxRequests: number, windowMs: number) => PromiseLike<{ allowed: boolean }>;
}

export async function handleEvolutionSync(
  req: Request,
  _injected: EvolutionSyncInjected = {},
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

  if (!evolutionApiUrl || !evolutionApiKey) {
    return jsonRes({ error: 'Evolution API not configured' }, 503, corsHeaders);
  }

  // Ferramenta administrativa: exige admin, nao apenas usuario logado.
  // verify_jwt=true so garante JWT valido; sem este guard, qualquer
  // atendente dispararia sync completo de historico de mensagens.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonRes({ error: 'Authorization header required' }, 401, corsHeaders);
  }

  const makeUserClient = _injected.makeUserClient ?? ((header: string) => createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: header } } },
  ) as unknown as EvolutionSyncUserClient);

  const supabaseUser = makeUserClient(authHeader);
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return jsonRes({ error: 'Unauthorized' }, 401, corsHeaders);
  }
  const { data: isAdmin } = await supabaseUser.rpc('is_admin_or_supervisor', { _user_id: user.id });
  if (!isAdmin) {
    return jsonRes({ error: 'Only admins can run evolution sync' }, 403, corsHeaders);
  }

  // Rate limit por usuário (10/min), mesmo helper das outras Edges.
  const rateLimit = _injected.enforceRateLimit ?? enforceRateLimit;
  const rl = await rateLimit(`evolution-sync:${user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return jsonRes({ error: 'Rate limit exceeded' }, 429, corsHeaders);
  }

  // Cast unico: comparar o client real (generics profundos do supabase-js) com
  // EvolutionDbClient aqui estoura o TS2589 do Deno ("instantiation is excessively
  // deep"). O contrato segue checado nos handlers, que recebem EvolutionDbClient.
  const supabase = _injected.supabase ?? (
    createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY')) as unknown as EvolutionDbClient
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'sync-contacts';

    // E20 (plano multi-conexão): cleanup-mock não opera em instância nenhuma;
    // toda outra ação sincroniza uma instância específica — nunca mais assumir
    // a PRINCIPAL quando o chamador esquece de informar.
    if (action === 'cleanup-mock') {
      return await cleanupMock(supabase, corsHeaders);
    }

    const instanceName = body.instanceName;
    if (typeof instanceName !== 'string' || !INSTANCE_NAME_RE.test(instanceName)) {
      return jsonRes({
        error: 'Nome de instância inválido — use letras minúsculas, números e "_" (3 a 40 caracteres).',
      }, 400, corsHeaders);
    }

    // Tetos: page/offset da varredura e o histórico por contato.
    const page = clampInt(body.page, 0, MAX_PAGE, 1);
    const offset = clampInt(body.offset, 1, MAX_OFFSET, 100);
    const messagesPerContact = clampInt(body.messagesPerContact, 1, MAX_MESSAGES_PER_CONTACT, 200);

    if (action === 'sync-contacts') {
      return await syncContacts(supabase, evolutionApiUrl, evolutionApiKey, instanceName, corsHeaders, page, offset);
    }

    if (action === 'sync-messages') {
      return await syncMessages(supabase, evolutionApiUrl, evolutionApiKey, instanceName, body.contactPhone, corsHeaders);
    }

    if (action === 'setup-webhook') {
      return await setupWebhook(evolutionApiUrl, evolutionApiKey, instanceName, requireEnv('SUPABASE_URL'), body.webhookUrl, corsHeaders);
    }

    if (action === 'full-sync') {
      return await fullSync(supabase, evolutionApiUrl, evolutionApiKey, instanceName, requireEnv('SUPABASE_URL'), corsHeaders);
    }

    if (action === 'sync-all-messages') {
      return await syncAllMessages(supabase, evolutionApiUrl, evolutionApiKey, instanceName, messagesPerContact, corsHeaders);
    }

    return jsonRes({
      error: 'Unknown action',
      validActions: ['sync-contacts', 'sync-messages', 'sync-all-messages', 'setup-webhook', 'cleanup-mock', 'full-sync'],
    }, 400, corsHeaders);
  } catch (error: unknown) {
    console.error('[Sync] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonRes({ error: message }, 500, corsHeaders);
  }
}

function jsonRes(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

if (import.meta.main) {
  Deno.serve((req) => handleEvolutionSync(req));
}
