// Item 62 (TEL-RECORDING-001) — o contrato da Edge `get-call-recording`.
//
// O DEFEITO: o player (`useCallRecording` -> `RecordingPlayer`) le `data.url` da resposta e
// monta `<audio src={url}>`; a Edge devolvia `new Response(upstream.body)` com Content-Type de
// audio. Corpo de audio (Blob) nao tem `.url`: o player devolvia null e a gravacao disponivel
// nunca aparecia para ouvir.
//
// Estes testes chamam o HANDLER REAL com um `Request` e conferem status E corpo. O cliente com
// o JWT do chamador e a busca na origem sao injetados (a mesma costura que `gmail-oauth` usa),
// entao o teste nao toca banco nem provedor — mas exercita cada decisao do handler: 401 sem JWT,
// 401 com token invalido, 403 quando a RLS nao devolve a linha, 404 sem gravacao, 502 com a
// origem fora do ar, 429 no limite, 405 fora de GET/POST e 200 com JSON na resposta.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/get-call-recording/index.test.ts

import { assertEquals, assert, assertFalse } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  handleGetCallRecording,
  type ClienteDoChamador,
  type GetCallRecordingDeps,
  type LinhaDaChamada,
} from "./index.ts";

/** O mesmo tipo do construtor de consulta que o handler usa (data/error do maybeSingle). */
type ConsultaFalsa = ReturnType<ClienteDoChamador["from"]>;

const URL_FUNCAO = "https://example.supabase.co/functions/v1/get-call-recording";
const URL_GRAVACAO = "https://gravacoes.exemplo/chamada-1.mp3";
const TOKEN = "Bearer token-do-chamador";
// Bytes de um audio real (cabecalho "ID3"): e o que o player NAO pode receber no lugar do JSON.
const BYTES_DE_AUDIO = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);

const CHAMADA: LinhaDaChamada = { id: "c1", recording_status: "available", recording_url: URL_GRAVACAO };

interface Leitura {
  tabela: string;
  colunas: string;
  coluna: string;
  valor: string;
}

interface Registro {
  tokens: string[];
  leituras: Leitura[];
  origens: string[];
  cancelamentos: number;
}

function novoRegistro(): Registro {
  return { tokens: [], leituras: [], origens: [], cancelamentos: 0 };
}

/** Corpo de audio com `cancel` rastreavel: prova que o probe NAO e o que chega ao cliente. */
function corpoDeAudio(registro: Registro): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(BYTES_DE_AUDIO);
    },
    cancel() {
      registro.cancelamentos++;
    },
  });
}

interface OpcoesDoFake {
  /** false = token invalido/expirado (getUser devolve erro) */
  autenticado?: boolean;
  /** undefined = chamada com gravacao disponivel; null = a RLS nao devolve a linha */
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
    buscarOrigem: (url: string) => {
      registro.origens.push(url);
      const status = opcoes.statusOrigem ?? 200;
      return Promise.resolve(
        new Response(status >= 400 ? null : corpoDeAudio(registro), {
          status,
          headers: { "Content-Type": "audio/mpeg" },
        }),
      );
    },
  };
}

interface OpcoesDoPedido {
  metodo?: "GET" | "POST" | "PUT";
  /** undefined = com o token do chamador; null = sem Authorization */
  token?: string | null;
  /** undefined = `?callId=c1`; null = sem query string */
  query?: string | null;
  corpo?: unknown;
  ip?: string;
}

function pedido(opcoes: OpcoesDoPedido = {}): Request {
  const metodo = opcoes.metodo ?? "GET";
  const url = new URL(URL_FUNCAO);
  const query = opcoes.query === undefined ? "c1" : opcoes.query;
  if (query !== null) url.searchParams.set("callId", query);
  const token = opcoes.token === undefined ? TOKEN : opcoes.token;

  return new Request(url.toString(), {
    method: metodo,
    headers: {
      ...(token ? { Authorization: token } : {}),
      ...(opcoes.ip ? { "x-forwarded-for": opcoes.ip } : {}),
      ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(opcoes.corpo !== undefined ? { body: JSON.stringify(opcoes.corpo) } : {}),
  });
}

// ── Autenticacao ─────────────────────────────────────────────────────────────

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

// ── Dono e disponibilidade ───────────────────────────────────────────────────

Deno.test("item 62: chamada que a RLS nao devolve (outro agente) responde 403 e nada de audio", async () => {
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
  assertEquals(registro.origens, [URL_GRAVACAO]);
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

// ── O contrato com o player (o defeito do item 62) ───────────────────────────

Deno.test("item 62: com JWT e dono a resposta e JSON com a url — nunca o stream de audio", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(pedido(), deps({}, registro));
  const tipo = res.headers.get("Content-Type") ?? "";

  assertEquals(res.status, 200);
  assert(tipo.includes("application/json"), `Content-Type deveria ser JSON, veio "${tipo}"`);
  assertFalse(tipo.includes("audio"), `a resposta nao pode ser audio, veio "${tipo}"`);
  // A URL do provedor e temporaria: a resposta nao pode ser guardada por intermediario.
  assert((res.headers.get("Cache-Control") ?? "").includes("no-store"));

  const texto = await res.text();
  assertEquals(JSON.parse(texto), { url: URL_GRAVACAO });
  // O corpo de bytes do provedor nao pode viajar na resposta (era o defeito).
  assertFalse(texto.includes("ID3"));
  // A origem foi consultada (a gravacao existe agora) e o probe foi descartado, nao entregue.
  assertEquals(registro.origens, [URL_GRAVACAO]);
  assertEquals(registro.cancelamentos, 1);
});

Deno.test("item 62: o player chama por POST com { callId } e recebe o mesmo JSON", async () => {
  const registro = novoRegistro();

  const res = await handleGetCallRecording(
    pedido({ metodo: "POST", corpo: { callId: "c9" } }),
    deps({}, registro),
  );
  const tipo = res.headers.get("Content-Type") ?? "";

  assertEquals(res.status, 200);
  assert(tipo.includes("application/json"), `Content-Type deveria ser JSON, veio "${tipo}"`);
  assertEquals(await res.json(), { url: URL_GRAVACAO });
  assertEquals(registro.leituras[0]?.valor, "c9");
  assertEquals(registro.origens, [URL_GRAVACAO]);
});

// ── Bordas do pedido ─────────────────────────────────────────────────────────

Deno.test("item 62: sem callId responde 400 (GET sem query e POST com corpo vazio)", async () => {
  const porGet = await handleGetCallRecording(pedido({ query: null }), deps({}, novoRegistro()));
  const porPost = await handleGetCallRecording(pedido({ metodo: "POST", corpo: {} }), deps({}, novoRegistro()));

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

Deno.test("item 62: o limite de 60 pedidos por IP continua valendo (429 no 61o)", async () => {
  const registro = novoRegistro();
  const ip = "203.0.113.7";

  // O limitador roda ANTES da autenticacao: a req sem token tambem consome a cota.
  let ultimo = 0;
  for (let i = 0; i < 61; i++) {
    const res = await handleGetCallRecording(pedido({ token: null, ip }), deps({}, registro));
    if (i < 60) assertEquals(res.status, 401);
    ultimo = res.status;
  }

  assertEquals(ultimo, 429);
});
