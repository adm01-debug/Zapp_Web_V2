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
 *    supabase-usage-guard.mjs, que substitui comentarios por espaco (no SQL,
 *    comentario vale como whitespace — nao pode colar tokens adjacentes) e
 *    torna strings/corpos dollar-quoted opacos para que os regex de CREATE/DROP
 *    nao casem dentro deles.
 */

function scanSqlSegments(input) {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const segments = [];
  let i = 0;

  // standard_conforming_strings: 'on' (padrao) trata backslash como LITERAL em
  // string normal; 'off' faz o backslash ESCAPAR a aspa em string normal (o PG
  // emite WARNING mas aceita — medido no PG 17.11: SELECT 'a\'b' devolve a'b).
  // Uma migration pode ligar/desligar no meio do arquivo, entao o scanner
  // acompanha `SET standard_conforming_strings = on|off|default` em vez de
  // assumir o padrao. Sem isso o scanner fecha a string no \' e engole o SQL
  // seguinte (fail-open: um DROP real deixa de ser projetado).
  let scsOff = false;
  const recent = []; // ultimos tokens significativos (deteccao do SET)
  const emit = (seg) => {
    segments.push(seg);
    if (seg.type !== 'word' && seg.type !== 'symbol' && seg.type !== 'string') return;
    recent.push(seg);
    if (recent.length > 4) recent.shift();
    if (recent.length < 4) return;
    const [a, b, c, d] = recent;
    const assign = (c.type === 'symbol' && c.text === '=')
      || (c.type === 'word' && c.text.toLowerCase() === 'to');
    const valor = d.type === 'word'
      ? d.text.toLowerCase()
      : (d.type === 'string' ? d.text.slice(1, -1).replace(/''/g, "'").toLowerCase() : '');
    if (a.type === 'word' && a.text.toLowerCase() === 'set'
      && b.type === 'word' && b.text.toLowerCase() === 'standard_conforming_strings'
      && assign && ['on', 'off', 'default'].includes(valor)) {
      scsOff = valor === 'off';
    }
  };

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (/\s/u.test(char)) {
      const start = i;
      i += 1;
      while (i < source.length && /\s/u.test(source[i])) i += 1;
      emit({ type: 'space', text: source.slice(start, i) });
      continue;
    }

    if (char === '-' && next === '-') {
      const start = i;
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      emit({ type: 'line-comment', text: source.slice(start, i) });
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
      emit({ type: 'block-comment', text: source.slice(start, i) });
      continue;
    }

    if (char === '$') {
      // Tag de dollar-quote segue dolq_start/dolq_cont do PostgreSQL (scan.l):
      // aceita qualquer byte nao-ASCII (acentos e afins), nao so [A-Za-z_]. Sem
      // isso `$ação$ ... $ação$` nao e reconhecido, o corpo vira tokens e um DROP
      // citado como texto dentro dele e projetado como DDL (falso positivo).
      const opening = source.slice(i).match(/^\$(?:[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*)?\$/u)?.[0];
      if (opening) {
        const end = source.indexOf(opening, i + opening.length);
        if (end === -1) {
          emit({ type: 'dollar', text: source.slice(i) });
          break;
        }
        emit({ type: 'dollar', text: source.slice(i, end + opening.length) });
        i = end + opening.length;
        continue;
      }
    }

    if (char === "'" || char === '"') {
      const quote = char;
      const prev = segments.length > 0 ? segments[segments.length - 1] : null;
      // E'...' (escape string) usa backslash para escapar a aspa; sem honrar o
      // escape o scanner fecharia a string no \' errado e engoliria (ou exporia)
      // o restante do arquivo — um fail-open/falso-positivo no guard.
      const backslashEscapes = quote === "'"
        && ((prev != null && prev.type === 'word' && /^[eE]$/.test(prev.text)) || scsOff);
      const start = i;
      i += 1;
      while (i < source.length) {
        if (backslashEscapes && source[i] === '\\' && i + 1 < source.length) {
          i += 2;
          continue;
        }
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
      // Aspas duplas abrem IDENTIFICADOR (nome de objeto; dobra "" escapa a
      // aspa); aspas simples abrem STRING (opaca, pode conter SQL "falso").
      // O guard precisa do nome do identificador para casar DROP TABLE
      // public."x" / "public".x.
      emit({ type: quote === '"' ? 'ident' : 'string', text: source.slice(start, i) });
      continue;
    }

    if (/[A-Za-z0-9_$]/u.test(char)) {
      const start = i;
      i += 1;
      const numeric = /[0-9]/.test(char);
      // Um token que comeca por digito e NUMERICO: o PostgreSQL nao deixa '$'
      // logo apos numero (1$q$X$q$ e erro), entao '$' nao pode ser engolido
      // como parte do word — ele deve abrir um dollar-quote/identificador.
      while (i < source.length && /[A-Za-z0-9_$]/u.test(source[i])) {
        if (numeric && source[i] === '$') break;
        i += 1;
      }
      emit({ type: 'word', text: source.slice(start, i) });
      continue;
    }

    emit({ type: 'symbol', text: char });
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
      // No SQL um comentario vale como whitespace: substituir por espaco (nao
      // remover) preserva a separacao entre tokens adjacentes — CREATE/*c*/FUNCTION
      // continua sendo CREATE FUNCTION, e dois '-' separados por comentario nao
      // colam num '--'.
      if (seg.type === 'line-comment' || seg.type === 'block-comment') return ' ';
      if (seg.type === 'dollar' || seg.type === 'string') return ' ';
      if (seg.type === 'ident') {
        // Identificador "..." e um NOME de objeto (nao uma string): expor o
        // conteudo (sem as aspas, com a dobra "" desfeita) para os regex de
        // CREATE/DROP casarem public."x" e "public".x.
        return seg.text.slice(1, -1).replace(/""/g, '"');
      }
      return seg.text;
    })
    .join('');
}
