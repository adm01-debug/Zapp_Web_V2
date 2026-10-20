// Mapa único tipado de ELEGIBILIDADE do Multiplix (bloco C / F30) — matriz de
// conversão PT (Singu) ↔ EN (Zapp) e EXAUSTIVIDADE do enum.
//
// Trava o aceite da decisão do dono: os valores do enum vivem em INGLÊS no banco
// e os rótulos em PORTUGUÊS na UI, com um mapa único tipado. Este teste prova
// que (a) o conjunto canônico é exatamente o dos 7 valores do F30; (b) o mapa de
// rótulos cobre TODOS eles (adicionar um valor ao enum sem o rótulo quebra aqui
// e no `deno check`, porque `ELIGIBILITY_LABELS_PT` é um Record exaustivo);
// (c) a tradução do Singu ('apto'|'destino_invalido'|'fora_do_escopo') bate com
// os valores canônicos; e (d) um valor DESCONHECIDO NUNCA vira 'eligible' — cai
// no fallback seguro.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/_shared/__tests__/multiplix-eligibility.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  ELIGIBILITY_LABELS_PT,
  fromSinguEligibility,
  MULTIPLIX_ELIGIBILITY_FALLBACK,
  MULTIPLIX_ELIGIBILITY_VALUES,
  SINGU_ELIGIBILITY_VALUES,
  type MultiplixEligibility,
} from "../multiplix-eligibility.ts";

// ─── Conjunto canônico (travado contra a spec do F30) ────────────
Deno.test("os 7 valores canônicos são exatamente os do enum multiplix_eligibility (F30)", () => {
  assertEquals(MULTIPLIX_ELIGIBILITY_VALUES, [
    "eligible",
    "no_destination",
    "suppressed",
    "out_of_scope",
    "media_pending",
    "connection_unavailable",
    "requires_template",
  ]);
  assertEquals(MULTIPLIX_ELIGIBILITY_VALUES.length, 7);
  // Sem duplicata: 7 valores, 7 distintos.
  assertEquals(new Set(MULTIPLIX_ELIGIBILITY_VALUES).size, 7);
});

Deno.test("o fallback é um valor do próprio enum (não é um literal inventado)", () => {
  assert(
    MULTIPLIX_ELIGIBILITY_VALUES.includes(MULTIPLIX_ELIGIBILITY_FALLBACK),
    `fallback fora do enum: ${MULTIPLIX_ELIGIBILITY_FALLBACK}`,
  );
});

// ─── Exaustividade do mapa de rótulos PT ─────────────────────────
// Se alguém acrescentar um valor ao enum, `ELIGIBILITY_LABELS_PT` precisa da
// chave correspondente — senão o `Record<MultiplixEligibility, string>` não
// compila e este teste quebra. O inverso também é barrado aqui.
Deno.test("o mapa de rótulos PT cobre os 7 valores do enum (sem faltar nem sobrar)", () => {
  assertEquals(
    Object.keys(ELIGIBILITY_LABELS_PT).sort(),
    [...MULTIPLIX_ELIGIBILITY_VALUES].sort(),
  );
});

Deno.test("todo valor canônico tem rótulo PT não vazio", () => {
  for (const value of MULTIPLIX_ELIGIBILITY_VALUES) {
    const label = ELIGIBILITY_LABELS_PT[value];
    assert(typeof label === "string", `rótulo ausente para ${value}`);
    assert(label.trim().length > 0, `rótulo vazio para ${value}`);
  }
});

// ─── Tradução do Singu (PT) → Zapp (EN) ──────────────────────────
const SINGU_KNOWN: Array<[string, MultiplixEligibility]> = [
  ["apto", "eligible"],
  ["destino_invalido", "no_destination"],
  ["fora_do_escopo", "out_of_scope"],
];

for (const [raw, expected] of SINGU_KNOWN) {
  Deno.test(`fromSinguEligibility(${JSON.stringify(raw)}) -> ${expected}`, () => {
    assertEquals(fromSinguEligibility(raw), expected);
  });
}

Deno.test("todos os literais do Singu conhecidos traduzem (o mapa cobre o produtor)", () => {
  for (const raw of SINGU_ELIGIBILITY_VALUES) {
    const mapped = fromSinguEligibility(raw);
    // Cada literal PT cai em exatamente um valor do enum canônico.
    assert(
      MULTIPLIX_ELIGIBILITY_VALUES.includes(mapped),
      `'${raw}' traduziu para '${mapped}', que não é valor do enum`,
    );
    // E esse valor tem rótulo PT (o par PT→EN→rótulo fecha).
    assert(ELIGIBILITY_LABELS_PT[mapped].length > 0, `sem rótulo para '${mapped}'`);
  }
});

Deno.test("a tradução é trim + case-insensitive (mesma regra do vocabulário de IA)", () => {
  assertEquals(fromSinguEligibility("  APTO  "), "eligible");
  assertEquals(fromSinguEligibility("Destino_Invalido"), "no_destination");
  assertEquals(fromSinguEligibility("Fora_Do_Escopo"), "out_of_scope");
});

// ─── Ausência: legado sem a coluna (contrato COALESCE) ───────────
Deno.test("ausência de classificação vira 'eligible' (resolvedor antigo sem a coluna)", () => {
  // Mesma leitura da RPC (COALESCE(elegibilidade,'apto')): a linha não pode ser
  // descartada por o produtor não devolver a coluna. A coluna do F31 é NOT NULL,
  // então a ausência precisa virar um valor concreto.
  assertEquals(fromSinguEligibility(null), "eligible");
  assertEquals(fromSinguEligibility(undefined), "eligible");
});

// ─── Valor desconhecido: fallback SEGURO, nunca 'eligible' ───────
const UNKNOWN: unknown[] = [
  "", // vazio (a coluna veio, mas sem valor) — não é ausência
  "   ",
  "elegivel", // PT inventado
  "sem_destino", // PT inventado
  "requires_template", // valor do enum do Zapp que o Singu NÃO devolve
  "eligible", // valor do Zapp que o Singu NÃO devolve
  "aprovado",
  "purple",
  0,
  42,
  true,
  {},
  [],
  ["apto"],
];

for (const raw of UNKNOWN) {
  Deno.test(`fromSinguEligibility(${JSON.stringify(raw)}) -> fallback ${MULTIPLIX_ELIGIBILITY_FALLBACK}`, () => {
    assertEquals(fromSinguEligibility(raw), MULTIPLIX_ELIGIBILITY_FALLBACK);
  });
}

Deno.test("valor desconhecido NUNCA vira 'eligible'", () => {
  // O filtro da RPC só deixa passar 'eligible'; promover um desconhecido a
  // eligible dispararia mensagem para quem talvez não possa receber.
  for (const raw of UNKNOWN) {
    const mapped = fromSinguEligibility(raw);
    assert(mapped !== "eligible", `${JSON.stringify(raw)} virou 'eligible'`);
    assertEquals(mapped, "out_of_scope");
  }
});
