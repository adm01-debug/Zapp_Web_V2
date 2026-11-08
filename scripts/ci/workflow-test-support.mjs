// Leitores restritos ao formato em blocos dos workflows deste repositorio.
// Nao sao um parser YAML geral: formatos nao reconhecidos falham nos contratos.
// Isolar job/step evita que comentarios e passos vizinhos satisfaçam garantias.
import assert from 'node:assert/strict';

export function jobsOf(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  assert.ok(start >= 0, 'mapa jobs ausente');
  const jobs = new Map();
  let id;
  let block = [];
  const save = () => {
    if (id) {
      assert.ok(!jobs.has(id), `job duplicado: ${id}`);
      jobs.set(id, block.join('\n'));
    }
  };
  for (const line of lines.slice(start + 1)) {
    const match = /^ {2}([\w-]+):\s*(?:#.*)?$/.exec(line);
    if (match) { save(); id = match[1]; block = [line]; }
    else if (/^\S/.test(line) && !line.startsWith('#')) { save(); id = undefined; break; }
    else if (id) block.push(line);
  }
  save();
  return jobs;
}

export function jobOf(source, id) {
  const job = jobsOf(source).get(id);
  assert.ok(job, `job ausente: ${id}`);
  return job;
}

export function stepsOf(job) {
  const lines = job.split(/\r?\n/);
  const start = lines.findIndex((line) => /^ {4}steps:\s*(?:#.*)?$/.test(line));
  assert.ok(start >= 0, 'steps ausentes no job');
  const steps = [];
  let block;
  for (const line of lines.slice(start + 1)) {
    if (/^ {6}-\s/.test(line)) {
      if (block) steps.push(block.join('\n'));
      block = [line.replace(/^ {6}- /, '        ')];
    } else if (line.trim() && !/^\s*#/.test(line) && /^ {0,4}\S/.test(line)) break;
    else if (block) block.push(line);
  }
  if (block) steps.push(block.join('\n'));
  return steps;
}

function scalar(text) {
  let quote;
  let end = text.length;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && quote === '"') { i++; continue; }
    if (text[i] === quote) quote = undefined;
    else if (!quote && (text[i] === '"' || text[i] === "'")) quote = text[i];
    else if (!quote && text[i] === '#' && (i === 0 || /\s/.test(text[i - 1]))) { end = i; break; }
  }
  const value = text.slice(0, end).trim();
  return /^(['"])[\s\S]*\1$/.test(value) ? value.slice(1, -1) : value;
}

export function valueOf(block, key, indent = 8) {
  assert.match(key, /^[\w-]+$/);
  const lines = block.split(/\r?\n/);
  const re = new RegExp(`^ {${indent}}${key}:\\s*(.*)$`);
  const matches = lines.flatMap((line, index) => re.test(line) ? [index] : []);
  assert.ok(matches.length <= 1, `chave duplicada: ${key}`);
  if (!matches.length) return undefined;
  const index = matches[0];
  const value = scalar(re.exec(lines[index])[1]);
  if (value && !/^[|>][-+]?$/.test(value)) return value;
  const content = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() && line.length - line.trimStart().length <= indent) break;
    content.push(line);
  }
  const nonempty = content.filter((line) => line.trim());
  if (!nonempty.length) return '';
  const width = Math.min(...nonempty.map((line) => line.length - line.trimStart().length));
  return content.map((line) => line.slice(width)).join(value.startsWith('>') ? ' ' : '\n').trimEnd();
}

export const nestedValue = (block, section, key) => valueOf(valueOf(block, section) ?? '', key, 0);
export const permission = (block, key, indent = 4) => valueOf(valueOf(block, 'permissions', indent) ?? '', key, 0);
export const runOf = (step) => valueOf(step, 'run') ?? '';
export const scriptOf = (step) => nestedValue(step, 'with', 'script') ?? '';
export const shellCode = (step) => runOf(step).split('\n').filter((line) => !/^\s*#/.test(line)).join('\n').replace(/\\\n\s*/g, ' ');
export const conditionOf = (block, indent = 8) => (valueOf(block, 'if', indent) ?? 'success()').replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim();

export function onlyStep(steps, predicate, description) {
  const found = steps.filter(predicate);
  assert.equal(found.length, 1, `esperado um unico passo: ${description}`);
  return found[0];
}

export function assertBlocking(block, indent = 8) {
  assert.ok([undefined, 'false'].includes(valueOf(block, 'continue-on-error', indent)), 'o contrato deve bloquear em falha');
}

// Avalia apenas o subconjunto booleano usado nos guards sob teste. Identificadores
// precisam estar no fixture; nada de contexto real, expansao de shell ou APIs.
export function conditionAllows(expression, bindings) {
  const tokens = expression.match(/\s+|&&|\|\||==|!=|[!()]|'[^']*'|"[^"]*"|[\w.-]+/g) ?? [];
  assert.equal(tokens.join(''), expression, 'expressao fora do subconjunto testado');
  const input = tokens.filter((x) => x.trim());
  let pos = 0;
  const take = (token) => input[pos] === token && (++pos, true);
  const primary = () => {
    if (take('!')) return !primary();
    if (take('(')) { const result = or(); assert.ok(take(')')); return result; }
    const token = input[pos++];
    assert.ok(token, 'expressao incompleta');
    if (/^['"]/.test(token)) return token.slice(1, -1);
    if (token === 'true' || token === 'false') return token === 'true';
    const key = take('(') ? (assert.ok(take(')')), `${token}()`) : token;
    assert.ok(Object.hasOwn(bindings, key), `contexto nao simulado: ${key}`);
    return bindings[key];
  };
  const comparison = () => {
    const left = primary();
    if (take('==')) return left === primary();
    if (take('!=')) return left !== primary();
    return left;
  };
  const and = () => { let result = comparison(); while (take('&&')) { const next = comparison(); result = result && next; } return result; };
  const or = () => { let result = and(); while (take('||')) { const next = and(); result = result || next; } return result; };
  const result = or();
  assert.equal(pos, input.length, 'tokens nao consumidos no guard');
  return Boolean(result);
}
