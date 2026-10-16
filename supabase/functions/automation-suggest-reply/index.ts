import {
  handleCors,
  errorResponse,
  jsonResponse,
  isValidUUID,
  Logger,
  requireAuth,
  createAuthedClient,
} from "../_shared/validation.ts";
import { extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import {
  AI_BUDGET_ERROR_CODE,
  generateWithRouting,
  type GenerateParams,
  type GenerateResult,
} from "../_shared/ai-generate.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { parseJsonObject } from "../_shared/ai-json.ts";

/**
 * `automation-suggest-reply` — sugestões para a barra de automação do chat.
 *
 * Diferença para o `ai-suggest-reply` (copilot): aqui o servidor descobre o
 * contexto sozinho. O chamador manda SÓ o `contact_id`; a mensagem que dispara a
 * busca e os artigos da base são resolvidos no servidor:
 *   1. as últimas 10 mensagens entram pelo client do PRÓPRIO chamador (RLS de
 *      `messages`/`contacts` é a fonte de verdade da visibilidade — sem chave de
 *      serviço lendo conversa de contato que o usuário não enxerga);
 *   2. a última mensagem RECEBIDA do cliente vira a consulta da base de
 *      conhecimento (RPC `search_knowledge_base`, 3 artigos por relevância);
 *   3. o modelo devolve até 3 respostas curtas em pt-BR, cada uma apontando o
 *      id do artigo usado ou `null`. O TÍTULO da fonte é carimbado AQUI, a partir
 *      dos artigos que realmente foram oferecidos — id desconhecido vira
 *      `source: null`, nunca um título inventado pelo modelo.
 *
 * Saída: `{ "suggestions": [{ "text": string, "source": { "article_id", "title" } | null }] }`.
 *
 * Erros de orçamento/limite devolvem HTTP 429 com CÓDIGO ESTÁVEL
 * (`ai_budget_exceeded` para orçamento/provedor sem crédito, `rate_limited` para
 * o guarda de ritmo/cota e para o 429 do provedor) — o front distingue os dois.
 *
 * Sem PII em log: registra só contagens e booleanos, jamais conteúdo de mensagem.
 */

/** Seam de teste (mesmo padrão de `ai-suggest-reply`/`ai-auto-tag`): o handler
 *  exportado recebe os pontos que a prova offline substitui. Em produção nada é
 *  injetado e as implementações reais valem — o teste chama o handler REAL. */
export interface AutomationSuggestReplyDeps {
  /** Resolve a identidade do chamador (default: `requireAuth`). */
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  /** Guarda de uso/cota de IA (default: `enforceAiGuards`). */
  enforceGuards?: (
    opts: { functionName: string; userId: string; req: Request },
  ) => Promise<Response | null>;
  /** Roteador de IA (default: `generateWithRouting`). */
  generate?: (params: GenerateParams) => Promise<GenerateResult>;
  /** Client Supabase com o JWT do chamador (default: `createAuthedClient`). */
  authedClient?: (req: Request) => Promise<AuthedClientLike>;
}

/** Linha crua de `messages` (só as colunas pedidas no select). */
interface MensagemRow {
  content?: unknown;
  sender?: unknown;
  created_at?: unknown;
}

/** Artigo devolvido pela RPC `search_knowledge_base`. */
interface ArtigoRow {
  id: unknown;
  title: unknown;
  content?: unknown;
}

/** Builder mínimo do PostgREST que o handler usa (`limit` é o ponto de espera). */
interface SelectBuilder {
  eq(column: string, value: unknown): SelectBuilder;
  order(column: string, opts: { ascending: boolean }): SelectBuilder;
  limit(
    count: number,
  ): PromiseLike<{ data: MensagemRow[] | null; error: { message?: string } | null }>;
}

/** Superfície do client autenticado que este handler consome. */
export interface AuthedClientLike {
  from(table: string): { select(columns: string): SelectBuilder };
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

/** Código estável para orçamento estourado (reserva de tokens / provedor sem crédito). */
const AI_BUDGET_EXCEEDED_CODE = "ai_budget_exceeded";
/** Código estável para limite de ritmo/cota e para o 429 do provedor. */
const AI_RATE_LIMITED_CODE = "rate_limited";

const MENSAGENS_LIMITE = 10;
const ARTIGOS_LIMITE = 3;
const ARTIGO_TRECHO_CHARS = 300;

const SYSTEM_PROMPT = `Você é o copilot de um atendente de uma empresa distribuidora/comercial. A partir da última mensagem recebida do cliente e dos artigos da base de conhecimento, sugira ATÉ 3 respostas curtas, prontas para enviar pelo WhatsApp, em português do Brasil.

Regras:
- Cada sugestão é a frase pronta para envio: sem explicações, sem aspas, sem prefixo do tipo "Resposta:".
- Use um artigo da base SOMENTE quando ele responder de fato à mensagem; nesse caso preencha "article_id" com o id EXATO do artigo usado.
- Quando nenhum artigo se aplicar, use "article_id": null. NUNCA invente id nem título.
- No máximo 3 sugestões; a primeira deve ser a resposta mais direta.

Responda APENAS com JSON, neste formato:
{"suggestions":[{"text":"texto da resposta","article_id":"<id do artigo ou null>"}]}`;

/** Corpo da chamada: só o `contact_id`. */
function parseInput(raw: unknown): { contact_id: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const id = (raw as { contact_id?: unknown }).contact_id;
  return typeof id === "string" && isValidUUID(id) ? { contact_id: id } : null;
}

/**
 * Valida a saída crua do modelo SEM coagir nada (mesma regra do
 * `_shared/ai-response-contracts.ts`): forma errada é rejeitada, não corrigida.
 * Array vazio, mais de 3 itens, item que não é objeto, texto vazio ou
 * `article_id` de tipo errado devolvem `null` — e nada é apresentado como se o
 * modelo o tivesse gerado.
 */
function parseSuggestions(
  raw: unknown,
): Array<{ text: string; article_id: string | null }> | null {
  if (!raw || typeof raw !== "object") return null;
  const lista = (raw as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > 3) return null;
  const out: Array<{ text: string; article_id: string | null }> = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") return null;
    const texto = (item as { text?: unknown }).text;
    const artigoId = (item as { article_id?: unknown }).article_id;
    if (typeof texto !== "string" || texto.trim().length === 0) return null;
    if (artigoId !== null && artigoId !== undefined && typeof artigoId !== "string") {
      return null;
    }
    out.push({ text: texto.trim(), article_id: typeof artigoId === "string" ? artigoId : null });
  }
  return out;
}

/** Identidade textual da linha; `null` quando não é mensagem recebida com texto. */
function textoRecebido(m: MensagemRow): string | null {
  if (m.sender !== "contact") return null;
  const conteudo = typeof m.content === "string" ? m.content.trim() : "";
  return conteudo.length > 0 ? conteudo : null;
}

/** 429 do guarda traduzido para o código estável, preservando o motivo quando legível. */
async function guardaNegada(req: Request, guarda: Response): Promise<Response> {
  if (guarda.status !== 429) return guarda;
  let detalhe = "Limite de uso da IA excedido.";
  try {
    const corpo = await guarda.clone().json();
    if (corpo && typeof corpo.error === "string" && corpo.error.length > 0) detalhe = corpo.error;
  } catch {
    // Corpo não-JSON: mantém a mensagem padrão. O código estável é o contrato.
  }
  return jsonResponse({ error: detalhe, code: AI_RATE_LIMITED_CODE }, 429, req);
}

export async function handleAutomationSuggestReply(
  req: Request,
  deps: AutomationSuggestReplyDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const uid = (authCheck as { userId: string }).userId;

  const guards = deps.enforceGuards ?? enforceAiGuards;
  const guarda = await guards({ functionName: "automation-suggest-reply", userId: uid, req });
  if (guarda) return await guardaNegada(req, guarda);

  const log = new Logger("automation-suggest-reply");
  const userId = extractUserIdFromRequest(req) ?? uid;

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return errorResponse("Corpo JSON inválido.", 400, req);
    }
    const entrada = parseInput(rawBody);
    if (!entrada) return errorResponse("contact_id ausente ou inválido.", 400, req);
    const contactId = entrada.contact_id;

    const getClient = deps.authedClient ??
      ((r: Request) => createAuthedClient(r) as unknown as Promise<AuthedClientLike>);
    const client = await getClient(req);

    // 1) Mensagens pelo client do CHAMADOR: a RLS decide o que existe. Um contato
    //    que o usuário não enxerga devolve zero linhas — e zero linhas vira
    //    sugestão vazia, nunca dado de outro contato.
    const mensagens = await client
      .from("messages")
      .select("content, sender, created_at")
      .eq("contact_id", contactId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(MENSAGENS_LIMITE);

    if (mensagens.error) {
      // Fail-closed interno: sem leitura confiável, não se inventa contexto.
      log.warn("Falha ao ler mensagens do contato", { erro: mensagens.error.message ? 1 : 0 });
      return jsonResponse({ suggestions: [] }, 200, req);
    }

    const recentes = (mensagens.data ?? []).filter(
      (m): m is MensagemRow => !!m && typeof m === "object",
    );
    const ultimaRecebida = recentes.map(textoRecebido).find((t): t is string => t !== null);
    if (!ultimaRecebida) {
      log.info("Sem mensagem recebida visível para o contato", { linhas: recentes.length });
      return jsonResponse({ suggestions: [] }, 200, req);
    }

    // 2) Base de conhecimento por relevância (FTS). Sem artigo aplicável, a
    //    sugestão sai sem fonte — o modelo não é obrigado a citar nada.
    let artigos: Array<{ id: string; title: string; content: string }> = [];
    const busca = await client.rpc("search_knowledge_base", {
      search_query: ultimaRecebida,
      max_results: ARTIGOS_LIMITE,
    });
    if (busca.error) {
      log.warn("Falha na busca da base de conhecimento", { erro: busca.error.message ? 1 : 0 });
    } else if (Array.isArray(busca.data)) {
      artigos = busca.data
        .filter((a): a is ArtigoRow => !!a && typeof a === "object")
        .map((a) => ({
          id: typeof a.id === "string" ? a.id : "",
          title: typeof a.title === "string" ? a.title : "",
          content: typeof a.content === "string" ? a.content : "",
        }))
        .filter((a) => a.id.length > 0 && a.title.length > 0);
    }

    const cronologico = recentes.slice().reverse();
    const historico = cronologico
      .map((m) => {
        const quem = m.sender === "agent" ? "atendente" : "cliente";
        const conteudo = typeof m.content === "string" ? m.content.slice(0, 500) : "";
        return `- ${quem}: ${conteudo}`;
      })
      .join("\n");

    const blocoArtigos = artigos.length > 0
      ? artigos
        .map((a) => `- id ${a.id} — ${a.title}: ${a.content.slice(0, ARTIGO_TRECHO_CHARS)}`)
        .join("\n")
      : "Nenhum artigo da base de conhecimento corresponde à mensagem.";

    const conteudoUsuario =
      `Últimas mensagens da conversa (mais antiga primeiro):\n${historico}\n\n` +
      `Última mensagem RECEBIDA do cliente:\n${ultimaRecebida}\n\n` +
      `Artigos da base de conhecimento (id — título: conteúdo):\n${blocoArtigos}`;

    log.info("Gerando sugestões da automação", {
      linhas: recentes.length,
      artigos: artigos.length,
    });

    const params: GenerateParams = {
      purpose: "copilot",
      functionName: "automation-suggest-reply",
      userId,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: conteudoUsuario }],
      temperature: 0.7,
    };

    const generate = deps.generate;
    const result = generate
      ? await generate(params)
      : await generateWithRouting(params);
    const { response, data } = result;

    if (!response.ok || !data) {
      if (result.errorCode === AI_BUDGET_ERROR_CODE || response.status === 402) {
        return jsonResponse(
          { error: "Orçamento de IA esgotado.", code: AI_BUDGET_EXCEEDED_CODE },
          429,
          req,
        );
      }
      if (response.status === 429) {
        return jsonResponse(
          { error: "Limite de requisições de IA excedido.", code: AI_RATE_LIMITED_CODE },
          429,
          req,
        );
      }
      return jsonResponse(
        { error: "Falha ao gerar sugestões.", code: "ai_provider_error" },
        502,
        req,
      );
    }

    const conteudo = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;

    const bruto = typeof conteudo === "string" ? parseJsonObject(conteudo) : null;
    const sugestoes = parseSuggestions(bruto);
    if (!sugestoes) {
      log.warn("Saída do modelo rejeitada pelo contrato");
      return jsonResponse(
        {
          error: "A resposta do modelo não atende ao contrato das sugestões; nada foi apresentado.",
          code: "ai_contract_rejected",
        },
        502,
        req,
      );
    }

    // 3) O título da fonte é carimbado AQUI, só a partir dos artigos oferecidos:
    //    id desconhecido (alucinado) vira `source: null` em vez de título inventado.
    const porId = new Map(artigos.map((a) => [a.id, a]));
    const saida = sugestoes.map((s) => {
      const artigo = s.article_id ? porId.get(s.article_id) : undefined;
      return {
        text: s.text,
        source: artigo ? { article_id: artigo.id, title: artigo.title } : null,
      };
    });

    log.done(200);
    return jsonResponse({ suggestions: saida }, 200, req);
  } catch (error: unknown) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    log.error("Erro não tratado", { erro: mensagem });
    return errorResponse("Erro ao gerar sugestões.", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAutomationSuggestReply(req));
}
