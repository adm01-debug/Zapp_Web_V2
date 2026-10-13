import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  extrairTokens,
  decodificarPayload,
  ehArquivoVarrido,
  listarArquivosVarridos,
  varrer,
  varrerEnv,
  avaliar,
  guarda,
  main,
} from './check-bundle-secrets.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI = join(AQUI, 'check-bundle-secrets.mjs');

// --- JWTs SINTETICOS (nunca reais; nenhum valor de chave real no teste) --------
const b64url = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
let seqAssinatura = 0;
function jwt(payload) {
  seqAssinatura += 1;
  const assinatura = Buffer.from(`assinatura-sintetica-${seqAssinatura}`, 'utf8').toString('base64url');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${assinatura}`;
}
const JWT_SERVICE = jwt({ iss: 'supabase', ref: 'sbtest', role: 'service_role', iat: 1, exp: 2 });
const JWT_ANON = jwt({ iss: 'supabase', ref: 'sbtest', role: 'anon', iat: 1, exp: 2 });
const JWT_AUTH = jwt({ iss: 'supabase', ref: 'sbtest', role: 'authenticated', iat: 1 });
const JWT_SEM_ROLE = jwt({ iss: 'supabase', ref: 'sbtest', sub: 'usuario-sintetico' });
// Igual ao que o .env.production versionado guarda hoje: um JWT TRUNCADO (nao e
// um JWT valido, entao nao tem payload para decodificar).
const CHAVE_TRUNCADA = 'eyJhbG...knC0';

const casos = [];
function novoCaso() {
  const raiz = mkdtempSync(join(tmpdir(), 'bundle-secrets-'));
  const dist = join(raiz, 'dist');
  mkdirSync(dist, { recursive: true });
  casos.push(() => rmSync(raiz, { recursive: true, force: true }));
  return { raiz, dist, env: join(raiz, '.env.production') };
}
function escrever(baseOuArquivo, relOuConteudo, conteudo) {
  if (conteudo === undefined) {
    const arquivo = baseOuArquivo;
    mkdirSync(dirname(arquivo), { recursive: true });
    writeFileSync(arquivo, relOuConteudo);
  } else {
    const alvo = join(baseOuArquivo, relOuConteudo);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
}
after(() => {
  for (const limpar of casos) limpar();
});

// --- extrairTokens ------------------------------------------------------------
test('extrairTokens: acha o JWT entre aspas no meio do codigo minificado', () => {
  const tokens = extrairTokens(`var a=1;var k="${JWT_SERVICE}";var b=2;`);
  assert.deepEqual(tokens, [JWT_SERVICE]);
});

test('extrairTokens: nao casa "eyJ" curto nem JWT colado a uma sequencia base64url maior (ancora)', () => {
  assert.deepEqual(extrairTokens('var x="eyJhbGci";'), []);
  assert.deepEqual(extrairTokens(`var x="prefixo${JWT_SERVICE}";`), []);
});

// --- decodificarPayload -------------------------------------------------------
test('decodificarPayload: decodifica so o payload (base64url -> JSON)', () => {
  assert.equal(decodificarPayload(JWT_SERVICE).role, 'service_role');
  assert.equal(decodificarPayload(JWT_ANON).role, 'anon');
});

test('decodificarPayload: devolve null para texto que nao e JWT ou payload nao-JSON', () => {
  assert.equal(decodificarPayload('nao-e-jwt'), null);
  assert.equal(decodificarPayload(`${b64url({ alg: 'HS256' })}.nao-e-json.sigxx`), null);
});

// --- varrer (bundle) ----------------------------------------------------------
test('varrer: reprova service_role no bundle e aponta o arquivo:linha', () => {
  const { dist } = novoCaso();
  escrever(dist, 'assets/index.js', `var a=1;\nvar b=2;\nvar k="${JWT_SERVICE}";\n`);
  const violacoes = varrer(dist);
  assert.equal(violacoes.length, 1);
  assert.equal(violacoes[0].tipo, 'bundle');
  assert.equal(violacoes[0].role, 'service_role');
  assert.equal(violacoes[0].linha, 3);
  assert.match(violacoes[0].arquivo, /assets[\\/]index\.js$/);
});

test('varrer: chave anon no bundle e liberada (o Vite injeta a publica por desenho)', () => {
  const { dist } = novoCaso();
  escrever(dist, 'assets/index.js', `var k="${JWT_ANON}";\n`);
  assert.deepEqual(varrer(dist), []);
});

test('varrer: no bundle so service_role reprova (demais roles ficam de fora do escopo do cartao)', () => {
  const { dist } = novoCaso();
  escrever(dist, 'assets/a.js', `var k="${JWT_AUTH}";\n`);
  escrever(dist, 'assets/b.mjs', `var k="${JWT_SEM_ROLE}";\n`);
  escrever(dist, 'assets/c.cjs', `var k="${JWT_ANON}";\n`);
  assert.deepEqual(varrer(dist), []);
});

test('varrer: percorre subdiretorios e reporta mais de uma violacao', () => {
  const { dist } = novoCaso();
  escrever(dist, 'assets/a.js', `var k="${JWT_SERVICE}";\n`);
  escrever(dist, 'assets/chunks/deep/b.js', `var x=1;\nvar k="${JWT_SERVICE}";\n`);
  assert.equal(varrer(dist).length, 2);
});

test('varrer: ignora sourcemap e arquivo que nao e .js/.mjs/.cjs', () => {
  const { dist } = novoCaso();
  escrever(dist, 'assets/a.js.map', `{"sourcesContent":["${JWT_SERVICE}"]}`);
  escrever(dist, 'assets/a.ts', `const k = "${JWT_SERVICE}";`);
  assert.deepEqual(varrer(dist), []);
});

test('varrer: bundle limpo nao tem violacao', () => {
  const { dist } = novoCaso();
  escrever(dist, 'assets/index.js', 'var a=1;var b="sem-chave";\n');
  assert.deepEqual(varrer(dist), []);
});

test('listarArquivosVarridos: lista so .js/.mjs/.cjs e ordena', () => {
  const { dist } = novoCaso();
  escrever(dist, 'b.js', '1');
  escrever(dist, 'a.js', '1');
  escrever(dist, 'c.mjs', '1');
  escrever(dist, 'd.cjs', '1');
  escrever(dist, 'e.ts', '1');
  escrever(dist, 'f.map', '1');
  const nomes = listarArquivosVarridos(dist).map((p) => p.split(/[\\/]/u).pop());
  assert.deepEqual(nomes, ['a.js', 'b.js', 'c.mjs', 'd.cjs']);
  assert.equal(ehArquivoVarrido('x.js'), true);
  assert.equal(ehArquivoVarrido('x.mjs'), true);
  assert.equal(ehArquivoVarrido('x.cjs'), true);
  assert.equal(ehArquivoVarrido('x.js.map'), false);
  assert.equal(ehArquivoVarrido('x.ts'), false);
});

// --- varrerEnv (.env.production) ---------------------------------------------
test('varrerEnv: reprova JWT com role=service_role no .env.production', () => {
  const { raiz, env } = novoCaso();
  escrever(raiz, '.env.production', `OUTRA_CHAVE=${JWT_SERVICE}\n`);
  const violacoes = varrerEnv(env);
  assert.equal(violacoes.length, 1);
  assert.equal(violacoes[0].tipo, 'env');
  assert.equal(violacoes[0].role, 'service_role');
  assert.equal(violacoes[0].linha, 1);
});

test('varrerEnv: aceita a chave anon e ignora comentario/vazio', () => {
  const { raiz, env } = novoCaso();
  escrever(raiz, '.env.production', `# chave publica\nVITE_SUPABASE_PUBLISHABLE_KEY=${JWT_ANON}\n\n`);
  assert.deepEqual(varrerEnv(env), []);
});

test('varrerEnv: reprova role que nao seja anon (aqui authenticated)', () => {
  const { raiz, env } = novoCaso();
  escrever(raiz, '.env.production', `CHAVE=${JWT_AUTH}\n`);
  assert.equal(varrerEnv(env)[0].role, 'authenticated');
});

test('varrerEnv: JWT truncado do repositorio atual nao e um JWT valido e nao quebra', () => {
  const { raiz, env } = novoCaso();
  escrever(raiz, '.env.production', `VITE_SUPABASE_PUBLISHABLE_KEY=${CHAVE_TRUNCADA}\n`);
  assert.deepEqual(varrerEnv(env), []);
});

test('varrerEnv: arquivo ausente devolve lista vazia', () => {
  const { raiz } = novoCaso();
  assert.deepEqual(varrerEnv(join(raiz, 'nao-existe.env')), []);
});

// --- avaliar / guarda --------------------------------------------------------
test('avaliar: descreve a violacao sem imprimir o token', () => {
  const linhas = avaliar([
    { arquivo: '/x/dist/a.js', linha: 3, tipo: 'bundle', role: 'service_role' },
    { arquivo: '/x/.env.production', linha: 1, tipo: 'env', role: 'ausente' },
  ]);
  assert.match(linhas[0], /\/x\/dist\/a\.js:3 — JWT com role=service_role/u);
  assert.match(linhas[1], /role=ausente/u);
  assert.ok(!linhas.join(' ').includes(JWT_SERVICE));
});

test('guarda: bundle e env limpos devolvem vazio', () => {
  const { raiz, dist, env } = novoCaso();
  escrever(raiz, '.env.production', `VITE_SUPABASE_PUBLISHABLE_KEY=${JWT_ANON}\n`);
  escrever(dist, 'assets/index.js', `var k="${JWT_ANON}";\n`);
  assert.deepEqual(guarda(dist, env), []);
});

// --- main() ------------------------------------------------------------------
test('main: exit 1 quando ha chave secreta no bundle', () => {
  const { raiz, dist } = novoCaso();
  escrever(raiz, '.env.production', 'VITE_SUPABASE_URL=https://x.invalid\n');
  escrever(dist, 'assets/index.js', `var k="${JWT_SERVICE}";\n`);
  const original = console.error;
  const saida = [];
  console.error = (...t) => saida.push(t.join(' '));
  let codigo;
  try {
    codigo = main([], raiz);
  } finally {
    console.error = original;
  }
  assert.equal(codigo, 1);
  assert.ok(saida.join('\n').includes(':1'));
  assert.ok(!saida.join('\n').includes(JWT_SERVICE), 'a guarda nao pode imprimir o token');
});

test('main: exit 0 com bundle e env limpos', () => {
  const { raiz, dist, env } = novoCaso();
  escrever(raiz, '.env.production', `VITE_SUPABASE_PUBLISHABLE_KEY=${JWT_ANON}\n`);
  escrever(dist, 'assets/index.js', 'var a=1;\n');
  assert.equal(main([], raiz), 0);
});

test('main: fail-closed quando dist nao existe (exit 2)', () => {
  const { raiz } = novoCaso();
  assert.equal(main([], raiz), 2);
});

test('main: fail-closed quando dist existe mas nao tem .js/.mjs/.cjs (exit 2)', () => {
  const { raiz, dist } = novoCaso();
  escrever(dist, 'index.html', '<html></html>');
  assert.equal(main([], raiz), 2);
});

// --- CLI ---------------------------------------------------------------------
function rodaCli(raiz) {
  return spawnSync(process.execPath, [join(raiz, 'scripts', 'ci', 'check-bundle-secrets.mjs')], {
    cwd: raiz,
    encoding: 'utf8',
  });
}

test('CLI: exit 1 com service_role no bundle, exit 0 sem ele, sem vazar o token', () => {
  const { raiz, dist } = novoCaso();
  mkdirSync(join(raiz, 'scripts', 'ci'), { recursive: true });
  copyFileSync(CLI, join(raiz, 'scripts', 'ci', 'check-bundle-secrets.mjs'));
  escrever(raiz, '.env.production', 'VITE_SUPABASE_URL=https://x.invalid\n');
  escrever(dist, 'assets/chunk.js', `const k="${JWT_SERVICE}";\n`);

  const comViolacao = rodaCli(raiz);
  assert.equal(comViolacao.status, 1);
  assert.match(comViolacao.stderr, /VIOLACAO/);
  assert.match(comViolacao.stderr, /assets[\\/]chunk\.js:1/);
  assert.ok(!comViolacao.stderr.includes(JWT_SERVICE));

  escrever(dist, 'assets/chunk.js', `const k="${JWT_ANON}";\n`);
  const semViolacao = rodaCli(raiz);
  assert.equal(semViolacao.status, 0);
  assert.match(semViolacao.stdout, /^OK/u);
});

test('CLI: fail-closed quando dist nao existe (exit 2)', () => {
  const { raiz } = novoCaso();
  mkdirSync(join(raiz, 'scripts', 'ci'), { recursive: true });
  copyFileSync(CLI, join(raiz, 'scripts', 'ci', 'check-bundle-secrets.mjs'));
  assert.equal(rodaCli(raiz).status, 2);
});

test('CLI: fail-closed quando dist existe mas nao tem js/mjs/cjs (exit 2)', () => {
  const { raiz, dist } = novoCaso();
  mkdirSync(join(raiz, 'scripts', 'ci'), { recursive: true });
  copyFileSync(CLI, join(raiz, 'scripts', 'ci', 'check-bundle-secrets.mjs'));
  escrever(dist, 'index.html', '<html></html>');
  assert.equal(rodaCli(raiz).status, 2);
});

test('CLI: argumento desconhecido sai != 0', () => {
  const { raiz, dist } = novoCaso();
  escrever(dist, 'assets/index.js', 'var a=1;\n');
  assert.notEqual(main(['--desconhecido'], raiz), 0);
});

test('check-bundle-secrets: importar o modulo nao executa a guarda', () => {
  const r = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(CLI)});`],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});
