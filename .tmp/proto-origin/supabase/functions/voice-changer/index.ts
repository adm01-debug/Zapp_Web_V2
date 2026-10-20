import {
  handleCors,
  errorResponse,
  jsonResponse,
  getCorsHeaders,
  Logger,
  requireEnv,
  requireAuth,
  enforceRateLimit,
} from "../_shared/validation.ts";
import { enforceAiCapability } from "../_shared/ai-feature-flags.ts";
import { logAiUsageDetached } from "../_shared/ai-usage.ts";
import {
  MAX_VOICE_CHANGER_AUDIO_BYTES,
  announcedAudioTooLarge,
  validateStsUpload,
} from "../_shared/sts-upload.ts";

/** G3 (item 26): o provedor tem 60 s para responder; antes eram 30 s, e o
 *  estouro virava um 500 genérico. */
const VOICE_CHANGER_TIMEOUT_MS = 60_000;

/** O modelo do produto — o mesmo que o `elevenlabs-sts` usa. */
const VOICE_CHANGER_MODEL = "eleven_multilingual_sts_v2";

const VOICE_PRESETS: Record<string, { voiceId: string; label: string }> = {
  // Masculinas
  'grave':      { voiceId: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (Grave)' },
  'roger':      { voiceId: 'CwhRBWXzGAHq8TQ4Fs17', label: 'Roger (Narrador)' },
  'animado':    { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam (Animado)' },
  'misterioso': { voiceId: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel (Misterioso)' },
  'brian':      { voiceId: 'nPczCjzI2devNBz1zQrb', label: 'Brian' },
  'bill':       { voiceId: 'pqHfZKP75CvOlQylNhV4', label: 'Bill' },
  'eric':       { voiceId: 'cjVigY5qzO86Huf0OWal', label: 'Eric' },
  'will':       { voiceId: 'bIHbv24MWmeRgasZH58o', label: 'Will' },
  'callum':     { voiceId: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum' },
  'charlie':    { voiceId: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie' },
  // Femininas
  'feminina':   { voiceId: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah' },
  'laura':      { voiceId: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura' },
  'alice':      { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice' },
  'matilda':    { voiceId: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda' },
  'jessica':    { voiceId: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica' },
  'lily':       { voiceId: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily' },
  // Neutras/Especiais
  'river':      { voiceId: 'SAz9YHcvj6GT2YYXdXww', label: 'River' },
  'robo':       { voiceId: 'iP95p4xoKVk53GoZ742B', label: 'Chris (Robô)' },
  'glitch':     { voiceId: 'kPtEHAvRnjUJFv7SK9WI', label: 'Glitch' },
  // Temáticas
  'santa':      { voiceId: 'MDLAMJ0jxkpYkjXbmG4t', label: 'Papai Noel' },
  'mrs_claus':  { voiceId: 'SAhdygBsjizE9aIj39dz', label: 'Mamãe Noel' },
  'elf':        { voiceId: 'e79twtVS2278lVZZQiAD', label: 'Elfo' },
  'reindeer':   { voiceId: 'h6u4tPKmcPlxUdZOaVpH', label: 'Rena' },
};

// `import.meta.main` (mesmo padrão de `elevenlabs-sts`): o handler pode ser
// importado por teste sem subir o servidor.
export async function handleVoiceChanger(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("voice-changer");

  // JWT ja e validado pelo gateway (verify_jwt=true); aqui o usuario vira a
  // chave do rate limit persistente — cota paga (ElevenLabs/Mapbox) por usuario.
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  // IA-009 / SL-010b — kill switch por capacidade, lido no SERVIDOR e ANTES de
  // reservar limite e de tocar o provedor pago. A família de voz/áudio da
  // ElevenLabs responde à chave única `ai.capability.voice` (decisão SL-010b).
  // Capacidade desligada → 503 e NÃO consome rate limit; leitura não confiável
  // fecha (fail-closed) — mesmo mecanismo já usado pelos outros caminhos de IA.
  const capability = await enforceAiCapability({ functionName: "voice-changer", req });
  if (capability) return capability;

  const rl = await enforceRateLimit(`voice-changer:${auth.userId}`, 10, 60_000);
  if (!rl.allowed) {
    return errorResponse("Limite de uso excedido. Tente novamente em instantes.", 429, req);
  }

  try {
    const elevenlabsKey = requireEnv('ELEVENLABS_API_KEY');

    // 1) Teto no CABEÇALHO antes de `req.formData()`: o corpo abusivo não chega a
    //    ser materializado na memória. O `content-length` pode mentir para baixo —
    //    nesse caso o `size` real do File decide no passo 3.
    if (announcedAudioTooLarge(req, MAX_VOICE_CHANGER_AUDIO_BYTES)) {
      return errorResponse(
        `Arquivo de áudio grande demais (máximo ${MAX_VOICE_CHANGER_AUDIO_BYTES} bytes)`,
        413,
        req,
      );
    }

    const formData = await req.formData();
    // Ponto 2 do refazer 1: o campo `audio` pode chegar como TEXTO (string) e
    // string é truthy — `!audioFile` não pegava, e o `file.slice` estourava em
    // 500 genérico. `instanceof File` barra texto e ausência com 400 claro.
    const audioField = formData.get('audio');
    if (!(audioField instanceof File)) {
      return errorResponse('Arquivo de áudio é obrigatório', 400, req);
    }
    const audioFile: File = audioField;
    const voicePreset = (formData.get('voice_preset') as string) || 'grave';

    // 2) Preset ANTES do provedor: voz fora do catálogo da interface não vira
    //    chamada paga (SL-008/B4, igual ao caminho do `elevenlabs-sts`).
    const preset = VOICE_PRESETS[voicePreset];
    if (!preset) {
      return errorResponse(`Predefinição de voz inválida: ${voicePreset}`, 400, req);
    }

    // 3) Tamanho real + CONTEÚDO (magic bytes): `File.type` vem do cliente e pode
    //    mentir, então o container é provado nos bytes — um blob que só DIZIA ser
    //    áudio não chega mais ao provedor pago.
    const uploadRejection = await validateStsUpload(audioFile, MAX_VOICE_CHANGER_AUDIO_BYTES);
    if (uploadRejection) {
      log.info('Upload recusado antes do provedor', {
        status: uploadRejection.status,
        size: audioFile.size,
      });
      return errorResponse(uploadRejection.error, uploadRejection.status, req);
    }

    log.info('Processing voice change', { preset: voicePreset, size: audioFile.size });

    const apiFormData = new FormData();
    apiFormData.append('audio', audioFile);
    apiFormData.append('model_id', VOICE_CHANGER_MODEL);
    apiFormData.append('voice_settings', JSON.stringify({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    }));

    const iniciadoEm = Date.now();
    // O corpo INTEIRO é lido dentro do MESMO prazo do `AbortSignal.timeout`: o áudio
    // volta como buffer (não há repasse em streaming), então o relógio de 60 s cobre
    // a resposta toda e, se estourar no meio dela, o timeout continua valendo.
    let response: Response | null = null;
    let audioBuffer: ArrayBuffer | null = null;
    let textoErro = '';
    let falhaDeRede: unknown = null;
    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/speech-to-speech/${preset.voiceId}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': elevenlabsKey,
          },
          body: apiFormData,
          signal: AbortSignal.timeout(VOICE_CHANGER_TIMEOUT_MS),
        }
      );
      if (response.ok) {
        audioBuffer = await response.arrayBuffer();
      } else {
        textoErro = (await response.text()).substring(0, 300);
      }
    } catch (err) {
      falhaDeRede = err;
    }

    const estourouTempo = falhaDeRede instanceof DOMException &&
      (falhaDeRede.name === 'TimeoutError' || falhaDeRede.name === 'AbortError');

    // SL-013 / IA-003 (B6): a cobrança do provedor é por SEGUNDO de áudio — "não
    // medido" nunca pode virar zero. A linha entra também quando o fetch falha ou
    // estoura o tempo: a chamada paga foi tentada. Sucesso exige buffer NÃO vazio
    // (`ArrayBuffer` vazio é truthy — sem o `byteLength > 0` um 200 sem áudio
    // marcaria 'success' no ledger e depois cairia no 500 da guarda).
    await logAiUsageDetached({
      functionName: 'voice-changer',
      userId: auth.userId,
      model: VOICE_CHANGER_MODEL,
      durationMs: Date.now() - iniciadoEm,
      status: response?.ok && audioBuffer && audioBuffer.byteLength > 0 ? 'success' : 'error',
      errorMessage: response
        ? (response.ok ? null : `ElevenLabs HTTP ${response.status}`)
        : (estourouTempo ? 'timeout' : 'network_error'),
      usageUnknown: true,
      metadata: {
        provider: 'elevenlabs',
        endpoint: '/v1/speech-to-speech',
        billing_unit: 'second',
        billing_quantity: null,
        input_bytes: audioFile.size,
        http_status: response?.status ?? null,
        timed_out: estourouTempo,
      },
    });

    if (estourouTempo) {
      log.error('ElevenLabs STS timeout', { timeoutMs: VOICE_CHANGER_TIMEOUT_MS });
      return jsonResponse(
        {
          error:
            `Tempo esgotado ao transformar a voz (limite de ${VOICE_CHANGER_TIMEOUT_MS / 1000}s). Tente novamente.`,
        },
        504,
        req,
      );
    }
    // Ponto 1 do refazer 1: falha de rede NÃO-timeout (fetch rejeitado ou corpo
    // 200 que quebra no meio do download, com audioBuffer nulo) cai no catch e
    // vira 500 — nunca 200 vazio. Fica DEPOIS do ramo do 504 e ANTES do ramo do
    // `!response.ok`, para o 502 do provedor continuar intacto.
    if (falhaDeRede) throw falhaDeRede;
    if (!response) throw new Error("ElevenLabs sem resposta após fetch");

    if (!response.ok) {
      log.error(`ElevenLabs STS error ${response.status}`, { detail: textoErro });
      return errorResponse(`Voice transformation failed: ${response.status}`, 502, req);
    }
    // Defesa de tipo (inalcançável na prática: com 200 e sem falha de rede o
    // `arrayBuffer()` acima preencheu o buffer) — sem os `?? 0`, que escondiam o
    // nulo atrás de um 200 vazio. O `byteLength === 0` cobre o 200 com corpo
    // vazio: sucesso sem áudio também não pode sair como 200.
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error("ElevenLabs devolveu 200 sem corpo de áudio");
    }

    log.done(200, { outputSize: audioBuffer.byteLength });

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (err: unknown) {
    log.error("Voice changer error", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse('Internal error processing voice change', 500, req);
  }
}

if (import.meta.main) {
  Deno.serve(handleVoiceChanger);
}
