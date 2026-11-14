import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Lógica pura do CI local (scripts/ci/ci-local.mjs): lê os workflows do GitHub
// e decide O QUE rodar, sem executar nada. Tudo aqui é determinístico e coberto
// por scripts/ci/ci-local.unit.mjs.
//
// Princípio: o CI local NÃO mantém uma cópia dos comandos. Ele interpreta os
// próprios .github/workflows/*.yml, então mudou lá, mudou aqui. Onde a semântica
// do Actions importa (expressões, matriz, status implícito) seguimos a
// especificação oficial; o que não sabemos avaliar NÃO roda "no escuro".

/** Expressão que o CI local não sabe avaliar (ex.: hashFiles). Quem chama falha o job. */
export class ExpressaoNaoSuportada extends Error {}

const FUNCOES_STATUS = new Set(['always', 'success', 'failure', 'cancelled']);
const CONTEXTOS = new Set([
  'env',
  'matrix',
  'secrets',
  'vars',
  'github',
  'runner',
  'steps',
  'needs',
  'inputs',
  'job',
  'strategy',
]);

// ------------------------------------------------------------- tokenização
function tokenizar(expr) {
  const out = [];
  const s = String(expr);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let v = '';
      for (;;) {
        if (j >= s.length) throw new ExpressaoNaoSuportada(`string sem fim em "${expr}"`);
        if (s[j] === "'") {
          if (s[j + 1] === "'") {
            v += "'";
            j += 2;
            continue;
          }
          break;
        }
        v += s[j++];
      }
      out.push({ t: 'lit', v });
      i = j + 1;
      continue;
    }
    const resto = s.slice(i);
    const num = /^(?:0x[0-9a-f]+|0o[0-7]+|-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?![\w.])/i.exec(
      resto
    );
    if (num) {
      out.push({ t: 'lit', v: paraNumero(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(resto);
    if (id) {
      const w = id[0];
      if (w === 'true' || w === 'false') out.push({ t: 'lit', v: w === 'true' });
      else if (w === 'null') out.push({ t: 'lit', v: null });
      else if (w === 'NaN') out.push({ t: 'lit', v: NaN });
      else if (w === 'Infinity') out.push({ t: 'lit', v: Infinity });
      else out.push({ t: 'id', v: w });
      i += w.length;
      continue;
    }
    const op = /^(?:<=|>=|==|!=|&&|\|\||[()[\]!<>,.*])/.exec(resto);
    if (op) {
      out.push({ t: 'op', v: op[0] });
      i += op[0].length;
      continue;
    }
    throw new ExpressaoNaoSuportada(`não entendi "${resto}" em "${expr}"`);
  }
  return out;
}

/** true se a expressão chama always()/success()/failure()/cancelled(). */
export function usaFuncaoStatus(expr) {
  let tokens;
  try {
    tokens = tokenizar(expr);
  } catch {
    return false;
  }
  return tokens.some((t, k) => t.t === 'id' && FUNCOES_STATUS.has(t.v) && tokens[k + 1]?.v === '(');
}

// ------------------------------------------------------ coerção (especificação)
// https://docs.github.com/actions/learn-github-actions/expressions#operators
class Filtro extends Array {}

function tipo(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** Conversão para número conforme a tabela da documentação. */
export function paraNumero(v) {
  switch (tipo(v)) {
    case 'null':
      return 0;
    case 'boolean':
      return v ? 1 : 0;
    case 'number':
      return v;
    case 'string': {
      const s = v.trim();
      if (s === '') return 0;
      if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16);
      if (/^0o[0-7]+$/i.test(s)) return parseInt(s.slice(2), 8);
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) return Number(s);
      if (/^[+-]?Infinity$/.test(s)) return Number(s);
      return NaN;
    }
    default:
      return NaN;
  }
}

export function verdadeiro(v) {
  switch (tipo(v)) {
    case 'null':
      return false;
    case 'boolean':
      return v;
    case 'number':
      return v !== 0 && !Number.isNaN(v);
    case 'string':
      return v !== '';
    default:
      return true;
  }
}

export function paraTexto(v) {
  switch (tipo(v)) {
    case 'null':
      return '';
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number':
      return String(v);
    case 'string':
      return v;
    default:
      return JSON.stringify(v);
  }
}

/** == do Actions: tipos diferentes viram número; strings ignoram caixa. */
export function igual(a, b) {
  const ta = tipo(a);
  const tb = tipo(b);
  if (ta !== tb) {
    const na = paraNumero(a);
    const nb = paraNumero(b);
    return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb;
  }
  if (ta === 'null') return true;
  if (ta === 'string') return a.toUpperCase() === b.toUpperCase();
  return a === b; // número (NaN != NaN), booleano, objeto/array por referência
}

function comparar(a, b, op) {
  let x;
  let y;
  if (tipo(a) === 'string' && tipo(b) === 'string') {
    x = a.toUpperCase();
    y = b.toUpperCase();
  } else {
    x = paraNumero(a);
    y = paraNumero(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
  }
  if (op === '<') return x < y;
  if (op === '<=') return x <= y;
  if (op === '>') return x > y;
  return x >= y;
}

function acessar(obj, chave) {
  if (obj instanceof Filtro) {
    const out = new Filtro();
    for (const item of obj) {
      const v = acessar(item, chave);
      if (v instanceof Filtro) out.push(...v);
      else if (v !== null) out.push(v);
    }
    return out;
  }
  if (obj === null || obj === undefined || typeof obj !== 'object') return null;
  if (chave === '*') {
    const out = new Filtro();
    out.push(...(Array.isArray(obj) ? obj : Object.values(obj)));
    return out;
  }
  if (Array.isArray(obj)) {
    const n = paraNumero(chave);
    return Number.isInteger(n) && n >= 0 && n < obj.length ? (obj[n] ?? null) : null;
  }
  const k = paraTexto(chave);
  const direto = obj[k];
  if (direto !== undefined) return direto ?? null;
  // Propriedades de objeto não diferenciam caixa no Actions.
  const achada = Object.keys(obj).find((p) => p.toLowerCase() === k.toLowerCase());
  return achada === undefined ? null : (obj[achada] ?? null);
}

function formatar(fmt, args) {
  return paraTexto(fmt).replace(/\{\{|\}\}|\{(\d+)\}/g, (m, n) => {
    if (m === '{{') return '{';
    if (m === '}}') return '}';
    const i = Number(n);
    if (i >= args.length) throw new ExpressaoNaoSuportada(`format(): índice {${n}} sem argumento`);
    return paraTexto(args[i]);
  });
}

function statusDeEstado(estado = 'success') {
  return { success: estado === 'success', failure: estado === 'failure', cancelled: false };
}

function chamar(nome, args, ctx) {
  const status = ctx.status ?? statusDeEstado(ctx.estadoJob);
  switch (nome) {
    case 'always':
      return true;
    case 'success':
      return !!status.success;
    case 'failure':
      return !!status.failure;
    case 'cancelled':
      return !!status.cancelled;
    case 'contains': {
      const [busca, item] = args;
      if (Array.isArray(busca)) return busca.some((x) => igual(x, item));
      return paraTexto(busca).toUpperCase().includes(paraTexto(item).toUpperCase());
    }
    case 'startsWith':
      return paraTexto(args[0]).toUpperCase().startsWith(paraTexto(args[1]).toUpperCase());
    case 'endsWith':
      return paraTexto(args[0]).toUpperCase().endsWith(paraTexto(args[1]).toUpperCase());
    case 'format':
      return formatar(args[0], args.slice(1));
    case 'join': {
      const sep = args.length > 1 ? paraTexto(args[1]) : ',';
      return Array.isArray(args[0]) ? args[0].map(paraTexto).join(sep) : paraTexto(args[0]);
    }
    case 'toJSON':
      return JSON.stringify(args[0] ?? null, null, 2);
    case 'fromJSON':
      try {
        return JSON.parse(paraTexto(args[0]));
      } catch (e) {
        throw new ExpressaoNaoSuportada(`fromJSON(): JSON inválido (${e.message})`);
      }
    default:
      throw new ExpressaoNaoSuportada(`função ${nome}() não suportada no CI local`);
  }
}

function contexto(nome, ctx) {
  if (!CONTEXTOS.has(nome)) throw new ExpressaoNaoSuportada(`contexto desconhecido: ${nome}`);
  const v = ctx[nome];
  return v === undefined ? null : v;
}

/**
 * Avalia uma expressão do Actions seguindo a especificação: literais (string,
 * número com expoente/hex, true/false/null), contextos com `.`, `[ ]` e `.*`,
 * `! < <= > >= == != && ||`, parênteses e as funções always/success/failure/
 * cancelled/contains/startsWith/endsWith/format/join/toJSON/fromJSON.
 * O que não for isso (ex.: hashFiles) lança ExpressaoNaoSuportada.
 */
export function avaliarExpressao(expr, ctx = {}) {
  const tokens = tokenizar(expr);
  let i = 0;
  const olhar = () => tokens[i];
  const ehOp = (v) => tokens[i]?.t === 'op' && tokens[i].v === v;
  const comer = (v) => {
    if (v !== undefined && !ehOp(v))
      throw new ExpressaoNaoSuportada(`esperado "${v}" em "${expr}"`);
    return tokens[i++];
  };

  function ou() {
    let v = e();
    while (ehOp('||')) {
      comer('||');
      const d = e();
      v = verdadeiro(v) ? v : d;
    }
    return v;
  }
  function e() {
    let v = igualdade();
    while (ehOp('&&')) {
      comer('&&');
      const d = igualdade();
      v = verdadeiro(v) ? d : v;
    }
    return v;
  }
  function igualdade() {
    let v = relacional();
    while (ehOp('==') || ehOp('!=')) {
      const op = comer().v;
      const d = relacional();
      v = op === '==' ? igual(v, d) : !igual(v, d);
    }
    return v;
  }
  function relacional() {
    let v = unario();
    while (ehOp('<') || ehOp('<=') || ehOp('>') || ehOp('>=')) {
      const op = comer().v;
      v = comparar(v, unario(), op);
    }
    return v;
  }
  function unario() {
    if (ehOp('!')) {
      comer('!');
      return !verdadeiro(unario());
    }
    return posfixo();
  }
  function posfixo() {
    let v = primario();
    for (;;) {
      if (ehOp('.')) {
        comer('.');
        const t = olhar();
        if (t?.t === 'op' && t.v === '*') {
          comer();
          v = acessar(v, '*');
        } else if (t?.t === 'id') {
          comer();
          v = acessar(v, t.v);
        } else throw new ExpressaoNaoSuportada(`propriedade inválida em "${expr}"`);
      } else if (ehOp('[')) {
        comer('[');
        let k;
        if (ehOp('*')) {
          comer('*');
          k = '*';
        } else k = ou();
        comer(']');
        v = acessar(v, k);
      } else return v;
    }
  }
  function primario() {
    const t = olhar();
    if (t === undefined) throw new ExpressaoNaoSuportada(`expressão incompleta: "${expr}"`);
    if (t.t === 'lit') {
      comer();
      return t.v;
    }
    if (ehOp('(')) {
      comer('(');
      const v = ou();
      comer(')');
      return v;
    }
    if (t.t === 'id') {
      comer();
      if (ehOp('(')) {
        comer('(');
        const args = [];
        if (!ehOp(')')) {
          args.push(ou());
          while (ehOp(',')) {
            comer(',');
            args.push(ou());
          }
        }
        comer(')');
        return chamar(t.v, args, ctx);
      }
      return contexto(t.v, ctx);
    }
    throw new ExpressaoNaoSuportada(`token inesperado "${t.v}" em "${expr}"`);
  }

  const v = ou();
  if (i !== tokens.length)
    throw new ExpressaoNaoSuportada(
      `sobrou "${tokens
        .slice(i)
        .map((t) => (t.t === 'lit' ? JSON.stringify(t.v) : t.v))
        .join(' ')}" em "${expr}"`
    );
  return v instanceof Filtro ? [...v] : v;
}

/** Tira o `${{ }}` de um valor inteiro (ex.: `if:`). */
function semChaves(texto) {
  const t = String(texto).trim();
  const m = /^\$\{\{([\s\S]*)\}\}$/.exec(t);
  if (m && !m[1].includes('}}')) return m[1];
  if (t.includes('${{'))
    throw new ExpressaoNaoSuportada(`expressão misturada com texto não é suportada: "${t}"`);
  return t;
}

/**
 * `if:` de job/step. Como no Actions: sem `${{ }}` o texto inteiro é expressão,
 * e sem função de status vale `success() && (<if>)` (o status implícito).
 * `ctx.status` = { success, failure, cancelled } do job (step) ou dos needs (job).
 */
export function avaliarCondicao(cond, ctx = {}) {
  let texto;
  if (cond === undefined || cond === null || cond === '') texto = 'success()';
  else if (typeof cond === 'boolean' || typeof cond === 'number') texto = String(cond);
  else texto = semChaves(cond);
  if (!usaFuncaoStatus(texto)) texto = `success() && (${texto})`;
  return verdadeiro(avaliarExpressao(texto, ctx));
}

/**
 * Avalia um campo que aceita expressão (continue-on-error, timeout-minutes,
 * working-directory...). Valor inteiro `${{ x }}` mantém o tipo; texto com
 * `${{ }}` no meio é interpolado.
 */
export function avaliarValor(valor, ctx = {}) {
  if (typeof valor !== 'string') return valor;
  const t = valor.trim();
  const m = /^\$\{\{([\s\S]*)\}\}$/.exec(t);
  if (m && !m[1].includes('}}')) return avaliarExpressao(m[1], ctx);
  if (!t.includes('${{')) return valor;
  const r = interpolar(valor, ctx);
  if (r.erros.length) throw new ExpressaoNaoSuportada(r.erros.join('; '));
  return r.texto;
}

/** continue-on-error: true/false ou expressão; a string 'false' é falsa. */
export function avaliarBooleano(valor, ctx = {}) {
  if (valor === undefined || valor === null) return false;
  const v = avaliarValor(valor, ctx);
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false' || s === '') return false;
    throw new ExpressaoNaoSuportada(`valor booleano inválido: "${v}"`);
  }
  return verdadeiro(v);
}

/** timeout-minutes (aceita expressão); undefined quando ausente. */
export function avaliarMinutos(valor, ctx = {}) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const n = paraNumero(avaliarValor(valor, ctx));
  if (!Number.isFinite(n) || n <= 0)
    throw new ExpressaoNaoSuportada(`timeout-minutes inválido: ${JSON.stringify(valor)}`);
  return n;
}

const EXPR = /\$\{\{([\s\S]+?)\}\}/g;

/**
 * Interpola `${{ ... }}` dentro de um texto. Devolve { texto, faltando[], erros[] }:
 * `faltando` = referências sem valor local (viram vazio, como no GitHub);
 * `erros` = expressões que o CI local não sabe avaliar (quem chama não roda o passo).
 */
export function interpolar(texto, ctx = {}) {
  const faltando = [];
  const erros = [];
  const saida = String(texto ?? '').replace(EXPR, (_, dentro) => {
    let v;
    try {
      v = avaliarExpressao(dentro, ctx);
    } catch (e) {
      if (!(e instanceof ExpressaoNaoSuportada)) throw e;
      erros.push(`${dentro.trim()} (${e.message})`);
      return '';
    }
    if (v === null || v === undefined) {
      faltando.push(dentro.trim());
      return '';
    }
    return paraTexto(v);
  });
  return { texto: saida, faltando, erros };
}

// ------------------------------------------------------------------ matriz
const mesmoValor = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Expande `strategy.matrix` pelo algoritmo oficial
 * (https://docs.github.com/actions/using-jobs/using-a-matrix-for-your-jobs):
 * produto cartesiano dos eixos; `exclude` por casamento parcial; cada `include`
 * é anexado a TODAS as combinações originais em que não sobrescreve um valor
 * original (valores já adicionados podem ser sobrescritos); se não couber em
 * nenhuma, vira combinação nova.
 */
export function expandirMatriz(job, ctx = {}) {
  let m = job?.strategy?.matrix;
  if (m === undefined || m === null) return [{}];
  if (typeof m === 'string') m = avaliarValor(m, ctx);
  if (!m || typeof m !== 'object' || Array.isArray(m))
    throw new ExpressaoNaoSuportada('strategy.matrix não é um mapa');
  const { include: incBruto = [], exclude: excBruto = [], ...eixos } = m;
  const include = [].concat(avaliarValor(incBruto, ctx) ?? []);
  const exclude = [].concat(avaliarValor(excBruto, ctx) ?? []);
  const chavesOriginais = Object.keys(eixos);
  let combos = chavesOriginais.length ? [{}] : [];
  for (const k of chavesOriginais) {
    const bruto = avaliarValor(eixos[k], ctx);
    const lista = Array.isArray(bruto) ? bruto : [bruto];
    combos = combos.flatMap((c) => lista.map((v) => ({ ...c, [k]: v })));
  }
  combos = combos.filter(
    (c) => !exclude.some((x) => Object.entries(x).every(([k, v]) => mesmoValor(c[k], v)))
  );
  const originais = combos.map((c) => ({ ...c }));
  const extras = [];
  for (const inc of include) {
    let anexou = false;
    combos.forEach((c, idx) => {
      const cabe = Object.entries(inc).every(
        ([k, v]) => !chavesOriginais.includes(k) || mesmoValor(originais[idx][k], v)
      );
      if (cabe) {
        Object.assign(c, inc);
        anexou = true;
      }
    });
    if (!anexou) extras.push({ ...inc });
  }
  const todos = [...combos, ...extras];
  return todos.length ? todos : [{}];
}

/** Ordena jobs respeitando `needs` (ordem do arquivo como desempate). */
export function ordenarJobs(jobs) {
  const ids = Object.keys(jobs);
  const feito = new Set();
  const ordem = [];
  const visitar = (id, pilha = new Set()) => {
    if (feito.has(id)) return;
    if (pilha.has(id)) throw new Error(`ciclo em needs envolvendo ${id}`);
    pilha.add(id);
    const needs = [].concat(jobs[id]?.needs ?? []);
    for (const n of needs) if (jobs[n]) visitar(n, pilha);
    pilha.delete(id);
    feito.add(id);
    ordem.push(id);
  };
  ids.forEach((id) => visitar(id));
  return ordem;
}

/** Lê o arquivo GITHUB_ENV/GITHUB_OUTPUT (KEY=VAL e KEY<<DELIM ... DELIM). */
export function lerArquivoEnv(conteudo) {
  const out = {};
  const linhas = String(conteudo ?? '').split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.trim()) continue;
    const hd = /^([^=<\s]+)<<(.+)$/.exec(l);
    if (hd) {
      const [, k, delim] = hd;
      const valor = [];
      i++;
      while (i < linhas.length && linhas[i] !== delim) valor.push(linhas[i++]);
      if (i >= linhas.length)
        throw new Error(`delimitador "${delim}" de ${k} não foi fechado (o GitHub falha o passo)`);
      out[k] = valor.join('\n');
      continue;
    }
    const eq = l.indexOf('=');
    if (eq > 0) out[l.slice(0, eq)] = l.slice(eq + 1);
  }
  return out;
}

/** Comando de shell como o runner Linux do GitHub monta. */
export function comandoShell(shell) {
  if (!shell) return ['bash', ['-e', '{0}']];
  if (shell === 'bash') return ['bash', ['--noprofile', '--norc', '-eo', 'pipefail', '{0}']];
  if (shell === 'sh') return ['sh', ['-e', '{0}']];
  if (shell === 'python') return ['python3', ['{0}']];
  if (shell === 'pwsh') return ['pwsh', ['-command', ". '{0}'"]];
  if (shell === 'powershell') return ['powershell', ['-command', ". '{0}'"]];
  const partes = shell.split(/\s+/);
  return [partes[0], partes.slice(1).length ? partes.slice(1) : ['{0}']];
}

/** Extensão do arquivo temporário do passo (o pwsh exige .ps1). */
export function extensaoShell(shell) {
  if (shell === 'python') return '.py';
  if (shell === 'pwsh' || shell === 'powershell') return '.ps1';
  return '.sh';
}

/**
 * Converte `options:` de um service (ex.: --health-cmd "pg_isready") em
 * argumentos para `docker run`, respeitando aspas.
 */
export function separarOpcoesDocker(options) {
  if (!options) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(options)))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/**
 * `ports:` de um service. Sem IP explícito publica só em 127.0.0.1: o runner do
 * GitHub é descartável, a máquina local não deve expor o banco de teste na rede.
 */
export function portaLocal(porta) {
  const p = String(porta).trim();
  if (/^\d+(\/\w+)?$/.test(p)) return `127.0.0.1::${p}`;
  if (/^\d+(-\d+)?:\d+(-\d+)?(\/\w+)?$/.test(p)) return `127.0.0.1:${p}`;
  return p;
}

/** Saída de `git diff -z --name-only` → lista de caminhos (sem aspas do git). */
export function arquivosDoDiffZ(saida) {
  return String(saida ?? '')
    .split('\0')
    .filter((l) => l.length > 0);
}

/** Arquivos para o modo --rapido: o que a branch mudou em relação à base. */
export function arquivosParaVitestRelated(lista) {
  const arquivos = Array.isArray(lista)
    ? lista
    : String(lista ?? '')
        .split('\n')
        .map((l) => l.trim());
  return [...new Set(arquivos)].filter(
    (l) => l && /\.(m?[jt]sx?)$/.test(l) && !l.startsWith('supabase/functions/')
  );
}

// --------------------------------------- db-guard: migration existente editada
// Equivalente local do passo "Rejeitar edicao de migration ja existente" do
// .github/workflows/db-guard.yml, com os MESMOS critérios: 'modified' ou
// 'renamed' com conteúdo alterado, nome ^supabase/migrations/\d{14}_.*\.sql$,
// exceção 1 (stub comment-only na base promovido, só 'modified') e exceção 2
// (kind fixado no scripts/db-audit/migration-evidence.json). Mudou lá, mude aqui.
export const MIGRATION_VERSIONADA = /^supabase\/migrations\/\d{14}_.*\.sql$/;
const KINDS_EDICAO_PERMITIDA = new Set([
  'ledger-only/name-and-file-pinned',
  'ledger-divergence/pinned-replay',
]);

/** Saída de `git diff --raw -z -M --no-abbrev` → [{ status, blobAntes, blobDepois, origem, arquivo }]. */
export function lerDiffRawZ(saida) {
  const campos = String(saida ?? '').split('\0');
  const entradas = [];
  for (let i = 0; i < campos.length;) {
    const cabecalho = campos[i++];
    if (!cabecalho) continue;
    const m = /^:\d+ \d+ ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/.exec(cabecalho);
    if (!m) throw new Error(`git diff --raw: linha inesperada "${cabecalho}"`);
    const origem = campos[i++];
    const arquivo = m[3] === 'R' || m[3] === 'C' ? campos[i++] : origem;
    entradas.push({ status: m[3], blobAntes: m[1], blobDepois: m[2], origem, arquivo });
  }
  return entradas;
}

/**
 * Migrations já existentes cujo CONTEÚDO a branch mudou. 'M' com o mesmo blob é
 * só troca de modo ('changed' no GitHub) e 'R' com o mesmo blob é rename puro.
 * `conteudoBase(arquivo)` devolve o texto na base ou null (null = violação, como
 * o catch do workflow).
 */
export function migrationsEditadas(entradas, { conteudoBase, evidencia }) {
  const violacoes = [];
  for (const f of entradas) {
    if (!MIGRATION_VERSIONADA.test(f.arquivo)) continue;
    if ((f.status !== 'M' && f.status !== 'R') || f.blobAntes === f.blobDepois) continue;
    const basename = f.arquivo.split('/').pop();
    const entry = (evidencia?.exceptions || []).find((e) => e.filename === basename);
    if (entry && KINDS_EDICAO_PERMITIDA.has(entry.kind)) continue;
    if (f.status === 'M') {
      const texto = conteudoBase(f.arquivo);
      if (
        texto !== null &&
        texto.split('\n').every((l) => l.trim() === '' || l.trim().startsWith('--'))
      )
        continue;
    }
    violacoes.push(f.arquivo);
  }
  return violacoes;
}

/**
 * Roda a checagem no repositório `cwd`: diff `base...HEAD` (o mesmo que a PR lista).
 * Com `workingTree` (--incluir-nao-commitado), o diff vai da merge-base até o working
 * tree, com os não rastreados marcados como intent-to-add (o `cwd` é o clone
 * descartável): o que ainda não foi commitado também é barrado, como seria no GitHub
 * depois do commit.
 */
export function checarMigrationsEditadas(cwd, base, { workingTree = false } = {}) {
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 30 });
  // Lido sempre, como no workflow (sem o arquivo o passo falha lá também).
  const evidencia = JSON.parse(
    readFileSync(join(cwd, 'scripts/db-audit/migration-evidence.json'), 'utf8')
  );
  // Sem pathspec: um rename de fora para supabase/migrations/ também conta.
  let alvo = `${base}...HEAD`;
  if (workingTree) {
    const ita = git('add', '-A', '--intent-to-add');
    if (ita.status !== 0)
      throw new Error(`git add --intent-to-add falhou: ${(ita.stderr ?? '').trim()}`);
    const mb = git('merge-base', base, 'HEAD');
    if (mb.status !== 0) throw new Error(`git merge-base falhou: ${(mb.stderr ?? '').trim()}`);
    alvo = mb.stdout.trim();
  }
  const d = git('diff', '--raw', '-z', '-M', '--no-abbrev', '--no-color', alvo);
  if (d.status !== 0) throw new Error(`git diff ${alvo} falhou: ${(d.stderr ?? '').trim()}`);
  return migrationsEditadas(lerDiffRawZ(d.stdout), {
    evidencia,
    conteudoBase: (arquivo) => {
      const r = git('cat-file', 'blob', `${base}:${arquivo}`);
      return r.status === 0 ? r.stdout : null;
    },
  });
}

// ------------------------------------------------------------- root/sudo
/** Comandos que pedem root. Cada passo roda com shims deles na frente do PATH. */
export const COMANDOS_ROOT = ['sudo', 'apt', 'apt-get', 'dpkg', 'su', 'doas', 'pkexec'];

const RE_COMANDO_ROOT = new RegExp(
  `(?:^|[\\s;&|(\`]|/s?bin/)(?:${COMANDOS_ROOT.map((c) => c.replace(/-/g, '\\-')).join('|')})(?=[\\s;&|)]|$)`
);
// Playwright chama `sudo apt-get install` POR CONTA PRÓPRIA em `install --with-deps`
// e `install-deps`: o texto do passo não tem "sudo", mas a máquina ganharia ~80 pacotes.
const RE_PLAYWRIGHT_DEPS = /\bplaywright\b.*(?:\s--with-deps\b|\sinstall-deps\b)/;

/**
 * Linhas de um passo que pedem root (sudo/apt/dpkg/su/doas/pkexec, inclusive por
 * /usr/bin/..., e `playwright install --with-deps`/`install-deps`): esses passos
 * são pulados. O que escapar desta detecção (ex.: `$cmd install`) cai nos shims
 * de `shimsDeRoot()` e falha — nunca roda como root na máquina.
 */
export function comandosComSudo(script) {
  return String(script ?? '')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .filter((l) => RE_COMANDO_ROOT.test(l) || RE_PLAYWRIGHT_DEPS.test(l))
    .map((l) => l.trim());
}

export const MSG_SHIM_ROOT = 'requer root — só no GitHub';

/** Conteúdo dos shims (nome → script) que barram root em todo passo. */
export function shimsDeRoot() {
  return Object.fromEntries(
    COMANDOS_ROOT.map((nome) => [
      nome,
      '#!/bin/sh\n' +
        `echo "ci-local: \\"${nome} $*\\" ${MSG_SHIM_ROOT} (bloqueado na máquina local)" >&2\n` +
        'exit 1\n',
    ])
  );
}

/** Troca valores de segredo por *** (como o mascaramento do runner). */
export function mascarar(texto, valores) {
  let s = String(texto);
  const pedacos = new Set();
  for (const v of valores ?? []) {
    if (typeof v !== 'string') continue;
    if (v.length >= 3) pedacos.add(v);
    for (const linha of v.split('\n')) if (linha.trim().length >= 3) pedacos.add(linha);
  }
  for (const v of [...pedacos].sort((a, b) => b.length - a.length)) s = s.split(v).join('***');
  return s;
}

// ------------------------------------------------------- isolamento do HOME
// HOME descartável por job. Caches (bun, playwright, deno, npm) continuam os
// reais. Configurações graváveis (git, gh, docker) são COPIADAS para o HOME do
// job: um `git config --global` ou `docker login` de um passo fica preso ao job.
// CREDENCIAIS NÃO vão junto (sem `--com-credenciais`): o `hosts.yml` do gh (token
// com escopo repo/workflow) não é copiado, o `config.json` do docker perde
// auths/credsStore/credHelpers e o `credential.helper` do git é zerado.
// O site-packages do usuário (onde fica o pip numa máquina sem pip no sistema)
// entra só para leitura via PYTHONPATH; o que o passo instala vai para o HOME do job.
export function planoHomeIsolado(homeJob, base = process.env, existe = existsSync, opcoes = {}) {
  const real = base.HOME ?? '';
  const comCredenciais = !!opcoes.comCredenciais;
  const seExiste = (p) => (p && existe(p) ? p : undefined);
  const copias = [];
  const copiar = (origem, destinoRel, extra = {}) => {
    if (!origem || !existe(origem)) return undefined;
    const destino = join(homeJob, destinoRel);
    copias.push({ origem, destino, ...extra });
    return destino;
  };
  const gitconfig = copiar(
    base.GIT_CONFIG_GLOBAL ?? join(real, '.gitconfig'),
    '.gitconfig',
    comCredenciais ? {} : { semCredencialGit: true }
  );
  const gh = copiar(
    base.GH_CONFIG_DIR ?? join(real, '.config', 'gh'),
    join('.config', 'gh'),
    comCredenciais ? {} : { excluir: ['hosts.yml'] }
  );
  // cli-plugins (docker compose/buildx do usuário) é ligado, não copiado: binários grandes, só leitura.
  const docker = copiar(base.DOCKER_CONFIG ?? join(real, '.docker'), '.docker', {
    ligar: ['cli-plugins'],
    ...(comCredenciais ? {} : { semCredencialDocker: true }),
  });
  const env = {
    HOME: homeJob,
    PATH: [join(homeJob, '.local', 'bin'), base.PATH ?? ''].join(':'),
    XDG_CONFIG_HOME: join(homeJob, '.config'),
    XDG_DATA_HOME: join(homeJob, '.local', 'share'),
    XDG_STATE_HOME: join(homeJob, '.local', 'state'),
    BUN_INSTALL_CACHE_DIR:
      base.BUN_INSTALL_CACHE_DIR ?? seExiste(join(real, '.bun', 'install', 'cache')),
    PLAYWRIGHT_BROWSERS_PATH:
      base.PLAYWRIGHT_BROWSERS_PATH ?? seExiste(join(real, '.cache', 'ms-playwright')),
    DENO_DIR: base.DENO_DIR ?? seExiste(join(real, '.cache', 'deno')),
    npm_config_cache: base.npm_config_cache ?? seExiste(join(real, '.npm')),
    GIT_CONFIG_GLOBAL: gitconfig ?? join(homeJob, '.gitconfig'),
    GH_CONFIG_DIR: gh,
    DOCKER_CONFIG: docker,
    PYTHONUSERBASE: join(homeJob, '.local'),
    PYTHONPATH:
      [seExiste(opcoes.pythonUserSite), base.PYTHONPATH].filter(Boolean).join(':') || undefined,
    TMPDIR: opcoes.tmpdir,
  };
  return {
    env: Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)),
    copias,
  };
}

export function ambienteIsolado(homeJob, base = process.env, existe = existsSync, opcoes = {}) {
  return planoHomeIsolado(homeJob, base, existe, opcoes).env;
}

/** config.json do docker sem credenciais (auths, credsStore, credHelpers). */
export function configDockerSemCredenciais(conteudo) {
  let cfg;
  try {
    cfg = JSON.parse(String(conteudo));
  } catch {
    return '{}\n';
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return '{}\n';
  const { auths: _a, credsStore: _s, credHelpers: _h, ...resto } = cfg;
  return `${JSON.stringify(resto, null, 2)}\n`;
}

/** Acrescentado à cópia do .gitconfig: zera a lista de credential.helper (git ≥ 2.9). */
export const GITCONFIG_SEM_CREDENCIAL =
  '\n# ci-local: credenciais do git não entram nos passos (use --com-credenciais)\n[credential]\n\thelper =\n';

// ------------------------------------------------------- ambiente dos passos
// O passo NÃO herda o ambiente de quem chamou (GH_TOKEN, chaves de API, AWS_*...):
// só esta lista passa; o resto vem do workflow (env:), do isolamento do HOME e
// das variáveis do runner que o CI local define.
const AMBIENTE_PERMITIDO = new Set([
  'PATH',
  'LANG',
  'LANGUAGE',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'TZ',
  'USER',
  'LOGNAME',
  'SHELL',
  'HOSTNAME',
  'CI',
  'DOCKER_HOST',
  'XDG_RUNTIME_DIR',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
]);

export function ambientePermitido(base = process.env) {
  return Object.fromEntries(
    Object.entries(base).filter(
      ([k, v]) => v !== undefined && (AMBIENTE_PERMITIDO.has(k) || /^LC_[A-Z]+$/.test(k))
    )
  );
}

// ------------------------------------------------------------------ gatilhos
/** Eventos do `on:` de um workflow (string, lista ou mapa). */
export function gatilhosDoWorkflow(wf) {
  const on = wf?.on ?? wf?.[true];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  if (on && typeof on === 'object') return Object.keys(on);
  return [];
}

/** Só workflows de PR rodam por padrão: os de push/schedule/dispatch costumam publicar ou implantar. */
export function temGatilhoPullRequest(wf) {
  return gatilhosDoWorkflow(wf).includes('pull_request');
}

// --------------------------------------------------------------- modo rápido
/** Saída do vitest quando `related` não achou nenhum teste ligado aos arquivos. */
export function semTestesRelacionados(saida) {
  return /No (?:affected )?test files found/i.test(String(saida ?? ''));
}

// -------------------------------------------------------------- encerramento
/**
 * Encerra com escalada: SIGINT → espera → SIGTERM → espera → SIGKILL. Para assim
 * que `vivo()` fica falso. Devolve o último sinal enviado (ou null se já tinha saído).
 * `apressar()` verdadeiro corta as esperas (ex.: segundo Ctrl-C).
 */
export async function encerrarEscalonado({
  sinalizar,
  vivo,
  esperaMs = 5000,
  passoMs = 100,
  apressar = () => false,
  dormir = (ms) => new Promise((ok) => setTimeout(ok, ms)),
}) {
  let ultimo = null;
  for (const sinal of ['SIGINT', 'SIGTERM', 'SIGKILL']) {
    if (!vivo()) return ultimo;
    sinalizar(sinal);
    ultimo = sinal;
    if (sinal === 'SIGKILL') return ultimo;
    for (let t = 0; t < esperaMs && !apressar(); t += passoMs) {
      await dormir(passoMs);
      if (!vivo()) return ultimo;
    }
  }
  return ultimo;
}

// ------------------------------------------------------ restos de execuções
/** Início do processo (campo 22 de /proc/<pid>/stat): distingue PID reaproveitado. */
export function inicioDoProcesso(pid, ler = (f) => readFileSync(f, 'utf8')) {
  try {
    const stat = ler(`/proc/${pid}/stat`);
    const campos = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return campos[19] ?? null;
  } catch {
    return null;
  }
}

/** O dono (pid + início) ainda é o mesmo processo vivo? */
export function donoVivo(dono, inicioDe = inicioDoProcesso) {
  if (!dono || !Number.isInteger(Number(dono.pid)) || Number(dono.pid) <= 0) return false;
  const atual = inicioDe(Number(dono.pid));
  if (atual === null) return false;
  return dono.inicio === undefined || dono.inicio === null || String(dono.inicio) === atual;
}

// ------------------------------------------------------------ shim do docker
/** Rótulos que o CI local põe em todo container que ele (ou um passo) cria. */
export const ROTULOS_CI_LOCAL = [
  'ci-local',
  'ci-local.run',
  'ci-local.job',
  'ci-local.pid',
  'ci-local.inicio',
];

/**
 * Shim `docker` (bash) que vai na frente do PATH dos passos, no mesmo diretório
 * dos shims de root. Em `docker run`/`docker create`/`docker container run|create`
 * injeta `--label ci-local=1 --label ci-local.run=… ci-local.job=… ci-local.pid=…
 * ci-local.inicio=…` (valores do ambiente do passo); todo o resto passa intacto.
 * A limpeza remove SÓ containers com o rótulo da execução: container sem rótulo
 * (outra sessão, `supabase start`, compose) nunca é tocado.
 *
 * Delegação: para o próximo `docker` do PATH fora deste diretório (ex.: o
 * docker-shim do db-guard em $HOME/.local/bin — sem ele o job divergiria do
 * GitHub). Se esse próximo chamar `docker` pelo nome e voltar aqui, a marca
 * CI_LOCAL_DOCKER_SHIM_ATIVO manda direto ao docker real resolvido no início
 * (CI_LOCAL_DOCKER_REAL, caminho absoluto): sem laço.
 */
export function shimDocker(dirShim) {
  return `#!/usr/bin/env bash
# ci-local: rotula os containers criados pelos passos (ver scripts/ci/ci-local-lib.mjs).
set -u
eu_dir=${JSON.stringify(dirShim)}
alvo=""
if [[ -z "\${CI_LOCAL_DOCKER_SHIM_ATIVO:-}" ]]; then
  IFS=: read -r -a dirs <<< "\${PATH:-}"
  for d in "\${dirs[@]}"; do
    [[ -z "$d" || "$d" == "$eu_dir" ]] && continue
    if [[ -x "$d/docker" && ! -d "$d/docker" ]]; then alvo="$d/docker"; break; fi
  done
fi
[[ -z "$alvo" ]] && alvo="\${CI_LOCAL_DOCKER_REAL:-}"
if [[ -z "$alvo" || "$alvo" == "$eu_dir/docker" ]]; then
  echo "ci-local: docker não encontrado" >&2
  exit 127
fi
export CI_LOCAL_DOCKER_SHIM_ATIVO=1
rotulos=(--label ci-local=1 --label "ci-local.run=\${CI_LOCAL_RUN:-}" --label "ci-local.job=\${CI_LOCAL_JOB:-}" --label "ci-local.pid=\${CI_LOCAL_PID:-}" --label "ci-local.inicio=\${CI_LOCAL_INICIO:-}")
args=("$@")
n=\${#args[@]}
out=()
i=0
# opções globais do docker antes do subcomando
while (( i < n )); do
  a=\${args[i]}
  case "$a" in
    --config|-c|--context|-H|--host|-l|--log-level|--tlscacert|--tlscert|--tlskey)
      out+=("$a"); i=$((i + 1))
      if (( i < n )); then out+=("\${args[i]}"); i=$((i + 1)); fi
      continue ;;
    -*) out+=("$a"); i=$((i + 1)); continue ;;
  esac
  break
done
if (( i < n )); then
  sub=\${args[i]}
  if [[ "$sub" == run || "$sub" == create ]]; then
    out+=("$sub" "\${rotulos[@]}"); i=$((i + 1))
  elif [[ "$sub" == container ]] && (( i + 1 < n )) && [[ "\${args[i+1]}" == run || "\${args[i+1]}" == create ]]; then
    out+=("$sub" "\${args[i+1]}" "\${rotulos[@]}"); i=$((i + 2))
  fi
fi
out+=("\${args[@]:i}")
exec "$alvo" "\${out[@]}"
`;
}

/** Linhas de `docker ps --format '{{.ID}}\t{{.Label "ci-local.run"}}\t{{.Names}}\t{{.Image}}'`. */
export function lerListaContainers(saida) {
  return String(saida ?? '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [id, run, nomes, imagem] = l.split('\t');
      return { id: id.trim(), run: run ?? '', nomes: nomes ?? '', imagem: imagem ?? '' };
    });
}

/**
 * Containers do CI local cujo dono morreu (linhas `id\tpid\tinicio\tnomes`). Sem
 * rótulo de pid (versão antiga), o pid vem do sufixo do nome `ci-local-...-<pid>`.
 */
export function containersOrfaos(saida, vivoDe = donoVivo) {
  return String(saida ?? '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [id, pid, inicio, nomes = ''] = l.split('\t');
      const pidNome = /-(\d+)$/.exec(nomes.split(',')[0] ?? '')?.[1];
      return { id: id.trim(), nomes, dono: { pid: pid || pidNome, inicio: inicio || undefined } };
    })
    .filter((c) => c.dono.pid && !vivoDe(c.dono));
}
