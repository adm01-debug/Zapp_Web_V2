import { handleCors, jsonResponse, Logger } from "../_shared/validation.ts";
import { ClassifyEmojiSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { requireAiIdentity } from "../_shared/ai-auth.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { extractAiRequestId, logAiUsage } from "../_shared/ai-usage.ts";
import { AiImageInputError, toInlineImage, type InlineImage } from "../_shared/ai-image-input.ts";

const EMOJI_CATEGORIES = [
  'sorriso', 'riso', 'amor', 'triste', 'raiva',
  'surpresa', 'medo', 'nojo', 'pensativo', 'legal',
  'festa', 'comida', 'animal', 'natureza', 'esporte',
  'trabalho', 'música', 'tech', 'viagem', 'meme',
  'deboche', 'fofo', 'fantasía', 'bandeira', 'outros'
];

const FUNCTION_NAME = "classify-emoji";

/**
 * IA-132 — CONTRATO DA RESPOSTA: todo corpo sai com `category` E, ao lado dela, o
 * ESTADO da classificação (`state`) + o motivo técnico (`error_code`) quando
 * existe. Antes, TODOS os caminhos de degradação respondiam só
 * `{ category: 'outros' }` e o consumidor não tinha como distinguir "o modelo
 * respondeu outros" (conclusão válida) de "não houve classificação". Estados:
 *   - 'ok':               categoria válida do provedor (inclusive 'outros');
 *   - 'unknown':          não havia entrada para classificar;
 *   - 'input_error':      a entrada não pôde ser preparada (imagem recusada);
 *   - 'low_confidence':   o provedor respondeu sem categoria da lista ou sem
 *                         conteúdo algum (EMPTY_RESPONSE);
 *   - 'provider_error':   falha técnica do provedor/roteamento (HTTP, timeout,
 *                         orçamento, circuito, nenhum candidato à modalidade);
 *   - 'unexpected_error': exceção fora dos caminhos tratados.
 */

/**
 * Detalhes do erro TIPADO do helper de imagem (código, tamanho medido, limite,
 * tipo declarado) para a trilha em `ai_usage_logs`. Não expõe a URL: o objeto
 * do Storage é privado e a mensagem do erro já omite token.
 */
function detalhesDoErroDeImagem(err: unknown): Record<string, unknown> {
  if (!(err instanceof AiImageInputError)) return {};
  return {
    image_error_code: err.code,
    ...(err.bytes !== null ? { image_bytes: err.bytes } : {}),
    ...(err.limitBytes !== null ? { image_limit_bytes: err.limitBytes } : {}),
    ...(err.contentType !== null ? { image_content_type: err.contentType } : {}),
  };
}

/**
 * JWT do chamador, extraído do header `Authorization` (`Bearer <jwt>`,
 * case-insensitive). Duplicada de `ai-auth.ts` de propósito: lá a extração não
 * é exportada, e aqui o token cru é o que autoriza o download do objeto privado
 * sob a identidade do usuário (a policy de `storage.objects` decide).
 */
function bearerTokenDoPedido(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

/**
 * Resultado da preparação da imagem: sucesso com a imagem embutida, ou a
 * recusa com o código TIPADO (IA-132 — o motivo técnico agora também viaja na
 * resposta, não só para `ai_usage_logs`).
 */
type ResultadoDaImagem =
  | { ok: true; imagem: InlineImage }
  | { ok: false; errorCode: string };

/**
 * Baixa a imagem no servidor sob a identidade do USUÁRIO que chamou a função
 * (anon key + JWT do pedido — nunca service role) e a devolve EMBUTIDA como
 * data URL (o bucket é privado; o modelo não alcança a URL). Em QUALQUER falha
 * do helper (storage indisponível, HTTP não-ok, objeto grande demais, tipo
 * não-imagem) registra o motivo em `ai_usage_logs` com status de erro e devolve
 * a recusa TIPADA — o chamador degrada para `outros` com o estado `input_error`
 * e o código, sem propagar exceção.
 */
async function embutirImagem(
  imageUrl: string,
  userId: string | null,
  bearerToken: string,
  requestId: string | null,
): Promise<ResultadoDaImagem> {
  try {
    return {
      ok: true,
      imagem: await toInlineImage(imageUrl, {
        storageIdentity: { kind: 'user', bearerToken },
      }),
    };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    await logAiUsage({
      functionName: FUNCTION_NAME,
      userId,
      requestId,
      status: 'error',
      errorMessage: motivo,
      // IA-052 — degradação registrada como rota: finalidade e modalidade são
      // conhecidas mesmo sem provedor (a chamada de visão nem chegou a sair).
      purpose: 'tagging',
      modality: 'vision',
      metadata: {
        reason: 'image_input_failed',
        ...detalhesDoErroDeImagem(err),
      },
    });
    return {
      ok: false,
      errorCode: err instanceof AiImageInputError ? err.code : 'IMAGE_INPUT_FAILED',
    };
  }
}

export async function handleClassifyEmoji(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  // IA-011: identidade de usuário verificada + cota antes de gastar provedor.
  // Sem isto, o endpoint aceitava qualquer portador da anon key pública.
  const identity = await requireAiIdentity(req, "classify-emoji");
  if (identity instanceof Response) return identity;

  const log = new Logger(FUNCTION_NAME);
  // IA-051 — id do run enviado pelo cliente (`x-ai-request-id`): uuid ou null,
  // nunca inventado (o registrador descarta o que não for uuid).
  const requestId = extractAiRequestId(req);

  try {
    const parsed = parseBody(ClassifyEmojiSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { image_url, file_name } = parsed.data;

    // Degradação REGISTRADA: sem imagem e sem nome não há classificação. Antes
    // este caminho devolvia 'outros' em silêncio; agora deixa linha de erro.
    if (!image_url && !file_name) {
      await logAiUsage({
        functionName: FUNCTION_NAME,
        userId: identity.userId,
        requestId,
        status: 'error',
        errorMessage: 'image_url e file_name ausentes: nenhuma entrada para classificar.',
        // IA-052 — modalidade declarada mesmo sem provedor: a etapa é de visão.
        purpose: 'tagging',
        modality: 'vision',
        metadata: { reason: 'missing_image_url' },
      });
      log.warn("Empty input, defaulting to outros");
      return jsonResponse({ category: 'outros', state: 'unknown', error_code: 'MISSING_INPUT' }, 200, req);
    }

    const prompt = `Você é um classificador de emojis/emoticons customizados para uma plataforma de atendimento via WhatsApp.
Analise a imagem e o nome do arquivo "${file_name || 'emoji'}" para classificar em EXATAMENTE UMA das categorias abaixo.
Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${EMOJI_CATEGORIES.join(', ')}`;

    // Imagem EMBUTIDA (data URL): o provedor de visão não busca nada pela rede.
    // Sem image_url (só file_name) segue sem a parte de imagem, como hoje.
    let imagem: InlineImage | null = null;
    if (image_url) {
      const preparo = await embutirImagem(image_url, identity.userId, bearerTokenDoPedido(req), requestId);
      if (!preparo.ok) {
        log.error("Falha ao preparar a imagem; degradando para 'outros' com motivo registrado");
        return jsonResponse({ category: 'outros', state: 'input_error', error_code: preparo.errorCode }, 200, req);
      }
      imagem = preparo.imagem;
    }

    type ContentPart = { type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string };
    const contentParts: ContentPart[] = [];

    if (imagem) {
      contentParts.push({ type: 'image_url', image_url: { url: imagem.dataUrl } });
    }
    contentParts.push({ type: 'text', text: prompt });

    // Despacho central (Bloco 04 / PR-4 — IA-033): sem URL fixa do gateway, sem
    // modelo fixo e sem chave fixa no consumidor. A modalidade 'vision' é a
    // exigência declarada; o provedor de visão e o modelo são decididos no servidor.
    const gen = await generateWithRouting({
      purpose: 'tagging',
      functionName: FUNCTION_NAME,
      userId: identity.userId,
      requestId,
      messages: [{ role: 'user', content: contentParts }],
      need: { modality: 'vision' },
      extraBody: { max_tokens: 20 },
      temperature: 0.1,
      timeoutMs: 15000,
    });

    // Degradação preservada: falha de roteamento/provedor/HTTP vira 'outros'
    // (200), nunca 500 — agora com estado `provider_error` e o motivo técnico.
    // O despacho central JÁ registra TODO desfecho de erro (HTTP não-ok,
    // timeout, exceção, roteamento) em ai_usage_logs — nada degrada para
    // 'outros' sem registro.
    if (!gen.ok || !gen.data) {
      log.error(`API error ${gen.response.status}`, { detail: gen.errorCode ?? 'unknown' });
      return jsonResponse({ category: 'outros', state: 'provider_error', error_code: gen.errorCode ?? 'PROVIDER_ERROR' }, 200, req);
    }

    // IA-132: resposta SEM conteúdo (choices ausente/vazio, item sem
    // `message.content`, ou content vazio/só espaços) NÃO é o modelo escolhendo
    // 'outros' — é resposta VAZIA. Antes, `(content || 'outros')` transformava
    // isso em `{ category: 'outros', state: 'ok' }`, uma conclusão FALSA.
    const content = (gen.data.choices as Array<{ message: { content: string } }>)?.[0]?.message?.content;
    const conteudoBruto = typeof content === 'string' ? content.trim() : '';
    if (!conteudoBruto) {
      log.warn('Provedor respondeu sem conteúdo: resposta vazia (EMPTY_RESPONSE)');
      return jsonResponse({ category: 'outros', state: 'low_confidence', error_code: 'EMPTY_RESPONSE' }, 200, req);
    }

    const rawCategory = conteudoBruto
      .toLowerCase().replace(/[^a-záàãâéêíóôõúç ]/g, '').trim();

    // IA-132: categoria fora da lista NÃO é o mesmo 'outros' de quando o modelo
    // escolhe 'outros' — é resposta sem categoria utilizável (`low_confidence`).
    const categoriaValida = EMOJI_CATEGORIES.includes(rawCategory);
    if (!categoriaValida) {
      log.warn(`Provedor respondeu categoria fora da lista: '${rawCategory}'`);
      return jsonResponse({ category: 'outros', state: 'low_confidence', error_code: 'INVALID_CATEGORY' }, 200, req);
    }
    const category = rawCategory;

    // Tamanho e mime da imagem preparada ficam na trilha da função (o registro de
    // consumo é escrito pelo despacho central, que não aceita metadata extra).
    log.done(200, { category, state: 'ok', imageMime: imagem?.mime, imageBytes: imagem?.bytes });
    return jsonResponse({ category, state: 'ok' }, 200, req);
  } catch (err: unknown) {
    // Exceção fora dos caminhos tratados (ex.: corpo inválido): também registrada,
    // para que NENHUM 'outros' saia sem trilha em ai_usage_logs.
    const motivo = err instanceof Error ? err.message : String(err);
    await logAiUsage({
      functionName: FUNCTION_NAME,
      userId: identity.userId,
      requestId,
      status: 'error',
      errorMessage: motivo,
      // IA-052 — exceção fora dos caminhos tratados também declara a rota.
      purpose: 'tagging',
      modality: 'vision',
      metadata: { reason: 'unhandled_exception' },
    });
    log.error("Error", { error: motivo });
    return jsonResponse({ category: 'outros', state: 'unexpected_error', error_code: 'UNEXPECTED' }, 200, req);
  }
}

// Handler exportado para o teste Deno (`index.test.ts`), mas o `Deno.serve`
// fica no nível do módulo, como no classify-sticker: os contratos vitest
// capturam o handler stubando `Deno.serve` na importação, então ele não pode
// ficar atrás de `import.meta.main`.
Deno.serve(handleClassifyEmoji);
