// Item 62 (TEL-RECORDING-001) — contrato seguro da Edge `get-call-recording`.
//
// O defeito original estava no front: o player esperava JSON `{ url }`, mas esta Edge
// entrega um stream de audio por decisao de seguranca do T73. Estes testes chamam o
// HANDLER REAL com um `Request` e provam os dois lados do contrato: status/corpo e a
// garantia de que a URL do provedor nunca aparece na resposta ao navegador.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/get-call-recording/index.test.ts

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  cabecalhosDoAudio,
  handleGetCallRecording,
  type ClienteDoChamador,
  type GetCallRecordingDeps,
  type LinhaDaChamada,
} from "./index.ts";

type ConsultaFalsa = ReturnType<ClienteDoChamador["from"]>;

const CORS = { "Access-Control-Allow-Origin": "*" };
const URL_FUNCAO = "https://example.supabase.co/functions/v1/get-call-recording";
const URL_GRAVACAO = "https://gravacoes.exemplo/chamada-1.mp3?token=segredo";
const TOKEN = "Bearer token-do-chamador";
const BYTES_DE_AUDIO = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
const CHAMADA: LinhaDaChamada = { id: "c1", recording_status: "available", recording_url: URL_GRAVACAO };

interface Leitura {
  tabela: string;
  colunas: string;
  coluna: string;
  valor: string;
}

interface Origem {
  url: string;
  range: string | null;
}

interface Registro {
  tokens: string[];
  leituras: Leitura[];
  origens: Origem[];
}

function novoRegistro(): Registro {
  return { tokens: [], leituras: [], origens: [] };
}

function corpoDeAudio(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(BYTES_DE_AUDIO);
      controller.close();
    },
  });
}

interface OpcoesDoFake {
  autenticado?: boolean;
  linha?: LinhaDaChamada | null;
  erroLeitura?: { message: string } | null;
  statusOrigem?: number;
}

function deps(opcoes: OpcoesDoFake, registro: Registro): GetCallRecordingDeps {
  return {
    clienteDoChamador: (authHeader: string) => {
      registro.tokens.push(authHeader);
      return {
        auth: {
          getUser: () =>
            Promise.resolve(
              opcoes.autenticado === false
                ? { data: { user: null }, error: { message: "invalid token" } }
                : { data: { user: { id: "user-1" } }, error: null },
            ),
        },
        from: (tabela: string) => {
          const consulta: ConsultaFalsa = {
            select(colunas: string): typeof consulta {
              registro.leituras.push({ tabela, colunas, coluna: "", valor: "" });
              return consulta;
            },
            eq(coluna: string, valor: string): typeof consulta {
              const ultima = registro.leituras[registro.leituras.length - 1];
              if (ultima) {
                ultima.coluna = coluna;
                ultima.valor = valor;
              }
              return consulta;
            },
            maybeSingle: () =>
              Promise.resolve({
                data: opcoes.linha === undefined ? CHAMADA : opcoes.linha,
                error: opcoes.erroLeitura ?? null,
              }),
          };
          return consulta;
        },
      };
    },
    buscarOrigem: (url: string, range: string | null) => {
      registro.origens.push({ url, range });
      const status = opcoes.statusOrigem ?? 200;
      return Promise.resolve(
        new Response(status >= 400 ? null : corpoDeAudio(), {
          status,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(BYTES_DE_AUDIO.byteLength),
            "Accept-Ranges": "bytes",
            ...(range ? { "Content-Range": "bytes 0-4/5" } : {}),
          },
        }),
      );
    },
  };
}

interface OpcoesDoPedido {
  metodo?: "GET" | "POST" | "PUT";
  token?: string | null;
  query?: string | null;
  corpo?: unknown;
  range?: string;
}

let ipSeq = 1;
function pedido(opcoes: OpcoesDoPedido = {}): Request {
  const metodo = opcoes.metodo ?? "GET";
  const url = new URL(URL_FUNCAO);
  const query = opcoes.query === undefined ? "c1" : opcoes.query;
  if (query !== null) url.searchParams.set("callId", query);
  const token = opcoes.token === undefined ? TOKEN : opcoes.token;

  return new Request(url.toString(), {
    method: metodo,
    headers: {
      "x-forwarded-for": `203.0.113.${ipSeq++}`,
      ...(token ? { Authorization: token } : {}),
      ...(opcoes.range ? { Range: opcoes.range } : {}),
      ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(opcoes.corpo !== undefined ? { body: JSON.stringify(opcoes.corpo) } : {}),
  });
}

Deno.test("T73: sem tipo na origem assume audio/mpeg", () => {
  assertEquals(cabecalhosDoAudio({}, CORS)["Content-Type"], "audio/mpeg");
});

Deno.test("T73: repassa faixa, tamanho e suporte a ranges", () => {
  const h = cabecalhosDoAudio(
    { tipo: "audio/wav", tamanho: "1024", faixa: "bytes 0-1023/4096", aceita: "bytes" },
    CORS,
  );
  assertEquals(h["Content-Type"], "audio/wav");
  assertEquals(h["Content-Length"], "1024");
  assertEquals(h["Content-Range"], "bytes 0-1023/4096");
  assertEquals(h["Accept-Ranges"], "bytes");
});

Deno.test("T73: sem tamanho/faixa, nao inventa cabecalho", () => {
  const h = cabecalhosDoAudio({}, CORS);
  assert(!("Content-Length" in h));
  assert(!("Content-Range" in h));
  assertEquals(h["Accept-Ranges"], "bytes");
});

Deno.test("T73: audio de cliente nunca e cacheado por intermediario", () => {
  assertEquals(cabecalhosDoAudio({}, CORS)["Cache-Control"], "private, no-store");
});

Deno.test("T73: a resposta nao carrega a URL de origem nem o id do provedor", () => {
  const h = cabecalhosDoAudio({ tipo: "audio/mpeg", tamanho: "10" }, CORS);
  const texto = JSON.stringify(h).toLowerCase();
  assert(!texto.includes("http://") && !texto.includes("https://"));
  assert(!texto.includes("url"));
  assert(!texto.includes("bitrix"));
  assert(!texto.includes("location"));
});

Deno.test("T73: mantem o CORS recebido (preflight e resposta usam o mesmo)", () => {
  assertEquals(cabecalhosDoAudio({}, CORS)["Access-Control-Allow-Origin"], "*");
});

Deno.test("item 62: sem Authorization responde 401 e nao chega na origem", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(pedido({ token: null }), deps({}, registro));

  assertEquals(res.status, 401);
  assertEquals(registro.tokens, []);
  assertEquals(registro.origens, []);
});

Deno.test("item 62: token invalido responde 401 sem ler a chamada", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(pedido(), deps({ autenticado: false }, registro));

  assertEquals(res.status, 401);
  assertEquals(registro.leituras, []);
  assertEquals(registro.origens, []);
});

Deno.test("item 62: a leitura usa o JWT do proprio chamador e o id pedido", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(pedido({ query: "c1" }), deps({}, registro));

  assertEquals(res.status, 200);
  assertEquals(registro.tokens, [TOKEN]);
  assertEquals(registro.leituras, [
    { tabela: "calls", colunas: "id, recording_status, recording_url", coluna: "id", valor: "c1" },
  ]);
});

Deno.test("item 62: chamada que a RLS nao devolve responde 403 sem URL de origem", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(pedido(), deps({ linha: null }, registro));
  const texto = await res.text();

  assertEquals(res.status, 403);
  assertEquals(registro.origens, []);
  assertFalse(texto.includes(URL_GRAVACAO));
});

Deno.test("item 62: sem gravacao disponivel responde 404 mesmo com url gravada no registro", async () => {
  const registro = novoRegistro();
  const semGravacao: LinhaDaChamada = { id: "c2", recording_status: "none", recording_url: URL_GRAVACAO };

  const res = await handleGetCallRecording(pedido(), deps({ linha: semGravacao }, registro));

  assertEquals(res.status, 404);
  assertEquals(registro.origens, []);
});

Deno.test("item 62: origem fora do ar responde 502 e nao entrega a url ao player", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(pedido(), deps({ statusOrigem: 404 }, registro));
  const texto = await res.text();

  assertEquals(res.status, 502);
  assertEquals(registro.origens, [{ url: URL_GRAVACAO, range: null }]);
  assertFalse(texto.includes(URL_GRAVACAO));
});

Deno.test("item 62: erro ao ler a chamada responde 500 sem vazar o detalhe do banco", async () => {
  const registro = novoRegistro();
  const erroDoBanco = { message: 'relation "calls" does not exist' };

  const res = await handleGetCallRecording(pedido(), deps({ erroLeitura: erroDoBanco }, registro));
  const texto = await res.text();

  assertEquals(res.status, 500);
  assertFalse(texto.includes("relation"));
  assertEquals(registro.origens, []);
});

Deno.test("item 62/T73: com JWT e dono a resposta e audio, mas nunca contem recording_url", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(pedido({ range: "bytes=0-4" }), deps({}, registro));
  const texto = await res.text();

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "audio/mpeg");
  assertEquals(res.headers.get("Content-Length"), String(BYTES_DE_AUDIO.byteLength));
  assertEquals(res.headers.get("Content-Range"), "bytes 0-4/5");
  assertEquals(res.headers.get("Cache-Control"), "private, no-store");
  assertEquals(registro.origens, [{ url: URL_GRAVACAO, range: "bytes=0-4" }]);
  assert(texto.startsWith("ID3"), "o corpo deve ser o audio que o hook consome como Blob");
  assertFalse(texto.includes(URL_GRAVACAO));
  assertFalse(JSON.stringify(Array.from(res.headers.entries())).includes(URL_GRAVACAO));
  const cabecalhosFinais = JSON.stringify([...res.headers.entries()]).toLowerCase();
  assert(!cabecalhosFinais.includes("url"));
  assert(!cabecalhosFinais.includes("bitrix"));
  assert(!cabecalhosFinais.includes("location"));
});

Deno.test("item 62: o player chama por POST com { callId } e recebe stream, nao JSON com url", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(
    pedido({ metodo: "POST", query: null, corpo: { callId: "c9" } }),
    deps({}, registro),
  );
  const texto = await res.text();

  assertEquals(res.status, 200);
  assertFalse((res.headers.get("Content-Type") ?? "").includes("application/json"));
  assertEquals(registro.leituras[0]?.valor, "c9");
  assertEquals(registro.origens, [{ url: URL_GRAVACAO, range: null }]);
  assertFalse(texto.includes(URL_GRAVACAO));
});

Deno.test("item 62: sem callId responde 400", async () => {
  const porGet = await handleGetCallRecording(pedido({ query: null }), deps({}, novoRegistro()));
  const porPost = await handleGetCallRecording(pedido({ metodo: "POST", query: null, corpo: {} }), deps({}, novoRegistro()));

  assertEquals(porGet.status, 400);
  assertEquals(porPost.status, 400);
});

Deno.test("item 62: metodo fora de GET/POST responde 405 sem tocar a origem", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(pedido({ metodo: "PUT", corpo: { callId: "c1" } }), deps({}, registro));

  assertEquals(res.status, 405);
  assertEquals(registro.origens, []);
  assertEquals(registro.tokens, []);
});
