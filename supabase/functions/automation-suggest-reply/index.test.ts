/**
 * `automation-suggest-reply` — prova do handler REAL com os dois pontos de rede
 * substituídos por seams (client do banco e roteador de IA). Nada de provedor,
 * credencial ou Postgres: quem responde é o handler de produção.
 *
 * O que este arquivo prova:
 *   1. o contexto é resolvido pelo SERVIDOR: as mensagens entram pelo client do
 *      chamador (RLS) e a consulta da base usa a ÚLTIMA mensagem RECEBIDA do
 *      cliente — não a do atendente;
 *   2. contato sem mensagem visível (RLS devolve zero linhas) vira sugestões
 *      VAZIAS (200), sem chamar a IA e sem vazar contexto de outro contato;
 *   3. sem artigo relevante a sugestão sai com `source: null`; com artigo, a
 *      fonte é carimbada NO SERVIDOR (`article_id` + título); id alucinado pelo
 *      modelo vira `source: null`, nunca título fabricado;
 *   4. o limite de IA é respeitado: o guarda (429) e o teto de orçamento
 *      (BUDGET_EXCEEDED) devolvem HTTP 429 com CÓDIGO ESTÁVEL
 *      (`rate_limited`/`ai_budget_exceeded`) e a IA não é chamada duas vezes;
 *   5. saída com forma errada não entra no render normal (502), e o `contact_id`
 *      inválido é recusado (400).
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
 *           supabase/functions/automation-suggest-reply/index.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  handleAutomationSuggestReply,
  type AuthedClientLike,
  type AutomationSuggestReplyDeps,
} from "./index.ts";
import {
  AI_BUDGET_ERROR_CODE,
  type GenerateParams,
  type GenerateResult,
} from "../_shared/ai-generate.ts";

const CONTATO = "11111111-2222-4333-8444-555555555555";
const ARTIGO_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const AUTH_USER_ID = "0f1e2d3c-4b5a-4978-8899-aabbccddeeff";

interface Mensagem {
  content: string;
  sender: "contact" | "agent";
  created_at: string;
}

interface FakeOpts {
  mensagens?: Mensagem[];
  mensagensError?: { message: string } | null;
  artigos?: Array<{ id: string; title: string; content: string }>;
  artigosError?: { message: string } | null;
  rpcCalls?: Array<{ fn: string; args: Record<string, unknown> }>;
}

/** Client do banco falso: registra a RPC e devolve o que cada cenário configurou. */
function clientFalso(opts: FakeOpts): AuthedClientLike {
  return {
    from(table: string) {
      assertEquals(table, "messages");
      const resultado = {
        data: opts.mensagensError ? null : (opts.mensagens ?? []),
        error: opts.mensagensError ?? null,
      };
      const builder = {
        eq: () => builder,
        order: () => builder,
        limit: () => Promise.resolve(resultado),
      };
      return { select: () => builder };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      opts.rpcCalls?.push({ fn, args });
      return Promise.resolve({
        data: opts.artigosError ? null : (opts.artigos ?? []),
        error: opts.artigosError ?? null,
      });
    },
  };
}

/** Provedor sintético: `content` é o texto cru que o modelo devolveu. */
function fakeProvider(
  content: unknown,
  overrides: Partial<GenerateResult> = {},
): { generate: AutomationSuggestReplyDeps["generate"]; seen: GenerateParams[] } {
  const seen: GenerateParams[] = [];
  const generate = (params: GenerateParams): Promise<GenerateResult> => {
    seen.push(params);
    return Promise.resolve({
      ok: true,
      response: new Response(JSON.stringify({}), { status: 200 }),
      data: { choices: [{ message: { content } }] },
      providerId: "provedor-de-teste",
      providerName: "provedor-de-teste",
      model: "modelo-de-teste",
      durationMs: 1,
      status: "ok",
      ...overrides,
    });
  };
  return { generate, seen };
}

let pedidos = 0;
/** Uma requisição por teste, com IP próprio (o guarda local é por IP). */
function pedido(body: unknown): Request {
  pedidos += 1;
  return new Request("https://local.test/automation-suggest-reply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer token-de-teste",
      "x-forwarded-for": `10.7.0.${pedidos}`,
    },
    body: JSON.stringify(body),
  });
}

/** Autorização e cota substituídas: aqui a pergunta é outra. */
const SEM_DONO: AutomationSuggestReplyDeps = {
  authorize: () => Promise.resolve({ userId: AUTH_USER_ID }),
  enforceGuards: () => Promise.resolve(null),
};

const CONVERSA: Mensagem[] = [
  { content: "Bom dia, cadê meu pedido?", sender: "contact", created_at: "2026-10-11T12:00:00Z" },
  { content: "Bom dia! Já vou verificar.", sender: "agent", created_at: "2026-10-11T12:01:00Z" },
];

const ARTIGO_PRAZO = {
  id: ARTIGO_A,
  title: "Prazo de entrega",
  content: "O prazo padrão é de 3 dias úteis após a confirmação.",
};

Deno.test("RLS: contato sem mensagem visível devolve sugestões vazias e NÃO chama a IA", async () => {
  const { generate, seen } = fakeProvider("{}");
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: [], rpcCalls: [] })),
  });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).suggestions, []);
  assertEquals(seen.length, 0, "sem contexto visível a IA não pode ser chamada");
});

Deno.test("sem mensagem RECEBIDA do cliente (só do atendente) também devolve vazio", async () => {
  const { generate, seen } = fakeProvider("{}");
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () =>
      Promise.resolve(clientFalso({
        mensagens: [{
          content: "Já vou verificar.",
          sender: "agent",
          created_at: "2026-10-11T12:01:00Z",
        }],
      })),
  });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).suggestions, []);
  assertEquals(seen.length, 0);
});

Deno.test("a busca da base usa a ÚLTIMA mensagem recebida, não a do atendente", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const { generate } = fakeProvider(JSON.stringify({ suggestions: [{ text: "Ok.", article_id: null }] }));
  await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA, rpcCalls })),
  });

  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "search_knowledge_base");
  assertEquals(rpcCalls[0].args.search_query, "Bom dia, cadê meu pedido?");
  assertEquals(rpcCalls[0].args.max_results, 3);
});

Deno.test("sem artigo relevante a sugestão sai com source null (200)", async () => {
  const { generate } = fakeProvider(JSON.stringify({
    suggestions: [
      { text: "Seu pedido já está a caminho.", article_id: null },
      { text: "Quer que eu confirme o prazo?", article_id: null },
    ],
  }));
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA, artigos: [] })),
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.suggestions.length, 2);
  assertEquals(body.suggestions[0].source, null);
  assertEquals(body.suggestions[1].source, null);
});

Deno.test("artigo citado pelo modelo vira fonte com o título carimbado NO SERVIDOR", async () => {
  const { generate, seen } = fakeProvider(JSON.stringify({
    suggestions: [
      { text: "O prazo é de 3 dias úteis.", article_id: ARTIGO_A },
      { text: "Quer que eu acompanhe?", article_id: null },
    ],
  }));
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA, artigos: [ARTIGO_PRAZO] })),
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.suggestions[0].source, { article_id: ARTIGO_A, title: "Prazo de entrega" });
  assertEquals(body.suggestions[1].source, null);
  // O artigo oferecido vai no prompt (id + título), para o modelo poder citá-lo.
  assert(JSON.stringify(seen[0].messages).includes(ARTIGO_A));
  assertEquals(seen[0].userId, AUTH_USER_ID);
  assertEquals(seen[0].functionName, "automation-suggest-reply");
  assertEquals(seen[0].purpose, "copilot");
});

Deno.test("article_id alucinado (fora dos artigos oferecidos) vira source null", async () => {
  const { generate } = fakeProvider(JSON.stringify({
    suggestions: [{ text: "O prazo é de 2 dias.", article_id: "id-que-nao-existe" }],
  }));
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA, artigos: [ARTIGO_PRAZO] })),
  });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).suggestions[0].source, null);
});

Deno.test("limite de IA: guarda 429 → 429 com código estável e sem chamar o provedor", async () => {
  const { generate, seen } = fakeProvider("{}");
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    authorize: SEM_DONO.authorize,
    enforceGuards: () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Per-user rate limit exceeded (30/min)" }), {
          status: 429,
        }),
      ),
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA })),
  });

  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.code, "rate_limited");
  assertEquals(body.error, "Per-user rate limit exceeded (30/min)");
  assertEquals(seen.length, 0, "guarda 429 não pode deixar a chamada de IA acontecer");
});

Deno.test("orçamento estourado (BUDGET_EXCEEDED) → 429 com código ai_budget_exceeded", async () => {
  const { generate } = fakeProvider(null, {
    ok: false,
    response: new Response(JSON.stringify({ error: "budget" }), { status: 429 }),
    data: null,
    status: "error",
    errorCode: AI_BUDGET_ERROR_CODE,
  });
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA, artigos: [] })),
  });

  assertEquals(res.status, 429);
  assertEquals((await res.json()).code, "ai_budget_exceeded");
});

Deno.test("429 do provedor (sem BUDGET_EXCEEDED) → 429 com código rate_limited", async () => {
  const { generate } = fakeProvider(null, {
    ok: false,
    response: new Response(JSON.stringify({ error: "rate" }), { status: 429 }),
    data: null,
    status: "error",
  });
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA, artigos: [] })),
  });

  assertEquals(res.status, 429);
  assertEquals((await res.json()).code, "rate_limited");
});

Deno.test("saída do modelo com forma errada não vira resposta normal (502)", async () => {
  const invalido = JSON.stringify({ suggestions: [{ text: "" }] });
  const { generate } = fakeProvider(invalido);
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA, artigos: [] })),
  });

  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.code, "ai_contract_rejected");
  assertEquals(body.suggestions, undefined);
});

Deno.test("mais de 3 sugestões é rejeitado pelo contrato (502)", async () => {
  const quatro = JSON.stringify({
    suggestions: [
      { text: "a", article_id: null },
      { text: "b", article_id: null },
      { text: "c", article_id: null },
      { text: "d", article_id: null },
    ],
  });
  const { generate } = fakeProvider(quatro);
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () => Promise.resolve(clientFalso({ mensagens: CONVERSA, artigos: [] })),
  });

  assertEquals(res.status, 502);
});

Deno.test("contact_id ausente ou fora do formato UUID é recusado (400) sem tocar no banco", async () => {
  for (const body of [{}, { contact_id: "não-é-uuid" }, { contact_id: 42 }]) {
    const res = await handleAutomationSuggestReply(pedido(body), {
      ...SEM_DONO,
      authedClient: () => {
        throw new Error("não deveria consultar o banco");
      },
    });
    assertEquals(res.status, 400);
  }
});

Deno.test("falha de leitura das mensagens não inventa contexto: vazio (200)", async () => {
  const { generate, seen } = fakeProvider("{}");
  const res = await handleAutomationSuggestReply(pedido({ contact_id: CONTATO }), {
    ...SEM_DONO,
    generate,
    authedClient: () =>
      Promise.resolve(clientFalso({ mensagensError: { message: "boom" }, rpcCalls: [] })),
  });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).suggestions, []);
  assertEquals(seen.length, 0);
});
