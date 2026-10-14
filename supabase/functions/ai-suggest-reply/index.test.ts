/**
 * R2-INF-024 (item 370) — a saída do modelo de `ai-suggest-reply` tem de passar
 * pelo contrato ANTES de chegar à interface.
 *
 * O que este arquivo prova, chamando o HANDLER REAL com a resposta do provedor
 * substituída por uma resposta sintética:
 *   1. três sugestões válidas continuam saindo como resultado NORMAL (200), com a
 *      `source` que o prompt pede e com o eco do `requestId` (IA-048/IA-051);
 *   2. JSON sintaticamente válido com forma errada — `suggestions` em string, em
 *      objeto, ausente, quantidade diferente de 3, item que não é objeto, texto
 *      vazio — NÃO entra no render normal: a resposta é erro explícito (502, com
 *      envelope e a evidência do contrato). Antes, esse objeto era devolvido com
 *      HTTP 200 e o cliente renderizava em cima dele (só conferia truthiness);
 *   3. resposta sem JSON utilizável NÃO vira três frases fixas apresentadas como
 *      se fossem do modelo: também é erro explícito, nunca 200 com texto padrão.
 *
 * LIMITE DECLARADO: o provedor de IA entra pelo seam `deps.generate` (mesmo
 * padrão do `ai-auto-tag`) e o `Deno.serve` fica atrás de `import.meta.main` —
 * nada de rede, banco ou credencial nesta prova. É o provedor que é sintético,
 * não o caminho: quem responde é o handler de produção.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
 *           supabase/functions/ai-suggest-reply/index.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handleAiSuggestReply, type AiSuggestReplyDeps } from "./index.ts";
import type { GenerateParams, GenerateResult } from "../_shared/ai-generate.ts";

const REQUEST_ID = "8c0f0d3a-1b2c-4d5e-8f90-1a2b3c4d5e6f";

/** Resposta sintética do provedor: `content` é o texto cru que o modelo devolveu. */
function fakeProvider(content: unknown): { generate: AiSuggestReplyDeps["generate"]; seen: GenerateParams[] } {
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
    });
  };
  return { generate, seen };
}

/** Uma requisição por teste, com IP próprio (o limitador local é de 15/min por IP). */
let pedidos = 0;
function pedido(body: unknown): Request {
  pedidos += 1;
  return new Request("https://local.test/ai-suggest-reply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer token-de-teste",
      "x-forwarded-for": `10.9.0.${pedidos}`,
    },
    body: JSON.stringify(body),
  });
}

/** Corpo da conversa como o cliente manda (schema `AiSuggestReplySchema`). */
function corpo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    messages: [{ sender: "contact", content: "Bom dia, cadê meu pedido?" }],
    contactName: "João Silva",
    ...extra,
  };
}

/** Autorização e guarda de cota substituídas: aqui a pergunta é outra. */
const SEM_DONO: AiSuggestReplyDeps = {
  authorize: () => Promise.resolve({ userId: "0f1e2d3c-4b5a-4978-8899-aabbccddeeff" }),
  enforceGuards: () => Promise.resolve(null),
};

const TRES_VALIDAS = JSON.stringify({
  suggestions: [
    { type: "direct", text: "João, seu pedido saiu para entrega hoje.", emoji: "✓", source: "Prazo de entrega" },
    { type: "empathetic", text: "João, entendo a espera — vou acompanhar por você.", emoji: "💬", source: null },
    { type: "followup", text: "João, quer que eu confirme o prazo com a transportadora?", emoji: "❓", source: null },
  ],
});

Deno.test("três sugestões válidas continuam sendo o resultado normal (200)", async () => {
  const { generate, seen } = fakeProvider(TRES_VALIDAS);
  const res = await handleAiSuggestReply(
    pedido(corpo({ requestId: REQUEST_ID })),
    { ...SEM_DONO, generate },
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.suggestions.length, 3);
  assertEquals(body.suggestions[0].type, "direct");
  assertEquals(body.suggestions[1].emoji, "💬");
  // A `source` que o prompt pede e a interface exibe NÃO pode ser descartada em silêncio.
  assertEquals(body.suggestions[0].source, "Prazo de entrega");
  // IA-051: o id do clique chega ao despacho central (o log de consumo é rastreável).
  assertEquals(seen[0].requestId, REQUEST_ID);
  assertEquals(seen[0].functionName, "ai-suggest-reply");
  // IA-048: e volta no corpo, para o cliente descartar resposta de outro contexto.
  assertEquals(body.requestId, REQUEST_ID);
});

const FORMAS_INVALIDAS: Array<[string, string]> = [
  ["`suggestions` em string", JSON.stringify({ suggestions: "João, seu pedido saiu." })],
  ["`suggestions` em objeto", JSON.stringify({ suggestions: { direct: "João, seu pedido saiu." } })],
  ["sem a chave `suggestions`", JSON.stringify({ respostas: TRES_VALIDAS })],
  ["JSON de outro tipo (array de itens solto)", JSON.stringify([{ type: "direct", text: "João, tudo bem?" }])],
  [
    "duas sugestões (o contrato exige exatamente 3)",
    JSON.stringify({ suggestions: [
      { type: "direct", text: "João, seu pedido saiu." },
      { type: "empathetic", text: "João, entendo a espera." },
    ] }),
  ],
  [
    "texto vazio em uma das sugestões",
    JSON.stringify({ suggestions: [
      { type: "direct", text: "João, seu pedido saiu." },
      { type: "empathetic", text: "" },
      { type: "followup", text: "João, quer que eu confirme?" },
    ] }),
  ],
  [
    "item que não é objeto",
    JSON.stringify({ suggestions: ["direta", "empática", "follow-up"] }),
  ],
];

for (const [nome, conteudo] of FORMAS_INVALIDAS) {
  Deno.test(`forma inválida não entra no render normal: ${nome}`, async () => {
    const { generate } = fakeProvider(conteudo);
    const res = await handleAiSuggestReply(pedido(corpo()), { ...SEM_DONO, generate });

    // Antes: HTTP 200 com esse objeto no corpo (a interface só conferia truthiness
    // de `data.suggestions` e quebrava no render).
    assertEquals(res.status, 502, `${nome}: forma errada tem de sair como erro, não como sugestão`);
    const body = await res.json();
    assertEquals(body.status, "error");
    assertEquals(body.capability, "ai-suggest-reply");
    assertEquals("suggestions" in body, false, `${nome}: nada de sugestão com forma errada`);
    assert(
      Array.isArray(body.evidence?.errors) && body.evidence.errors.length > 0,
      `${nome}: o envelope de erro precisa trazer a evidência do contrato`,
    );
  });
}

const SEM_JSON: Array<[string, unknown]> = [
  ["texto sem nenhum JSON", "João, eu não sei responder isso agora."],
  ["JSON cortado (sem fechar o objeto)", '{"suggestions": [{"type": "direct", "text": "João'],
  ["JSON com sintaxe quebrada", '{"suggestions": [1,2,]}'],
  ["o provedor devolveu conteúdo vazio", ""],
  ["o provedor não devolveu conteúdo nenhum", undefined],
];

for (const [nome, conteudo] of SEM_JSON) {
  Deno.test(`saída sem JSON utilizável é erro explícito, não frase fabricada: ${nome}`, async () => {
    const { generate } = fakeProvider(conteudo);
    const res = await handleAiSuggestReply(pedido(corpo()), { ...SEM_DONO, generate });

    // Antes: 200 com três frases fixas ("Entendi sua solicitação. Vou verificar...")
    // apresentadas como se o modelo as tivesse gerado.
    assertEquals(res.status, 502, `${nome}: nada de 200 com texto de fallback`);
    const body = await res.json();
    assertEquals(body.status, "error");
    assertEquals("suggestions" in body, false, `${nome}: nada de frase fixa travestida de sugestão`);
    const serializado = JSON.stringify(body);
    assert(
      !serializado.includes("Entendi sua solicitação"),
      `${nome}: as frases fixas não podem voltar como resultado`,
    );
  });
}
/**
 * Seleção de artigos via `search_knowledge_base` (sem fallback para publicados).
 *
 * O que este bloco prova, chamando o HANDLER REAL:
 *   1. o RPC `search_knowledge_base` é chamado com a ÚLTIMA mensagem do cliente
 *      como `search_query` (e `max_results: 5`);
 *   2. os artigos que o RPC devolve entram no prompt do modelo (título, categoria,
 *      rank e conteúdo), observados no `system` que chega ao provedor;
 *   3. a tabela `knowledge_base_articles` NÃO é mais consultada — o fallback
 *      genérico de 10 publicados não existe neste código;
 *   4. erro no RPC deixa o contexto vazio de forma explícita (sem fallback,
 *      sem resto parcial), e a resposta continua saindo normalmente.
 *
 * Onde está a fronteira sintética (e por quê ela não invalida a prova): o cliente
 * Supabase é CONSTRUÍDO DE VERDADE (`createClient` com `SUPABASE_URL` de teste) e
 * quem responde é o `fetch` global substituído — o mesmo padrão aprovado do
 * `searchbox-budget-alert`. Ou seja: a seleção (qual chamada, com quais
 * parâmetros), o parse da resposta, a formatação no prompt e o ramo de erro são
 * o código de produção, sem seam. Sintéticos são só o provedor de IA (seam
 * `deps.generate`, como no restante deste arquivo), a autorização/cota e os
 * bytes HTTP. Com o código ANTERIOR (consulta direta à tabela) estes testes
 * falham: não há POST no RPC, o `system` não contém o artigo de mentira e a
 * tabela é consultada.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
 *           supabase/functions/ai-suggest-reply/index.test.ts
 */

type ChamadaFetch = { url: string; method: string; corpo: unknown };

type LinhaArtigo = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  rank: number;
};

const ARTIGO_MENTIRA: LinhaArtigo = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "Prazo de entrega — Artigo-Mentira-7f3a",
  content: "TOKEN-MENTIRA-7f3a-conteudo: pedidos saem em até 48h úteis.",
  category: "Logística",
  tags: ["entrega"],
  rank: 0.85,
};

/** Liga o `fetch` falso do Supabase e o ambiente mínimo para o bloco da KB rodar. */
function ligarBancoFalso(opcoes: { rpcStatus?: number; rpcCorpo?: unknown } = {}): {
  chamadas: ChamadaFetch[];
  desligar: () => void;
} {
  const chamadas: ChamadaFetch[] = [];
  const fetchOriginal = globalThis.fetch;
  const urlAnterior = Deno.env.get("SUPABASE_URL");
  const chaveAnterior = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://banco-falso-de-teste.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-falsa-de-teste");

  globalThis.fetch = (entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    const method = (init?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
    let corpo: unknown = null;
    try {
      if (typeof init?.body === "string" && init.body.length > 0) corpo = JSON.parse(init.body);
    } catch {
      corpo = init?.body ?? null;
    }
    chamadas.push({ url, method, corpo });

    if (url.includes("/rest/v1/rpc/search_knowledge_base")) {
      const status = opcoes.rpcStatus ?? 200;
      const payload = opcoes.rpcCorpo !== undefined ? opcoes.rpcCorpo : [ARTIGO_MENTIRA];
      if (status >= 400) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "falha-sintetica-do-rpc", code: "XX000" }), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    // Qualquer outra chamada REST (notas, campos — este cartão não passa
    // `contactId`, então nada deveria chegar aqui além do RPC).
    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  return {
    chamadas,
    desligar: () => {
      globalThis.fetch = fetchOriginal;
      if (urlAnterior === undefined) Deno.env.delete("SUPABASE_URL");
      else Deno.env.set("SUPABASE_URL", urlAnterior);
      if (chaveAnterior === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
      else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", chaveAnterior);
    },
  };
}

function chamadasRpc(chamadas: ChamadaFetch[]): ChamadaFetch[] {
  return chamadas.filter((c) => c.url.includes("/rest/v1/rpc/search_knowledge_base"));
}

function tocouNaTabela(chamadas: ChamadaFetch[]): ChamadaFetch[] {
  return chamadas.filter((c) => c.url.includes("/rest/v1/knowledge_base_articles"));
}

const ULTIMA_DO_CLIENTE = "Última pergunta-Mentira-7f3a sobre entrega";

function corpoComConversa(): Record<string, unknown> {
  return corpo({
    messages: [
      { sender: "contact", content: "Primeira dúvida-Mentira-7f3a sobre preço" },
      { sender: "agent", content: "Resposta do atendente (não é mensagem do cliente)" },
      { sender: "contact", content: ULTIMA_DO_CLIENTE },
    ],
  });
}

Deno.test("o RPC é chamado com a última mensagem do cliente como query", async () => {
  const banco = ligarBancoFalso();
  try {
    const { generate } = fakeProvider(TRES_VALIDAS);
    const res = await handleAiSuggestReply(pedido(corpoComConversa()), { ...SEM_DONO, generate });

    assertEquals(res.status, 200);
    const rpc = chamadasRpc(banco.chamadas);
    // Com o código anterior (tabela direta) este array é vazio: o teste falha.
    assertEquals(rpc.length, 1, `esperava 1 chamada ao RPC, vi: ${JSON.stringify(banco.chamadas)}`);
    const params = rpc[0].corpo as Record<string, unknown>;
    assertEquals(params["search_query"], ULTIMA_DO_CLIENTE);
    assertEquals(params["max_results"], 5);
  } finally {
    banco.desligar();
  }
});

Deno.test("os artigos do RPC entram no prompt do modelo", async () => {
  const banco = ligarBancoFalso();
  try {
    const { generate, seen } = fakeProvider(TRES_VALIDAS);
    const res = await handleAiSuggestReply(pedido(corpoComConversa()), { ...SEM_DONO, generate });

    assertEquals(res.status, 200);
    assertEquals(banco.chamadas.length > 0, true, "o handler tinha de consultar o banco falso");
    const system = String(seen[0].system ?? "");
    // Com o código anterior o `system` não contém o artigo de mentira: falha.
    assert(system.includes("BASE DE CONHECIMENTO"), "o prompt tinha de trazer a seção da base");
    assert(system.includes(ARTIGO_MENTIRA.title), "o prompt tinha de citar o título do artigo");
    assert(system.includes("TOKEN-MENTIRA-7f3a-conteudo"), "o prompt tinha de citar o conteúdo do artigo");
    assert(system.includes("Logística"), "o prompt tinha de citar a categoria do artigo");
  } finally {
    banco.desligar();
  }
});

Deno.test("a tabela de artigos não é mais consultada (sem fallback de publicados)", async () => {
  const banco = ligarBancoFalso();
  try {
    const { generate } = fakeProvider(TRES_VALIDAS);
    const res = await handleAiSuggestReply(pedido(corpoComConversa()), { ...SEM_DONO, generate });

    assertEquals(res.status, 200);
    // Com o código anterior esta lista tem a consulta direta (limit 10): falha.
    assertEquals(
      tocouNaTabela(banco.chamadas).length,
      0,
      `a tabela não pode ser tocada: ${JSON.stringify(tocouNaTabela(banco.chamadas))}`,
    );
  } finally {
    banco.desligar();
  }
});

Deno.test("erro no RPC deixa o contexto vazio, sem fallback e sem parcial", async () => {
  const banco = ligarBancoFalso({ rpcStatus: 500 });
  try {
    const { generate, seen } = fakeProvider(TRES_VALIDAS);
    const res = await handleAiSuggestReply(pedido(corpoComConversa()), { ...SEM_DONO, generate });

    // A falha do banco não derruba a capacidade: as sugestões saem sem contexto.
    assertEquals(res.status, 200);
    assertEquals(chamadasRpc(banco.chamadas).length, 1, "o RPC tinha de ter sido tentado");
    const system = String(seen[0].system ?? "");
    assertEquals(system.includes("BASE DE CONHECIMENTO"), false, "erro no RPC: nada de seção da base");
    assertEquals(system.includes("Artigo-Mentira-7f3a"), false, "erro no RPC: nada de artigo parcial");
    // O ramo de erro zera o contexto de forma explícita: o prompt com RPC em
    // erro tem de ser IDÊNTICO ao prompt com RPC vazio. Qualquer resto parcial
    // ou fallback no ramo de erro quebraria esta igualdade.
    const bancoVazio = ligarBancoFalso({ rpcCorpo: [] });
    try {
      const parcial2 = fakeProvider(TRES_VALIDAS);
      const res2 = await handleAiSuggestReply(pedido(corpoComConversa()), { ...SEM_DONO, generate: parcial2.generate });
      assertEquals(res2.status, 200);
      assertEquals(system, String(parcial2.seen[0].system ?? ""), "erro no RPC: prompt idêntico ao de RPC vazio");
    } finally {
      bancoVazio.desligar();
    }
    assertEquals(
      tocouNaTabela(banco.chamadas).length,
      0,
      "erro no RPC: nada de fallback para a tabela",
    );
  } finally {
    banco.desligar();
  }
});

Deno.test("RPC vazio deixa o contexto vazio (nenhum artigo entra no prompt)", async () => {
  const banco = ligarBancoFalso({ rpcCorpo: [] });
  try {
    const { generate, seen } = fakeProvider(TRES_VALIDAS);
    const res = await handleAiSuggestReply(pedido(corpoComConversa()), { ...SEM_DONO, generate });

    assertEquals(res.status, 200);
    assertEquals(chamadasRpc(banco.chamadas).length, 1);
    assertEquals(
      String(seen[0].system ?? "").includes("BASE DE CONHECIMENTO"),
      false,
      "RPC vazio: nenhum artigo entra no prompt",
    );
  } finally {
    banco.desligar();
  }
});

Deno.test("sem mensagem do cliente o RPC nem é chamado", async () => {
  const banco = ligarBancoFalso();
  try {
    const { generate } = fakeProvider(TRES_VALIDAS);
    const res = await handleAiSuggestReply(
      pedido(corpo({ messages: [{ sender: "agent", content: "Olá, em que posso ajudar?" }] })),
      { ...SEM_DONO, generate },
    );

    assertEquals(res.status, 200);
    assertEquals(
      chamadasRpc(banco.chamadas).length,
      0,
      `sem mensagem do cliente não há o que buscar: ${JSON.stringify(banco.chamadas)}`,
    );
  } finally {
    banco.desligar();
  }
});
