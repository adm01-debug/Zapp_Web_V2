/**
 * Extração de objeto JSON da saída crua de modelos de IA.
 *
 * Por que não regex: o padrão `/\{[\s\S]*\}/` é um quantificador aninhado que o
 * Sonar marca como backtracking super-linear (typescript:S8786). `indexOf` +
 * `lastIndexOf` produzem exatamente o mesmo recorte — do PRIMEIRO `{` ao ÚLTIMO
 * `}` (o regex era guloso) — sem custo de backtracking e sem depender do motor
 * de expressões regulares.
 *
 * Não é um parser tolerante: só delimita o candidato. Quem chama decide o que
 * fazer quando o recorte não é JSON válido (aqui, sempre `null` — nunca dado
 * fabricado).
 */

/** Recorta do primeiro `{` ao último `}`; `null` quando não existe par delimitador. */
export function extractJsonObject(texto: string): string | null {
  if (typeof texto !== "string") return null;
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  return inicio >= 0 && fim > inicio ? texto.slice(inicio, fim + 1) : null;
}

/** Recorta e faz o parse; `null` quando não há objeto JSON válido no texto. */
export function parseJsonObject(texto: string): unknown {
  const bruto = extractJsonObject(texto);
  if (bruto === null) return null;
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}
