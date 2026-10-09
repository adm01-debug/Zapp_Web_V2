import { handleCors, jsonResponse, Logger } from "../_shared/validation.ts";
import { ClassifyStickerSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { requireAiIdentityOrService, type AiIdentity } from "../_shared/ai-auth.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { extractAiRequestId, logAiUsage } from "../_shared/ai-usage.ts";
import { AiImageInputError, toInlineImage, type InlineImage, type StorageIdentity } from "../_shared/ai-image-input.ts";

const STICKER_CATEGORIES = [
  'comemoração', 'riso', 'chorando', 'amor', 'raiva',
  'surpresa', 'pensativo', 'cumprimento', 'despedida', 'concordância',
  'negação', 'sono', 'fome', 'medo', 'vergonha',
  'deboche', 'fofo', 'triste', 'animado', 'engraçado', 'outros'
];

const FUNCTION_NAME = "classify-sticker";

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
 * Traduz a identidade autenticada da função para a identidade de download do
 * Storage — dois ramos FECHADOS, sem credencial implícita nem emprestada:
 *   - usuário: `{ kind: 'user', bearerToken }` — anon key + JWT do chamador; a
 *     policy de `storage.objects` decide o que ele pode ler (biblioteca
 *     compartilhada só passa quando a policy do objeto permite);
 *   - serviço (webhook interno do WhatsApp): `{ kind: 'service' }` — service
 *     role explícita, declarada assim de propósito. Nada aqui "promove" um
 *     usuário a serviço nem carrega o bearer dele para o outro ramo.
 */
export function storageIdentityPara(identity: AiIdentity, bearerToken: string): StorageIdentity {
  return identity.kind === 'user'
    ? { kind: 'user', bearerToken }
    : { kind: 'service' };
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
 * Baixa a imagem no servidor sob a identidade do CHAMADOR — usuário: anon key +
 * JWT do pedido (a policy de `storage.objects` decide); serviço (webhook do
 * WhatsApp): service role explícita — e a devolve EMBUTIDA como data URL (o
 * bucket é privado; o modelo não alcança a URL). Em QUALQUER falha do helper
 * (storage indisponível, HTTP não-ok, objeto grande demais, tipo não-imagem)
 * registra o motivo em `ai_usage_logs` com status de erro e devolve a recusa
 * TIPADA — o chamador degrada para `outros` com o estado `input_error` e o
 * código, sem propagar exceção.
 */
async function embutirImagem(
  imageUrl: string,
  identity: AiIdentity,
  bearerToken: string,
  requestId: string | null,
): Promise<ResultadoDaImagem> {
  try {
    return {
      ok: true,
      imagem: await toInlineImage(imageUrl, {
        storageIdentity: storageIdentityPara(identity, bearerToken),
      }),
    };
  } catch (err) {
    // O `message` do AiImageInputError carrega `<bucket>/<path>` — locator de
    // objeto privado que NÃO pode ir para o log. Registra-se o código tipado
    // (estável) + os detalhes medidos de `detalhesDoErroDeImagem` (que já
    // excluem bucket/path); bearer token nunca entra na mensagem do helper.
    const motivo = err instanceof AiImageInputError
      ? `imagem recusada na preparacao: ${err.code}`
      : err instanceof Error ? err.message : String(err);
    await logAiUsage({
      functionName: FUNCTION_NAME,
      userId: identity.userId,
      requestId,
      status: 'error',
      errorMessage: motivo,
      // IA-052 — a etapa é de VISÃO: modalidade declarada mesmo na degradação,
      // quando não houve provedor nenhum (nulo aqui é informação, não lacuna).
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

/**
 * Handler real exportado para teste (`index.test.ts`). O `Deno.serve` continua
 * no nível do módulo — o contrato vitest de visão captura o handler stubando
 * `Deno.serve` na importação, então a chamada não pode ficar atrás de
 * `import.meta.main` aqui.
 */
export async function handleClassifyStickerRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  // IA-011: identidade de usuário verificada + cota antes de gastar provedor.
  // Aceita também o caminho de serviço: o webhook do WhatsApp classifica
  // figurinhas recebidas chamando esta função com a service role key
  // (`_shared/evolution-webhook-messages.ts`), que `requireAiIdentity` recusaria.
  const identity = await requireAiIdentityOrService(req, "classify-sticker");
  if (identity instanceof Response) return identity;

  const log = new Logger(FUNCTION_NAME);
  const requestId = extractAiRequestId(req);

  try {
    const parsed = parseBody(ClassifyStickerSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { image_url } = parsed.data;

    // Degradação REGISTRADA: sem imagem não existe visão. Antes este caminho
    // devolvia 'outros' em silêncio; agora deixa linha de erro em ai_usage_logs.
    if (!image_url) {
      await logAiUsage({
        functionName: FUNCTION_NAME,
        userId: identity.userId,
        requestId,
        status: 'error',
        errorMessage: 'image_url ausente: nenhuma imagem para classificar.',
        // IA-052 — modalidade declarada mesmo sem provedor: a etapa é de visão.
        purpose: 'tagging',
        modality: 'vision',
        metadata: { reason: 'missing_image_url' },
      });
      log.warn("Empty input, defaulting to outros");
      return jsonResponse({ category: 'outros', state: 'unknown', error_code: 'MISSING_INPUT' }, 200, req);
    }

    const prompt = `Analise esta figurinha/sticker e classifique em EXATAMENTE UMA das categorias abaixo. Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${STICKER_CATEGORIES.join(', ')}`;

    // Imagem EMBUTIDA (data URL): o provedor de visão não busca nada pela rede.
    const preparo = await embutirImagem(image_url, identity, bearerTokenDoPedido(req), requestId);
    if (!preparo.ok) {
      log.error("Falha ao preparar a imagem; degradando para 'outros' com motivo registrado");
      return jsonResponse({ category: 'outros', state: 'input_error', error_code: preparo.errorCode }, 200, req);
    }
    const imagem = preparo.imagem;

    // Despacho central (Bloco 04 / PR-4 — IA-033): sem URL fixa do gateway, sem
    // modelo fixo e sem chave fixa no consumidor. A modalidade 'vision' é a
    // exigência declarada; o provedor de visão e o modelo são decididos no servidor.
    const gen = await generateWithRouting({
      purpose: 'tagging',
      functionName: FUNCTION_NAME,
      userId: identity.userId,
      requestId,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imagem.dataUrl } },
          { type: 'text', text: prompt },
        ],
      }],
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
    const categoriaValida = STICKER_CATEGORIES.includes(rawCategory);
    if (!categoriaValida) {
      log.warn(`Provedor respondeu categoria fora da lista: '${rawCategory}'`);
      return jsonResponse({ category: 'outros', state: 'low_confidence', error_code: 'INVALID_CATEGORY' }, 200, req);
    }
    const category = rawCategory;

    // Tamanho e mime da imagem preparada ficam na trilha da função (o registro de
    // consumo é escrito pelo despacho central, que não aceita metadata extra).
    log.done(200, { category, state: 'ok', imageMime: imagem.mime, imageBytes: imagem.bytes });
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

Deno.serve(handleClassifyStickerRequest);
