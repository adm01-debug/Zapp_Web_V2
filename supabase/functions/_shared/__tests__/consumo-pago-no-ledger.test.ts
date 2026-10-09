// SL-013 / IA-003 B6 — "toda chamada paga gera linha no ledger".
//
// Defeito: nenhuma função `elevenlabs-*` registrava consumo. As chamadas pagas
// ao provedor saíam sem nenhuma linha em `ai_usage_logs`, então o relatório de
// custo (IA-058) não tinha base nenhuma para o gasto do ElevenLabs.
//
// Este teste é a GUARDA permanente: ele NÃO confere um exemplo, ele varre as
// fontes reais em `supabase/functions/*/index.ts` e falha se alguma função que
// fala com provedor pago deixar de registrar o consumo. Uma família nova
// (`elevenlabs-*`, `classify-*`) entra na varredura sozinha, pelo nome da pasta.
//
// Como uma função registra (qualquer um dos dois vale, e os dois são aceitos
// porque o registro pelo despacho central é o caminho canônico das funções de
// texto):
//   (a) DIRETO — importa `logAiUsage`/`logAiUsageDetached` de `_shared/ai-usage.ts`;
//   (b) PELO DESPACHO CENTRAL — chama `generateWithRouting`/`callAiWithTracking`,
//       que gravam em `ai_usage_logs` em TODOS os desfechos (IA-033/IA-049).
//
// PROVA COMPORTAMENTAL IRMÃ: `elevenlabs-dialogue/index.test.ts` roda o handler
// real e captura o insert no ledger (uma linha por chamada, unidade caractere,
// tokens NULL). Esta guarda cobre as funções que não têm esse teste.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";

/** Raiz das funções: `supabase/functions/`. */
const RAIZ = new URL("../../", import.meta.url);

/** Endpoints de provedor que COBRAM dinheiro por chamada. */
const HOSTS_PAGOS = [
  "api.elevenlabs.io",
  "ai.gateway.lovable.dev",
  "openrouter.ai",
  "api.openai.com",
];

/** Marcas de registro DIRETO no ledger (import de `_shared/ai-usage.ts`). */
const REGISTRO_DIRETO = ["logAiUsage(", "logAiUsageDetached("];

/** Marcas de registro PELO despacho central (que grava por dentro). */
const REGISTRO_PELO_DESPACHO = ["generateWithRouting(", "callAiWithTracking("];

const IMPORT_DO_LOGGER = 'from "../_shared/ai-usage.ts"';

/**
 * Funções da família `elevenlabs-*` que NÃO fazem chamada paga de saída: elas
 * são ponto de ENTRADA (o provedor chama a nossa função). A isenção é conferida
 * contra o código no próprio teste — não é uma exceção no escuro.
 */
const ELEVENLABS_SEM_CHAMADA_PAGA = ["elevenlabs-webhook"];

/**
 * Funções que falam com provedor pago e ainda NÃO registram consumo, fora do
 * escopo deste cartão (o título cita `elevenlabs-*`, `voice-agent` e
 * `classify-*`). São dívida DECLARADA: a lista é fechada de propósito — uma
 * função nova sem registro faz o teste falhar em vez de entrar aqui sozinha.
 */
const PENDENTES_DECLARADAS = ["ai-transcribe-audio", "voice-changer"];

async function listarFuncoes(): Promise<string[]> {
  const nomes: string[] = [];
  for await (const entrada of Deno.readDir(RAIZ)) {
    if (!entrada.isDirectory || entrada.name.startsWith("_") || entrada.name.startsWith(".")) continue;
    nomes.push(entrada.name);
  }
  return nomes.sort();
}

/** Fonte da função ou `null` quando a pasta não tem `index.ts`. */
async function fonte(nome: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(new URL(`${nome}/index.ts`, RAIZ));
  } catch {
    return null;
  }
}

function registraConsumo(src: string): boolean {
  const direto = REGISTRO_DIRETO.some((marca) => src.includes(marca)) && src.includes(IMPORT_DO_LOGGER);
  const peloDespacho = REGISTRO_PELO_DESPACHO.some((marca) => src.includes(marca));
  return direto || peloDespacho;
}

Deno.test("SL-013: TODA função `elevenlabs-*` que chama o provedor pago registra o consumo no ledger", async () => {
  const daFamilia = (await listarFuncoes()).filter((nome) => nome.startsWith("elevenlabs-"));
  // Anti-vazio: sem esta asserção o teste passaria com a varredura quebrada.
  assert(
    daFamilia.length >= 8,
    `esperado o inventário das funções elevenlabs-* (IA-002 §(c)); encontrei ${daFamilia.length}: ${daFamilia.join(", ")}`,
  );

  // A isenção das funções de ENTRADA é conferida no CÓDIGO: só vale porque a
  // função não faz chamada de saída ao provedor pago. Se ela passar a fazer, a
  // isenção cai sozinha e o teste abaixo cobra o registro.
  for (const isenta of ELEVENLABS_SEM_CHAMADA_PAGA) {
    const src = await fonte(isenta);
    assert(src !== null, `${isenta} deveria existir em supabase/functions/`);
    assert(
      !HOSTS_PAGOS.some((host) => src.includes(host)),
      `${isenta} está isenta por ser ponto de ENTRADA (o provedor chama a gente); se ela passou a chamar o provedor pago, a isenção caiu`,
    );
  }

  const semRegistro: string[] = [];
  for (const nome of daFamilia) {
    if (ELEVENLABS_SEM_CHAMADA_PAGA.includes(nome)) continue;
    const src = await fonte(nome);
    if (src === null) continue;
    if (!registraConsumo(src)) semRegistro.push(nome);
  }

  assertEquals(
    semRegistro,
    [],
    `estas funções chamam o provedor pago e não registram consumo (ledger cego): ${semRegistro.join(", ")}`,
  );
});

Deno.test("SL-013: `voice-agent` e as `classify-*` registram o consumo", async () => {
  const nomes = (await listarFuncoes()).filter(
    (nome) => nome === "voice-agent" || nome.startsWith("classify-"),
  );
  assert(
    nomes.length >= 4,
    `esperado voice-agent + classify-*; encontrei ${nomes.length}: ${nomes.join(", ")}`,
  );

  const semRegistro: string[] = [];
  for (const nome of nomes) {
    const src = await fonte(nome);
    if (src === null) continue;
    if (!registraConsumo(src)) semRegistro.push(nome);
  }

  assertEquals(
    semRegistro,
    [],
    `estas funções de IA paga não registram consumo: ${semRegistro.join(", ")}`,
  );
});

Deno.test("SL-013: o inventário de provedor pago é FECHADO — função nova sem registro falha aqui", async () => {
  const nomes = await listarFuncoes();
  const semRegistro: string[] = [];

  for (const nome of nomes) {
    const src = await fonte(nome);
    if (src === null) continue;
    if (!HOSTS_PAGOS.some((host) => src.includes(host))) continue;
    if (registraConsumo(src)) continue;
    semRegistro.push(nome);
  }

  assertEquals(
    semRegistro.sort(),
    [...PENDENTES_DECLARADAS].sort(),
    "toda função que fala com provedor pago tem de registrar consumo; a dívida declarada é fechada e não pode crescer sem um cartão próprio",
  );
});

Deno.test("SL-013: nenhum ponto de log de consumo descarta a promessa com `void logAiUsage`", async () => {
  const nomes = await listarFuncoes();
  const comDescarte: string[] = [];

  for (const nome of nomes) {
    const src = await fonte(nome);
    if (src === null) continue;
    // IA-049: `void logAiUsage(...)` perde o registro se a função encerrar
    // antes do insert — é o defeito que `logAiUsageDetached` fechou.
    if (/void\s+logAiUsage\s*\(/.test(src)) comDescarte.push(nome);
  }

  assertEquals(
    comDescarte,
    [],
    `estas funções descartam a promessa do insert de consumo: ${comDescarte.join(", ")}`,
  );
});
