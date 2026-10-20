import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, internalErrorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { registrarAcaoCalculada } from "../_shared/ai-usage.ts";
import { AiChurnAnalysisSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { analyzeChurnContacts } from "./churn-risk.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("ai-churn-analysis");

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`churn:${ip}`, 10, 60_000);
    if (!allowed) return errorResponse("Rate limit exceeded", 429, req);

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Não autorizado", 401, req);

    const callerClient = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return errorResponse("Não autorizado", 401, req);
    const __guard = await enforceAiGuards({ functionName: "ai-churn-analysis", userId: user.id, req });
    if (__guard) return __guard;

    // IA-054/IA-QUOTA-001 — ação admitida pela guarda tem de virar linha em
    // ai_usage_logs: é essa contagem por (usuário, função) que a quota diária lê
    // (passo 3 de _shared/ai-guards.ts). Sem a linha, a ação passava pela guarda
    // e era invisível para a quota — o defeito do cartão. O handler é calculado
    // (nenhum modelo é chamado), então a linha grava tokens NULL ("não medido"):
    // conta como ação/tentativa na quota, nunca como cobrança de tokens. Toda
    // saída de `responder` — sucesso, entrada inválida ou erro interno — gera
    // exatamente uma linha.
    const responder = async (): Promise<Response> => {
      try {
        const parsed = parseBody(AiChurnAnalysisSchema, await req.json());
        if (!parsed.success) return validationErrorResponse(parsed, req);

        const { contactIds } = parsed.data;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const { data: visibleContacts } = await callerClient
          .from("contacts")
          .select("id")
          .in("id", contactIds);
        const visibleContactIds = (visibleContacts || []).map((c: { id: string }) => c.id);

        const { data: contacts } = await adminClient
          .from("contacts")
          .select("id, name, phone, created_at")
          .in("id", visibleContactIds);

        if (!contacts || contacts.length === 0) {
          return jsonResponse({ results: [], message: "Nenhum contato encontrado" }, 200, req);
        }

        log.info("Analyzing churn risk", { contactCount: contacts.length });

        // IA-111: o engajamento é medido SÓ pelas mensagens (churn-risk.ts). O
        // cadastro do contato — e o seu `updated_at`, mutado por qualquer edição —
        // não entra no cálculo da inatividade.
        const results = await analyzeChurnContacts(adminClient, contacts, new Date());

        log.done(200, { analyzed: results.length });
        return jsonResponse({ results }, 200, req);
      } catch (err: unknown) {
        log.error("Error", { error: err instanceof Error ? err.message : String(err) });
        return internalErrorResponse(err, req);
      }
    };

    const __inicio = Date.now();
    const resposta = await responder();
    await registrarAcaoCalculada({
      functionName: "ai-churn-analysis",
      userId: user.id,
      req,
      resposta,
      inicio: __inicio,
    });
    return resposta;
  } catch (err: unknown) {
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return internalErrorResponse(err, req);
  }
});
