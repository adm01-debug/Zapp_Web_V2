/**
 * PE-16 — preflight CORS: o navegador recusa cabeçalho que a Edge não declara.
 *
 * O wrapper do front (`src/lib/invokeEdge.ts`) manda `x-request-id`,
 * `x-correlation-id` e `traceparent`. Como o `invoke` sai do navegador, o
 * `Access-Control-Request-Headers` do preflight precisa estar coberto por
 * `Access-Control-Allow-Headers`, senão a chamada é bloqueada ANTES de chegar à
 * Edge — e o id de correlação (o objetivo do cartão) nunca sairia do cliente.
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getCorsHeaders, handleCors } from "./validation.ts";

const PREFLIGHT_REQUEST_HEADERS = ["x-request-id", "x-correlation-id", "traceparent"];

Deno.test("allow-headers cobre os 3 cabecalhos que o front manda", () => {
  const allowed = (getCorsHeaders()["Access-Control-Allow-Headers"] || "")
    .split(",")
    .map((header) => header.trim().toLowerCase());

  for (const header of PREFLIGHT_REQUEST_HEADERS) {
    assert(allowed.includes(header), `Access-Control-Allow-Headers sem ${header}`);
  }
});

Deno.test("preflight (OPTIONS) responde 204-ish com os cabecalhos de correlacao", () => {
  const res = handleCors(
    new Request("https://zapp.example/functions/v1/message-delivery", {
      method: "OPTIONS",
      headers: {
        origin: "https://zapp-web-v2.vercel.app",
        "access-control-request-headers": PREFLIGHT_REQUEST_HEADERS.join(", "),
        "access-control-request-method": "POST",
      },
    }),
  );

  assert(res, "OPTIONS precisa de resposta propria do preflight");
  assertEquals(res!.headers.get("Access-Control-Allow-Methods")?.includes("POST"), true);
  // o cliente precisa poder LER o id que a Edge ecoa, para casar com o log
  assertEquals(res!.headers.get("Access-Control-Expose-Headers")?.includes("x-correlation-id"), true);
});

Deno.test("nao-preflight segue sem resposta de CORS (nenhuma regressao para POST)", () => {
  const res = handleCors(new Request("https://zapp.example/functions/v1/message-delivery", { method: "POST" }));
  assertEquals(res, null);
});
