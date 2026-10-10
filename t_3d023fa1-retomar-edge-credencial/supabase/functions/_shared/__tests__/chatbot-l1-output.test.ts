/**
 * Contrato de saída do chatbot L1 (IA-025).
 *
 * O que estes testes protegem: `confidence` é NÚMERO de verdade — uma string
 * (`'0.9'`) ou um percentual (95) é REJEITADO em vez de coagido, e ausência
 * continua ausência (não vira 0). `detected_sentiment` só aceita o canônico
 * pt-BR; o legado em inglês é traduzido e o valor desconhecido é omitido ANTES
 * do contrato.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { normalizeSentiment, SENTIMENT_VALUES } from "../ai-vocabulary.ts";
import { ChatbotL1Output, parseModelOutput } from "../ai-response-contracts.ts";

/** Fixture mínima válida; cada teste sobrescreve só o que importa. */
function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    handled: true,
    response: "Seu pedido foi registrado e o prazo é de 3 dias úteis.",
    transfer_to_human: false,
    ...overrides,
  };
}

Deno.test("chatbot-l1: saída bem formada passa e preserva os valores", () => {
  const parsed = parseModelOutput(
    ChatbotL1Output,
    base({
      transfer_reason: null,
      confidence: 0.87,
      matched_article: "Prazos de entrega",
      detected_intent: "duvida",
      detected_sentiment: "neutro",
    }),
  );
  assert(parsed.ok, `esperava sucesso: ${!parsed.ok ? JSON.stringify(parsed.errors) : ""}`);
  assertEquals(parsed.data.handled, true);
  assertEquals(parsed.data.response, "Seu pedido foi registrado e o prazo é de 3 dias úteis.");
  assertEquals(parsed.data.transfer_to_human, false);
  assertEquals(parsed.data.confidence, 0.87);
  assertEquals(parsed.data.matched_article, "Prazos de entrega");
  assertEquals(parsed.data.detected_intent, "duvida");
  assertEquals(parsed.data.detected_sentiment, "neutro");
  assertEquals(parsed.data.transfer_reason, null);
});

Deno.test("chatbot-l1: confidence em string é rejeitada (não é coagida)", () => {
  const parsed = parseModelOutput(ChatbotL1Output, base({ confidence: "0.9" }));
  assert(!parsed.ok, "confidence '0.9' (string) precisa ser rejeitada, não coagida");
  assert(
    parsed.errors.some((e) => e.path === "confidence"),
    `esperava erro em 'confidence': ${JSON.stringify(parsed.errors)}`,
  );
});

Deno.test("chatbot-l1: confidence em percentual/fora de 0-1 é rejeitada", () => {
  assert(!parseModelOutput(ChatbotL1Output, base({ confidence: 95 })).ok, "95 é percentual, não ratio");
  assert(!parseModelOutput(ChatbotL1Output, base({ confidence: 1.5 })).ok);
  assert(!parseModelOutput(ChatbotL1Output, base({ confidence: -0.1 })).ok);
});

Deno.test("chatbot-l1: confidence 0 sobrevive como 0 (não é ausência)", () => {
  const parsed = parseModelOutput(ChatbotL1Output, base({ confidence: 0 }));
  assert(parsed.ok);
  assertEquals(parsed.data.confidence, 0);
  assert("confidence" in parsed.data, "0 não pode ser descartado");
});

Deno.test("chatbot-l1: confidence ausente continua ausente (não vira 0)", () => {
  const parsed = parseModelOutput(ChatbotL1Output, base());
  assert(parsed.ok, `fixture sem opcionais precisa ser válida: ${!parsed.ok ? JSON.stringify(parsed.errors) : ""}`);
  assertEquals(parsed.data.confidence, undefined);
  assert(!("confidence" in parsed.data), "confidence ausente não pode virar chave");
  assertEquals(parsed.data.transfer_reason, undefined);
  assert(!("transfer_reason" in parsed.data));
  assert(!("matched_article" in parsed.data));
  assert(!("detected_intent" in parsed.data));
  assert(!("detected_sentiment" in parsed.data));
});

Deno.test("chatbot-l1: response vazio é rejeitado com path achatado", () => {
  const parsed = parseModelOutput(ChatbotL1Output, base({ response: "" }));
  assert(!parsed.ok, "resposta vazia não é resposta");
  assert(
    parsed.errors.some((e) => e.path === "response"),
    `esperava erro em 'response': ${JSON.stringify(parsed.errors)}`,
  );
});

Deno.test("chatbot-l1: campos obrigatórios ausentes são rejeitados", () => {
  const semHandled = base();
  delete semHandled.handled;
  const pHandled = parseModelOutput(ChatbotL1Output, semHandled);
  assert(!pHandled.ok);
  assert(pHandled.errors.some((e) => e.path === "handled"), JSON.stringify(pHandled.errors));

  const semTransfer = base();
  delete semTransfer.transfer_to_human;
  const pTransfer = parseModelOutput(ChatbotL1Output, semTransfer);
  assert(!pTransfer.ok);
  assert(pTransfer.errors.some((e) => e.path === "transfer_to_human"), JSON.stringify(pTransfer.errors));

  const semResponse = base();
  delete semResponse.response;
  const pResponse = parseModelOutput(ChatbotL1Output, semResponse);
  assert(!pResponse.ok);
  assert(pResponse.errors.some((e) => e.path === "response"), JSON.stringify(pResponse.errors));
});

Deno.test("chatbot-l1: detected_sentiment fora do canônico é rejeitado no contrato", () => {
  const parsed = parseModelOutput(ChatbotL1Output, base({ detected_sentiment: "positive" }));
  assert(
    !parsed.ok,
    "'positive' não é canônico — precisa ser traduzido para 'positivo' antes do contrato",
  );
  assert(
    parsed.errors.some((e) => e.path === "detected_sentiment"),
    JSON.stringify(parsed.errors),
  );
});

Deno.test("chatbot-l1: o vocabulário de sentimento aceito é o mesmo de ai-vocabulary", () => {
  for (const value of SENTIMENT_VALUES) {
    const parsed = parseModelOutput(ChatbotL1Output, base({ detected_sentiment: value }));
    assert(parsed.ok, `sentimento canônico '${value}' deveria passar`);
    assertEquals(parsed.data.detected_sentiment, value);
  }
});

Deno.test("chatbot-l1: legado EN é traduzido antes do contrato; valor inventado vira ausência", () => {
  // Simula a normalização que a Edge Function faz antes de validar.
  const comLegado: Record<string, unknown> = base({ detected_sentiment: "negative" });
  const traduzido = normalizeSentiment(comLegado.detected_sentiment);
  if (traduzido.known && traduzido.value) comLegado.detected_sentiment = traduzido.value;
  else delete comLegado.detected_sentiment;
  const ok = parseModelOutput(ChatbotL1Output, comLegado);
  assert(ok.ok, `legado traduzido deveria passar: ${!ok.ok ? JSON.stringify(ok.errors) : ""}`);
  assertEquals(ok.data.detected_sentiment, "negativo");

  const comLixo: Record<string, unknown> = base({ detected_sentiment: "purple" });
  const desconhecido = normalizeSentiment(comLixo.detected_sentiment);
  if (desconhecido.known && desconhecido.value) comLixo.detected_sentiment = desconhecido.value;
  else delete comLixo.detected_sentiment;
  const limpo = parseModelOutput(ChatbotL1Output, comLixo);
  assert(limpo.ok, `valor desconhecido é omitido, não rejeitado: ${!limpo.ok ? JSON.stringify(limpo.errors) : ""}`);
  assert(!("detected_sentiment" in limpo.data), "desconhecido não pode virar 'neutro'");
});

Deno.test("chatbot-l1: saída que não é objeto é rejeitada com path raiz vazio", () => {
  const parsed = parseModelOutput(ChatbotL1Output, "não é um objeto");
  assert(!parsed.ok);
  assertEquals(parsed.errors[0].path, "");
  assert(parsed.errors[0].message.length > 0);
});
