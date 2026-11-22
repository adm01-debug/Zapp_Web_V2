import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_FUNCTION,
  CAPABILITY_LABELS,
  MODEL_CAPABILITIES,
  normalizeQuery,
  readIntent,
  routeCapabilities,
} from "./assistant-gateway.ts";

/** Atalho: rota a partir do texto cru, como a edge faz. */
const route = (q: string) => routeCapabilities(readIntent(q));

Deno.test("normaliza acento, caixa e espaço", () => {
  assertEquals(normalizeQuery("  Como  ESTOU com o João?  "), "como estou com o joao?");
});

Deno.test("panorama do cliente aciona agenda + resumo + temperatura", () => {
  const caps = route("como estou com o cliente João?");
  assertEquals(caps, ["agenda", "resumo_conversa", "temperatura_lead"]);
});

Deno.test("panorama aceita variações sem acento e 'situação'", () => {
  assertEquals(readIntent("situacao do cliente").status, true);
  assertEquals(route("Qual a situação do cliente Maria").length >= 3, true);
  assertEquals(readIntent("como esta o joao").status, true);
  assertEquals(readIntent("panorama do contato").status, true);
});

Deno.test("pedido só de agenda não aciona modelo", () => {
  const caps = route("quais são meus compromissos amanhã?");
  assertEquals(caps, ["agenda"]);
  assertEquals(caps.filter((c) => MODEL_CAPABILITIES.includes(c)), []);
});

Deno.test("pedido de resposta não aciona agenda nem temperatura", () => {
  assertEquals(route("o que eu falo para ele agora?"), ["sugerir_resposta"]);
});

Deno.test("objeção de preço aciona o tratador de objeção", () => {
  assertEquals(route("ele disse que está caro e pediu desconto"), ["tratar_objecao"]);
});

Deno.test("prazo e produto podem vir juntos", () => {
  assertEquals(route("quando entrega e qual brinde eu ofereço?"), ["recomendar_produto", "calcular_prazo"]);
});

Deno.test("texto sem sinal cai no mínimo útil (agenda + resumo)", () => {
  assertEquals(route("oi"), ["agenda", "resumo_conversa"]);
  assertEquals(route(""), ["agenda", "resumo_conversa"]);
});

Deno.test("ordem é sempre a canônica, independente da ordem das regras", () => {
  const caps = route("resume a conversa, qual o prazo, a temperatura do lead e meus compromissos");
  const esperado = ASSISTANT_CAPABILITIES.filter((c) => caps.includes(c));
  assertEquals(caps, esperado);
  // Exemplo concreto do pedido misto: agenda antes de resumo antes de temperatura.
  const pan = route("como estou com o cliente e qual o prazo de entrega?");
  assertEquals(pan, ["agenda", "resumo_conversa", "temperatura_lead", "calcular_prazo"]);
});

Deno.test("toda capacidade tem rótulo e edge de execução (exceto agenda)", () => {
  for (const cap of ASSISTANT_CAPABILITIES) {
    assert(CAPABILITY_LABELS[cap] && CAPABILITY_LABELS[cap].length > 0, `rótulo de ${cap}`);
    if (cap === "agenda") continue;
    assert(CAPABILITY_FUNCTION[cap as Exclude<typeof cap, "agenda">], `edge de ${cap}`);
    assert(MODEL_CAPABILITIES.includes(cap), `${cap} deveria gastar modelo`);
  }
});

Deno.test("as 8 edges ligadas pela porta única são as do plano (6 da Fase 3 + 2 de retenção)", () => {
  assertEquals(Object.values(CAPABILITY_FUNCTION).sort(), [
    "ai-conversation-summary",
    "ai-deadline-calculator",
    "ai-lead-temperature",
    "ai-loss-risk",
    "ai-objection-handler",
    "ai-price-anchor",
    "ai-product-recommendation",
    "ai-suggest-reply",
  ]);
});

Deno.test("sinal de perda da venda aciona o risco de perda", () => {
  assertEquals(route("o cliente sumiu e acho que vou perder essa venda"), ["risco_perda"]);
});

Deno.test("discussão de preço por unidade aciona a ancoragem de preço", () => {
  assertEquals(route("como defendo o preço por unidade?"), ["ancoragem_preco"]);
});

Deno.test("risco de perda e temperatura convivem no mesmo pedido", () => {
  assertEquals(route("qual a temperatura do lead? vai desistir?"), ["temperatura_lead", "risco_perda"]);
});