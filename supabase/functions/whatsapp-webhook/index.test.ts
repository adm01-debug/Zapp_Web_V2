// t_2174883b (R2-API-019) — webhook oficial da Meta/WhatsApp Cloud.
//
// Antes da correção: `value.messages` era só percorrido para log (entrada nunca
// persistida) e `value.statuses` fazia UPDATE cego por `external_id`, sem
// correlação com a conta (phone_number_id) e sem guarda monotônica — um `sent`
// tardio rebaixava `read`.
//
// O que estes testes travam (chamam o handler REAL, com HMAC válido, contra um
// PostgREST falso por rota que registra método+URL+corpo):
//   (a) inbound de texto de conta conhecida -> POST em rpc/ingest_inbound_message;
//   (b) a MESMA fixture entregue 2x -> 2 chamadas ao RPC com o mesmo p_external_id
//       (a deduplicação real é do banco: ux_messages_dedup);
//   (c) `read` seguido de `sent` atrasado -> um único PATCH (o `sent` não rebaixa);
//   (d) status de phone_number_id sem linha em channel_connections -> ZERO PATCH, 400;
//   (e) inbound sem metadata/phone_number_id -> ZERO RPC, resposta != 200;
//   (f) RPC devolvendo erro -> resposta 500 (nunca 200 dizendo sucesso);
//   (g) text.body vazio ou só espaços -> p_content cai no placeholder
//       `[mensagem <type>]` (string vazia não é nullish);
//   (h) `from` sem nenhum dígito -> ZERO POST no RPC (não cria contato com
//       telefone vazio) e resposta != 200 (evento não atribuído).
//   (i) contato sem `profile.name` (ou sem `profile`) -> a entrada É
//       persistida com p_push_name nulo; o lote não pode ser descartado por
//       causa de um nome de perfil que a Meta não manda.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/whatsapp-webhook/index.test.ts

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWhatsappWebhook } from "./index.ts";

// ---------------------------------------------------------------------------
// helpers (withEnv/metaSign copiados de _shared/__tests__/webhook-auth-gates.test.ts)
// ---------------------------------------------------------------------------

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
  }
  const restaurar = () => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
    }
  };
  const resultado = fn();
  if (resultado instanceof Promise) return resultado.finally(restaurar);
  restaurar();
}

const encode = (s: string) => new TextEncoder().encode(s);

async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, encode(payload));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const metaSign = async (payload: string, secret: string) => `sha256=${await hmacSha256Hex(payload, secret)}`;

const WA_URL = "http://localhost/functions/v1/whatsapp-webhook";
const SECRET = "app-secret";
const ENV = {
  WHATSAPP_APP_SECRET: SECRET,
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
};

const postAssinado = async (body: string) =>
  new Request(WA_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": await metaSign(body, SECRET) },
    body,
  });

// ---------------------------------------------------------------------------
// PostgREST falso por rota. Filtra como o PostgREST de verdade (eq.<valor>),
// então uma consulta SEM o escopo exigido volta vazia e o teste falha.
// ---------------------------------------------------------------------------

interface Chamada {
  method: string;
  path: string;
  url: string;
  body: unknown;
}

interface LinhaMensagem {
  id: string;
  status: string | null;
  external_id: string;
  whatsapp_connection_id: string;
  sender: string;
}

interface LinhaChannelConnection {
  channel_type: string;
  external_account_id: string;
  whatsapp_connection_id: string | null;
}

interface ConfigDb {
  channelConnections: LinhaChannelConnection[];
  messages: LinhaMensagem[];
  rpcStatus?: number;
}

const eqParam = (u: URL, key: string): string | null => {
  const v = u.searchParams.get(key);
  return v !== null && v.startsWith("eq.") ? v.slice(3) : null;
};

function installFakeDb(config: ConfigDb) {
  const original = globalThis.fetch;
  const calls: Chamada[] = [];

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const u = new URL(url);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ method, path: u.pathname, url, body });

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

    if (u.pathname === "/rest/v1/channel_connections" && method === "GET") {
      const conta = eqParam(u, "external_account_id");
      const canal = eqParam(u, "channel_type");
      return Promise.resolve(json(config.channelConnections.filter((r) =>
        (conta === null || r.external_account_id === conta) &&
        (canal === null || r.channel_type === canal)
      )));
    }

    if (u.pathname === "/rest/v1/messages" && method === "GET") {
      const ext = eqParam(u, "external_id");
      const conn = eqParam(u, "whatsapp_connection_id");
      const sender = eqParam(u, "sender");
      const rows = config.messages.filter((m) =>
        (ext === null || m.external_id === ext) &&
        (conn === null || m.whatsapp_connection_id === conn) &&
        (sender === null || m.sender === sender)
      );
      return Promise.resolve(json(rows.map(({ id, status }) => ({ id, status }))));
    }

    if (u.pathname === "/rest/v1/messages" && method === "PATCH") {
      const id = eqParam(u, "id");
      const row = config.messages.find((m) => m.id === id);
      if (row && body && typeof body === "object") Object.assign(row, body);
      return Promise.resolve(json([]));
    }

    if (u.pathname === "/rest/v1/rpc/ingest_inbound_message" && method === "POST") {
      if (config.rpcStatus && config.rpcStatus >= 400) {
        return Promise.resolve(json({ code: "P0001", message: "ingest_inbound_message falhou", details: null, hint: null }, config.rpcStatus));
      }
      return Promise.resolve(json([{
        contact_id: "c0ffee00-0000-4000-8000-000000000001",
        contact_name: "Maria",
        assigned_to: null,
        avatar_url: null,
        contact_created: true,
        message_id: "c0ffee00-0000-4000-8000-000000000002",
        outcome: "inserted",
      }]));
    }

    return Promise.resolve(json({ error: "rota nao stubada" }, 599));
  }) as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = original; } };
}

const rpcCalls = (calls: Chamada[]) =>
  calls.filter((c) => c.method === "POST" && c.path === "/rest/v1/rpc/ingest_inbound_message");
const patchCalls = (calls: Chamada[]) =>
  calls.filter((c) => c.method === "PATCH" && c.path === "/rest/v1/messages");
const getMessageCalls = (calls: Chamada[]) =>
  calls.filter((c) => c.method === "GET" && c.path === "/rest/v1/messages");

// ---------------------------------------------------------------------------
// fixtures do envelope da Meta
// ---------------------------------------------------------------------------

const PHONE_NUMBER_ID = "900123456789012";
const CONN_ID = "11111111-2222-4333-8444-555555555555";
const CONN_ROW: LinhaChannelConnection = {
  channel_type: "whatsapp",
  external_account_id: PHONE_NUMBER_ID,
  whatsapp_connection_id: CONN_ID,
};

const envelopeInbound = () =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5511999990000", phone_number_id: PHONE_NUMBER_ID },
          contacts: [{ profile: { name: "Maria Silva" }, wa_id: "5511987654321" }],
          messages: [{
            from: "5511987654321",
            id: "wamid.INBOUND-1",
            timestamp: "1728000000",
            type: "text",
            text: { body: "oi, tudo bem?" },
          }],
        },
      }],
    }],
  });

const envelopeStatus = (status: string, phoneNumberId = PHONE_NUMBER_ID) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
          statuses: [{ id: "wamid.SENT-1", status, timestamp: "1728000001", recipient_id: "5511987654321" }],
        },
      }],
    }],
  });

// ---------------------------------------------------------------------------
// casos
// ---------------------------------------------------------------------------

Deno.test("(a) inbound de texto de conta conhecida chama ingest_inbound_message e responde 200", async () => {
  await withEnv(ENV, async () => {
    const db = installFakeDb({ channelConnections: [CONN_ROW], messages: [] });
    try {
      const res = await handleWhatsappWebhook(await postAssinado(envelopeInbound()));
      assertEquals(res.status, 200);
      const body = await res.json() as { success: boolean; ingested: number };
      assertEquals(body.success, true);
      assertEquals(body.ingested, 1);

      const rpc = rpcCalls(db.calls);
      assertEquals(rpc.length, 1, `esperava 1 POST no RPC, vieram ${rpc.length}`);
      const args = rpc[0].body as Record<string, unknown>;
      assertEquals(args.p_external_id, "wamid.INBOUND-1");
      assertEquals(args.p_connection_id, CONN_ID);
      assertEquals(args.p_content, "oi, tudo bem?");
      assertEquals(args.p_phone, "5511987654321");
      assertEquals(args.p_push_name, "Maria Silva");

      const lookups = db.calls.filter((c) => c.method === "GET" && c.path === "/rest/v1/channel_connections");
      assert(
        lookups.some((c) => c.url.includes(`external_account_id=eq.${PHONE_NUMBER_ID}`)),
        "a correlação tem de filtrar channel_connections pelo phone_number_id do envelope",
      );
    } finally {
      db.restore();
    }
  });
});

Deno.test("(b) a mesma fixture entregue 2x chama o RPC com o mesmo p_external_id e ambas respondem 200", async () => {
  await withEnv(ENV, async () => {
    const db = installFakeDb({ channelConnections: [CONN_ROW], messages: [] });
    try {
      const corpo = envelopeInbound();
      const res1 = await handleWhatsappWebhook(await postAssinado(corpo));
      const res2 = await handleWhatsappWebhook(await postAssinado(corpo));
      assertEquals(res1.status, 200);
      assertEquals(res2.status, 200);

      const rpc = rpcCalls(db.calls);
      assertEquals(rpc.length, 2, `esperava 2 chamadas ao RPC, vieram ${rpc.length}`);
      const ids = rpc.map((c) => (c.body as Record<string, unknown>).p_external_id);
      assertEquals(ids, ["wamid.INBOUND-1", "wamid.INBOUND-1"]);
    } finally {
      db.restore();
    }
  });
});

Deno.test("(c) read seguido de sent atrasado gera um único PATCH com status read (monotônico + escopo de conexão)", async () => {
  await withEnv(ENV, async () => {
    const db = installFakeDb({
      channelConnections: [CONN_ROW],
      messages: [{
        id: "msg-1",
        status: "delivered",
        external_id: "wamid.SENT-1",
        whatsapp_connection_id: CONN_ID,
        sender: "agent",
      }],
    });
    try {
      const resRead = await handleWhatsappWebhook(await postAssinado(envelopeStatus("read")));
      assertEquals(resRead.status, 200);
      const resSent = await handleWhatsappWebhook(await postAssinado(envelopeStatus("sent")));
      assertEquals(resSent.status, 200);

      const patches = patchCalls(db.calls);
      assertEquals(patches.length, 1, `esperava 1 PATCH (o read), vieram ${patches.length}`);
      assertEquals((patches[0].body as Record<string, unknown>).status, "read");
      assert(patches[0].url.includes("id=eq.msg-1"), "o PATCH tem de mirar a linha pelo id, não por external_id");

      const lookups = getMessageCalls(db.calls);
      assert(
        lookups.every((c) =>
          c.url.includes(`whatsapp_connection_id=eq.${CONN_ID}`) &&
          c.url.includes("sender=eq.agent") &&
          c.url.includes("external_id=eq.wamid.SENT-1")
        ),
        "a busca da mensagem alvo tem de ter escopo de conexão, sender=agent e external_id",
      );
    } finally {
      db.restore();
    }
  });
});

Deno.test("(d) status com phone_number_id de outra conta (sem channel_connections) não gera PATCH e responde 400", async () => {
  await withEnv(ENV, async () => {
    const db = installFakeDb({
      channelConnections: [CONN_ROW], // só existe a conta PHONE_NUMBER_ID
      messages: [{
        id: "msg-1",
        status: "delivered",
        external_id: "wamid.SENT-1",
        whatsapp_connection_id: CONN_ID,
        sender: "agent",
      }],
    });
    try {
      const res = await handleWhatsappWebhook(await postAssinado(envelopeStatus("read", "999-outra-conta")));
      assertEquals(res.status, 400);
      assertEquals(patchCalls(db.calls).length, 0, "evento de conta desconhecida não pode tocar messages");
      assertEquals(getMessageCalls(db.calls).length, 0, "sem atribuição de conta nem se busca a mensagem");
    } finally {
      db.restore();
    }
  });
});

Deno.test("(e) inbound sem metadata/phone_number_id não chama o RPC e responde != 200", async () => {
  await withEnv(ENV, async () => {
    const db = installFakeDb({ channelConnections: [CONN_ROW], messages: [] });
    try {
      const semMetadata = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          id: "waba-1",
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ profile: { name: "Maria" }, wa_id: "5511987654321" }],
              messages: [{
                from: "5511987654321",
                id: "wamid.SEM-CONTA",
                timestamp: "1728000000",
                type: "text",
                text: { body: "sem conta" },
              }],
            },
          }],
        }],
      });
      const res = await handleWhatsappWebhook(await postAssinado(semMetadata));
      assertNotEquals(res.status, 200);
      assertEquals(rpcCalls(db.calls).length, 0, "sem phone_number_id nada pode ser persistido");
    } finally {
      db.restore();
    }
  });
});

Deno.test("(f) ingest_inbound_message devolvendo erro propaga como 500 (nunca 200 dizendo sucesso)", async () => {
  await withEnv(ENV, async () => {
    const db = installFakeDb({ channelConnections: [CONN_ROW], messages: [], rpcStatus: 400 });
    try {
      const res = await handleWhatsappWebhook(await postAssinado(envelopeInbound()));
      assertEquals(res.status, 500);
      const body = await res.json() as { error?: string };
      assert(body.error !== undefined, `esperava corpo de erro, veio ${JSON.stringify(body)}`);
    } finally {
      db.restore();
    }
  });
});

Deno.test("(g) text.body vazio ou só espaços grava o placeholder [mensagem text] em p_content", async () => {
  await withEnv(ENV, async () => {
    const db = installFakeDb({ channelConnections: [CONN_ROW], messages: [] });
    try {
      const corpo = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          id: "waba-1",
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5511999990000", phone_number_id: PHONE_NUMBER_ID },
              messages: [
                { from: "5511987654321", id: "wamid.VAZIO-1", timestamp: "1728000000", type: "text", text: { body: "" } },
                { from: "5511987654321", id: "wamid.VAZIO-2", timestamp: "1728000001", type: "text", text: { body: "   " } },
              ],
            },
          }],
        }],
      });
      const res = await handleWhatsappWebhook(await postAssinado(corpo));
      assertEquals(res.status, 200);

      const rpc = rpcCalls(db.calls);
      assertEquals(rpc.length, 2, `esperava 2 POSTs no RPC, vieram ${rpc.length}`);
      for (const call of rpc) {
        assertEquals(
          (call.body as Record<string, unknown>).p_content,
          "[mensagem text]",
          "body vazio ou só espaços tem de cair no placeholder, não gravar content=''",
        );
      }
    } finally {
      db.restore();
    }
  });
});

Deno.test("(h) from sem nenhum dígito não chama o RPC e responde != 200 (evento não atribuído)", async () => {
  await withEnv(ENV, async () => {
    const db = installFakeDb({ channelConnections: [CONN_ROW], messages: [] });
    try {
      const corpo = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          id: "waba-1",
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5511999990000", phone_number_id: PHONE_NUMBER_ID },
              messages: [
                { from: "wa-contact", id: "wamid.SEM-FONE", timestamp: "1728000000", type: "text", text: { body: "oi" } },
              ],
            },
          }],
        }],
      });
      const res = await handleWhatsappWebhook(await postAssinado(corpo));
      assertNotEquals(res.status, 200, "telefone vazio trata o evento como não atribuído");
      assertEquals(rpcCalls(db.calls).length, 0, "sem telefone não pode criar contato com p_phone vazio");
    } finally {
      db.restore();
    }
  });
});

Deno.test("(i) contato sem profile.name (ou sem profile) não descarta o lote: a entrada é persistida", async () => {
  // A Meta manda `contacts[].profile.name` só quando existe. Exigir o nome no
  // schema derrubava o payload INTEIRO para o ramo "Invalid payload format"
  // (200 + warning), perdendo a mensagem sem gravar nada — o mesmo defeito do
  // cartão (confirma a entrada sem persistir).
  const contatos = [
    { wa_id: "5511987654321", profile: {} },
    { wa_id: "5511987654321" },
  ];
  for (const contact of contatos) {
    await withEnv(ENV, async () => {
      const db = installFakeDb({ channelConnections: [CONN_ROW], messages: [] });
      try {
        const corpo = JSON.stringify({
          object: "whatsapp_business_account",
          entry: [{
            id: "waba-1",
            changes: [{
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999990000", phone_number_id: PHONE_NUMBER_ID },
                contacts: [contact],
                messages: [
                  { from: "5511987654321", id: "wamid.SEM-NOME", timestamp: "1728000000", type: "text", text: { body: "oi" } },
                ],
              },
            }],
          }],
        });
        const res = await handleWhatsappWebhook(await postAssinado(corpo));
        assertEquals(
          res.status,
          200,
          `contato sem profile.name não é payload inválido (contato=${JSON.stringify(contact)})`,
        );
        const rpc = rpcCalls(db.calls);
        assertEquals(rpc.length, 1, "a mensagem tem de ser persistida mesmo sem profile.name");
        assertEquals((rpc[0].body as Record<string, unknown>).p_phone, "5511987654321");
        assertEquals(
          (rpc[0].body as Record<string, unknown>).p_push_name,
          null,
          "sem profile.name o push_name vai nulo e o RPC cai no telefone",
        );
      } finally {
        db.restore();
      }
    });
  }
});
