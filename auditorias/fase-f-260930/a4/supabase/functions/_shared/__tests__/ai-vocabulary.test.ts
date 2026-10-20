// IA-021 (sentimento) / IA-022 (urgência × prioridade) — matriz de conversão.
//
// Trava o aceite do plano: cada valor canônico e cada legado real do repo
// converte para o mesmo significado nas duas pontas; ausência, tipo errado ou
// token inventado NUNCA viram default (nem `'neutro'`, nem `'media'`, nem `'low'`).
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/__tests__/ai-vocabulary.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  normalizeOperationalPriority,
  normalizeSentiment,
  normalizeUrgency,
  OPERATIONAL_PRIORITY_VALUES,
  SENTIMENT_VALUES,
  type OperationalPriority,
  type Sentiment,
  urgencyToOperationalPriority,
  URGENCY_VALUES,
  type Urgency,
} from "../ai-vocabulary.ts";

// ─── Conjuntos canônicos (travados contra a spec) ────────────────
Deno.test("os conjuntos canônicos são exatamente os da spec", () => {
  assertEquals(SENTIMENT_VALUES, ["positivo", "neutro", "negativo", "critico"]);
  assertEquals(URGENCY_VALUES, ["baixa", "media", "alta", "critica"]);
  assertEquals(OPERATIONAL_PRIORITY_VALUES, ["low", "medium", "high", "urgent"]);
});

// ─── Sentimento ──────────────────────────────────────────────────
const SENTIMENT_KNOWN: Array<[unknown, Sentiment]> = [
  // canônico pt-BR
  ["positivo", "positivo"],
  ["neutro", "neutro"],
  ["negativo", "negativo"],
  ["critico", "critico"],
  // legado EN escrito por ai-auto-tag / chatbot-l1
  ["positive", "positivo"],
  ["neutral", "neutro"],
  ["negative", "negativo"],
  ["critical", "critico"],
  // trim + case-insensitive
  ["  POSITIVO  ", "positivo"],
  ["NeUtRo", "neutro"],
  [" Negative ", "negativo"],
  ["CRITICAL", "critico"],
];

for (const [raw, expected] of SENTIMENT_KNOWN) {
  Deno.test(`normalizeSentiment(${JSON.stringify(raw)}) -> ${expected}`, () => {
    assertEquals(normalizeSentiment(raw), { value: expected, known: true });
  });
}

const SENTIMENT_UNKNOWN: unknown[] = [
  // ausência
  null,
  undefined,
  "",
  "   ",
  // tipo errado
  0,
  42,
  Number.NaN,
  {},
  [],
  ["positivo"],
  true,
  // valor inventado / sem equivalente canônico
  "very_positive",
  "very_negative",
  "purple",
  "neutra",
  "unknown",
  "positivo!",
];

for (const raw of SENTIMENT_UNKNOWN) {
  Deno.test(`normalizeSentiment(${JSON.stringify(raw)}) -> desconhecido`, () => {
    assertEquals(normalizeSentiment(raw), { value: null, known: false });
  });
}

Deno.test("normalizeSentiment nunca cai para 'neutro'", () => {
  for (const raw of SENTIMENT_UNKNOWN) {
    const result = normalizeSentiment(raw);
    assertEquals(result.value, null);
    assert(result.value !== "neutro");
    assertEquals(result.known, false);
  }
});

Deno.test("normalizeSentiment: 'very_negative' é inventado (known:false), não vira 'negativo'", () => {
  assertEquals(normalizeSentiment("very_negative"), { value: null, known: false });
  assertEquals(normalizeSentiment("very_positive"), { value: null, known: false });
});

// ─── Urgência ────────────────────────────────────────────────────
const URGENCY_KNOWN: Array<[unknown, Urgency]> = [
  // canônico pt-BR
  ["baixa", "baixa"],
  ["media", "media"],
  ["alta", "alta"],
  ["critica", "critica"],
  // legado EN
  ["low", "baixa"],
  ["medium", "media"],
  ["high", "alta"],
  ["critical", "critica"],
  ["urgent", "critica"],
  // trim + case-insensitive
  ["  BAIXA  ", "baixa"],
  ["Media", "media"],
  ["HIGH", "alta"],
  ["UrGent", "critica"],
];

for (const [raw, expected] of URGENCY_KNOWN) {
  Deno.test(`normalizeUrgency(${JSON.stringify(raw)}) -> ${expected}`, () => {
    assertEquals(normalizeUrgency(raw), { value: expected, known: true });
  });
}

const URGENCY_UNKNOWN: unknown[] = [
  // ausência
  null,
  undefined,
  "",
  "   ",
  // tipo errado
  0,
  7,
  {},
  [],
  false,
  // valor inventado / fora da escala de urgência
  "normal",
  "urgente",
  "muito_alta",
  "none",
  "low_priority",
  "baixo",
];

for (const raw of URGENCY_UNKNOWN) {
  Deno.test(`normalizeUrgency(${JSON.stringify(raw)}) -> desconhecido`, () => {
    assertEquals(normalizeUrgency(raw), { value: null, known: false });
  });
}

Deno.test("normalizeUrgency: 'normal' é desconhecido (é prioridade, não urgência)", () => {
  assertEquals(normalizeUrgency("normal"), { value: null, known: false });
});

// ─── Urgência → prioridade operacional ───────────────────────────
Deno.test("urgencyToOperationalPriority mapeia a escala e preserva null", () => {
  assertEquals(urgencyToOperationalPriority("baixa"), "low");
  assertEquals(urgencyToOperationalPriority("media"), "medium");
  assertEquals(urgencyToOperationalPriority("alta"), "high");
  assertEquals(urgencyToOperationalPriority("critica"), "urgent");
  assertEquals(urgencyToOperationalPriority(null), null);
});

Deno.test("urgencyToOperationalPriority: valor fora da escala em runtime devolve null (sem default)", () => {
  assertEquals(urgencyToOperationalPriority("nope" as unknown as Urgency), null);
  assertEquals(urgencyToOperationalPriority(undefined as unknown as Urgency), null);
});

// ─── Prioridade operacional ──────────────────────────────────────
const PRIORITY_KNOWN: Array<[unknown, OperationalPriority]> = [
  // canônico EN (a escala que o front já espera)
  ["low", "low"],
  ["medium", "medium"],
  ["high", "high"],
  ["urgent", "urgent"],
  // legados reais do repo
  ["normal", "medium"], // ai-auto-tag grava 'normal'
  ["alta", "high"], // urgência pt-BR gravada em ai_priority
  ["media", "medium"],
  ["baixa", "low"],
  ["critica", "urgent"],
  // trim + case-insensitive
  ["  NORMAL  ", "medium"],
  ["High", "high"],
  ["CRITICA", "urgent"],
  ["Media", "medium"],
];

for (const [raw, expected] of PRIORITY_KNOWN) {
  Deno.test(`normalizeOperationalPriority(${JSON.stringify(raw)}) -> ${expected}`, () => {
    assertEquals(normalizeOperationalPriority(raw), { value: expected, known: true });
  });
}

const PRIORITY_UNKNOWN: unknown[] = [
  // ausência
  null,
  undefined,
  "",
  "   ",
  // tipo errado
  1,
  {},
  [],
  true,
  // valor inventado / de outra escala
  "baixo",
  "urgente",
  "positive",
  "negativo",
  "critical",
  "mediums",
];

for (const raw of PRIORITY_UNKNOWN) {
  Deno.test(`normalizeOperationalPriority(${JSON.stringify(raw)}) -> desconhecido`, () => {
    assertEquals(normalizeOperationalPriority(raw), { value: null, known: false });
  });
}

// ─── Invariantes entre as três escalas ───────────────────────────
Deno.test("normalizar a prioridade concorda com a conversão da urgência canônica", () => {
  for (const u of URGENCY_VALUES) {
    assertEquals(normalizeOperationalPriority(u), {
      value: urgencyToOperationalPriority(u),
      known: true,
    });
  }
});

Deno.test("todo valor canônico é idempotente na própria normalização", () => {
  for (const s of SENTIMENT_VALUES) {
    assertEquals(normalizeSentiment(s), { value: s, known: true });
  }
  for (const u of URGENCY_VALUES) {
    assertEquals(normalizeUrgency(u), { value: u, known: true });
  }
  for (const p of OPERATIONAL_PRIORITY_VALUES) {
    assertEquals(normalizeOperationalPriority(p), { value: p, known: true });
  }
});
