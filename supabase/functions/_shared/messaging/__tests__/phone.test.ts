// Teste unitário do kernel de telefone (Bloco D / F38) — E.164 brasileiro.
//
// Cobre: (1) 9º dígito (celular com e sem o 9), (2) DDD válido preservado,
// (3) entrada inválida/vazia/nula, (4) LID rejeitado (o helper loga warn e
// devolve null) e (5) RED-BEFORE: prova que o `replace(/\D/g,"")` cru de
// multiplix-send/index.ts L437 ACEITA o que normalizePhone RECUSA.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/_shared/messaging/__tests__/phone.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  generatePhoneVariants,
  normalizePhone,
  type E164Phone,
  type NormalizedPhone,
} from "../phone.ts";

// ─── (1) Nono dígito: celular com e sem o 9 ──────────────────────────────────
Deno.test("generatePhoneVariants: nº COM 9º dígito gera a variante SEM o 9", () => {
  // DDD 64, celular 9 8445-0900 → 55 64 984450900 (13 dígitos com DDI).
  const semNove: E164Phone = "556484450900";
  const comNove: E164Phone = "5564984450900";
  const variantes = generatePhoneVariants(comNove);

  assert(variantes.includes(comNove), "faltou a forma com o 9");
  assert(variantes.includes(semNove), "faltou a variante sem o 9º dígito");
});

Deno.test("generatePhoneVariants: nº SEM 9º dígito gera a variante COM o 9", () => {
  const semNove: E164Phone = "556484450900";
  const comNove: E164Phone = "5564984450900";
  const variantes = generatePhoneVariants(semNove);

  assert(variantes.includes(semNove), "faltou a forma sem o 9");
  assert(variantes.includes(comNove), "faltou a variante com o 9º dígito");
});

Deno.test("generatePhoneVariants: o par com/sem 9 é fechado (ida e volta)", () => {
  // Qualquer que seja a forma que o produtor mandou (WhatsApp/Evolution varia),
  // as variantes contêm as duas — é o que permite casar o contato no banco.
  const a: E164Phone = "5564984450900";
  const b: E164Phone = "556484450900";
  assertEquals(
    new Set(generatePhoneVariants(a)).has(b),
    new Set(generatePhoneVariants(b)).has(a),
  );
});

Deno.test("generatePhoneVariants: sempre inclui a forma com '+' e a entrada crua", () => {
  const variantes = generatePhoneVariants("5564984450900");
  assert(variantes.includes("+5564984450900"), "faltou a forma com '+'");
  assert(variantes.includes("5564984450900"), "faltou a entrada crua");
});

// ─── (2) DDD válido preservado ───────────────────────────────────────────────
Deno.test("normalizePhone preserva o DDD (só remove sujeira, não reinterpreta)", () => {
  // O DDD tem de atravessar intacto: é ele que distingue dois números iguais no
  // miolo (DDD 11 vs DDD 64). Um strip que reordenasse/comesse dígitos falharia.
  assertEquals(normalizePhone("5564984450900@s.whatsapp.net"), "5564984450900"); // DDD 64
  assertEquals(normalizePhone("+55 (11) 99999-8888"), "5511999998888"); // DDD 11
  assertEquals(normalizePhone("+55 11 99999-8888"), "5511999998888");
});

Deno.test("normalizePhone remove sufixo de dispositivo (:NN@) sem perder o DDD", () => {
  assertEquals(
    normalizePhone("5511999998888:12@s.whatsapp.net"),
    "5511999998888",
  );
});

Deno.test("generatePhoneVariants mantém o MESMO DDD nas duas variantes do 9", () => {
  const variantes = generatePhoneVariants("5511999998888");
  for (const v of variantes) {
    if (v.replace(/\D/g, "").startsWith("55") && v.length >= 12) {
      assert(
        v.replace(/\D/g, "").substring(2, 4) === "11",
        `variante com DDD trocado: ${v}`,
      );
    }
  }
});

// ─── (3) Entrada inválida / vazia / nula ─────────────────────────────────────
Deno.test("normalizePhone: ausência devolve null", () => {
  const vazio: NormalizedPhone = normalizePhone(undefined);
  assertEquals(vazio, null);
});

Deno.test("normalizePhone: string vazia devolve null", () => {
  assertEquals(normalizePhone(""), null);
  // Só espaços: sobrevive ao guard `!rawJid`, mas o trim o reduz a vazio e o
  // retorno `digitsOnly || sanitized || null` cai em null.
  assertEquals(normalizePhone("   "), null);
});

// ─── (4) LID rejeitado (loga warn e devolve null) ────────────────────────────
Deno.test("normalizePhone rejeita @lid e LOGA warn (comportamento real L38-41)", () => {
  const warns: string[] = [];
  const warnOriginal = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.join(" ")); };
  try {
    assertEquals(normalizePhone("123456789012345@lid"), null);
  } finally {
    console.warn = warnOriginal;
  }
  assertEquals(warns.length, 1, "esperado exatamente 1 warn de LID rejeitado");
  assert(warns[0].includes("[normalizePhone]"), `warn inesperado: ${warns[0]}`);
  assert(warns[0].includes("LID rejeitado"), `warn inesperado: ${warns[0]}`);
});

Deno.test("normalizePhone rejeita LID SEM sufixo (14-15 dígitos nus) e loga warn", () => {
  // Fallback por tamanho: um LID que chega sem '@lid' tem >= 14 dígitos.
  const warns: string[] = [];
  const warnOriginal = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.join(" ")); };
  try {
    assertEquals(normalizePhone("12345678901234"), null); // 14 dígitos
    assertEquals(normalizePhone("123456789012345"), null); // 15 dígitos
  } finally {
    console.warn = warnOriginal;
  }
  assertEquals(warns.length, 2, "esperado 1 warn por LID sem sufixo");
  assert(warns[0].includes("possivel LID"), `warn inesperado: ${warns[0]}`);
});

Deno.test("normalizePhone NÃO rejeita grupo do WhatsApp (exceção por prefixo)", () => {
  // Grupos (120363…) têm >= 14 dígitos e são válidos: a heurística de tamanho
  // abre exceção para esse prefixo. Sem isso o grupinho viraria 'null'.
  const grupo = normalizePhone("120363123456789012@g.us");
  assertEquals(grupo, "120363123456789012");
});

// ─── (5) RED-BEFORE: o strip cru de multiplix-send aceita o que normalizePhone recusa
//
// Esta é a expressão EXATA de multiplix-send/index.ts L437 (não alteramos aquele
// arquivo — o F43 troca a chamada). Ela só arranca o que não for dígito; não
// aplica a heurística anti-LID nem valida faixa.
const destinoE164Cru = (destino: string): string => destino.replace(/\D/g, "");

Deno.test("RED-BEFORE: strip cru aceita LID com sufixo que normalizePhone recusa", () => {
  const lid = "123456789012345@lid";

  const peloCru = destinoE164Cru(lid);
  const peloHelper = normalizePhone(lid);

  // O caminho atual de multiplix-send manda esse LID como telefone ao provedor.
  assertEquals(peloCru, "123456789012345");
  assert(peloCru.length > 0, "o strip cru aceitou (este é o defeito do red-before)");

  // normalizePhone recusa — é a correção do F38.
  assertEquals(peloHelper, null);

  // Divergência explícita: mesma entrada, o cru aprova e o helper reprova.
  assert(
    peloCru !== "" && peloHelper === null,
    "esperado divergência cru->aprova / helper->reprova",
  );
});

Deno.test("RED-BEFORE: strip cru aceita LID de 14 dígitos nus que normalizePhone recusa", () => {
  const lidNu = "12345678901234"; // 14 dígitos, sem '@lid'

  assertEquals(destinoE164Cru(lidNu), "12345678901234");
  assertEquals(normalizePhone(lidNu), null);

  assert(
    destinoE164Cru(lidNu) !== (normalizePhone(lidNu) ?? ""),
    "o cru e o helper precisam divergir nesta entrada",
  );
});

Deno.test("RED-BEFORE: o strip cru não produz variantes do 9º dígito", () => {
  // Além de aceitar LID, o caminho cru não casaria o contato quando o banco
  // guardou a outra forma do 9º dígito — generatePhoneVariants resolve isso.
  const destino = "5564984450900";
  assertEquals(destinoE164Cru(destino), "5564984450900"); // uma única forma
  assert(
    generatePhoneVariants(destino).length > 1,
    "generatePhoneVariants deve devolver mais de uma forma",
  );
  assert(
    generatePhoneVariants(destino).includes("556484450900"),
    "faltou a variante sem o 9",
  );
});
