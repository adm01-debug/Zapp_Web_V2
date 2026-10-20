import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, Logger, getCorsHeaders } from "../_shared/validation.ts";

const BitrixBodySchema = z.object({
  action: z.enum([
    'list', 'get', 'create', 'update', 'delete',
    'register_call', 'finish_call', 'attach_record',
    'sync_contacts', 'push_contact', 'create_lead_from_conversation',
  ]),
  entityType: z.enum(['lead', 'contact', 'deal', 'activity', 'call']).optional(),
  entityId: z.string().max(100).optional(),
  data: z.record(z.unknown()).optional(),
  filters: z.record(z.unknown()).optional(),
}).strict();

/**
 * R2-API-018 — classificacao unica das respostas do Bitrix REST.
 *
 * O Bitrix sinaliza rejeicao de negocio com HTTP 200 e envelope
 * `{ error, error_description }`, e falha de infraestrutura com 4xx/5xx (muitas
 * vezes com o mesmo envelope). Declarar sucesso sem olhar para isso fazia os
 * ramos especiais de criacao devolverem `success: true` para uma criacao que o
 * provedor recusou — e o front (`useBitrixApi`) so checa `result.success` para
 * exibir o toast de criacao.
 *
 * Regra: HTTP nao-ok -> 502 (falha do provedor; a mensagem interna nao vai ao
 * cliente porque a resposta de erro do provedor sanitiza 5xx); HTTP ok com envelope de erro ->
 * 400 com a mensagem do provedor (mesma classificacao que o ramo generico ja
 * usava); HTTP ok sem erro -> corpo devolvido a quem chamou.
 */
type BitrixCallResult =
  | { ok: true; data: unknown; total: unknown }
  | { ok: false; status: number; message: string };

async function classifyBitrixResponse(response: Response): Promise<BitrixCallResult> {
  const raw = await response.text().catch(() => '');
  let body: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = null;
  }

  if (!response.ok) {
    return { ok: false, status: 502, message: `Bitrix respondeu HTTP ${response.status}` };
  }
  if (!body) {
    return { ok: false, status: 502, message: 'Bitrix devolveu resposta ilegivel' };
  }
  if (typeof body.error === 'string' && body.error.length > 0) {
    const description = typeof body.error_description === 'string' && body.error_description.length > 0
      ? body.error_description
      : body.error;
    return { ok: false, status: 400, message: description };
  }
  return { ok: true, data: body.result, total: body.total };
}

/** ID devolvido pelo Bitrix numa criacao. Sem ID nao houve criacao a confirmar. */
function createdEntityId(data: unknown): number | null {
  if (typeof data === 'number' && Number.isInteger(data) && data > 0) return data;
  if (typeof data === 'string' && /^\d+$/.test(data) && Number(data) > 0) return Number(data);
  return null;
}

/**
 * Host do portal Bitrix configurado no servidor. A resposta pode nomear o host,
 * mas nunca ecoa o caminho do webhook, que carrega o token do portal.
 */
export function configuredPortalHost(webhookUrl: string | null | undefined): string | null {
  if (typeof webhookUrl !== 'string' || webhookUrl.trim() === '') return null;
  try {
    const parsed = new URL(webhookUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.host || null;
  } catch {
    return null;
  }
}

function bitrixProviderErrorResponse(result: { status: number; message: string }, portal: string, req: Request): Response {
  const message = result.status >= 500 ? 'Internal server error' : result.message;
  return jsonResponse({ success: false, portal, error: message }, result.status, req);
}

// Handler exportado (padrao das edges do repo): o teste chama ESTE handler com
// um Request real; o servidor so sobe quando o arquivo roda como entrypoint.
export async function handleBitrixApi(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("bitrix-api");

  try {
    // SECURITY: require an authenticated user JWT before touching the
    // external CRM. Without this check any unauthenticated caller could
    // list/create/update/delete leads, contacts, deals and trigger a
    // contact sync into the app database.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401, req);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return errorResponse("Server misconfigured", 500, req);
    }
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return errorResponse("Unauthorized", 401, req);
    }

    const BITRIX_WEBHOOK_URL = Deno.env.get('BITRIX_WEBHOOK_URL')?.trim();
    const portal = configuredPortalHost(BITRIX_WEBHOOK_URL);
    if (!BITRIX_WEBHOOK_URL) {
      return errorResponse('BITRIX_WEBHOOK_URL não configurada. Configure a URL do webhook Bitrix nas configurações', 400, req);
    }
    if (!portal) {
      log.error('BITRIX_WEBHOOK_URL inválida', { error: 'url absoluta http(s) esperada' });
      return errorResponse('BITRIX_WEBHOOK_URL inválida: informe a URL completa do webhook (https://<portal>.bitrix24.com.br/rest/1/<token>/)', 400, req);
    }

    const raw = await req.json().catch(() => null);
    if (!raw) return errorResponse('Invalid JSON body', 400, req);

    const parsed = BitrixBodySchema.safeParse(raw);
    if (!parsed.success) {
      const errors = parsed.error.flatten();
      const fieldMsg = Object.entries(errors.fieldErrors)
        .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
        .join('; ');
      const formMsg = errors.formErrors.join('; ');
      const msg = [fieldMsg, formMsg].filter(Boolean).join('; ');
      return errorResponse(msg || 'Validation error', 400, req);
    }

    const { action, entityType, entityId, data, filters } = parsed.data;
    log.info(`action=${action} entityType=${entityType || 'none'}`, { portal });

    // Bitrix é um CRM externo sem RLS/dono por contato no nosso schema —
    // TODA ação desta function (mesmo padrão já usado em crm-integration
    // para 'select'/'mutate') restringe a admin/supervisor. Auditoria
    // adversarial de 2026-09-25 achou que o gate anterior só cobria
    // list/get/create/update/delete: finish_call/attach_record/sync_contacts
    // aceitavam callId/filtro arbitrário sem checar dono (mesmo padrão do
    // bug original) e sync_contacts fazia upsert em massa sobrescrevendo
    // contacts local; register_call/push_contact/create_lead_from_conversation
    // escreviam no CRM com dados arbitrários do body sem nenhuma checagem.
    const { data: isAdmin, error: adminError } = await authClient.rpc('is_admin_or_supervisor', {
      _user_id: userData.user.id,
    });
    if (adminError || !isAdmin) {
      return errorResponse('Forbidden', 403, req);
    }

    let endpoint = '';
    let body: Record<string, unknown> | null = null;

    const entityMap: Record<string, string> = {
      lead: 'crm.lead', contact: 'crm.contact', deal: 'crm.deal',
      activity: 'crm.activity', call: 'telephony.externalcall',
    };
    const bitrixEntity = entityType ? entityMap[entityType] : '';

    switch (action) {
      case 'list':
        endpoint = `${bitrixEntity}.list`;
        body = { filter: filters || {}, select: ['*', 'UF_*'] };
        break;
      case 'get':
        endpoint = `${bitrixEntity}.get`;
        body = { id: entityId };
        break;
      case 'create':
        endpoint = `${bitrixEntity}.add`;
        body = { fields: data };
        break;
      case 'update':
        endpoint = `${bitrixEntity}.update`;
        body = { id: entityId, fields: data };
        break;
      case 'delete':
        endpoint = `${bitrixEntity}.delete`;
        body = { id: entityId };
        break;
      case 'register_call':
        endpoint = 'telephony.externalcall.register';
        body = {
          USER_PHONE_INNER: data?.userPhoneInner,
          USER_ID: data?.userId,
          PHONE_NUMBER: data?.phoneNumber,
          TYPE: data?.type || 1,
          CALL_START_DATE: data?.callStartDate || new Date().toISOString(),
          CRM_CREATE: data?.crmCreate || 1,
        };
        break;
      case 'finish_call':
        endpoint = 'telephony.externalcall.finish';
        body = {
          CALL_ID: data?.callId, USER_ID: data?.userId,
          DURATION: data?.duration, STATUS_CODE: data?.statusCode || 200,
          ADD_TO_CHAT: data?.addToChat || 0,
        };
        break;
      case 'attach_record':
        endpoint = 'telephony.externalCall.attachRecord';
        body = {
          CALL_ID: data?.callId, FILENAME: data?.filename,
          FILE_CONTENT: data?.fileContent,
        };
        break;
      case 'sync_contacts': {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const contactsResponse = await fetch(`${BITRIX_WEBHOOK_URL}/crm.contact.list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: filters || {},
            select: ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'COMPANY_ID', 'POST'],
          }),
        });
        const contacts = await classifyBitrixResponse(contactsResponse);
        if (!contacts.ok) {
          log.error('Bitrix error', { error: contacts.message, status: contacts.status });
          return bitrixProviderErrorResponse(contacts, portal, req);
        }

        // R2-API-018: erro por item nao pode sumir numa contagem menor. Cada
        // contato nao sincronizado sai em `failures` com razao sanitizada (a
        // mensagem crua do banco fica so no log do servidor).
        const rows = Array.isArray(contacts.data) ? contacts.data : [];
        const syncResults = [];
        const failures: Array<{ id: unknown; reason: string }> = [];
        for (const bitrixContact of rows) {
          const phone = bitrixContact.PHONE?.[0]?.VALUE || '';
          if (!phone) {
            failures.push({ id: bitrixContact.ID ?? null, reason: 'missing_phone' });
            continue;
          }
          const { data: upsertedContact, error } = await supabase
            .from('contacts')
            .upsert({
              phone: phone.replace(/\D/g, ''),
              name: bitrixContact.NAME || 'Sem nome',
              surname: bitrixContact.LAST_NAME,
              email: bitrixContact.EMAIL?.[0]?.VALUE,
              company: bitrixContact.COMPANY_ID,
              job_title: bitrixContact.POST,
              notes: `Bitrix ID: ${bitrixContact.ID}`,
            }, { onConflict: 'phone', ignoreDuplicates: false })
            .select().single();
          if (error) {
            log.error('sync_contacts: upsert falhou', { code: error.code, bitrixId: bitrixContact.ID });
            failures.push({ id: bitrixContact.ID ?? null, reason: 'upsert_failed' });
            continue;
          }
          syncResults.push(upsertedContact);
        }
        log.done(200, { synced: syncResults.length, failed: failures.length, portal });
        return jsonResponse({
          success: true,
          portal,
          synced: syncResults.length,
          failed: failures.length,
          total: rows.length,
          failures,
        }, 200, req);
      }
      case 'push_contact': {
        const pushResponse = await fetch(`${BITRIX_WEBHOOK_URL}/crm.contact.add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              NAME: data?.name, LAST_NAME: data?.surname,
              PHONE: data?.phone ? [{ VALUE: data.phone, VALUE_TYPE: 'WORK' }] : [],
              EMAIL: data?.email ? [{ VALUE: data.email, VALUE_TYPE: 'WORK' }] : [],
              POST: data?.jobTitle,
            },
          }),
        });
        const push = await classifyBitrixResponse(pushResponse);
        if (!push.ok) {
          log.error('Bitrix error', { error: push.message, status: push.status });
          return bitrixProviderErrorResponse(push, portal, req);
        }
        const bitrixId = createdEntityId(push.data);
        if (bitrixId === null) {
          log.error('Bitrix sem ID na criacao do contato');
          return errorResponse('Bitrix nao confirmou o contato criado', 502, req);
        }
        log.done(200, { portal });
        return jsonResponse({ success: true, portal, bitrixId }, 200, req);
      }
      case 'create_lead_from_conversation': {
        const leadResponse = await fetch(`${BITRIX_WEBHOOK_URL}/crm.lead.add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              TITLE: data?.title || `Lead WhatsApp - ${data?.contactName}`,
              NAME: data?.contactName,
              PHONE: data?.phone ? [{ VALUE: data.phone, VALUE_TYPE: 'WORK' }] : [],
              SOURCE_ID: 'WEB',
              SOURCE_DESCRIPTION: 'WhatsApp via ZAPP Web',
              COMMENTS: data?.conversationSummary,
              UF_CRM_WHATSAPP_CONTACT_ID: data?.contactId,
            },
          }),
        });
        const lead = await classifyBitrixResponse(leadResponse);
        if (!lead.ok) {
          log.error('Bitrix error', { error: lead.message, status: lead.status });
          return bitrixProviderErrorResponse(lead, portal, req);
        }
        const leadId = createdEntityId(lead.data);
        if (leadId === null) {
          log.error('Bitrix sem ID na criacao do lead');
          return errorResponse('Bitrix nao confirmou o lead criado', 502, req);
        }
        log.done(200, { portal });
        return jsonResponse({ success: true, portal, leadId }, 200, req);
      }
      default:
        return errorResponse('Ação não suportada', 400, req);
    }

    if (endpoint) {
      log.info(`Calling Bitrix: ${endpoint}`, { portal });
      const bitrixResponse = await fetch(`${BITRIX_WEBHOOK_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const bitrix = await classifyBitrixResponse(bitrixResponse);

      if (!bitrix.ok) {
        log.error('Bitrix error', { error: bitrix.message, status: bitrix.status });
        return bitrixProviderErrorResponse(bitrix, portal, req);
      }

      // R2-API-018: criacao so e sucesso com o ID devolvido pelo Bitrix.
      if (action === 'create' && createdEntityId(bitrix.data) === null) {
        log.error('Bitrix sem ID na criacao', { endpoint });
        return errorResponse('Bitrix nao confirmou o registro criado', 502, req);
      }

      log.done(200, { portal });
      return jsonResponse({ success: true, portal, data: bitrix.data, total: bitrix.total }, 200, req);
    }

    return errorResponse('Endpoint não definido', 400, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    log.error('Unhandled error', { error: msg });
    return errorResponse(msg, 500, req);
  }
}

if (import.meta.main) Deno.serve(handleBitrixApi);
