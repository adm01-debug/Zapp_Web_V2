import { handleCors, jsonResponse, Logger } from "../_shared/validation.ts";
import { ClassifyStickerSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { requireAiIdentityOrService } from "../_shared/ai-auth.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { logAiUsage } from "../_shared/ai-usage.ts";
import { AiImageInputError, toInlineImage, type InlineImage } from "../_shared/ai-image-input.ts";

const STICKER_CATEGORIES = [
  'comemoração', 'riso', 'chorando', 'amor', 'raiva',
  'surpresa', 'pensativo', 'cumprimento', 'despedida', 'concordância',
  'negação', 'sono', 'fome', 'medo', 'vergonha',
  'deboche', 'fofo', 'triste', 'animado', 'engraçado', 'outros'
];

const FUNCTION_NAME = "classify-sticker";

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
 * Baixa a imagem no servidor com a service role e a devolve EMBUTIDA como data
 * URL (o bucket é privado; o modelo não alcança a URL). Em QUALQUER falha do
 * helper (storage indisponível, HTTP não-ok, objeto grande demais, tipo
 * não-imagem) registra o motivo em `ai_usage_logs` com status de erro e devolve
 * `null` — o chamador degrada para `outros` sem propagar exceção.
 */
async function embutirImagem(imageUrl: string, userId: string | null): Promise<InlineImage | null> {
  try {
    return await toInlineImage(imageUrl);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    await logAiUsage({
      functionName: FUNCTION_NAME,
      userId,
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
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // IA-011: identidade de usuário verificada + cota antes de gastar provedor.
  // Aceita também o caminho de serviço: o webhook do WhatsApp classifica
  // figurinhas recebidas chamando esta função com a service role key
  // (`_shared/evolution-webhook-messages.ts`), que `requireAiIdentity` recusaria.
  const identity = await requireAiIdentityOrService(req, "classify-sticker");
  if (identity instanceof Response) return identity;

  const log = new Logger(FUNCTION_NAME);

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
        status: 'error',
        errorMessage: 'image_url ausente: nenhuma imagem para classificar.',
        // IA-052 — modalidade declarada mesmo sem provedor: a etapa é de visão.
        purpose: 'tagging',
        modality: 'vision',
        metadata: { reason: 'missing_image_url' },
      });
      log.warn("Empty input, defaulting to outros");
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    const prompt = `Analise esta figurinha/sticker e classifique em EXATAMENTE UMA das categorias abaixo. Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${STICKER_CATEGORIES.join(', ')}`;

    // Imagem EMBUTIDA (data URL): o provedor de visão não busca nada pela rede.
    const imagem = await embutirImagem(image_url, identity.userId);
    if (!imagem) {
      log.error("Falha ao preparar a imagem; degradando para 'outros' com motivo registrado");
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    // Despacho central (Bloco 04 / PR-4 — IA-033): sem URL fixa do gateway, sem
    // modelo fixo e sem chave fixa no consumidor. A modalidade 'vision' é a
    // exigência declarada; o provedor de visão e o modelo são decididos no servidor.
    const gen = await generateWithRouting({
      purpose: 'tagging',
      functionName: FUNCTION_NAME,
      userId: identity.userId,
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
    // (200), nunca 500. O despacho central JÁ registra TODO desfecho de erro
    // (HTTP não-ok, timeout, exceção, roteamento) em ai_usage_logs — nada degrada
    // para 'outros' sem registro.
    if (!gen.ok || !gen.data) {
      log.error(`API error ${gen.response.status}`, { detail: gen.errorCode ?? 'unknown' });
      return jsonResponse({ category: 'outros' }, 200, req);
    }

    const content = (gen.data.choices as Array<{ message: { content: string } }>)?.[0]?.message?.content;
    const rawCategory = (content || 'outros')
      .trim().toLowerCase().replace(/[^a-záàãâéêíóôõúç ]/g, '').trim();

    const category = STICKER_CATEGORIES.includes(rawCategory) ? rawCategory : 'outros';

    // Tamanho e mime da imagem preparada ficam na trilha da função (o registro de
    // consumo é escrito pelo despacho central, que não aceita metadata extra).
    log.done(200, { category, imageMime: imagem.mime, imageBytes: imagem.bytes });
    return jsonResponse({ category }, 200, req);
  } catch (err: unknown) {
    // Exceção fora dos caminhos tratados (ex.: corpo inválido): também registrada,
    // para que NENHUM 'outros' saia sem trilha em ai_usage_logs.
    const motivo = err instanceof Error ? err.message : String(err);
    await logAiUsage({
      functionName: FUNCTION_NAME,
      userId: identity.userId,
      status: 'error',
      errorMessage: motivo,
      // IA-052 — exceção fora dos caminhos tratados também declara a rota.
      purpose: 'tagging',
      modality: 'vision',
      metadata: { reason: 'unhandled_exception' },
    });
    log.error("Error", { error: motivo });
    return jsonResponse({ category: 'outros' }, 200, req);
  }
});
