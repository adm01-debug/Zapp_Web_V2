// T73 — entrega da gravacao sem expor a URL.
//
// O aceite pede tres respostas distintas: sem JWT -> 401, JWT de quem nao e dono -> 403
// (a RLS e quem decide), com gravacao -> 200. Os dois primeiros nascem do proprio caminho
// de auth copiado do `get-sip-password`; o terceiro depende de existir audio. Este arquivo
// trava a parte pura: (1) o que a resposta de audio carrega, (2) que ela NUNCA carrega a URL
// de origem, e (3) que a faixa (Range) e repassada - sem isso o <audio> nao busca pedaco.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/get-call-recording/index.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { cabecalhosDoAudio } from "./index.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

Deno.test("T73: sem tipo na origem assume audio/mpeg (o <audio> nao fica sem Content-Type)", () => {
  assertEquals(cabecalhosDoAudio({}, CORS)["Content-Type"], "audio/mpeg");
});

Deno.test("T73: repassa a faixa e o tamanho do trecho pedido", () => {
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
