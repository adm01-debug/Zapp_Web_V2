import {
  handleCors, errorResponse, jsonResponse,
  sanitizeString, isValidUUID, checkRateLimit, getClientIP, requireEnv, Logger, requireAuth,
} from "../_shared/validation.ts";
import { AiEnhanceMessageSchema, parseBody } from "../_shared/schemas.ts";
import { callAiWithTracking, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";

const tonePrompts: Record<string, string> = {
  professional: "Reescreva a mensagem abaixo de forma mais profissional, clara e educada. Mantenha o mesmo significado mas use linguagem corporativa e polida.",
  casual: "Reescreva a mensagem abaixo de forma mais casual, amigável e descontraída. Mantenha o mesmo significado mas use linguagem informal e acolhedora.",
  persuasive: "Reescreva a mensagem abaixo de forma mais persuasiva e convincente. Mantenha o mesmo significado mas torne-a mais impactante e motivadora.",
  empathetic: "Reescreva a mensagem abaixo de forma mais empática e acolhedora. Mantenha o mesmo significado mas demonstre compreensão e cuidado com o cliente.",
  concise: "Reescreva a mensagem abaixo de forma mais concisa e direta. Remova redundâncias e mantenha apenas o essencial, sem perder o significado.",
  detailed: "Reescreva a mensagem abaixo de forma mais detalhada e explicativa. Expanda as ideias para que fique mais completa e informativa.",
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-enhance-message", userId: __uid, req });
  if (__guard) return __guard;


  const log = new Logger("ai-enhance-message");
  const userId = extractUserIdFromRequest(req);

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`enhance:${ip}`, 20, 60_000);
    if (!allowed) return errorResponse("Limite de requisições excedido. Tente novamente em 1 minuto.", 429, req);

    const parsed = parseBody(AiEnhanceMessageSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { message, tone, contactName } = parsed.data;
    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");
    const systemPrompt = tonePrompts[tone as string];

    const firstName = contactName ? contactName.split(' ')[0] : null;
    const humanizationRule = firstName && firstName !== 'Cliente'
      ? `\n- REGRA CRÍTICA DE HUMANIZAÇÃO: O nome do cliente é "${firstName}". A mensagem reescrita DEVE obrigatoriamente começar mencionando o nome "${firstName}" de forma natural e humana (ex: "${firstName}, entendi sua solicitação..." ou "${firstName}, vou verificar isso..."). O cliente JAMAIS deve perceber que a resposta foi gerada por IA. Isso é OBRIGATÓRIO.`
      : '';

    log.info("Enhancing message", { tone, len: message.length, hasContactName: !!firstName });

    const { response, data } = await callAiWithTracking({
      functionName: 'ai-enhance-message',
      userId,
      apiKey: LOVABLE_API_KEY,
      body: {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você trabalha em uma empresa distribuidora/comercial com múltiplos departamentos (Vendas, Compras, Logística, RH, Financeiro, SAC). Identifique o contexto da mensagem e adapte o tom adequadamente.

${systemPrompt}

Regras importantes:
- Retorne APENAS a mensagem reescrita, sem explicações, aspas ou prefixos.
- Não adicione saudações ou despedidas que não existiam na mensagem original.
- Mantenha o mesmo idioma da mensagem original.
- Mantenha emojis se houverem na mensagem original.
- A mensagem é para ser enviada via WhatsApp.${humanizationRule}`,
          },
          { role: "user", content: message },
        ],
      },
    });

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Limite de requisições excedido. Tente novamente em alguns segundos.", 429, req);
      if (response.status === 402) return errorResponse("Créditos de IA esgotados. Adicione créditos nas configurações.", 402, req);
      throw new Error("Erro ao processar com IA");
    }

    const enhancedMessage = (data.choices as Array<{message: {content: string}}>)?.[0]?.message?.content?.trim();
    if (!enhancedMessage) throw new Error("Resposta vazia da IA");

    log.done(200);
    return jsonResponse({ enhanced: enhancedMessage }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : "Erro desconhecido", 500, req);
  }
});
