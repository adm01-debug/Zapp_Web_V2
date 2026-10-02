// Testes da canonicalização de `_shared/ai-generate.ts` (achado Sonar typescript:S2871).
//
// `canonicalize` NÃO é exportada. A única porta exportada que a exercita é
// `deriveAiIdempotencyKey` — que monta o payload `{ messages, maxTokens }`,
// passa por `serializeCanonico` (→ `canonicalize`) e resume a forma canônica num
// FNV-1a de 32 bits. O hash é, portanto, o CANAL OBSERVÁVEL da ordem das chaves:
// duas ordens diferentes produzem strings diferentes e, logo, hashes diferentes.
// Os testes abaixo reconstroem a serialização esperada para as duas ordens e
// provam por qual delas a chave real passou — sem exportar `canonicalize`.
//
// Contexto do achado: `.sort()` sem argumento (ordem de code-unit UTF-16) foi
// trocado por `.sort(compararCodeUnit)` — MESMA ordem, mas explícita. A escolha é
// deliberada: `localeCompare` depende do locale do runtime e, para caixa e
// `_`/dígito, ordena diferente — o mesmo payload geraria hash diferente em
// ambientes diferentes. Aqui se prova que a ordem é de code-unit e NÃO de locale.

import { deriveAiIdempotencyKey } from "./ai-generate.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CMP_CODE_UNIT = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const CMP_LOCALE = (a: string, b: string): number => a.localeCompare(b);

/** Réplica da canonicalização para uma dada ordem de comparador (independente da fonte). */
function canonizar(value: unknown, cmp: (a: string, b: string) => number): unknown {
  if (Array.isArray(value)) return value.map((item) => canonizar(item, cmp));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort(cmp)) {
      out[key] = canonizar((value as Record<string, unknown>)[key], cmp);
    }
    return out;
  }
  return value;
}

/** Réplica do payload canônico que `deriveAiIdempotencyKey` resume no hash. */
function payloadCanonico(
  messages: unknown,
  maxTokens: unknown,
  cmp: (a: string, b: string) => number,
): string {
  return JSON.stringify(canonizar({ messages: messages ?? null, maxTokens: maxTokens ?? null }, cmp)) ?? "";
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
function fnv1aHex(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const FUNCAO = "ai-auto-tag";
const DONO = "user-teste";
const MODELO = "modelo-teste";
const MAX_TOKENS = 10;

/** Chave que `deriveAiIdempotencyKey` DEVERIA devolver se a ordem fosse a do comparador dado. */
function chaveEsperada(
  messages: unknown,
  maxTokens: unknown,
  cmp: (a: string, b: string) => number,
): string {
  return `${FUNCAO}:${DONO}:${MODELO}:${fnv1aHex(payloadCanonico(messages, maxTokens, cmp))}`;
}

/** Chave REAL, pelo caminho exportado que usa canonicalize. */
function chaveReal(messages: unknown, maxTokens: unknown = MAX_TOKENS): string {
  return deriveAiIdempotencyKey(FUNCAO, DONO, MODELO, messages, maxTokens);
}

Deno.test("canonicalize: pontuação vs sem — em `{ ab, a_b }`, `a_b` (0x5F) vem antes de `ab` (0x62)", () => {
  const mensagens = { ab: 1, a_b: 2 };
  const canonico = payloadCanonico(mensagens, MAX_TOKENS, CMP_CODE_UNIT);
  assert(
    canonico === '{"maxTokens":10,"messages":{"a_b":2,"ab":1}}',
    `em code-unit '_' (0x5F) < 'b' (0x62), então \`a_b\` tem de vir primeiro: ${canonico}`,
  );
  assert(
    chaveReal(mensagens) === chaveEsperada(mensagens, MAX_TOKENS, CMP_CODE_UNIT),
    "a chave real não corresponde à forma canônica de code-unit",
  );
});

Deno.test("canonicalize: a ordem NÃO é a do localeCompare (o caso discrimina)", () => {
  // IMPORTANTE/HONESTO: para `{ ab, a_b }` este runtime NÃO diverge — `localeCompare`
  // e code-unit dão a MESMA ordem (`a_b,ab`), então esse par sozinho não prova nada
  // contra a colação de idioma. Os pares abaixo sim DIVERGEM aqui:
  //  - pontuação×dígito: code-unit põe `a1` antes de `a_1` ('1'=0x31 < '_'=0x5F);
  //    localeCompare colaciona `a_1` antes de `a1`.
  //  - caixa: code-unit põe `aB` antes de `ab` ('B'=0x42 < 'b'=0x62);
  //    localeCompare ignora a caixa e mantém `ab` antes.
  const casos: Array<Record<string, number>> = [
    { a1: 1, a_1: 2 },
    { aB: 1, ab: 2 },
  ];
  for (const mensagens of casos) {
    const codeUnit = payloadCanonico(mensagens, MAX_TOKENS, CMP_CODE_UNIT);
    const locale = payloadCanonico(mensagens, MAX_TOKENS, CMP_LOCALE);
    assert(
      codeUnit !== locale,
      `o caso perdeu o poder de discriminar code-unit de localeCompare: ${codeUnit}`,
    );
    const real = chaveReal(mensagens);
    assert(
      real === chaveEsperada(mensagens, MAX_TOKENS, CMP_CODE_UNIT),
      `a chave deveria seguir code-unit, veio ${real}`,
    );
    assert(
      real !== chaveEsperada(mensagens, MAX_TOKENS, CMP_LOCALE),
      "a chave seguiu o localeCompare, não a ordem de code-unit",
    );
  }
});

Deno.test("canonicalize: ordena as chaves em TODOS os níveis (objeto aninhado)", () => {
  const mensagens = { z: 1, outer: { aB: 1, ab: 2 } };
  const codeUnit = payloadCanonico(mensagens, MAX_TOKENS, CMP_CODE_UNIT);
  const locale = payloadCanonico(mensagens, MAX_TOKENS, CMP_LOCALE);
  assert(
    codeUnit === '{"maxTokens":10,"messages":{"outer":{"aB":1,"ab":2},"z":1}}',
    `o nível aninhado deveria manter a ordem code-unit: ${codeUnit}`,
  );
  assert(codeUnit !== locale, `o caso aninhado perdeu o poder de discriminar: ${codeUnit}`);
  const real = chaveReal(mensagens);
  assert(
    real === chaveEsperada(mensagens, MAX_TOKENS, CMP_CODE_UNIT),
    `a chave aninhada deveria seguir code-unit, veio ${real}`,
  );
  assert(
    real !== chaveEsperada(mensagens, MAX_TOKENS, CMP_LOCALE),
    "a chave aninhada seguiu o localeCompare",
  );
});

Deno.test("canonicalize: é ESTÁVEL — a ordem de inserção não vaza para a chave", () => {
  // Esta é a propriedade que importa para o hash: o MESMO conjunto de pares, em
  // qualquer ordem de inserção, tem de cair na MESMA chave (mesma reserva).
  const a = chaveReal({ ab: 1, a_b: 2, Zebra: 3 });
  const b = chaveReal({ Zebra: 3, a_b: 2, ab: 1 });
  const c = chaveReal({ a_b: 2, Zebra: 3, ab: 1 });
  assert(a === b && b === c, `a ordem de inserção mudou a chave: ${a} / ${b} / ${c}`);
});

Deno.test("canonicalize: arrays PRESERVAM a ordem (não são reordenados)", () => {
  const canonico = payloadCanonico([3, 1, 2], MAX_TOKENS, CMP_CODE_UNIT);
  assert(
    canonico === '{"maxTokens":10,"messages":[3,1,2]}',
    `array deveria manter a ordem original: ${canonico}`,
  );
  assert(
    chaveReal([3, 1, 2]) === chaveEsperada([3, 1, 2], MAX_TOKENS, CMP_CODE_UNIT),
    "a chave do array não corresponde à ordem original",
  );
  // Se arrays fossem ordenados, [3,1,2] e [3,2,1] colidiriam na mesma chave.
  assert(
    chaveReal([3, 1, 2]) !== chaveReal([3, 2, 1]),
    "arrays com ordens diferentes colidiram — foram reordenados",
  );
});

Deno.test("canonicalize: primitivos e null voltam iguais (passam intactos)", () => {
  // `messages` ausente (undefined) e `null` normalizam para o mesmo null.
  assert(chaveReal(null) === chaveReal(undefined), "null e undefined deveriam normalizar igual");
  // Primitivos não viram objeto e não colidem entre valores distintos.
  assert(chaveReal(42) === chaveReal(42), "o mesmo primitivo deveria dar a mesma chave");
  assert(chaveReal(42) !== chaveReal(43), "primitivos diferentes colidiram");
  assert(chaveReal("ab") !== chaveReal("a_b"), "strings diferentes colidiram");
  // A forma canônica de um primitivo/null é o próprio valor.
  assert(
    payloadCanonico(42, null, CMP_CODE_UNIT) === '{"maxTokens":null,"messages":42}',
    `primitivo foi transformado: ${payloadCanonico(42, null, CMP_CODE_UNIT)}`,
  );
  assert(
    payloadCanonico(null, null, CMP_CODE_UNIT) === '{"maxTokens":null,"messages":null}',
    "null foi transformado",
  );
});
