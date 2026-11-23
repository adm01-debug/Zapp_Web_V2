/**
 * Fallback de STT pelo OpenRouter — contrato executável.
 *
 * Contexto (2026-11-23): a credencial do ElevenLabs em produção está recusada
 * (1.414 chamadas no mês, 100% HTTP 401, zero transcrições desde 14/11). O
 * fallback usa um modelo multimodal do OpenRouter que aceita `input_audio` e
 * devolve `usage` com tokens reais — o que `ai_usage_logs` sabe medir.
 *
 * Este arquivo cobre a unidade que fala com o provedor: formato, base64, corpo
 * e interpretação da resposta. O `fetch` é injetado: roda offline, sem rede,
 * sem banco e sem env.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/ai-transcribe-audio/openrouter-stt.test.ts
 */
import {
  audioParaBase64,
  formatoDeAudioParaOpenRouter,
  interpretarRespostaOpenRouter,
  montarCorpoOpenRouter,
  montarPromptTranscricao,
  OPENROUTER_STT_ENDPOINT,
  OPENROUTER_STT_MODEL_PADRAO,
  transcreverViaOpenRouter,
} from "./openrouter-stt.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
  }
}

Deno.test("formato: containers que a edge reconhece viram a extensão do input_audio", () => {
  const esperado: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/flac": "flac",
    "audio/aac": "aac",
    "audio/webm": "webm",
  };
  for (const [mime, formato] of Object.entries(esperado)) {
    assertEquals(formatoDeAudioParaOpenRouter(mime), formato, `formato de ${mime}`);
  }
});

Deno.test("formato: mime de outro tipo ou desconhecido não vira extensão inventada", () => {
  assertEquals(formatoDeAudioParaOpenRouter("image/png"), null, "PNG não é áudio");
  assertEquals(formatoDeAudioParaOpenRouter("text/plain"), null, "texto não é áudio");
  assertEquals(formatoDeAudioParaOpenRouter("application/octet-stream"), null, "binário não é áudio");
  assertEquals(formatoDeAudioParaOpenRouter(""), null, "vazio não é áudio");
});

Deno.test("formato: parâmetro do content-type (codecs) não atrapalha e o case não importa", () => {
  assertEquals(
    formatoDeAudioParaOpenRouter("audio/webm;codecs=opus"),
    "webm",
    "o parâmetro é ignorado",
  );
  assertEquals(formatoDeAudioParaOpenRouter("AUDIO/OGG"), "ogg", "case-insensitive");
});

Deno.test("base64: buffer maior que o bloco interno é convertido byte a byte", () => {
  // 40.000 bytes força mais de um bloco de 0x8000 — o caminho que poderia
  // estourar a pilha com `String.fromCharCode(...bytes)` de uma vez.
  const bytes = new Uint8Array(40_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;

  const base64 = audioParaBase64(bytes);
  const decodificado = atob(base64);

  assertEquals(decodificado.length, bytes.length, "o tamanho sobrevive à ida e volta");
  let divergente = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (decodificado.charCodeAt(i) !== bytes[i]) {
      divergente = i;
      break;
    }
  }
  assertEquals(divergente, -1, "nenhum byte pode divergir na ida e volta");
});

Deno.test("base64: buffer vazio devolve string vazia (sem áudio, sem exceção)", () => {
  assertEquals(audioParaBase64(new Uint8Array(0)), "", "vazio vira vazio");
});

Deno.test("corpo: o áudio vai como input_audio com formato e o texto como instrução", () => {
  const corpo = montarCorpoOpenRouter({
    audioBase64: "QUJD",
    formato: "ogg",
    prompt: montarPromptTranscricao("pt"),
    modelo: OPENROUTER_STT_MODEL_PADRAO,
  }) as {
    model: string;
    temperature: number;
    messages: { role: string; content: { type: string; text?: string; input_audio?: { data: string; format: string } }[] }[];
  };

  assertEquals(corpo.model, OPENROUTER_STT_MODEL_PADRAO, "usa o modelo multimodal padrão");
  assertEquals(corpo.temperature, 0, "temperature 0: transcrever é tarefa determinística");
  assertEquals(corpo.messages.length, 1, "uma única mensagem do usuário");
  assertEquals(corpo.messages[0].role, "user", "papel user");

  const [texto, audio] = corpo.messages[0].content;
  assertEquals(texto.type, "text", "o primeiro bloco é a instrução");
  assertEquals(audio.type, "input_audio", "o segundo bloco é o áudio");
  assertEquals(audio.input_audio?.data, "QUJD", "o data leva o base64 do arquivo");
  assertEquals(audio.input_audio?.format, "ogg", "o format segue o container real");
});

Deno.test("prompt: instrui transcrição literal em pt-BR e proíbe comentário/tradução", () => {
  const pt = montarPromptTranscricao("pt-BR");
  assert(pt.includes("português do Brasil"), "idioma pt-BR citado");
  assert(pt.includes("SOMENTE o texto falado"), "proíbe rótulo e comentário");
  assert(pt.includes("não traduza"), "proíbe tradução");

  const outro = montarPromptTranscricao("en");
  assert(outro.includes("o idioma en"), "outro idioma é nomeado como veio");
  assertEquals(montarPromptTranscricao(null).includes("português do Brasil"), true, "sem idioma assume pt");
});

Deno.test("resposta: content string com usage é lido com os tokens reais", () => {
  const lido = interpretarRespostaOpenRouter({
    choices: [{ message: { content: "  bom dia, tudo bem?  " } }],
    usage: { prompt_tokens: 1_234, completion_tokens: 56 },
  });
  assert(lido, "a resposta válida é interpretada");
  assertEquals(lido.texto, "bom dia, tudo bem?", "o texto é aparado");
  assertEquals(lido.tokensIn, 1_234, "prompt_tokens vira tokensIn");
  assertEquals(lido.tokensOut, 56, "completion_tokens vira tokensOut");
});

Deno.test("resposta: content em blocos é concatenado na ordem", () => {
  const lido = interpretarRespostaOpenRouter({
    choices: [{ message: { content: [{ type: "text", text: "parte 1 " }, { type: "text", text: "parte 2" }] } }],
  });
  assert(lido, "blocos também são interpretados");
  assertEquals(lido.texto, "parte 1 parte 2", "a concatenação preserva a ordem");
});

Deno.test("resposta: sem usage os tokens são null (não medido), nunca zero", () => {
  const lido = interpretarRespostaOpenRouter({ choices: [{ message: { content: "oi" } }] });
  assert(lido, "sem usage ainda é resposta válida");
  assertEquals(lido.tokensIn, null, "token de entrada não medido");
  assertEquals(lido.tokensOut, null, "token de saída não medido");
});

Deno.test("resposta: usage com valor negativo ou não numérico não vira número inventado", () => {
  const lido = interpretarRespostaOpenRouter({
    choices: [{ message: { content: "oi" } }],
    usage: { prompt_tokens: -5, completion_tokens: "muitos" },
  });
  assert(lido, "a resposta continua válida");
  assertEquals(lido.tokensIn, null, "negativo é recusado");
  assertEquals(lido.tokensOut, null, "string é recusada");
});

Deno.test("resposta: payload sem choices ou vazio não é interpretado", () => {
  assertEquals(interpretarRespostaOpenRouter(null), null, "null não é interpretado");
  assertEquals(interpretarRespostaOpenRouter({}), null, "sem choices não é interpretado");
  assertEquals(interpretarRespostaOpenRouter({ choices: [] }), null, "choices vazio não é interpretado");
  assertEquals(
    interpretarRespostaOpenRouter({ choices: [{}] }),
    null,
    "escolha sem message não é interpretada",
  );
});

Deno.test("transcrever: mime desconhecido é recusado ANTES de tocar o provedor", async () => {
  let chamou = false;
  const resultado = await transcreverViaOpenRouter({
    audio: new Uint8Array([1, 2, 3]),
    mimeType: "image/png",
    apiKey: "chave",
    fetchImpl: (() => {
      chamou = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch,
  });

  assert(!resultado.ok, "mime não suportado não pode dar ok");
  assertEquals(resultado.motivo, "sem_formato", "o motivo separa falta de formato de erro de rede");
  assertEquals(chamou, false, "nenhuma chamada paga é feita sem formato válido");
});

Deno.test("transcrever: envia o áudio autenticado ao endpoint e devolve o texto medido", async () => {
  let url = "";
  let autorizacao = "";
  let corpo: { model?: string; messages?: { content?: { input_audio?: { data?: string; format?: string } }[] }[] } = {};
  const audio = new Uint8Array([0x4f, 0x67, 0x67, 0x53]);

  const resultado = await transcreverViaOpenRouter({
    audio,
    mimeType: "audio/ogg",
    idioma: "pt-BR",
    apiKey: "chave-secreta",
    fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      autorizacao = (init?.headers as Record<string, string>).Authorization;
      corpo = JSON.parse(String(init?.body));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "bom dia" } }],
            usage: { prompt_tokens: 900, completion_tokens: 12 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }) as typeof fetch,
  });

  assertEquals(url, OPENROUTER_STT_ENDPOINT, "o endpoint é o de chat completions");
  assertEquals(autorizacao, "Bearer chave-secreta", "a chave vai no header, não na URL");
  assertEquals(corpo.model, OPENROUTER_STT_MODEL_PADRAO, "o modelo padrão é enviado");
  assertEquals(
    corpo.messages?.[0]?.content?.[1]?.input_audio?.data,
    audioParaBase64(audio),
    "o áudio vai em base64 no bloco input_audio",
  );
  assertEquals(
    corpo.messages?.[0]?.content?.[1]?.input_audio?.format,
    "ogg",
    "o formato acompanha o container",
  );

  assert(resultado.ok, "resposta 200 vira sucesso");
  assertEquals(resultado.texto, "bom dia", "o texto é devolvido");
  assertEquals(resultado.tokensIn, 900, "os tokens de entrada vêm do usage");
  assertEquals(resultado.tokensOut, 12, "os tokens de saída vêm do usage");
});

Deno.test("transcrever: HTTP de erro preserva o status e o trecho do corpo", async () => {
  const resultado = await transcreverViaOpenRouter({
    audio: new Uint8Array([1]),
    mimeType: "audio/mpeg",
    apiKey: "chave",
    fetchImpl: (() =>
      Promise.resolve(
        new Response("model does not support audio", { status: 400 }),
      )) as typeof fetch,
  });

  assert(!resultado.ok, "400 não pode dar ok");
  assertEquals(resultado.motivo, "http", "o motivo é http");
  assertEquals(resultado.httpStatus, 400, "o status é preservado para o ledger");
  assert(resultado.detalhe.includes("does not support audio"), "o corpo do provedor fica no detalhe");
});

Deno.test("transcrever: queda de rede vira motivo `rede`, não exceção solta", async () => {
  const resultado = await transcreverViaOpenRouter({
    audio: new Uint8Array([1]),
    mimeType: "audio/mpeg",
    apiKey: "chave",
    fetchImpl: (() => Promise.reject(new Error("connect timeout"))) as typeof fetch,
  });

  assert(!resultado.ok, "rede caída não pode dar ok");
  assertEquals(resultado.motivo, "rede", "o motivo distingue falha de rede");
  assertEquals(resultado.httpStatus, null, "sem status HTTP");
  assert(resultado.detalhe.includes("connect timeout"), "a causa é preservada");
});

Deno.test("transcrever: JSON inválido ou resposta sem choices não é confundido com transcrição", async () => {
  const invalido = await transcreverViaOpenRouter({
    audio: new Uint8Array([1]),
    mimeType: "audio/mpeg",
    apiKey: "chave",
    fetchImpl: (() => Promise.resolve(new Response("nao e json", { status: 200 }))) as typeof fetch,
  });
  assert(!invalido.ok, "corpo não-JSON não pode dar ok");
  assertEquals(invalido.motivo, "resposta", "o motivo é resposta inválida");

  const semChoices = await transcreverViaOpenRouter({
    audio: new Uint8Array([1]),
    mimeType: "audio/mpeg",
    apiKey: "chave",
    fetchImpl: (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "sem choices" } }), { status: 200 }),
      )) as typeof fetch,
  });
  assert(!semChoices.ok, "sem choices não pode dar ok");
  assertEquals(semChoices.motivo, "resposta", "o motivo é resposta sem transcrição");
});
