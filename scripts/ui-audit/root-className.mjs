/**
 * Extrai o className da raiz JSX de um componente de view.
 *
 * Heuristica deliberadamente conservadora, porque um extrator que erra o
 * elemento faz o guard dar verde sem auditar nada:
 *
 *  - o componente e o ultimo `export` do arquivo (function, const ou default);
 *  - so contam os `return` no nivel de indentacao do corpo do componente (2
 *    espacos). `return` dentro de callback (useMemo, map, useEffect) esta mais
 *    fundo e ficava de fora — era o que fazia o parser pegar a tag errada;
 *  - de cada return desses sai apenas a TAG DE ABERTURA do elemento, contando
 *    chaves para achar o '>' certo, senao um root com cn(...) faz o regex
 *    escorregar para um descendente;
 *  - guard clauses (`if (!x) return <.../>`) tambem sao raizes renderizadas,
 *    entao todas voltam, nao so a ultima.
 */

const CLASSNAME_RE =
  /className=(?:["'`]([^"'`]+)["'`]|\{(?:cn\([^)]*?["'`]([^"'`]+)["'`]|`([^`]+)`|"([^"]+)"|'([^']+)'))/;

/** Recorta a tag de abertura do primeiro elemento JSX a partir de `from`. */
function openingTagAt(source, from) {
  const tagStart = source.indexOf("<", from);
  if (tagStart === -1) return null;
  // Fragment (<>): raiz valida, so nao tem className — auditada como vazia.
  if (source[tagStart + 1] === ">") return "";

  let depth = 0;
  for (let i = tagStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return source.slice(tagStart, i + 1);
  }
  return null;
}

/**
 * @returns {string[]} um className por raiz retornada; vazio quando o arquivo
 * nao tem componente exportado ou nenhum return de JSX no nivel do corpo.
 */
export function extractRootClassNames(source) {
  const exportRe = /^export\s+(?:default\s+)?(?:function|const|class)\s+/gm;
  const exports = [...source.matchAll(exportRe)];
  if (exports.length === 0) return [];

  const body = source.slice(exports[exports.length - 1].index);

  // `return` no nivel do corpo do componente: exatamente 2 espacos de recuo.
  const roots = [];
  const returnRe = /^ {2}return\s*(\(|<)/gm;
  for (const m of body.matchAll(returnRe)) {
    const tag = openingTagAt(body, m.index);
    if (tag === null) continue;
    const cls = tag.match(CLASSNAME_RE);
    roots.push(cls ? (cls[1] || cls[2] || cls[3] || cls[4] || cls[5] || "") : "");
  }
  return roots;
}
