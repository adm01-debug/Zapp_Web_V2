/**
 * Lexer SQL compartilhado entre check-migration-drift.mjs e
 * supabase-usage-guard.mjs.
 *
 * Um unico scanner reconhece comentarios de linha (--), comentarios de bloco
 * (/* ... *\/, aninhados), strings ('...', "..." com escape por dobra de aspa)
 * e corpos dollar-quoted ($tag$...$tag$). Centralizar evita dois lexers
 * divergentes: qualquer ajuste na forma de reconhecer um desses construtos
 * vale para os dois consumidores.
 *
 * Consumidores:
 *  - sqlTokens(): base do canonicalSql() de check-migration-drift.mjs
 *    (comparacao arquivo <-> ledger), que normaliza case e espacos.
 *  - stripSqlComments(): base da projecao forward-only do
 *    supabase-usage-guard.mjs, que remove comentarios e torna strings/corpos
 *    dollar-quoted opacos para que os regex de CREATE/DROP nao casem dentro
 *    deles.
 */

function scanSqlSegments(input) {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const segments = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (/\s/u.test(char)) {
      const start = i;
      i += 1;
      while (i < source.length && /\s/u.test(source[i])) i += 1;
      segments.push({ type: 'space', text: source.slice(start, i) });
      continue;
    }

    if (char === '-' && next === '-') {
      const start = i;
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      segments.push({ type: 'line-comment', text: source.slice(start, i) });
      continue;
    }

    if (char === '/' && next === '*') {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (source[i] === '/' && source[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (source[i] === '*' && source[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      segments.push({ type: 'block-comment', text: source.slice(start, i) });
      continue;
    }

    if (char === '$') {
      const opening = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (opening) {
        const end = source.indexOf(opening, i + opening.length);
        if (end === -1) {
          segments.push({ type: 'dollar', text: source.slice(i) });
          break;
        }
        segments.push({ type: 'dollar', text: source.slice(i, end + opening.length) });
        i = end + opening.length;
        continue;
      }
    }

    if (char === "'" || char === '"') {
      const quote = char;
      const start = i;
      i += 1;
      while (i < source.length) {
        if (source[i] === quote) {
          if (source[i + 1] === quote) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      segments.push({ type: 'quoted', text: source.slice(start, i) });
      continue;
    }

    if (/[A-Za-z0-9_$]/u.test(char)) {
      const start = i;
      i += 1;
      while (i < source.length && /[A-Za-z0-9_$]/u.test(source[i])) i += 1;
      segments.push({ type: 'word', text: source.slice(start, i) });
      continue;
    }

    segments.push({ type: 'symbol', text: char });
    i += 1;
  }

  return segments;
}

export function sqlTokens(input) {
  return scanSqlSegments(input)
    .filter((seg) => seg.type !== 'space'
      && seg.type !== 'line-comment'
      && seg.type !== 'block-comment')
    .map((seg) => (seg.type === 'word' ? seg.text.toLowerCase() : seg.text));
}

export function stripSqlComments(input) {
  return scanSqlSegments(input)
    .map((seg) => {
      if (seg.type === 'line-comment' || seg.type === 'block-comment') return '';
      if (seg.type === 'dollar' || seg.type === 'quoted') return ' ';
      return seg.text;
    })
    .join('');
}
