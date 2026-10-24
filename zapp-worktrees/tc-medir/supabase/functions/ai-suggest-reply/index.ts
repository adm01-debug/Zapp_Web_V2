import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, checkRateLimit, getClientIP, requireEnv, Logger, requireAuth, createAuthedClient } from "../_shared/validation.ts";
import { AiSuggestReplySchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { generateWithRouting, type GenerateParams, type GenerateResult } from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { SuggestedRepliesEnvelope, buildAiEnvelope, parseModelOutput } from "../_shared/ai-response-contracts.ts";

/**
 * Seam de teste (mesmo padrão do `ai-auto-tag`): o handler exportado recebe os
 * poucos pontos que o teste offline precisa substituir. Em produção nada é
 * injetado e as implementações reais valem — por isso o teste chama o handler
 * REAL. Sem este seam, o defeito de contrato do `ai-suggest-reply` não teria
 * como ser provado sem provedor de IA e credencial de banco.
 */
export interface AiSuggestReplyDeps {
  /** Resolve a identidade do chamador (default: `requireAuth`). */
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  /** Guarda de uso/cota de IA (default: `enforceAiGuards`). */
  enforceGuards?: (
    opts: { functionName: string; userId: string; req: Request },
  ) => Promise<Response | null>;
  /** Roteador de IA (default: `generateWithRouting`). */
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
}

export async function handleAiSuggestReply(
  req: Request,
  deps: AiSuggestReplyDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const guards = deps.enforceGuards ?? enforceAiGuards;
  const __guard = await guards({ functionName: "ai-suggest-reply", userId: __uid, req });
  if (__guard) return __guard;


  const log = new Logger("ai-suggest-reply");
  const userId = extractUserIdFromRequest(req);

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`suggest:${ip}`, 15, 60_000);
    if (!allowed) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);

    const parsed = parseBody(AiSuggestReplySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, contactName, contactId, context } = parsed.data;
    // IA-048: identidade da requisição, ecoada no corpo (só eco — sem efeito novo).
    const requestId = parsed.data.requestId ?? null;

    // Fetch Knowledge Base articles for context
    let knowledgeContext = '';
    try {
      const supabaseUrl = requireEnv("SUPABASE_URL");
      const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: articles } = await supabase
        .from('knowledge_base_articles')
        .select('title, content, category')
        .eq('is_published', true)
        .limit(10);

      if (articles && articles.length > 0) {
        knowledgeContext = `\n\nBASE DE CONHECIMENTO DA EMPRESA (use como referência para suas respostas):\n${
          articles.map((a: { category: string | null; title: string; content: string }) =>
            `[${a.category || 'Geral'}] ${a.title}: ${a.content.substring(0, 500)}`
          ).join('\n---\n')
        }`;
      }

      // Este client roda com service_role (bypassa RLS). Sem esta checagem,
      // qualquer usuário autenticado poderia usar contactId de um contato que
      // não enxerga para ler notas/dados customizados (PII) — a RLS real de
      // `contacts` é a fonte de verdade de visibilidade.
      let visibleContactId: string | null = contactId ?? null;
      if (visibleContactId) {
        const authedClient = await createAuthedClient(req);
        const { data: visibleContact } = await authedClient
          .from('contacts')
          .select('id')
          .eq('id', visibleContactId)
          .maybeSingle();
        if (!visibleContact) {
          visibleContactId = null;
        }
      }

      if (visibleContactId) {
        const { data: notes } = await supabase
          .from('contact_notes')
          .select('content')
          .eq('contact_id', visibleContactId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (notes && notes.length > 0) {
          knowledgeContext += `\n\nNOTAS DO CONTATO:\n${notes.map((n: { content: string }) => n.content).join('\n')}`;
        }

        const { data: customFields } = await supabase
          .from('contact_custom_fields')
          .select('field_name, field_value')
          .eq('contact_id', visibleContactId);

        if (customFields && customFields.length > 0) {
          knowledgeContext += `\n\nDADOS DO CONTATO:\n${customFields.map((f: { field_name: string; field_value: string | null }) => `${f.field_name}: ${f.field_value}`).join('\n')}`;
        }
      }
    } catch (e) {
      log.warn("Error fetching knowledge base", { error: e instanceof Error ? e.message : String(e) });
    }

    log.info("Generating reply suggestions", { contactName, kbContext: knowledgeContext.length > 0 });

    const firstName = contactName ? contactName.split(' ')[0] : null;

    const systemPrompt = `Você é um Copilot de IA especializado em comunicação empresarial via WhatsApp de uma empresa distribuidora/comercial.

CONTEXTO DO NEGÓCIO — Nossos departamentos se comunicam com diferentes públicos:
• VENDAS: Vendedores ↔ clientes (empresas/lojistas) — pedidos, condições, follow-ups.
• COMPRAS: Compradores ↔ fornecedores — cotações, prazos, acompanhamento de produção.
• LOGÍSTICA: Logística ↔ transportadoras — fretes, rastreio, ocorrências.
• RH: RH ↔ colaboradores — questões trabalhistas, benefícios.
• FINANCEIRO: Cobranças, pagamentos, boletos.
• SAC: Reclamações, trocas, pós-venda.

Identifique o tipo de conversa e adapte o tom e conteúdo da sugestão ao contexto correto.

Contexto do contato: ${contactName}
${context ? `Informações adicionais: ${context}` : ''}
${knowledgeContext}

IMPORTANTE: Use as informações da Base de Conhecimento e dados do contato para personalizar suas sugestões.
Se houver artigos relevantes, cite informações específicas nas respostas.

${firstName && firstName !== 'Cliente' ? `REGRA CRÍTICA DE HUMANIZAÇÃO: O primeiro nome do contato é "${firstName}". TODA sugestão de resposta DEVE obrigatoriamente começar mencionando o nome "${firstName}" de forma natural e humana (ex: "${firstName}, entendi sua solicitação..." ou "${firstName}, compreendo sua situação..."). O contato JAMAIS deve perceber que a resposta foi gerada por IA. Isso é OBRIGATÓRIO em todas as 3 sugestões.` : ''}

Baseado na conversa, gere exatamente 3 sugestões de resposta:
1. Uma resposta direta e objetiva (use dados da KB se aplicável)
2. Uma resposta mais empática e detalhada  
3. Uma resposta com pergunta de follow-up

Responda APENAS em formato JSON com a seguinte estrutura:
{
  "suggestions": [
    {"type": "direct", "text": "resposta aqui", "emoji": "✓", "source": "kb_article_title ou null"},
    {"type": "empathetic", "text": "resposta aqui", "emoji": "💬", "source": null},
    {"type": "followup", "text": "resposta aqui", "emoji": "❓", "source": null}
  ]
}`;

    const conversationHistory = Array.isArray(messages)
      ? messages.slice(-20).map((m) => ({
          role: m.sender === 'agent' ? 'assistant' : 'user',
          content: String(m.content || ''),
        }))
      : [];

    // Despacho central (IA-032). O caminho PADRÃO chama `generateWithRouting`
    // literalmente junto do `requestId`: o contrato de origem do IA-051 lê este
    // bloco no fonte (o id do clique tem de chegar ao log de consumo). O seam
    // `deps.generate` existe só para o teste rodar o handler real offline e
    // recebe OS MESMOS parâmetros — não é um caminho diferente.
    const generateParams: GenerateParams = {
      purpose: 'copilot',
      functionName: 'ai-suggest-reply',
      userId,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: "Gere 3 sugestões de resposta contextualizadas para a última mensagem do cliente." }
      ],
      temperature: 0.7,
    };

    const generate = deps.generate;
    const { response, data } = generate
      ? await generate({ ...generateParams, requestId })
      : await generateWithRouting({ ...generateParams, requestId });

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);
      if (response.status === 402) return errorResponse("Payment required. Please add credits.", 402, req);
      throw new Error(`AI gateway error [${response.status}]`);
    }

    // `any` saiu daqui: o campo do provedor é lido por tipo explícito (o valor
    // continua tratado como `unknown` e só vira JSON depois do contrato).
    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;

    // Recorte do primeiro `{` ao último `}` — EXATAMENTE o regex de antes (a
    // migração para o helper canônico `_shared/ai-json.ts` é dívida pinada no
    // ratchet `_adv_edge_legacy_producers` e não faz parte deste cartão). O que
    // muda é o destino do recorte: ele passa a ser VALIDADO contra o contrato da
    // capacidade antes de sair daqui.
    let rawOutput: unknown = null;
    try {
      const jsonMatch = (content as string).match(/\{[\s\S]*\}/);
      if (jsonMatch) rawOutput = JSON.parse(jsonMatch[0]);
    } catch {
      rawOutput = null;
    }

    // Contrato de saída da capacidade (IA-025): o envelope `{ suggestions: [...] }`
    // e CADA sugestão são conferidos aqui (array, exatamente 3 itens, texto não
    // vazio). Antes, JSON sintaticamente válido com forma errada seguia direto
    // para a interface (o cliente só conferia `data.suggestions` truthy) e o
    // parse que falhava devolvia três frases FABRICADAS como se fossem do modelo,
    // com HTTP 200 — nenhum dos dois casos sinalizava degradação. Agora nada de
    // forma errada entra no render normal: a resposta é erro explícito, com o
    // motivo do contrato na evidência.
    const validated = parseModelOutput(SuggestedRepliesEnvelope, rawOutput);
    if (!validated.ok) {
      log.warn("Model output rejected by contract", {
        errors: validated.errors.map((issue) => `${issue.path}: ${issue.message}`).slice(0, 8),
      });
      return jsonResponse(buildAiEnvelope({
        capability: 'ai-suggest-reply',
        status: 'error',
        error: 'A resposta do modelo não atende ao contrato das sugestões; nenhuma sugestão foi apresentada.',
        evidence: { errors: validated.errors },
      }), 502, req);
    }

    const suggestions = validated.data.suggestions;

    // IA-048: ecoa o identificador da requisição no corpo para o cliente descartar
    // com segurança uma resposta que já não pertence ao contexto atual. Não há
    // revalidação aqui: esta capacidade não tem efeito de servidor a proteger.
    const body: { suggestions: typeof suggestions; requestId?: string } = { suggestions };
    if (requestId) body.requestId = requestId;

    log.done(200);
    return jsonResponse(body, 200, req);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: errorMessage });
    return errorResponse(errorMessage, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAiSuggestReply(req));
}
