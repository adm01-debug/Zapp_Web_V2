/**
 * R2-API-033 (item 207) — contrato executável do ai-auto-tag.
 *
 * Defeito: quando a classificação VALIDADA não trazia etiquetas (`tags: []`, ou
 * todas recusadas pelo contrato/vazias), o handler pulava a RPC
 * `replace_ai_conversation_tags` e as etiquetas de IA ANTIGAS ficavam no
 * contato — a conversa passava a mentir sobre a classificação atual. O RPC já
 * tem a semântica explícita de que array vazio LIMPA as etiquetas de IA
 * ("Resultado vazio tem semântica explícita: LIMPA as etiquetas de IA"), então
 * o handler precisa chamá-lo mesmo sem etiquetas.
 *
 * O teste chama o handler REAL (`handleAiAutoTag`) com um Request real e
 * confere o status, o corpo E o efeito no banco (a RPC chamada). Roda offline,
 * sem rede, sem banco e sem env: tudo entra por `deps`.
 *
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read <este arquivo>
 */
import { handleAiAutoTag, type AiAutoTagDeps } from "./index.ts";
import type { GenerateParams, GenerateResult } from "../_shared/ai-generate.ts";
import type { AutoTagOutput } from "../_shared/ai-response-contracts.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

interface ServiceCtx {
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  tables: string[];
  updates: Array<{ table: string; row: Record<string, unknown> }>;
}

/**
 * Client service_role falso: registra toda RPC (nome + argumentos) e todo
 * acesso de tabela/update. É assim que o teste prova o efeito no banco sem
 * banco nenhum.
 */
function makeServiceClient(): { client: unknown; ctx: ServiceCtx } {
  const ctx: ServiceCtx = { rpcCalls: [], tables: [], updates: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function builder(table: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {};
    const chain = () => b;
    b.select = chain;
    b.eq = chain;
    b.order = chain;
    b.limit = chain;
    b.in = chain;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.update = (row: Record<string, unknown>) => {
      ctx.updates.push({ table, row });
      return b;
    };
    b.insert = () => Promise.resolve({ data: null, error: null });
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(res, rej);
    b.catch = (rej: (e: unknown) => unknown) => Promise.resolve().catch(rej);
    return b;
  }
  return {
    client: {
      from(table: string) {
        ctx.tables.push(table);
        return builder(table);
      },
      rpc(name: string, args: Record<string, unknown>) {
        ctx.rpcCalls.push({ name, args });
        return Promise.resolve({ data: { replaced: true, count: 0 }, error: null });
      },
    },
    ctx,
  };
}

/** Client de escopo do usuário: só responde a checagem de visibilidade do contato. */
function makeAuthedClient(visible: boolean): unknown {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: visible ? { id: CONTACT_ID } : null, error: null }),
        }),
      }),
    }),
  };
}

/** Roteador de IA falso: devolve a classificação que o teste quer. */
function makeGenerate(output: AutoTagOutput): (params: GenerateParams) => Promise<GenerateResult> {
  return () =>
    Promise.resolve({
      ok: true,
      response: new Response("{}", { status: 200 }),
      data: { choices: [{ message: { content: JSON.stringify(output) } }] },
      providerId: null,
      providerName: null,
      model: null,
      durationMs: 0,
      status: "ok",
    });
}

function makeDeps(
  output: AutoTagOutput,
  opts: { visible?: boolean; rpcError?: unknown } = {},
): { deps: AiAutoTagDeps; ctx: ServiceCtx } {
  const service = makeServiceClient();
  if (opts.rpcError !== undefined) {
    (service.client as { rpc: unknown }).rpc = (name: string, args: Record<string, unknown>) => {
      service.ctx.rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: opts.rpcError });
    };
  }
  const deps: AiAutoTagDeps = {
    authorize: () => Promise.resolve({ userId: "user-1" }),
    enforceGuards: () => Promise.resolve(null),
    supabase: service.client,
    authedClient: makeAuthedClient(opts.visible ?? true),
    generate: makeGenerate(output),
    rateLimit: () => ({ allowed: true }),
    clientIp: "127.0.0.1",
    env: (key) => (key === "SUPABASE_URL" ? "https://local.test" : "service-role-key"),
  };
  return { deps, ctx: service.ctx };
}

function makeRequest(body: unknown): Request {
  return new Request("https://edge.test/ai-auto-tag", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

const CONVERSATION = [{ sender: "customer", content: "quero comprar" }];

function replaceCall(ctx: ServiceCtx) {
  return ctx.rpcCalls.find((c) => c.name === "replace_ai_conversation_tags");
}

Deno.test("R2-API-033: classificação válida SEM tags LIMPA as etiquetas de IA antigas (chama a RPC com array vazio)", async () => {
  const { deps, ctx } = makeDeps({ tags: [] });
  const res = await handleAiAutoTag(makeRequest({ contactId: CONTACT_ID, messages: CONVERSATION }), deps);

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const call = replaceCall(ctx);
  assert(call, "a RPC replace_ai_conversation_tags NÃO foi chamada: as etiquetas antigas ficariam no contato");
  assert(call.args.p_contact_id === CONTACT_ID, "a RPC foi chamada com o contato errado");
  assert(
    Array.isArray(call.args.p_tags) && (call.args.p_tags as unknown[]).length === 0,
    `esperava p_tags = [] (limpar), veio ${JSON.stringify(call.args.p_tags)}`,
  );
});

Deno.test("R2-API-033: classificação válida COM tags grava exatamente essas etiquetas (não regride)", async () => {
  const { deps, ctx } = makeDeps({
    tags: [{ name: "vendas", confidence: 0.9 }],
  });
  const res = await handleAiAutoTag(makeRequest({ contactId: CONTACT_ID, messages: CONVERSATION }), deps);

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const call = replaceCall(ctx);
  assert(call, "a RPC replace_ai_conversation_tags não foi chamada com etiquetas");
  assert(
    JSON.stringify(call.args.p_tags) === JSON.stringify([{ name: "vendas", confidence: 0.9 }]),
    `p_tags inesperado: ${JSON.stringify(call.args.p_tags)}`,
  );
});

Deno.test("R2-API-033: sem conversa não há classificação — a RPC não é chamada (não apaga etiqueta por engano)", async () => {
  const { deps, ctx } = makeDeps({ tags: [] });
  const res = await handleAiAutoTag(makeRequest({ contactId: CONTACT_ID, messages: [] }), deps);

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const body = await res.json();
  assert(JSON.stringify(body.tags) === "[]", "sem conversa a resposta deve trazer tags vazias");
  assert(!replaceCall(ctx), "sem conversa a RPC não pode ser chamada — não existe classificação a gravar");
});

Deno.test("R2-API-033: falha ao substituir etiquetas responde 502 e não finge sucesso", async () => {
  const { deps } = makeDeps({ tags: [{ name: "vendas", confidence: 0.9 }] }, {
    rpcError: { message: "rpc falhou" },
  });
  const res = await handleAiAutoTag(makeRequest({ contactId: CONTACT_ID, messages: CONVERSATION }), deps);
  assert(res.status === 502, `esperava 502, veio ${res.status}`);
});
