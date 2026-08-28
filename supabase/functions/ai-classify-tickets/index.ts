import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { AiClassifyTicketsSchema, parseBody } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("ai-classify-tickets");

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`classify:${ip}`, 15, 60_000);
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
    const __guard = await enforceAiGuards({ functionName: "ai-classify-tickets", userId: user.id, req });
    if (__guard) return __guard;

    const parsed = parseBody(AiClassifyTicketsSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { limit } = parsed.data;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: tags } = await adminClient
      .from("ai_conversation_tags")
      .select("id, contact_id, tag_name, confidence, source")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);

    if (!tags || tags.length === 0) {
      return jsonResponse({ classified: 0, results: [], message: "Nenhuma tag para classificar" }, 200, req);
    }

    const CATEGORY_RULES: Record<string, string[]> = {
      "Suporte Técnico": ["suporte", "bug", "erro", "problema", "travou", "não funciona", "defeito"],
      "Vendas": ["preço", "compra", "venda", "orçamento", "proposta", "desconto", "produto"],
      "Financeiro": ["pagamento", "boleto", "fatura", "cobrança", "nota fiscal", "pix", "transferência"],
      "Reclamação": ["reclamação", "insatisfeito", "péssimo", "horrível", "demora", "atraso"],
      "Agendamento": ["agenda", "horário", "marcar", "agendar", "visita", "reunião"],
      "Informação": ["informação", "dúvida", "pergunta", "como", "onde", "quando"],
    };

    const PRIORITY_RULES: Record<string, string> = {
      "Reclamação": "urgent",
      "Suporte Técnico": "high",
      "Financeiro": "high",
      "Vendas": "medium",
      "Agendamento": "medium",
      "Informação": "low",
    };

    const results = [];

    for (const tag of tags) {
      const tagLower = tag.tag_name.toLowerCase();
      let category = "Informação";

      for (const [cat, keywords] of Object.entries(CATEGORY_RULES)) {
        if (keywords.some(kw => tagLower.includes(kw))) {
          category = cat;
          break;
        }
      }

      const priority = PRIORITY_RULES[category] || "low";
      const confidence = tag.confidence || 0.5;

      let finalPriority = priority;
      if (confidence < 0.3) finalPriority = "low";

      results.push({
        tagId: tag.id,
        contactId: tag.contact_id,
        tagName: tag.tag_name,
        category,
        priority: finalPriority,
        confidence,
      });
    }

    const summary: Record<string, number> = {};
    for (const r of results) {
      summary[r.category] = (summary[r.category] || 0) + 1;
    }

    log.done(200, { classified: results.length });
    return jsonResponse({ classified: results.length, results, summary }, 200, req);
  } catch (err: unknown) {
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse(err instanceof Error ? err.message : "Erro interno", 500, req);
  }
});
