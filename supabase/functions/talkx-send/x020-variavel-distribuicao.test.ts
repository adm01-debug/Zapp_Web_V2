// X020 — proporção, fronteiras e estabilidade do sorteio A/B de variantes.
//
// Continuação comportamental de x020-variavel-precedencia.test.ts: aquele fixa
// o determinismo por destinatário e a independência da ordem devolvida pelo
// banco; este fixa o que a decisão FAZ com o peso — proporção esperada,
// fronteiras (peso 0, negativo e não-finito), os caminhos de vazio/último
// recurso e a estabilidade da leitura repetida.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env \
//   --allow-read --allow-net=127.0.0.1 supabase/functions/talkx-send/x020-variavel-distribuicao.test.ts

import { pickVariant } from "./process-recipient.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Variant = {
  id: string;
  content: string;
  media_url: null;
  media_type: null;
  weight: number;
};

function variante(id: string, weight: number): Variant {
  return { id, content: `Texto ${id}`, media_url: null, media_type: null, weight };
}

// Mock mínimo da cadeia .from().select().eq() que pickVariant usa.
function banco(rows: Variant[] | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

// Sorteia `n` destinatários distintos e devolve quantas vezes cada variante saiu.
async function contagem(rows: Variant[], n: number, prefixo = "destinatario-"): Promise<Record<string, number>> {
  const sb = banco(rows);
  const c: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const v = await pickVariant(sb as never, "tpl-ab", `${prefixo}${i}`);
    assert(v !== null, `pickVariant devolveu null para ${prefixo}${i}`);
    c[v.id] = (c[v.id] ?? 0) + 1;
  }
  return c;
}

Deno.test("X020: pesos 1:2:3 distribuem na proporção em 6.000 destinatários", async () => {
  const rows = [variante("va", 1), variante("vb", 2), variante("vc", 3)];
  const n = 6000;
  const c = await contagem(rows, n);
  const esperado: Record<string, number> = { va: 1 / 6, vb: 2 / 6, vc: 3 / 6 };
  // 0,03 ≈ 4 desvios-padrão no pior caso (p = 0,5, n = 6.000): não é ajuste fino
  // ao acaso — é a largura que separa distribuição de degradação.
  const tolerancia = 0.03;
  for (const id of ["va", "vb", "vc"]) {
    const obtido = (c[id] ?? 0) / n;
    assert(
      Math.abs(obtido - esperado[id]) <= tolerancia,
      `${id}: esperava ${esperado[id].toFixed(3)} ±${tolerancia}, veio ${obtido.toFixed(4)} (${c[id] ?? 0}/${n})`,
    );
  }
  assert(
    Object.keys(c).sort().join(",") === "va,vb,vc",
    `todas as variantes com peso positivo devem sair: ${JSON.stringify(c)}`,
  );
});

Deno.test("X020: pesos 1:2:3 mantêm a proporção em 100.000 destinatários", async () => {
  const rows = [variante("va", 1), variante("vb", 2), variante("vc", 3)];
  const n = 100000;
  const c = await contagem(rows, n, "volume-");
  const esperado: Record<string, number> = { va: 1 / 6, vb: 2 / 6, vc: 3 / 6 };
  // Com n = 100.000 a tolerância de 0,01 é ~6 desvios-padrão: aqui um viés de
  // verdade (ex.: módulo errado) estoura a faixa, aleatoriedade não.
  const tolerancia = 0.01;
  for (const id of ["va", "vb", "vc"]) {
    const obtido = (c[id] ?? 0) / n;
    assert(
      Math.abs(obtido - esperado[id]) <= tolerancia,
      `${id}: esperava ${esperado[id].toFixed(3)} ±${tolerancia}, veio ${obtido.toFixed(4)} (${c[id] ?? 0}/${n})`,
    );
  }
});

Deno.test("X020: peso 99 domina o peso 1 com folga", async () => {
  const rows = [variante("forte", 99), variante("fraca", 1)];
  const n = 20000;
  const c = await contagem(rows, n, "dominancia-");
  const forte = (c["forte"] ?? 0) / n;
  assert(forte >= 0.985, `peso 99 deveria ficar ≥ 0,985 das vezes, veio ${forte.toFixed(4)}`);
  assert((c["fraca"] ?? 0) > 0, `peso 1 ainda deve ser sorteado às vezes: ${JSON.stringify(c)}`);
});

Deno.test("X020: mesma entrada devolve sempre a mesma variante (estabilidade)", async () => {
  const rows = [variante("va", 1), variante("vb", 2), variante("vc", 3)];
  const sb = banco(rows);
  const primeira: (string | null)[] = [];
  for (let i = 0; i < 500; i++) {
    const v = await pickVariant(sb as never, "tpl-ab", `fixo-${i}`);
    primeira.push(v?.id ?? null);
  }
  for (let i = 0; i < 500; i++) {
    const v = await pickVariant(sb as never, "tpl-ab", `fixo-${i}`);
    assert(
      (v?.id ?? null) === primeira[i],
      `destinatario fixo-${i} trocou de variante entre leituras: ${primeira[i]} != ${v?.id}`,
    );
  }
  // Mesmo id, 100 leituras seguidas: nunca troca.
  const alvo = await pickVariant(sb as never, "tpl-ab", "repetido-1");
  for (let i = 0; i < 100; i++) {
    const v = await pickVariant(sb as never, "tpl-ab", "repetido-1");
    assert(v?.id === alvo?.id, `repetido-1 trocou de variante: ${alvo?.id} != ${v?.id}`);
  }
});

Deno.test("X020: soma de pesos ≤ 0 devolve a última variante ordenada por id", async () => {
  const zeros = [variante("za", 0), variante("zb", 0)];
  const v0 = await pickVariant(banco(zeros) as never, "tpl-ab", "qualquer-1");
  assert(v0?.id === "zb", `soma 0 deve devolver a última (zb), veio ${v0?.id}`);

  const misto = [variante("ma", 0), variante("mb", -5)];
  const v1 = await pickVariant(banco(misto) as never, "tpl-ab", "qualquer-2");
  assert(v1?.id === "mb", `soma -5 deve devolver a última (mb), veio ${v1?.id}`);
});

Deno.test("X020: sem variantes (vazio ou null) devolve null", async () => {
  const vazio = await pickVariant(banco([]) as never, "tpl-ab", "destinatario-1");
  assert(vazio === null, `lista vazia deveria dar null: ${JSON.stringify(vazio)}`);
  const nulo = await pickVariant(banco(null) as never, "tpl-ab", "destinatario-1");
  assert(nulo === null, `data null deveria dar null: ${JSON.stringify(nulo)}`);
});

Deno.test("X020: variante com peso 0 ou negativo nunca é sorteada", async () => {
  const comZero = [variante("va", 1), variante("vzero", 0), variante("vb", 1)];
  const c0 = await contagem(comZero, 3000, "zero-");
  assert((c0["vzero"] ?? 0) === 0, `peso 0 nunca deveria sair: ${JSON.stringify(c0)}`);
  assert(
    (c0["va"] ?? 0) > 0 && (c0["vb"] ?? 0) > 0,
    `as duas variantes com peso 1 devem sair: ${JSON.stringify(c0)}`,
  );

  const comNegativo = [variante("va", 3), variante("vneg", -2), variante("vb", 3)];
  const c1 = await contagem(comNegativo, 3000, "negativo-");
  assert((c1["vneg"] ?? 0) === 0, `peso negativo nunca deveria sair: ${JSON.stringify(c1)}`);
});

Deno.test("X020: peso não-finito (NaN) nunca é sorteado; total NaN faz a decisão cair na última", async () => {
  // Defeito aberto em supabase/functions/talkx-send/process-recipient.ts:167-168:
  // a soma dos pesos vira NaN, `!(total > 0)` é verdadeiro e a função devolve
  // ordered[last] para QUALQUER destinatário — o sorteio deixa de distribuir.
  // Este cartão proíbe alterar código de produção: o defeito fica relatado.
  const rows = [variante("va", NaN), variante("vb", 1)];
  const c = await contagem(rows, 500, "nan-");
  assert((c["va"] ?? 0) === 0, `variante com peso NaN nunca deveria sair: ${JSON.stringify(c)}`);
  assert((c["vb"] ?? 0) === 500, `total NaN cai sempre na última (vb): ${JSON.stringify(c)}`);
});
