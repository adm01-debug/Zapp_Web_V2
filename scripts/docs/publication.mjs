/**
 * Projecao lexical de ADD/DROP TABLE declarados para supabase_realtime/public.
 * Reusa o lexer compartilhado; nao executa SQL nem representa o estado real do PG.
 *
 * DO/plpgsql e EXECUTE literal sao inspecionados, sem avaliar IF/EXCEPTION.
 * CREATE PUBLICATION vazio e neutro: a projecao pressupoe que ela existe.
 * Tabela sem schema mantem a convencao public; identificadores citados preservam case.
 * SELECT, RAISE e corpos de funcoes permanecem opacos. Expressoes/variaveis nao
 * geram eventos; evidencias literais de DDL de publication geram diagnostico.
 * Nao resolve funcoes, loops, consultas indiretas nem strings codificadas.
 * Formas de membership/identidade fora da gramatica reconhecida falham alto.
 * A expansao de corpos/literais e limitada a oito niveis.
 */
import { sqlTokens } from '../db-audit/sql-lexer.mjs';

const MAX_EXPANSIONS = 8;
const literalEvidence = (token) => {
  if (token?.startsWith("'")) return token.slice(1, token.endsWith("'") ? -1 : undefined).replace(/''/g, "'");
  const tag = token?.match(/^(\$(?:[A-Za-z_\u0080-\u{10FFFF}][A-Za-z0-9_\u0080-\u{10FFFF}]*)?\$)/u)?.[1];
  return tag && token.endsWith(tag) ? token.slice(tag.length, -tag.length) : token;
};
const mentionsPublication = (tokens) => {
  const marker = (text) => /(?:publication|supabase_realtime)/i.test(text.replace(/['|\s]/g, ''));
  return marker(tokens.join(' ')) || marker(tokens.filter(isLiteral).map(literalEvidence).join(''));
};
const identifier = (token) => {
  if (/^"(?:[^"]|"")+"$/u.test(token ?? '')) return token.slice(1, -1).replace(/""/g, '"');
  return /^[a-z_][a-z0-9_$]*$/u.test(token ?? '') ? token : undefined;
};
const isLiteral = (token) => token?.startsWith("'") || token?.startsWith('$');

/** Projecao lexical, sem avaliar IF/EXCEPTION nem executar SQL. */
export function publicationChanges(sql, origin = 'SQL') {
  const unsupported = (reason) => {
    const error = new Error(`${origin}: publication não suportada: ${reason}`);
    error.code = 'PUBLICATION_UNSUPPORTED';
    throw error;
  };

  function literal(token) {
    if (token?.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/su.test(token)) unsupported('string sem fechamento reconhecido');
      return { value: token.slice(1, -1).replace(/''/g, "'"), backslash: token.includes('\\') };
    }
    const tag = token?.match(/^(\$(?:[A-Za-z_\u0080-\u{10FFFF}][A-Za-z0-9_\u0080-\u{10FFFF}]*)?\$)/u)?.[1];
    if (!tag || token.length < tag.length * 2 || !token.endsWith(tag)) {
      unsupported('corpo dollar-quoted sem fechamento reconhecido');
    }
    return { value: token.slice(tag.length, -tag.length), backslash: false };
  }

  function alter(tokens) {
    if (tokens[0] !== 'alter' || tokens[1] !== 'publication') return [];
    if (identifier(tokens[2]) !== 'supabase_realtime') {
      if (tokens[3] === 'rename' && tokens[4] === 'to' && identifier(tokens[5]) === 'supabase_realtime') {
        unsupported('RENAME para a publication alvo fora da projeção reconhecida');
      }
      return [];
    }
    const action = tokens[3];
    if (!['add', 'drop'].includes(action) || tokens[4] !== 'table') {
      unsupported('esperado ADD TABLE ou DROP TABLE');
    }
    let index = 5;
    const changes = [];
    const tables = new Set();
    while (index < tokens.length) {
      const first = identifier(tokens[index++]);
      if (first === undefined) unsupported('nome de tabela ausente ou inválido');
      let schema = 'public';
      let table = first;
      if (tokens[index] === '.') {
        schema = first;
        table = identifier(tokens[++index]);
        index += 1;
        if (table === undefined) unsupported('nome de tabela qualificada incompleto');
      }
      const key = `${schema}\0${table}`;
      if (tables.has(key)) unsupported('tabela repetida na mesma operação');
      tables.add(key);
      if (tokens[index] === '(') {
        if (action !== 'add') unsupported('lista de colunas em DROP TABLE');
        index += 1;
        const columns = new Set();
        while (true) {
          const column = identifier(tokens[index++]);
          if (column === undefined || columns.has(column)) unsupported('lista de colunas inválida');
          columns.add(column);
          if (tokens[index] === ')') { index += 1; break; }
          if (tokens[index++] !== ',') unsupported('lista de colunas incompleta');
        }
      }
      if (schema === 'public') changes.push({ action: action.toUpperCase(), table });
      if (index === tokens.length) return changes;
      if (tokens[index++] !== ',' || index === tokens.length) unsupported('restante da lista de tabelas inválido');
    }
    unsupported('lista de tabelas vazia');
  }

  function statements(tokens) {
    const result = [];
    let start = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] === ';') { result.push(tokens.slice(start, index)); start = index + 1; }
    }
    if (start < tokens.length) result.push(tokens.slice(start));
    return result;
  }

  function publicationLifecycle(tokens) {
    if (!['create', 'drop'].includes(tokens[0]) || tokens[1] !== 'publication') return;
    if (tokens[0] === 'create' && identifier(tokens[2]) === 'supabase_realtime') {
      if (tokens.length !== 3) unsupported('CREATE PUBLICATION com opções fora da projeção reconhecida');
    } else if (tokens[0] === 'drop' && tokens.slice(2).some((token) => identifier(token) === 'supabase_realtime')) {
      unsupported('DROP PUBLICATION fora da projeção reconhecida');
    }
  }

  function rejectAtomicRoutines(tokens) {
    if (!mentionsPublication(tokens)) return;
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] !== 'create') continue;
      const nameIndex = tokens[index + 1] === 'or' && tokens[index + 2] === 'replace' ? index + 3 : index + 1;
      if (!['function', 'procedure'].includes(tokens[nameIndex])) continue;
      const end = tokens.indexOf(';', nameIndex);
      const header = tokens.slice(nameIndex, end === -1 ? tokens.length : end);
      if (header.some((token, i) => token === 'begin' && header[i + 1] === 'atomic')) {
        unsupported('rotina com BEGIN ATOMIC fora da projeção reconhecida');
      }
    }
  }

  function doBody(tokens, depth) {
    const initialHint = mentionsPublication(tokens);
    let index = 1;
    let language = 'plpgsql';
    let languageDeclared = false;
    if (tokens[index] === 'language') {
      language = identifier(tokens[index + 1]);
      languageDeclared = true;
      index += 2;
    }
    if (!isLiteral(tokens[index])) {
      if (initialHint) unsupported('DO sem corpo literal reconhecido');
      return [];
    }
    let body;
    try { body = literal(tokens[index++]); } catch (error) {
      if (initialHint) throw error;
      return [];
    }
    if (!initialHint && !mentionsPublication(sqlTokens(body.value))) return [];
    if (tokens[index] === 'language') {
      if (languageDeclared) unsupported('LANGUAGE duplicado no DO');
      language = identifier(tokens[index + 1]);
      index += 2;
    }
    if (index !== tokens.length || language !== 'plpgsql') unsupported('forma ou linguagem de DO não reconhecida');
    if (body.backslash) unsupported('escape por backslash em corpo DO simples');
    return expand(body.value, depth + 1, true);
  }

  function block(tokens, depth) {
    const changes = [];
    let declaration = tokens[0] === 'declare';
    let declaredPublication = false;
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] === 'begin') declaration = false;
      if ((tokens[index] === ':' && tokens[index + 1] === '=') || (declaration && tokens[index] === 'default')) {
        const end = tokens.indexOf(';', index);
        if (mentionsPublication(tokens.slice(index, end === -1 ? tokens.length : end))) declaredPublication = true;
      }
    }
    rejectAtomicRoutines(tokens);
    for (let index = 0; index < tokens.length; index += 1) {
      const previous = tokens[index - 1];
      if (index !== 0 && ![';', 'begin', 'then', 'else', 'loop'].includes(previous)) continue;
      const command = tokens[index];
      if (!['alter', 'execute', 'do', 'create', 'drop'].includes(command)) continue;
      const end = tokens.indexOf(';', index);
      const next = end === -1 ? tokens.length : end;
      const statement = tokens.slice(index, next);
      if (command === 'alter') changes.push(...alter(statement));
      else if (command === 'do') changes.push(...doBody(statement, depth));
      else if (command === 'create' || command === 'drop') publicationLifecycle(statement);
      else if (isLiteral(statement[1])) {
        const value = literal(statement[1]);
        const tail = statement.slice(2);
        if (tail.length && !['using', 'into'].includes(tail[0])) {
          if (mentionsPublication(statement) || declaredPublication) unsupported('expressão de EXECUTE envolvendo publication');
        } else {
          if (value.backslash && mentionsPublication([value.value])) unsupported('escape de EXECUTE envolvendo publication');
          const literalChanges = expand(value.value, depth + 1, false);
          if (tail.length && literalChanges.length) unsupported('EXECUTE de publication não é literal simples isolado');
          changes.push(...literalChanges);
        }
      } else if (declaredPublication || mentionsPublication(statement)) {
        unsupported('EXECUTE dinâmico envolvendo publication');
      }
      index = next;
    }
    return changes;
  }

  function expand(text, depth, inBlock) {
    if (depth > MAX_EXPANSIONS) unsupported('limite de expansão de corpos/literais excedido');
    const tokens = sqlTokens(text);
    if (inBlock) return block(tokens, depth);
    const parts = statements(tokens);
    rejectAtomicRoutines(tokens);
    return parts.flatMap((part) => {
      publicationLifecycle(part);
      return part[0] === 'alter' ? alter(part) : part[0] === 'do' ? doBody(part, depth) : [];
    });
  }

  return expand(sql, 0, false);
}
