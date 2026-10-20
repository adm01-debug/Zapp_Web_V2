// IA-014 (lote B) — comportamento em RUNTIME da autorização por objeto.
//
// O teste do lote A só cobria rejeições anteriores ao banco (400 sem messageId,
// 404 para id malformado, 401 sem Bearer). A verificação adversarial do lote B
// mostrou que isso deixa o caminho central sem prova: "mensagem invisível (RLS
// devolve zero linhas) → não transcreve" e "mensagem visível → a media_url do
// registro é a fonte do objeto".
//
// Aqui o cliente Supabase é exercitado com um `fetch` de mentira: prova as duas
// coisas SEM banco e SEM rede — inclusive que a requisição carrega o JWT DO
// CHAMADOR, que é o que faz a RLS de `messages` responder como ele.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertMessageVisibleToCaller } from "../ai-audio-authz.ts";

const MSG_ID = "11111111-2222-3333-4444-555555555555";
const CALLER_JWT = "jwt-do-chamador-de-teste";
const MEDIA_URL =
  "https://projeto.supabase.co/storage/v1/object/public/audio-messages/audio/a.ogg";

interface Captura {
  url: string;
  authorization: string | null;
  apikey: string | null;
}

function comFetchFalso(resposta: () => Response): { capturas: Captura[]; restaurar: () => void } {
  const capturas: Captura[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const req = new Request(url, init);
    capturas.push({
      url: req.url,
      authorization: req.headers.get("authorization"),
      apikey: req.headers.get("apikey"),
    });
    return Promise.resolve(resposta());
  }) as typeof fetch;
  return { capturas, restaurar: () => { globalThis.fetch = original; } };
}

const comJson = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });

function pedidoDoChamador(): Request {
  return new Request("https://projeto.supabase.co/functions/v1/ai-transcribe-audio", {
    method: "POST",
    headers: { authorization: `Bearer ${CALLER_JWT}` },
  });
}

function prepararAmbiente() {
  Deno.env.set("SUPABASE_URL", "https://projeto.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key-publica");
}

Deno.test("IA-014: mensagem invisível (RLS devolve zero linhas) não transcreve", async () => {
  prepararAmbiente();
  const { capturas, restaurar } = comFetchFalso(() => comJson([]));
  try {
    const r = await assertMessageVisibleToCaller(pedidoDoChamador(), MSG_ID);
    assertEquals(r.ok, false);
    if (!r.ok) assertEquals(r.status, 404);
  } finally {
    restaurar();
  }

  assertEquals(capturas.length, 1, "esperava exatamente uma consulta ao banco");
  const consulta = capturas[0];
  // Sem o JWT do chamador a consulta não é a dele — a RLS não teria como negar.
  assertEquals(consulta.authorization, `Bearer ${CALLER_JWT}`);
  assertEquals(consulta.apikey, "anon-key-publica");
  assertEquals(consulta.url.includes("/rest/v1/messages"), true, consulta.url);
  assertEquals(consulta.url.includes(MSG_ID), true, consulta.url);
});

Deno.test("IA-014: mensagem visível devolve a media_url do registro (fonte do objeto)", async () => {
  prepararAmbiente();
  const { restaurar } = comFetchFalso(() => comJson([{ id: MSG_ID, media_url: MEDIA_URL }]));
  try {
    const r = await assertMessageVisibleToCaller(pedidoDoChamador(), MSG_ID);
    assertEquals(r.ok, true);
    if (r.ok) assertEquals(r.mediaUrl, MEDIA_URL);
  } finally {
    restaurar();
  }
});

Deno.test("IA-014: media_url nula vira null (o handler decide o que fazer)", async () => {
  prepararAmbiente();
  const { restaurar } = comFetchFalso(() => comJson([{ id: MSG_ID, media_url: null }]));
  try {
    const r = await assertMessageVisibleToCaller(pedidoDoChamador(), MSG_ID);
    assertEquals(r.ok, true);
    if (r.ok) assertEquals(r.mediaUrl, null);
  } finally {
    restaurar();
  }
});

Deno.test("IA-014: falha do banco não vira 'sem permissão'", async () => {
  prepararAmbiente();
  const { restaurar } = comFetchFalso(() => comJson({ message: "boom" }, 500));
  try {
    const r = await assertMessageVisibleToCaller(pedidoDoChamador(), MSG_ID);
    assertEquals(r.ok, false);
    if (!r.ok) assertEquals(r.status, 500);
  } finally {
    restaurar();
  }
});

Deno.test("IA-014: sem messageId e sem Bearer nem chega ao banco", async () => {
  prepararAmbiente();
  const { capturas, restaurar } = comFetchFalso(() => comJson([]));
  try {
    const semId = await assertMessageVisibleToCaller(pedidoDoChamador(), undefined);
    assertEquals(semId.ok, false);
    if (!semId.ok) assertEquals(semId.status, 400);

    const semBearer = await assertMessageVisibleToCaller(
      new Request("https://projeto.supabase.co/functions/v1/ai-transcribe-audio", { method: "POST" }),
      MSG_ID,
    );
    assertEquals(semBearer.ok, false);
    if (!semBearer.ok) assertEquals(semBearer.status, 401);
  } finally {
    restaurar();
  }
  assertEquals(capturas.length, 0, "nada deveria ter ido ao banco");
});
