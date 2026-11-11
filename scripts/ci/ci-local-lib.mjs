// Lógica pura do CI local (scripts/ci/ci-local.mjs): lê os workflows do GitHub
// e decide O QUE rodar, sem executar nada. Tudo aqui é determinístico e coberto
// por scripts/ci/ci-local.unit.mjs.
//
// Princípio: o CI local NÃO mantém uma cópia dos comandos. Ele interpreta os
// próprios .github/workflows/*.yml, então mudou lá, mudou aqui.

const EXPR = /\$\{\{\s*([\s\S]+?)\s*\}\}/g;

/**
 * Resolve uma referência de contexto do GitHub Actions (`env.X`, `matrix.Y`,
 * `secrets.Z`, `github.*`, `runner.*`, `steps.id.outputs.k`, `needs.j.result`).
 * Devolve `undefined` quando não sabe — quem chama decide (vazio + aviso).
 */
export function resolverReferencia(ref, ctx) {
  const r = ref.trim();
  const partes = r.split('.');
  const [raiz, ...resto] = partes;
  const pegar = (obj, chaves) => chaves.reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
  switch (raiz) {
    case 'env': return pegar(ctx.env ?? {}, resto);
    case 'matrix': return pegar(ctx.matrix ?? {}, resto);
    case 'secrets': return pegar(ctx.secrets ?? {}, resto);
    case 'vars': return pegar(ctx.vars ?? {}, resto);
    case 'github': return pegar(ctx.github ?? {}, resto);
    case 'runner': return pegar(ctx.runner ?? {}, resto);
    case 'steps': return pegar(ctx.steps ?? {}, resto);
    case 'needs': return pegar(ctx.needs ?? {}, resto);
    case 'inputs': return pegar(ctx.inputs ?? {}, resto);
    default: return undefined;
  }
}

/**
 * Avalia uma expressão simples do Actions. Suporta: referências de contexto,
 * literais ('x', números, true/false/null), ==, !=, &&, ||, !, parênteses e as
 * funções always(), success(), failure(), cancelled(). Qualquer outra coisa
 * (contains(), format(), fromJSON()...) lança `ExpressaoNaoSuportada`.
 */
export class ExpressaoNaoSuportada extends Error {}

export function avaliarExpressao(expr, ctx) {
  const tokens = tokenizar(expr);
  let i = 0;
  const olhar = () => tokens[i];
  const comer = (t) => {
    if (t !== undefined && tokens[i] !== t) throw new ExpressaoNaoSuportada(`esperado ${t} em "${expr}"`);
    return tokens[i++];
  };
  const verdade = (v) => !(v === false || v === null || v === undefined || v === '' || v === 0);

  function primario() {
    const t = olhar();
    if (t === undefined) throw new ExpressaoNaoSuportada(`expressão incompleta: "${expr}"`);
    if (t === '(') { comer('('); const v = ou(); comer(')'); return v; }
    if (t === '!') { comer('!'); return !verdade(primario()); }
    comer();
    if (/^'.*'$/s.test(t)) return t.slice(1, -1).replace(/''/g, "'");
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null') return null;
    if (olhar() === '(') {
      comer('(');
      comer(')');
      const estado = ctx.estadoJob ?? 'success';
      if (t === 'always') return true;
      if (t === 'success') return estado === 'success';
      if (t === 'failure') return estado === 'failure';
      if (t === 'cancelled') return false;
      throw new ExpressaoNaoSuportada(`função ${t}() não suportada`);
    }
    if (/^[A-Za-z_][\w-]*(\.[\w*-]+)*$/.test(t)) return resolverReferencia(t, ctx);
    throw new ExpressaoNaoSuportada(`token não suportado: ${t}`);
  }
  function comparacao() {
    let v = primario();
    while (olhar() === '==' || olhar() === '!=') {
      const op = comer();
      const d = primario();
      const igual = String(v ?? '').toLowerCase() === String(d ?? '').toLowerCase()
        && (typeof v !== 'boolean' || typeof d !== 'boolean' || v === d);
      v = op === '==' ? igual : !igual;
    }
    return v;
  }
  function e() {
    let v = comparacao();
    while (olhar() === '&&') { comer('&&'); const d = comparacao(); v = verdade(v) ? d : v; }
    return v;
  }
  function ou() {
    let v = e();
    while (olhar() === '||') { comer('||'); const d = e(); v = verdade(v) ? v : d; }
    return v;
  }
  const v = ou();
  if (i !== tokens.length) throw new ExpressaoNaoSuportada(`sobrou "${tokens.slice(i).join(' ')}" em "${expr}"`);
  return v;
}

function tokenizar(expr) {
  const out = [];
  const re = /\s*('(?:[^']|'')*'|==|!=|&&|\|\||[()!,]|[A-Za-z_][\w-]*(?:\.[\w*-]+)*|-?\d+(?:\.\d+)?)/y;
  let pos = 0;
  const s = expr.trim();
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw new ExpressaoNaoSuportada(`não entendi "${s.slice(pos)}"`);
    out.push(m[1]);
    pos = re.lastIndex;
    while (pos < s.length && /\s/.test(s[pos])) pos++;
  }
  return out;
}

/** `if:` de job/step. Sem `${{ }}` o Actions trata o texto inteiro como expressão. */
export function avaliarCondicao(cond, ctx) {
  if (cond === undefined || cond === null || cond === '') return true;
  if (typeof cond === 'boolean') return cond;
  const texto = String(cond).trim();
  const m = /^\$\{\{([\s\S]*)\}\}$/.exec(texto);
  const v = avaliarExpressao(m ? m[1] : texto, ctx);
  return !(v === false || v === null || v === undefined || v === '' || v === 0);
}

/** Interpola `${{ ... }}` dentro de um texto. Devolve { texto, faltando[] }. */
export function interpolar(texto, ctx) {
  const faltando = [];
  const saida = String(texto).replace(EXPR, (_, dentro) => {
    let v;
    try { v = avaliarExpressao(dentro, ctx); } catch { v = undefined; }
    if (v === undefined || v === null) { faltando.push(dentro.trim()); return ''; }
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
  return { texto: saida, faltando };
}

/** Expande `strategy.matrix` (produto cartesiano + include/exclude simples). */
export function expandirMatriz(job) {
  const m = job?.strategy?.matrix;
  if (!m || typeof m !== 'object') return [{}];
  const { include = [], exclude = [], ...eixos } = m;
  let combos = [{}];
  for (const [k, valores] of Object.entries(eixos)) {
    const lista = Array.isArray(valores) ? valores : [valores];
    combos = combos.flatMap((c) => lista.map((v) => ({ ...c, [k]: v })));
  }
  const casa = (c, alvo) => Object.entries(alvo).every(([k, v]) => c[k] === v);
  combos = combos.filter((c) => !exclude.some((x) => casa(c, x)));
  for (const inc of include) {
    const base = combos.find((c) => Object.keys(c).length && casa(inc, c));
    if (base) Object.assign(base, inc); else combos.push({ ...inc });
  }
  return combos.length ? combos : [{}];
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

/** Lê o arquivo GITHUB_ENV (KEY=VAL e KEY<<DELIM ... DELIM). */
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
  const partes = shell.split(/\s+/);
  return [partes[0], partes.slice(1).length ? partes.slice(1) : ['{0}']];
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

/** Arquivos para o modo --rapido: o que a branch mudou em relação à base. */
export function arquivosParaVitestRelated(listaGit) {
  return String(listaGit ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\.(m?[jt]sx?)$/.test(l) && !l.startsWith('supabase/functions/'));
}
