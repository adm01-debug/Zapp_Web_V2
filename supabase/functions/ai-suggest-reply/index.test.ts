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
