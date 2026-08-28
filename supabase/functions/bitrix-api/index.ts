import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
});

Deno.serve(async (req) => {
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

    const BITRIX_WEBHOOK_URL = Deno.env.get('BITRIX_WEBHOOK_URL');
    if (!BITRIX_WEBHOOK_URL) {
      return errorResponse('Bitrix não configurado. Configure BITRIX_WEBHOOK_URL nas configurações', 400, req);
    }

    const raw = await req.json().catch(() => null);
    if (!raw) return errorResponse('Invalid JSON body', 400, req);

    const parsed = BitrixBodySchema.safeParse(raw);
    if (!parsed.success) {
      const errors = parsed.error.flatten();
      const msg = Object.entries(errors.fieldErrors)
        .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
        .join('; ');
      return errorResponse(msg || 'Validation error', 400, req);
    }

    const { action, entityType, entityId, data, filters } = parsed.data;
    log.info(`action=${action} entityType=${entityType || 'none'}`);

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
        const contactsData = await contactsResponse.json();

        if (contactsData.result) {
          const syncResults = [];
          for (const bitrixContact of contactsData.result) {
            const phone = bitrixContact.PHONE?.[0]?.VALUE || '';
            if (!phone) continue;
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
            if (!error) syncResults.push(upsertedContact);
          }
          log.done(200, { synced: syncResults.length });
          return jsonResponse({ success: true, synced: syncResults.length, total: contactsData.result.length }, 200, req);
        }
        break;
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
        const pushData = await pushResponse.json();
        log.done(200);
        return jsonResponse({ success: true, bitrixId: pushData.result }, 200, req);
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
              SOURCE_DESCRIPTION: 'WhatsApp via Lovable',
              COMMENTS: data?.conversationSummary,
              UF_CRM_WHATSAPP_CONTACT_ID: data?.contactId,
            },
          }),
        });
        const leadData = await leadResponse.json();
        log.done(200);
        return jsonResponse({ success: true, leadId: leadData.result }, 200, req);
      }
      default:
        return errorResponse('Ação não suportada', 400, req);
    }

    if (endpoint) {
      log.info(`Calling Bitrix: ${endpoint}`);
      const bitrixResponse = await fetch(`${BITRIX_WEBHOOK_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const responseData = await bitrixResponse.json();

      if (responseData.error) {
        log.error('Bitrix error', { error: responseData.error });
        return errorResponse(responseData.error_description || responseData.error, 400, req);
      }

      log.done(200);
      return jsonResponse({ success: true, data: responseData.result, total: responseData.total }, 200, req);
    }

    return errorResponse('Endpoint não definido', 400, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    log.error('Unhandled error', { error: msg });
    return errorResponse(msg, 500, req);
  }
});
