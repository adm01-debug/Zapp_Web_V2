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
  // acompanha o estado em vez de assumir o padrao. Sem isso o scanner fecha a
  // string no \' e engole o SQL seguinte (fail-open: um DROP real deixa de ser
  // projetado) — ou o inverso (falso positivo).
  //
  // Formas que o PG 17.11 REALMENTE aceita (todas medidas com sonda:
  // CREATE canario; <forma>; SELECT 'a\'; DROP TABLE canario):
  //   SET [SESSION] scs {=|TO} <bool>   com bool em on/off/true/false/1/0/yes/no
  //                                     (case-insensitive, com ou sem aspas)
  //   SET "scs" = <bool>                (nome do parametro citado)
  //   SET scs = default                 -> on
  //   RESET scs | RESET ALL | DISCARD ALL -> on
  //   SELECT set_config('scs', <bool>, false)
  //   SET LOCAL scs = off               -> so dentro de transacao explicita
  //   SET scs = 2                       -> ERROR (requires a Boolean value)
  let scsOff = false;
  let tx = null; // { scsOffNoInicio } enquanto houver BEGIN sem COMMIT/ROLLBACK
  let stmt = []; // tokens significativos do statement corrente (ate o ';')
  const nomeToken = (tok) => {
    if (!tok) return '';
    if (tok.type === 'ident') return tok.text.slice(1, -1).replace(/""/g, '"').toLowerCase();
    return tok.text.toLowerCase();
  };
  const lido = (tok) => {
    if (!tok) return null;
    if (tok.type === 'string') return tok.text.slice(1, -1).replace(/''/g, "'").toLowerCase();
    if (tok.type === 'ident') return tok.text.slice(1, -1).replace(/""/g, '"').toLowerCase();
    return tok.text.toLowerCase();
  };
  const booleano = (tok) => {
    const t = lido(tok);
    if (t === null) return null;
    if (['on', 'true', 'yes', '1', 'default'].includes(t)) return 'on';
    if (['off', 'false', 'no', '0'].includes(t)) return 'off';
    return null;
  };
  const fimDeTransacao = () => {
    if (tx) { scsOff = tx.scsOffNoInicio; tx = null; }
  };
  const aplicarStatement = (tokens) => {
    if (tokens.length === 0) return;
    const head = nomeToken(tokens[0]);
    if (head === 'begin' || (head === 'start' && nomeToken(tokens[1]) === 'transaction')) {
      if (!tx) tx = { scsOffNoInicio: scsOff };
      return;
    }
    if (head === 'commit' || head === 'rollback' || head === 'end') { fimDeTransacao(); return; }
    if ((head === 'reset' || head === 'discard') && nomeToken(tokens[1]) === 'all') {
      scsOff = false;
      return;
    }
    if (head === 'reset' && nomeToken(tokens[1]) === 'standard_conforming_strings') {
      scsOff = false;
      return;
    }
    if (head === 'set') {
      let i = 1;
      let local = false;
      const escopo = nomeToken(tokens[i]);
      if (escopo === 'session' || escopo === 'local') { local = escopo === 'local'; i += 1; }
      if (nomeToken(tokens[i]) !== 'standard_conforming_strings') return;
      i += 1;
      const op = nomeToken(tokens[i]);
      if (op !== '=' && op !== 'to') return;
      const v = booleano(tokens[i + 1]);
      if (v === null) return;
      // SET LOCAL so vale dentro da transacao corrente: fora dela o PG descarta no
      // fim do proprio statement (medido), entao nao pode mudar o estado do lexer.
      if (local && !tx) return;
      scsOff = v === 'off';
      return;
    }
    for (let i = 0; i + 4 < tokens.length; i += 1) {
      if (nomeToken(tokens[i]) !== 'set_config') continue;
      if (!(tokens[i + 1].type === 'symbol' && tokens[i + 1].text === '(')) continue;
      if (lido(tokens[i + 2]) !== 'standard_conforming_strings') continue;
      const v = booleano(tokens[i + 4]);
      if (v !== null) scsOff = v === 'off';
      return;
    }
  };
  const emit = (seg) => {
    segments.push(seg);
    if (seg.type !== 'word' && seg.type !== 'symbol'
      && seg.type !== 'string' && seg.type !== 'ident') return;
    if (seg.type === 'symbol' && seg.text === ';') {
      aplicarStatement(stmt);
      stmt = [];
      return;
    }
    stmt.push(seg);
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
      // aceita qualquer byte nao-ASCII, nao so [A-Za-z_] — e o PG valida BYTE a
      // byte, entao vale tambem FORA do plano basico (medido no PG 17: `$😀$`,
      // `$a😀b$` e `$<U+10FFFF>$` sao tags validas e o corpo fica opaco). O
      // intervalo vai ate U+10FFFF: `\uFFFF` sozinho cobria so o BMP, a tag astral
      // nao era reconhecida, o corpo virava tokens e um DROP citado dentro dele era
      // projetado como DDL (falso positivo — e um CREATE de mentira entrava na
      // projecao, fail-open).
      const opening = source.slice(i).match(/^\$(?:[A-Za-z_\u0080-\u{10FFFF}][A-Za-z0-9_\u0080-\u{10FFFF}]*)?\$/u)?.[0];
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
