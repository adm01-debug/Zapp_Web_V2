import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { AiChurnAnalysisSchema, parseBody } from "../_shared/schemas.ts";

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

    const parsed = parseBody(AiChurnAnalysisSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { contactIds } = parsed.data;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: contacts } = await adminClient
      .from("contacts")
      .select("id, name, phone, created_at, updated_at")
      .in("id", contactIds);

    if (!contacts || contacts.length === 0) {
      return jsonResponse({ results: [], message: "Nenhum contato encontrado" }, 200, req);
    }

    log.info("Analyzing churn risk", { contactCount: contacts.length });

    const results = [];

    for (const contact of contacts) {
      const { data: lastMsg } = await adminClient
        .from("messages")
        .select("created_at")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: recentMsgCount } = await adminClient
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .gte("created_at", thirtyDaysAgo);

      const { count: totalMsgCount } = await adminClient
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact.id);

      const lastMessageAt = lastMsg?.created_at || contact.updated_at;
      const daysSinceLastMessage = Math.floor(
        (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      let riskScore = 0;

      if (daysSinceLastMessage > 90) riskScore += 40;
      else if (daysSinceLastMessage > 60) riskScore += 30;
      else if (daysSinceLastMessage > 30) riskScore += 20;
      else if (daysSinceLastMessage > 14) riskScore += 10;

      const avgMonthly = (totalMsgCount || 0) > 0
        ? ((totalMsgCount || 0) / Math.max(1, Math.floor((Date.now() - new Date(contact.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000))))
        : 0;

      if (avgMonthly > 0 && (recentMsgCount || 0) < avgMonthly * 0.3) riskScore += 30;
      else if (avgMonthly > 0 && (recentMsgCount || 0) < avgMonthly * 0.5) riskScore += 20;
      else if (avgMonthly > 0 && (recentMsgCount || 0) < avgMonthly * 0.7) riskScore += 10;

      if ((totalMsgCount || 0) <= 1) riskScore += 30;
      else if ((totalMsgCount || 0) <= 5) riskScore += 20;
      else if ((totalMsgCount || 0) <= 10) riskScore += 10;

      let riskLevel = "low";
      if (riskScore >= 80) riskLevel = "critical";
      else if (riskScore >= 60) riskLevel = "high";
      else if (riskScore >= 40) riskLevel = "medium";

      const reasons: string[] = [];
      if (daysSinceLastMessage > 30) reasons.push(`${daysSinceLastMessage} dias sem interação`);
      if ((recentMsgCount || 0) === 0) reasons.push("Sem mensagens nos últimos 30 dias");
      if ((totalMsgCount || 0) <= 5) reasons.push("Baixo engajamento total");

      results.push({
        contactId: contact.id,
        name: contact.name,
        riskScore: Math.min(100, riskScore),
        riskLevel,
        daysSinceLastMessage,
        recentMessageCount: recentMsgCount || 0,
        totalMessageCount: totalMsgCount || 0,
        reasons,
      });
    }

    results.sort((a, b) => b.riskScore - a.riskScore);

    log.done(200, { analyzed: results.length });
    return jsonResponse({ results }, 200, req);
  } catch (err: unknown) {
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse(err instanceof Error ? err.message : "Erro interno", 500, req);
  }
});
