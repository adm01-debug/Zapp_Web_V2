// Item 035 (plano de paridade V1/V3) — edge `status`.
//
// Prova o mínimo: 200 com o formato esperado, sem consultar o banco e sem exigir
// credencial interna; o correlation id (034) vai no corpo e no cabeçalho.
import { handleStatus } from "./index.ts";
import { withRequestId } from "../_shared/observability.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

Deno.test("status: 200 mínimo, sem banco, ecoando o correlation id", async () => {
  const res = await handleStatus(new Request("https://edge.invalid/status", {
    headers: { "x-request-id": "corr-status-1" },
  }));

  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  const body = await res.json();
  assert(body.status === "ok", `status inesperado: ${JSON.stringify(body)}`);
  assert(body.service === "zapp-web-v2-edges", `service inesperado: ${JSON.stringify(body)}`);
  assert(typeof body.time === "string" && !Number.isNaN(Date.parse(body.time)), "time inválido");
  assert(body.requestId === "corr-status-1", `requestId divergiu: ${JSON.stringify(body)}`);
  assert(res.headers.get("x-request-id") === "corr-status-1", "cabeçalho sem o eco do id");
});

Deno.test("status: preflight OPTIONS responde com CORS e sem corpo", async () => {
  const res = await handleStatus(new Request("https://edge.invalid/status", {
    method: "OPTIONS",
    headers: { origin: "https://zapp-web-v2.vercel.app" },
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(res.headers.get("access-control-allow-origin") === "https://zapp-web-v2.vercel.app",
    "origem canônica deveria ser ecoada no preflight");
});

Deno.test("status: via withRequestId, gera o id quando o cliente não manda", async () => {
  const res = await withRequestId("status", (req) => handleStatus(req))(
    new Request("https://edge.invalid/status"),
  );
  const gerado = res.headers.get("x-request-id");
  assert(gerado !== null && gerado.length > 0, "withRequestId não gerou o id");
  const body = await res.json();
  assert(body.requestId === gerado, `corpo e cabeçalho divergiram: ${body.requestId} vs ${gerado}`);
});
