/**
 * SL-190 — eventos TYPEBOT_* (`typebot.start`, `typebot.change.status`).
 *
 * Lacuna do inventário (docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv:445,
 * fonte docs/WEBHOOK_EVENTS.md): "Sem handler Typebot em evolution-webhook".
 * A Evolution está configurada a enviar os dois eventos
 * (`evolution-api` set-webhook registra `TYPEBOT_START`/`TYPEBOT_CHANGE_STATUS`)
 * e o roteador não tinha ramo para eles: o evento chegava, ganhava 200 e era
 * descartado sem nenhum efeito.
 *
 * Este arquivo prova as duas metades da correção:
 *
 *   1) O COMPORTAMENTO — `handleTypebotEvent` grava a transição da sessão do
 *      Typebot do contato em `conversation_events` (a trilha da conversa que já
 *      registra atribuição, transferência e encerramento), e NÃO grava nada
 *      quando o JID não tem telefone real, quando o status está fora do
 *      vocabulário documentado, quando a instância não tem conexão ou quando o
 *      contato não existe. Dublê de client: nenhum banco, nenhuma rede.
 *
 *   2) O DESPACHO — o roteador REAL (`handleEvolutionWebhook`) recebe um POST
 *      `typebot.start` e a escrita tem de aparecer; um evento fora do ramo não
 *      pode escrever. Supabase FALSO em 127.0.0.1 (mesmo desenho de
 *      `evolution-webhook-event-coverage.test.ts`), sem banco nem instância de
 *      produção. Fixtures sintéticas e anonimizadas.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-typebot-events.test.ts
 */

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { handleEvolutionWebhook } from "../../evolution-webhook/index.ts";
import { handleTypebotEvent } from "../evolution-webhook-handlers.ts";
import { invalidateConnectionCache } from "../evolution-helpers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

const CONEXAO = { id: "conn-wa-1" };
const CONTATO = { id: "contato-1", name: "Cliente", avatar_url: null, assigned_to: null };
/** Número de exemplo, nunca de cliente. */
const JID = "5511988887777@s.whatsapp.net";

interface InsertCall {
  tabela: string;
  valores: Record<string, unknown>;
}

/**
 * Dublê do client PostgREST: devolve conexão/contato por tabela, espiona o
 * `insert` e registra um erro forçável para exercitar o ramo de falha.
 */
function makeStubClient(
  opts: { conexao?: unknown; contato?: unknown; erroInsert?: { message: string; code?: string } | null } = {},
) {
  const inserts: InsertCall[] = [];
  const client = {
    from(tabela: string) {
      const resultado =
        tabela === "whatsapp_connections"
          ? { data: opts.conexao === undefined ? CONEXAO : opts.conexao, error: null }
          : tabela === "contacts"
            ? { data: opts.contato === undefined ? CONTATO : opts.contato, error: null }
            : { data: null, error: null };
      const chain: Record<string, unknown> = {};
      const resolve = () => Promise.resolve(resultado);
      for (const metodo of ["select", "eq", "neq", "in", "limit", "order", "update", "delete", "upsert"]) {
        chain[metodo] = () => chain;
      }
      chain.insert = (valores: unknown) => {
        inserts.push({ tabela, valores: valores as Record<string, unknown> });
        return Promise.resolve({ data: null, error: opts.erroInsert ?? null });
      };
      chain.maybeSingle = resolve;
      chain.single = resolve;
      chain.then = (onFulfilled: (valor: unknown) => unknown) => resolve().then(onFulfilled);
      return chain;
    },
  } as unknown as EvolutionDbClient;
  return { client, inserts };
}

function metadadosDaSessao(insert: InsertCall): Record<string, unknown> {
  return insert.valores.metadata as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1) Comportamento do handler
// ---------------------------------------------------------------------------

Deno.test("SL-190 typebot.start grava a sessão do contato como 'opened' em conversation_events", async () => {
  const { client, inserts } = makeStubClient();

  await handleTypebotEvent(client, "inst-1", { remoteJid: JID, typebotId: "bot-do-cliente" }, "typebot.start");

  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].tabela, "conversation_events");
  assertEquals(inserts[0].valores.contact_id, CONTATO.id);
  assertEquals(inserts[0].valores.event_type, "bot_session");
  const meta = metadadosDaSessao(inserts[0]);
  // TYPEBOT_START não traz status; a sessão começa aberta.
  assertEquals(meta.session_status, "opened");
  assertEquals(meta.source, "typebot");
  assertEquals(meta.provider_event, "typebot.start");
  assertEquals(meta.typebot_id, "bot-do-cliente");
});

Deno.test("SL-190 typebot.change.status grava o status do vocabulário documentado (opened/paused/closed)", async () => {
  for (const status of ["opened", "paused", "closed"]) {
    const { client, inserts } = makeStubClient();

    await handleTypebotEvent(client, "inst-1", { remoteJid: JID, status }, "typebot.change.status");

    assertEquals(inserts.length, 1, `status '${status}' deveria gravar`);
    assertEquals(metadadosDaSessao(inserts[0]).session_status, status);
    assertEquals(metadadosDaSessao(inserts[0]).provider_event, "typebot.change.status");
  }
});

Deno.test("SL-190 status fora do vocabulário NÃO é gravado cru", async () => {
  const { client, inserts } = makeStubClient();

  await handleTypebotEvent(client, "inst-1", { remoteJid: JID, status: "finalizado" }, "typebot.change.status");

  assertEquals(inserts.length, 0);
});

Deno.test("SL-190 evento sem remoteJid não grava nada", async () => {
  const { client, inserts } = makeStubClient();

  await handleTypebotEvent(client, "inst-1", {}, "typebot.start");

  assertEquals(inserts.length, 0);
});

Deno.test("SL-190 JID sem telefone real (@lid) não grava nada", async () => {
  const { client, inserts } = makeStubClient();

  await handleTypebotEvent(client, "inst-1", { remoteJid: "1234567890@lid", status: "opened" }, "typebot.change.status");

  assertEquals(inserts.length, 0);
});

Deno.test("SL-190 instância sem conexão não grava nada", async () => {
  const { client, inserts } = makeStubClient({ conexao: null });

  await handleTypebotEvent(client, "inst-sem-conexao", { remoteJid: JID, status: "opened" }, "typebot.change.status");

  assertEquals(inserts.length, 0);
});

Deno.test("SL-190 contato inexistente não grava e não cria contato", async () => {
  const { client, inserts } = makeStubClient({ contato: null });

  await handleTypebotEvent(client, "inst-1", { remoteJid: JID, status: "opened" }, "typebot.change.status");

  assertEquals(inserts.length, 0);
});

Deno.test("SL-190 falha ao persistir não é engolida (fail-closed: webhook devolve 500 e o provedor reprocessa)", async () => {
  const { client } = makeStubClient({ erroInsert: { message: "boom", code: "08006" } });

  await assertRejects(
    () => handleTypebotEvent(client, "inst-1", { remoteJid: JID, status: "opened" }, "typebot.change.status"),
    Error,
    "Unable to persist typebot session event",
  );
});

// ---------------------------------------------------------------------------
// 2) O roteador REAL despacha typebot.* (Supabase falso, sem banco real)
// ---------------------------------------------------------------------------

interface RequisicaoRegistrada {
  metodo: string;
  caminho: string;
  valores: Record<string, unknown> | null;
}

function iniciarSupabaseFalso() {
  const requisicoes: RequisicaoRegistrada[] = [];
  const servidor = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const url = new URL(req.url);
    let valores: Record<string, unknown> | null = null;
    if (req.method === "POST") {
      const texto = await req.text();
      try {
        const bruto = JSON.parse(texto);
        valores = Array.isArray(bruto) ? (bruto[0] as Record<string, unknown>) : (bruto as Record<string, unknown>);
      } catch {
        valores = null;
      }
    }
    requisicoes.push({ metodo: req.method, caminho: `${url.pathname}${url.search}`, valores });
    // PostgREST falso: conexão e contato existem (para o handler passar do
    // resolvedor) e a escrita devolve `[]`, como o PostgREST devolve.
    const corpo = url.pathname.endsWith("/whatsapp_connections")
      ? JSON.stringify(CONEXAO)
      : url.pathname.endsWith("/contacts")
        ? JSON.stringify(CONTATO)
        : "[]";
    return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
  });
  const porta = (servidor.addr as Deno.NetAddr).port;
  return {
    url: `http://127.0.0.1:${porta}`,
    requisicoes,
    parar: () => servidor.shutdown(),
  };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave);
    else Deno.env.set(chave, valor);
  }
  return fn().finally(() => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave);
      else Deno.env.set(chave, valor);
    }
  });
}

Deno.test("SL-190 roteador real: typebot.start chega ao handler e escreve; evento fora do ramo não escreve", async () => {
  const falso = iniciarSupabaseFalso();
  const token = "tok-sl190-do-teste";
  const envio = (evento: string, data: Record<string, unknown>) =>
    new Request("http://localhost/functions/v1/evolution-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: evento, instance: `INST-SL190-${evento}`, instanceToken: token, data }),
    });
  const gravacoesDeSessao = () =>
    falso.requisicoes.filter((r) => r.metodo === "POST" && r.caminho.includes("/conversation_events"));

  try {
    await withEnv(
      {
        SUPABASE_URL: falso.url,
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-local",
        EVOLUTION_INSTANCE_TOKEN: token,
        EVOLUTION_WEBHOOK_SECRET: undefined,
        WEBHOOK_SECRET: undefined,
        EVOLUTION_WEBHOOK_ENFORCE: undefined,
      },
      async () => {
        // Ramo novo: o evento tem de atravessar o roteador e gravar a sessão.
        invalidateConnectionCache();
        const inicio = await handleEvolutionWebhook(envio("typebot.start", { remoteJid: JID, typebotId: "bot-1" }));
        assertEquals(inicio.status, 200);

        const gravadas = gravacoesDeSessao();
        assertEquals(gravadas.length, 1, "typebot.start não chegou ao handler (nenhuma escrita de sessão)");
        assertEquals(gravadas[0].valores?.event_type, "bot_session");
        assertEquals((gravadas[0].valores?.metadata as Record<string, unknown>)?.session_status, "opened");

        // Controle negativo: um evento que não é do ramo não pode escrever.
        invalidateConnectionCache();
        const desconhecido = await handleEvolutionWebhook(
          envio("evento.fora.do.ramo", { remoteJid: JID, status: "opened" }),
        );
        assertEquals(desconhecido.status, 200);
        assertEquals(gravacoesDeSessao().length, 1, "evento fora do ramo escreveu na trilha da conversa");
      },
    );
  } finally {
    await falso.parar();
  }
});

Deno.test("SL-190 roteador real: typebot.change.status grava o status recebido", async () => {
  const falso = iniciarSupabaseFalso();
  const token = "tok-sl190-do-teste";
  try {
    await withEnv(
      {
        SUPABASE_URL: falso.url,
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-local",
        EVOLUTION_INSTANCE_TOKEN: token,
        EVOLUTION_WEBHOOK_SECRET: undefined,
        WEBHOOK_SECRET: undefined,
        EVOLUTION_WEBHOOK_ENFORCE: undefined,
      },
      async () => {
        invalidateConnectionCache();
        const res = await handleEvolutionWebhook(
          new Request("http://localhost/functions/v1/evolution-webhook", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              event: "typebot.change.status",
              instance: "INST-SL190-CHANGE",
              instanceToken: token,
              data: { remoteJid: JID, status: "closed" },
            }),
          }),
        );
        assertEquals(res.status, 200);
        const gravadas = falso.requisicoes.filter(
          (r) => r.metodo === "POST" && r.caminho.includes("/conversation_events"),
        );
        assertEquals(gravadas.length, 1);
        assertEquals((gravadas[0].valores?.metadata as Record<string, unknown>)?.session_status, "closed");
      },
    );
  } finally {
    await falso.parar();
  }
});
