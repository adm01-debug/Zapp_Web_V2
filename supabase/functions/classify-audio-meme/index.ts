import { handleCors, jsonResponse, Logger } from "../_shared/validation.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import { ClassifyAudioMemeSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { requireAiIdentity } from "../_shared/ai-auth.ts";
import { logAiUsage } from "../_shared/ai-usage.ts";
import {
  AiAudioInputError,
  toInlineAudio,
  type InlineAudio,
} from "../_shared/ai-audio-input.ts";

const AUDIO_CATEGORIES = [
  'risada', 'aplausos', 'suspense', 'vitória', 'falha',
  'surpresa', 'triste', 'raiva', 'romântico', 'medo',
  'deboche', 'narração', 'bordão', 'efeito sonoro', 'viral',
  'cumprimento', 'despedida', 'animação', 'drama', 'gospel', 'outros'
];

const FUNCTION_NAME = "classify-audio-meme";

/** Teto de tempo do provedor quando ele precisa OUVIR o áudio. */
const AUDIO_TIMEOUT_MS = 60_000;

/**
 * Regra de negócio compartilhada pelos dois modos (conteúdo e metadados).
 * Preservada do handler original: a classificação de "viral" não pode engolir
 * bordão/meme antigo.
 */
const REGRA_VIRAL = 'REGRA IMPORTANTE: A categoria "viral" deve ser usada SOMENTE para sons que são tendências ATUAIS de TikTok/Reels. Memes brasileiros conhecidos, bordões de TV, frases famosas de celebridades devem ser classificados como "bordão". Sons cômicos e engraçados devem ser "risada" ou "deboche".';

/**
 * Detalhes do erro TIPADO do helper de áudio para a trilha em `ai_usage_logs`.
 * Nunca expõe a URL: o objeto do Storage é privado e a mensagem do erro já a omite.
 */
function detalhesDoErroDeAudio(err: unknown): Record<string, unknown> {
  if (!(err instanceof AiAudioInputError)) return {};
  return {
    audio_error_code: err.code,
    ...(err.bytes !== null ? { audio_bytes: err.bytes } : {}),
    ...(err.limitBytes !== null ? { audio_limit_bytes: err.limitBytes } : {}),
    ...(err.contentType !== null ? { audio_content_type: err.contentType } : {}),
  };
}

/**
 * JWT do chamador, extraído do header `Authorization` (`Bearer <jwt>`,
 * case-insensitive). Duplicada de `ai-auth.ts` de propósito: lá a extração não é
 * exportada, e aqui o token cru é o que autoriza o download do objeto sob a
 * identidade do usuário (a policy de `storage.objects` decide).
 */
function bearerTokenDoPedido(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

/** Categoria válida a partir do que o provedor respondeu (senão `outros`). */
function normalizarCategoria(content: unknown): string {
  const rawCategory = (typeof content === 'string' && content !== '' ? content : 'outros')
    .trim().toLowerCase().replace(/[^a-záàãâéêíóôõúç ]/g, '').trim();
  return AUDIO_CATEGORIES.includes(rawCategory) ? rawCategory : 'outros';
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // IA-011: identidade de usuário verificada + cota antes de gastar provedor.
  const identity = await requireAiIdentity(req, FUNCTION_NAME);
  if (identity instanceof Response) return identity;

  const log = new Logger(FUNCTION_NAME);

  /**
   * Modo LIMITADO (IA-131): classifica só pelo nome do arquivo e DIZ isso ao
   * modelo — o resultado sai rotulado `basis: 'metadata'`, e não como se o som
   * tivesse sido ouvido. É o caminho de quando não há `audio_url`, ou de quando o
   * conteúdo sonoro não pôde ser preparado; nesse segundo caso a falha viaja em
   * `error_code` (falha técnica NÃO vira categoria).
   *
   * Definida DENTRO do handler de propósito: a autenticação acima é executada
   * antes de qualquer gasto de provedor (contrato IA-011 do
   * `ai-endpoints-auth.contract.test.ts`, que confere essa ordem no fonte).
   */
  const classificarPorMetadados = async (params: {
    file_name: string | null | undefined;
    errorCode: string | null;
  }): Promise<Response> => {
    const { file_name, errorCode } = params;
    const prompt = `Você é um classificador de áudios meme/sons engraçados para uma biblioteca de atendimento via WhatsApp.
Você NÃO recebeu o som deste arquivo: classifique APENAS pelo nome do arquivo "${file_name || 'audio'}".
Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${AUDIO_CATEGORIES.join(', ')}

${REGRA_VIRAL}`;

    const gen = await generateWithRouting({
      purpose: 'tagging',
      functionName: FUNCTION_NAME,
      userId: identity.userId,
      messages: [{ role: 'user', content: prompt }],
      extraBody: { max_tokens: 20 },
      temperature: 0.1,
      timeoutMs: 15000,
    });

    if (!gen.ok || !gen.data) {
      log.error(`API error ${gen.response.status}`, { detail: gen.errorCode ?? 'unknown' });
      return jsonResponse(
        { category: 'outros', basis: 'none', degraded: true, error_code: errorCode ?? 'PROVIDER_ERROR' },
        200,
        req,
      );
    }

    const result = gen.data as { choices?: Array<{ message?: { content?: string } }> };
    const category = normalizarCategoria(result.choices?.[0]?.message?.content);
    log.done(200, { category, basis: 'metadata', degraded: Boolean(errorCode) });
    return jsonResponse(
      {
        category,
        basis: 'metadata',
        ...(errorCode ? { degraded: true, error_code: errorCode } : { degraded: false }),
      },
      200,
      req,
    );
  };

  try {
    const parsed = parseBody(ClassifyAudioMemeSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { audio_url, file_name } = parsed.data;

    if (!audio_url && !file_name) {
      await logAiUsage({
        functionName: FUNCTION_NAME,
        userId: identity.userId,
        status: 'error',
        errorMessage: 'audio_url e file_name ausentes: nenhuma entrada para classificar.',
        purpose: 'tagging',
        modality: 'audio_stt',
        metadata: { reason: 'missing_input' },
      });
      log.warn("Empty input, defaulting to outros");
      return jsonResponse({ category: 'outros', basis: 'none' }, 200, req);
    }

    // Conteúdo sonoro: só quando há objeto autorizado no Storage. Em QUALQUER
    // falha do helper (URL fora do projeto/bucket, storage indisponível, HTTP
    // não-ok, objeto grande demais, tipo/formato recusado) o motivo fica
    // registrado e o classificador cai no modo por metadados ROTULADO — não
    // inventa categoria nem afirma ter ouvido.
    let audio: InlineAudio | null = null;
    let audioErrorCode: string | null = null;
    if (audio_url) {
      try {
        audio = await toInlineAudio(audio_url, {
          storageIdentity: { kind: 'user', bearerToken: bearerTokenDoPedido(req) },
        });
      } catch (err) {
        audioErrorCode = err instanceof AiAudioInputError ? err.code : 'AUDIO_DOWNLOAD_FAILED';
        const motivo = err instanceof Error ? err.message : String(err);
        await logAiUsage({
          functionName: FUNCTION_NAME,
          userId: identity.userId,
          status: 'error',
          errorMessage: motivo,
          purpose: 'tagging',
          modality: 'audio_stt',
          metadata: { reason: 'audio_input_failed', ...detalhesDoErroDeAudio(err) },
        });
        log.error("Falha ao preparar o audio; degradando para metadados com motivo registrado");
      }
    }

    if (audio) {
      const prompt = `Você é um classificador de áudios meme/sons engraçados para uma biblioteca de atendimento via WhatsApp.
Ouça o CONTEÚDO SONORO do áudio anexado (e, como apoio, considere o nome do arquivo "${file_name || 'audio'}") e classifique em EXATAMENTE UMA das categorias abaixo.
Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${AUDIO_CATEGORIES.join(', ')}

${REGRA_VIRAL}`;

      type ContentPart =
        | { type: 'input_audio'; input_audio: { data: string; format: string } }
        | { type: 'text'; text: string };
      const contentParts: ContentPart[] = [
        { type: 'input_audio', input_audio: { data: audio.data, format: audio.format } },
        { type: 'text', text: prompt },
      ];

      // Despacho central: a modalidade `audio_stt` é a exigência declarada (é a
      // que o ai-proxy reconhece para entrada de áudio); provedor e modelo são
      // decididos no servidor a partir dela.
      const gen = await generateWithRouting({
        purpose: 'tagging',
        functionName: FUNCTION_NAME,
        userId: identity.userId,
        messages: [{ role: 'user', content: contentParts }],
        need: { modality: 'audio_stt' },
        extraBody: { max_tokens: 20 },
        temperature: 0.1,
        timeoutMs: AUDIO_TIMEOUT_MS,
      });

      if (gen.ok && gen.data) {
        const conteudo = (gen.data as { choices?: Array<{ message?: { content?: string } }> })
          .choices?.[0]?.message?.content;
        const category = normalizarCategoria(conteudo);
        log.done(200, { category, basis: 'audio_content', audioBytes: audio.bytes });
        return jsonResponse({ category, basis: 'audio_content' }, 200, req);
      }

      // Sem provedor que declare áudio, NADA foi enviado: o som não foi
      // analisado, mas o nome ainda pode classificar — rotulado como limitado.
      const semProvedorDeAudio =
        gen.errorCode === 'NO_PROVIDER' || gen.errorCode === 'AMBIGUOUS_PROVIDER';
      if (semProvedorDeAudio) {
        log.warn("Nenhum provedor de audio disponivel; classificando por metadados");
        return await classificarPorMetadados({
          file_name,
          errorCode: gen.errorCode ?? 'NO_PROVIDER',
        });
      }

      // Falha do provedor de áudio: `outros` degradado, NUNCA uma categoria
      // apresentada como conclusão sobre o som (falha técnica separada).
      log.error(`API error ${gen.response.status}`, { detail: gen.errorCode ?? 'unknown' });
      return jsonResponse(
        { category: 'outros', basis: 'none', degraded: true, error_code: gen.errorCode ?? 'PROVIDER_ERROR' },
        200,
        req,
      );
    }

    return await classificarPorMetadados({ file_name, errorCode: audioErrorCode });
  } catch (err: unknown) {
    const motivo = err instanceof Error ? err.message : String(err);
    await logAiUsage({
      functionName: FUNCTION_NAME,
      userId: identity.userId,
      status: 'error',
      errorMessage: motivo,
      purpose: 'tagging',
      modality: 'audio_stt',
      metadata: { reason: 'unhandled_exception' },
    });
    log.error("Error", { error: motivo });
    return jsonResponse(
      { category: 'outros', basis: 'none', degraded: true, error_code: 'UNEXPECTED' },
      200,
      req,
    );
  }
});
