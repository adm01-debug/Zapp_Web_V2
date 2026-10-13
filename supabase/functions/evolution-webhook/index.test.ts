/**
 * evolution-webhook — certeza de que uma falha no ingest da mensagem recebida
 * NÃO termina em perda silenciosa:
 *
 *   - falha TRANSITÓRIA (ex.: conexão caiu) → 5xx, para o provedor reenviar, E o
 *     evento fica na dead-letter (`webhook_failures`) com o payload truncado;
 *   - falha PERMANENTE (payload inválido no banco, ex.: 22001) → 200, porque
 *     reenviar não muda o resultado, e o evento fica na dead-letter;
 *   - sucesso → 200 sem tocar a dead-letter.
 *
 * Banco FALSO em 127.0.0.1 (nenhuma rede fora de loopback, nenhum banco real).
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-webhook/index.test.ts
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { handleEvolutionWebhook } from "./index.ts";
import { invalidateConnectionCache } from "../_shared/evolution-helpers.ts";

const TELEFONE = "5511988887777";
const JID = `${TELEFONE}@s.whatsapp.net`;
const TOKEN = "tok-dead-letter-teste";

interface Requisicao {
  metodo: string;
  caminho: string;
  corpo: string;
}

interface FakeOpts {
  /** Erro devolvido pela RPC `ingest_inbound_message` (null = sucesso). */
  rpcErro?: { code: string; message: string } | null;
}

const TX_OK = [{
  contact_id: "contato-1",
  contact_name: "Contato Sintético",
  assigned_to: null,
  // Avatar fora do CDN do WhatsApp: evita a chamada externa de foto no meio do teste.
  avatar_url: "https://sintetico.exemplo.invalid/avatar.png",
  contact_created: false,
  message_id: "mensagem-1",
  // `duplicate` faz o handler encerrar logo depois do ingest.
  outcome: "duplicate",
}];

function iniciarSupabaseFalso(opts: FakeOpts = {}) {
  const requisicoes: Requisicao[] = [];
  const servidor = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const url = new URL(req.url);
    const corpo = req.method === "GET" ? "" : await req.text();
    requisicoes.push({ metodo: req.method, caminho: `${url.pathname}${url.search}`, corpo });
    const cabecalhos = { "content-type": "application/json" };

    if (url.pathname.includes("/rest/v1/rpc/ingest_inbound_message")) {
      if (opts.rpcErro) {
        return new Response(
          JSON.stringify({ code: opts.rpcErro.code, message: opts.rpcErro.message, details: null, hint: null }),
          { status: 500, headers: cabecalhos },
        );
      }
      return new Response(JSON.stringify(TX_OK), { status: 200, headers: cabecalhos });
    }
    if (url.pathname.includes("/rest/v1/whatsapp_connections")) {
      // `maybeSingle()` pede um objeto único (Accept: application/vnd.pgrst.object+json).
      return new Response(JSON.stringify({ id: "conexao-1" }), { status: 200, headers: cabecalhos });
    }
    if (url.pathname.includes("/rest/v1/webhook_failures")) {
      return new Response("", { status: 201, headers: cabecalhos });
    }
    return new Response(req.method === "GET" ? "null" : "[]", { status: 200, headers: cabecalhos });
  });

  const porta = (servidor.addr as Deno.NetAddr).port;
  return {
    url: `http://127.0.0.1:${porta}`,
    requisicoes,
    parar: () => servidor.shutdown(),
  };
}

async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const antes = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    antes.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave);
    else Deno.env.set(chave, valor);
  }
  try {
    await fn();
  } finally {
    for (const [chave, valor] of antes) {
      if (valor === undefined) Deno.env.delete(chave);
      else Deno.env.set(chave, valor);
    }
  }
}

function corpoDaMensagem() {
  return JSON.stringify({
    event: "messages.upsert",
    instance: "INST-DEAD-LETTER",
    instanceToken: TOKEN,
    data: {
      messages: [{
        key: { id: "MSG-DEAD-1", remoteJid: JID, fromMe: false },
        message: { conversation: "oi" },
        pushName: "Contato Sintético",
        messageTimestamp: 1730000000,
      }],
    },
  });
}

function chamarWebhook(url: string) {
  return handleEvolutionWebhook(
    new Request("http://localhost/functions/v1/evolution-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpoDaMensagem(),
    }),
  );
}

function linhasDaDeadLetter(requisicoes: Requisicao[]): Record<string, unknown>[] {
  return requisicoes
    .filter((r) => r.metodo === "POST" && r.caminho.includes("/rest/v1/webhook_failures"))
    .map((r) => JSON.parse(r.corpo) as Record<string, unknown>)
    // supabase-js manda o insert como objeto; aceita array por segurança.
    .flatMap((linha) => (Array.isArray(linha) ? linha : [linha]));
}

Deno.test("falha transitória no ingest: 503 + evento na dead-letter", async () => {
  const falso = iniciarSupabaseFalso({ rpcErro: { code: "08006", message: "connection failure" } });
  try {
    await withEnv(
      {
        SUPABASE_URL: falso.url,
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-local",
        EVOLUTION_INSTANCE_TOKEN: TOKEN,
        EVOLUTION_WEBHOOK_SECRET: undefined,
        WEBHOOK_SECRET: undefined,
        EVOLUTION_WEBHOOK_ENFORCE: undefined,
      },
      async () => {
        invalidateConnectionCache();
        const res = await chamarWebhook(falso.url);
        assertEquals(res.status, 503, "falha transitória precisa pedir reenvio (5xx)");

        const linhas = linhasDaDeadLetter(falso.requisicoes);
        assertEquals(linhas.length, 1, "o evento precisa ficar na dead-letter");
        const linha = linhas[0];
        assertEquals(linha.endpoint, "evolution-webhook");
        assertEquals(linha.external_id, "MSG-DEAD-1");
        assertEquals(linha.event_type, "messages.upsert");
        assert(
          typeof linha.payload_sha256 === "string" && /^[0-9a-f]{64}$/.test(linha.payload_sha256),
          "payload_sha256 precisa ser o hash do snapshot",
        );
        // O diagnóstico NÃO carrega o telefone; o replay carrega (é o que permite reingressar).
        assert(!JSON.stringify(linha.payload_truncated).includes(TELEFONE));
        assertEquals(
          (linha.replay_payload as Record<string, unknown>).p_external_id,
          "MSG-DEAD-1",
        );
      },
    );
  } finally {
    await falso.parar();
  }
});

Deno.test("falha permanente no ingest: 200 + evento na dead-letter (reenviar não ajuda)", async () => {
  const falso = iniciarSupabaseFalso({ rpcErro: { code: "22001", message: "value too long for type character varying(10)" } });
  try {
    await withEnv(
      {
        SUPABASE_URL: falso.url,
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-local",
        EVOLUTION_INSTANCE_TOKEN: TOKEN,
        EVOLUTION_WEBHOOK_SECRET: undefined,
        WEBHOOK_SECRET: undefined,
        EVOLUTION_WEBHOOK_ENFORCE: undefined,
      },
      async () => {
        invalidateConnectionCache();
        const res = await chamarWebhook(falso.url);
        assertEquals(res.status, 200, "payload inválido não deve gerar reenvio infinito");
        assertEquals(linhasDaDeadLetter(falso.requisicoes).length, 1);
      },
    );
  } finally {
    await falso.parar();
  }
});

Deno.test("ingest OK: 200 sem tocar a dead-letter", async () => {
  const falso = iniciarSupabaseFalso();
  try {
    await withEnv(
      {
        SUPABASE_URL: falso.url,
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-local",
        EVOLUTION_INSTANCE_TOKEN: TOKEN,
        EVOLUTION_WEBHOOK_SECRET: undefined,
        WEBHOOK_SECRET: undefined,
        EVOLUTION_WEBHOOK_ENFORCE: undefined,
      },
      async () => {
        invalidateConnectionCache();
        const res = await chamarWebhook(falso.url);
        assertEquals(res.status, 200);
        assertEquals(linhasDaDeadLetter(falso.requisicoes).length, 0);
      },
    );
  } finally {
    await falso.parar();
  }
});
