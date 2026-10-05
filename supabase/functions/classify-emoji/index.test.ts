// t_f1da4967 (R2-INF-022, P1) — o download de imagem privada do classify-emoji
// corre sob a identidade do USUÁRIO do pedido, nunca sob credencial implícita.
//
// Aceite: o bearer do header Authorization é repassado a `toInlineImage` como
// `storageIdentity: { kind:'user', bearerToken }`; negação do helper degrada
// para `outros` (HTTP 200) SEM chamar o provedor e com linha tipada de log sem
// token/locator; imagem autorizada chega ao provedor embutida em data URL;
// identidade inválida (e service role) não baixa imagem nenhuma.
import { handleClassifyEmojiRequest } from "./index.ts";
import { AiImageInputError, type InlineImage, type toInlineImage } from "../_shared/ai-image-input.ts";
import type { GenerateParams, GenerateResult, generateWithRouting } from "../_shared/ai-generate.ts";
import type { logAiUsage } from "../_shared/ai-usage.ts";

type ChamadasImagem = Parameters<typeof toInlineImage>[];
type ChamadasGenerate = GenerateParams[];
type ChamadasLog = Parameters<typeof logAiUsage>[0][];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// Credencial e locator SINTÉTICOS: nada aqui é token/URL real, e o teste prova
// que mesmo assim eles não vazam para o log.
const BEARER = "jwt.sintetico.do.teste";
const IMAGE_URL = "https://edge.invalid/storage/v1/object/public/custom-emojis/alfa/feliz.png";

function makeReq(body: unknown = { image_url: IMAGE_URL, file_name: "feliz.png" }) {
  return new Request("https://edge.invalid/classify-emoji", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${BEARER}`,
    },
    body: JSON.stringify(body),
  });
}

function imagemAutorizada(): InlineImage {
  return {
    dataUrl: "data:image/png;base64,AAA",
    mime: "image/png",
    bytes: 3,
    bucket: "custom-emojis",
    path: "alfa/feliz.png",
  };
}

function generateOk(categoria: string): GenerateResult {
  return {
    ok: true,
    response: new Response("{}", { status: 200 }),
    data: { choices: [{ message: { content: categoria } }] },
    providerId: "prov-sintetico",
    providerName: "provedor-sintetico",
    model: "modelo-sintetico",
    durationMs: 1,
    status: "success",
  };
}

function assertStorageIdentityDeUsuario(chamadasImagem: ChamadasImagem) {
  assert(chamadasImagem.length === 1, `toInlineImage deveria ser chamado 1x, foi ${chamadasImagem.length}x`);
  const identidade = chamadasImagem[0][1]?.storageIdentity;
  assert(
    identidade?.kind === "user",
    `storageIdentity.kind esperado 'user' (nunca 'service'): ${JSON.stringify(identidade)}`,
  );
  if (identidade?.kind === "user") {
    assert(
      identidade.bearerToken === BEARER,
      "o bearer do header Authorization deveria autorizar o download",
    );
  }
}

Deno.test("classify-emoji: imagem privada alheia → helper nega, provedor não é chamado, 'outros' com log", async () => {
  const chamadasImagem: ChamadasImagem = [];
  const chamadasGenerate: ChamadasGenerate = [];
  const chamadasLog: ChamadasLog = [];

  const res = await handleClassifyEmojiRequest(makeReq(), {
    requireIdentity: () => Promise.resolve({ kind: "user", userId: "user-1" }),
    toInlineImage: (...args) => {
      chamadasImagem.push(args);
      return Promise.reject(
        new AiImageInputError("IMAGE_STORAGE_UNAVAILABLE", "Storage negou a leitura do objeto."),
      );
    },
    generate: (params) => {
      chamadasGenerate.push(params);
      return Promise.resolve(generateOk("amor"));
    },
    logUsage: (entry) => {
      chamadasLog.push(entry);
      return Promise.resolve();
    },
  });

  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.category === "outros", `categoria esperada 'outros': ${JSON.stringify(body)}`);

  assertStorageIdentityDeUsuario(chamadasImagem);

  assert(
    chamadasGenerate.length === 0,
    "o provedor NÃO pode ser chamado quando o helper nega a imagem",
  );

  const logErro = chamadasLog.find((entry) => entry.status === "error");
  assert(logErro, "a degradação deveria registrar uma linha tipada com status 'error'");
  const payload = JSON.stringify(logErro);
  assert(!payload.includes(BEARER), "o log não pode conter o bearer do pedido");
  assert(!payload.includes(IMAGE_URL), "o log não pode conter o locator do objeto");
});

Deno.test("classify-emoji: imagem autorizada chega ao provedor embutida e responde a categoria", async () => {
  const chamadasImagem: ChamadasImagem = [];
  const chamadasGenerate: ChamadasGenerate = [];

  const res = await handleClassifyEmojiRequest(makeReq(), {
    requireIdentity: () => Promise.resolve({ kind: "user", userId: "user-1" }),
    toInlineImage: (...args) => {
      chamadasImagem.push(args);
      return Promise.resolve(imagemAutorizada());
    },
    generate: (params) => {
      chamadasGenerate.push(params);
      return Promise.resolve(generateOk("amor"));
    },
    logUsage: () => Promise.resolve(),
  });

  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.category === "amor", `categoria esperada 'amor': ${JSON.stringify(body)}`);

  assertStorageIdentityDeUsuario(chamadasImagem);

  assert(chamadasGenerate.length === 1, `generate deveria ser chamado 1x, foi ${chamadasGenerate.length}x`);
  const mensagens = chamadasGenerate[0].messages as Array<{
    role: string;
    content: Array<{ type: string; image_url?: { url: string }; text?: string }>;
  }>;
  const parteImagem = mensagens[0].content.find((parte) => parte.type === "image_url");
  assert(
    parteImagem?.image_url?.url === imagemAutorizada().dataUrl,
    "a mensagem ao provedor deve embutir a data URL da imagem",
  );
});

Deno.test("classify-emoji: identidade inválida não baixa imagem nem chama provedor", async () => {
  const chamadasImagem: ChamadasImagem = [];
  const chamadasGenerate: ChamadasGenerate = [];
  const respostaGate = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const res = await handleClassifyEmojiRequest(makeReq(), {
    requireIdentity: () => Promise.resolve(respostaGate),
    toInlineImage: (...args) => {
      chamadasImagem.push(args);
      return Promise.resolve(imagemAutorizada());
    },
    generate: (params) => {
      chamadasGenerate.push(params);
      return Promise.resolve(generateOk("amor"));
    },
  });

  assert(res === respostaGate, "a resposta do gate deve ser devolvida sem alteração");
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(chamadasImagem.length === 0, "nenhuma imagem pode ser baixada sem identidade válida");
  assert(chamadasGenerate.length === 0, "o provedor não pode ser chamado sem identidade válida");
});

Deno.test("classify-emoji: service role recusada pelo gate não baixa imagem", async () => {
  const chamadasImagem: ChamadasImagem = [];
  const chamadasGenerate: ChamadasGenerate = [];
  const respostaGate = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const res = await handleClassifyEmojiRequest(makeReq(), {
    requireIdentity: () => Promise.resolve(respostaGate),
    toInlineImage: (...args) => {
      chamadasImagem.push(args);
      return Promise.resolve(imagemAutorizada());
    },
    generate: (params) => {
      chamadasGenerate.push(params);
      return Promise.resolve(generateOk("amor"));
    },
  });

  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  assert(chamadasImagem.length === 0, "service role não autoriza download neste endpoint");
  assert(chamadasGenerate.length === 0, "service role não pode chamar o provedor neste endpoint");
});
