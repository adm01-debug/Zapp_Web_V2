#!/usr/bin/env node
// Guarda dos três documentos de inventário do V2: ESTADO.md, FEATURE_REGISTRY.md e
// TESTING_CONVENTION.md (lacuna 009-010 do PLANO_100_ETAPAS_PARIDADE_V1_V3).
//
// O defeito que estes testes fecham é o de documentação que envelhece calada: nenhum dos
// três arquivos existia, e um inventário escrito à mão ("quem chama cada edge", "o que cada
// view entrega") vira mentira na primeira edge nova ou no primeiro componente trocado. Aqui
// a tabela é RECALCULADA a partir do código e comparada com o texto publicado:
//
//   * ESTADO.md      — conjunto de edges == conjunto de `supabase/functions/*/index.ts`;
//                      grupo == primeiro chamador real na ordem A→B→C→D;
//                      toda âncora `arquivo:linha` citada existe e cita a própria edge;
//                      edge marcada como órfã (grupo E) não tem chamador nenhum no repo.
//   * FEATURE_REGISTRY.md — conjunto de views == `VIEW_MAP` + `SPECIAL_VIEWS` do
//                      ViewRouter; componente, arquivo e classificação batem com o código.
//   * TESTING_CONVENTION.md — cada pasta/runner que o texto afirma existe de fato, e as
//                      linhas de comando citadas estão no `ci.yml`/`package.json` reais.
//
// Mudou o código? O vermelho obriga a atualizar o documento na mesma entrega.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IGNORAR = new Set(['node_modules', '.git', 'dist', 'coverage', '.tmp']);
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const linhasDe = (p) => fs.readFileSync(p, 'utf8').split('\n');
const relativo = (p) => path.relative(raiz, p).split(path.sep).join('/');
const normalizaEspacos = (texto) => texto.replace(/\s+/g, ' ').trim();

function andar(dir, filtro) {
  const achados = [];
  const pilha = [dir];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    for (const entrada of fs.readdirSync(atual, { withFileTypes: true })) {
      if (entrada.isDirectory()) {
        if (!IGNORAR.has(entrada.name)) pilha.push(path.join(atual, entrada.name));
      } else if (filtro(entrada.name)) {
        achados.push(path.join(atual, entrada.name));
      }
    }
  }
  return achados;
}

const ehTeste = (p) => /\.test\.[a-z]+$/.test(p) || /__tests__/.test(p);

// ---------------------------------------------------------------- edges (ESTADO.md)
const dirFuncoes = path.join(raiz, 'supabase/functions');
const edgesReais = fs.readdirSync(dirFuncoes, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== '_shared' && !e.name.startsWith('.'))
  .map((e) => e.name)
  .filter((n) => fs.existsSync(path.join(dirFuncoes, n, 'index.ts')))
  .sort();

const invoca = (n) => new RegExp(`invoke\\(\\s*['"\`]${n}['"\`]`);
const rota = (n) => new RegExp(`/functions/v1/${n}(?![\\w-])`);
const CRON = /cron\.schedule|net\.http_post|pg_cron|supabase_functions\.http_request|http_request_queue/i;

const srcTs = andar(path.join(raiz, 'src'), (n) => /\.(ts|tsx)$/.test(n)).filter((p) => !ehTeste(p));
const funcoesTs = andar(dirFuncoes, (n) => /\.ts$/.test(n)).filter((p) => !ehTeste(p));
const migracoes = andar(path.join(raiz, 'supabase/migrations'), (n) => n.endsWith('.sql'));

const linhasConfigSupabase = linhasDe(path.join(raiz, 'supabase/config.toml'));
const funcoesExternasConfig = new Map();
for (let i = 0; i < linhasConfigSupabase.length; i++) {
  const m = linhasConfigSupabase[i].match(/^\[functions\.([\w-]+)]$/);
  if (m) funcoesExternasConfig.set(m[1], `supabase/config.toml:${i + 1}`);
}

/** Chamadores reais de uma edge, no formato `arquivo:linha`. */
function chamadores(nome) {
  const doFront = [];
  const deOutraEdge = [];
  const deCron = [];
  const deConfig = [];
  for (const p of srcTs) {
    const ls = linhasDe(p);
    for (let i = 0; i < ls.length; i++) {
      if (invoca(nome).test(ls[i]) || rota(nome).test(ls[i])) doFront.push(`${relativo(p)}:${i + 1}`);
    }
  }
  for (const p of funcoesTs) {
    if (relativo(p).startsWith(`supabase/functions/${nome}/`)) continue;
    const ls = linhasDe(p);
    for (let i = 0; i < ls.length; i++) {
      if (invoca(nome).test(ls[i]) || rota(nome).test(ls[i])) deOutraEdge.push(`${relativo(p)}:${i + 1}`);
    }
  }
  for (const p of migracoes) {
    const ls = linhasDe(p);
    if (!ls.some((l) => CRON.test(l))) continue;   // arquivo sem agendador não prova cron
    const i = ls.findIndex((l) => rota(nome).test(l));
    if (i >= 0) deCron.push(`${relativo(p)}:${i + 1}`);
  }
  if (funcoesExternasConfig.has(nome)) deConfig.push(funcoesExternasConfig.get(nome));
  return { doFront, deOutraEdge, deCron, deConfig };
}

function grupoPublicadoEsperado(c) {
  if (c.doFront.length > 0) return 'A';
  if (c.deOutraEdge.length > 0) return 'B';
  if (c.deCron.length > 0) return 'C';
  if (c.deConfig.length > 0) return 'D';
  return 'E';
}

function totaisPorColunaMarkdown(doc, titulo) {
  const inicio = doc.indexOf(`## ${titulo}`);
  assert.notEqual(inicio, -1, `${titulo} não encontrado`);
  const resto = doc.slice(inicio);
  const fimRel = resto.slice(1).search(/\n## /);
  const bloco = fimRel >= 0 ? resto.slice(0, fimRel + 1) : resto;
  const totais = new Map();
  for (const m of bloco.matchAll(/^\| (\*\*)?([A-Za-z]+|[A-E]|total)\1? \| (\*\*)?(\d+)\3? \|$/gm)) {
    totais.set(m[2], Number(m[4]));
  }
  return totais;
}

const LACUNA_ORFA = 'sem chamador no repositório';

/** Lê um dos três documentos; sem ele o teste falha nomeando a lacuna 009-010 do plano. */
function lerDoc(nome) {
  const caminho = path.join(raiz, nome);
  assert.ok(fs.existsSync(caminho), `${nome} não existe (lacuna 009-010 do PLANO_100_ETAPAS_PARIDADE_V1_V3)`);
  return fs.readFileSync(caminho, 'utf8');
}

/** Linhas da tabela do ESTADO.md: | `edge` | grupo | âncora | */
function tabelaDoEstado() {
  return lerDoc('ESTADO.md').split('\n')
    .map((l) => l.match(/^\| `([\w.-]+)` \| ([A-E]) \| (.*) \|$/))
    .filter(Boolean)
    .map((m) => ({ edge: m[1], grupo: m[2], ancora: m[3] }));
}

test('ESTADO.md lista exatamente as edges que existem no repositório', () => {
  const linhasDaTabelaEstado = tabelaDoEstado();
  assert.ok(edgesReais.length > 0, 'nenhuma edge encontrada — o teste perdeu o alvo');
  const noDoc = linhasDaTabelaEstado.map((l) => l.edge);
  assert.equal(new Set(noDoc).size, noDoc.length, 'ESTADO.md tem edge repetida na tabela');
  for (const nome of edgesReais) {
    assert.ok(noDoc.includes(nome), `ESTADO.md não tem linha para a edge \`${nome}\` (rode a guarda de novo)`);
  }
  for (const nome of noDoc) {
    assert.ok(edgesReais.includes(nome), `ESTADO.md lista \`${nome}\`, que não é edge de supabase/functions/`);
  }
});

test('ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge', () => {
  for (const linha of tabelaDoEstado()) {
    if (linha.ancora.includes(LACUNA_ORFA)) continue;
    const ancoras = [...linha.ancora.matchAll(/`([^`]+:\d+)`/g)].map((m) => m[1]);
    assert.ok(ancoras.length > 0, `\`${linha.edge}\` (grupo ${linha.grupo}) não tem âncora nem declara órfã`);
    for (const ancora of ancoras) {
      const [arquivo, numero] = ancora.split(/:(?=\d+$)/);
      const caminho = path.join(raiz, arquivo);
      assert.ok(fs.existsSync(caminho), `ESTADO.md cita \`${ancora}\` para \`${linha.edge}\`, arquivo que não existe`);
      const conteudo = linhasDe(caminho)[Number(numero) - 1] || '';
      const edgeComFronteira = new RegExp(
        `(?<![\\w-])${linha.edge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`,
      );
      assert.ok(
        edgeComFronteira.test(conteudo),
        `âncora desatualizada: ${ancora} não cita \`${linha.edge}\``,
      );
    }
  }
});

test('edge marcada como órfã (grupo E) realmente não tem chamador no repositório', () => {
  const tabela = tabelaDoEstado();
  const orfas = tabela.filter((l) => l.grupo === 'E');
  for (const linha of orfas) {
    const c = chamadores(linha.edge);
    assert.deepEqual(
      [c.doFront.length, c.deOutraEdge.length, c.deCron.length, c.deConfig.length],
      [0, 0, 0, 0],
      `\`${linha.edge}\` está marcada como órfã em ESTADO.md, mas tem chamador agora: ` +
        JSON.stringify([...c.doFront, ...c.deOutraEdge, ...c.deCron, ...c.deConfig]),
    );
  }
  for (const linha of tabela.filter((l) => l.grupo !== 'E')) {
    assert.ok(!linha.ancora.includes(LACUNA_ORFA), `\`${linha.edge}\` está no grupo ${linha.grupo} mas sem âncora`);
  }
});

test('ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D', () => {
  for (const linha of tabelaDoEstado()) {
    const c = chamadores(linha.edge);
    assert.equal(
      linha.grupo,
      grupoPublicadoEsperado(c),
      `grupo de \`${linha.edge}\` divergiu dos chamadores reais: ` +
        JSON.stringify({ A: c.doFront, B: c.deOutraEdge, C: c.deCron, D: c.deConfig }),
    );
  }
});

test('ESTADO.md mantém totais e lista de órfãs sincronizados com a tabela publicada', () => {
  const doc = lerDoc('ESTADO.md');
  assert.ok(doc.includes('existe em `supabase/functions/`'), 'ESTADO.md precisa limitar órfã ao que o repo comprova');
  assert.ok(!doc.includes('existe e é deployada'), 'ESTADO.md não pode afirmar deploy sem prova no repositório');
  const tabela = tabelaDoEstado();
  const contagem = new Map(['A', 'B', 'C', 'D', 'E'].map((g) => [g, tabela.filter((l) => l.grupo === g).length]));
  const totais = totaisPorColunaMarkdown(doc, 'Totais');
  for (const grupo of ['A', 'B', 'C', 'D', 'E']) {
    assert.equal(totais.get(grupo), contagem.get(grupo), `total do grupo ${grupo} em ESTADO.md divergiu da tabela`);
  }
  assert.equal(totais.get('total'), tabela.length, 'total geral de ESTADO.md divergiu da tabela');

  const cabecalhoOrfas = doc.match(/## Órfãs \((\d+)\)/);
  assert.ok(cabecalhoOrfas, 'ESTADO.md não tem cabeçalho de órfãs com contagem');
  assert.equal(Number(cabecalhoOrfas[1]), contagem.get('E'), 'contagem do cabeçalho de órfãs divergiu da tabela');

  const listaOrfas = [...doc.matchAll(/^- `([\w-]+)`$/gm)].map((m) => m[1]).sort();
  const orfasDaTabela = tabela.filter((l) => l.grupo === 'E').map((l) => l.edge).sort();
  assert.deepEqual(listaOrfas, orfasDaTabela, 'lista Órfãs de ESTADO.md divergiu das linhas grupo E');
});

test('total de edges do cabeçalho do ESTADO.md bate com a tabela', () => {
  const total = Number((lerDoc('ESTADO.md').match(/Base: .*?\.\s*(\d+) edges/) || [])[1]);
  assert.equal(total, edgesReais.length, 'o cabeçalho do ESTADO.md ficou para trás do número de edges');
});

// ------------------------------------------------------- views (FEATURE_REGISTRY.md)
const viewRouter = ler('src/pages/ViewRouter.tsx');
const lazyViews = ler('src/pages/lazyViews.ts');

const mapaDeComponentes = {};
for (const m of lazyViews.matchAll(
  /export const (\w+)\s*=\s*lazyWithRetry\((?:async\s*)?\(\)\s*=>\s*(?:\{[\s\S]*?await\s+)?import\('(@\/[^']+)'\)/g,
)) {
  mapaDeComponentes[m[1]] = m[2].replace('@/', 'src/');
}

const viewsReais = [];
const blocoMapa = viewRouter.match(/const VIEW_MAP[\s\S]*?\n};/);
for (const m of blocoMapa[0].matchAll(/'([\w-]+)':\s*Views\.(\w+)/g)) {
  viewsReais.push({ view: m[1], componente: m[2] });
}
const blocoEspeciais = viewRouter.match(/const SPECIAL_VIEWS[\s\S]*?\n};/);
for (const m of blocoEspeciais[0].matchAll(/'([\w-]+)':/g)) {
  const trecho = blocoEspeciais[0].split(`'${m[1]}':`)[1] || '';
  const componente = trecho.match(/Views\.(\w+)/);
  viewsReais.push({ view: m[1], componente: componente ? componente[1] : '?' });
}

const usaBanco = (texto) => /\.from\(|\.rpc\(|\binvoke\(/.test(texto);
const hooksImportados = (texto) =>
  [...texto.matchAll(/from '@\/(hooks|services|lib)\/([\w/.-]+)'/g)].map((m) => `src/${m[1]}/${m[2]}`);
const acharArquivo = (base) => {
  for (const c of [base, base + '.tsx', base + '.ts', base + '/index.ts', base + '/index.tsx']) {
    if (base && fs.existsSync(path.join(raiz, c)) && fs.statSync(path.join(raiz, c)).isFile()) return c;
  }
  return null;
};

/** Recalcula componente/arquivo/classificação de cada view, como o documento declara. */
function registroReal(view) {
  const arquivo = acharArquivo(mapaDeComponentes[view.componente] || '');
  if (!arquivo) return { componente: view.componente, arquivo: null, classe: 'Suggested', evid: null };
  let alvo = null;
  if (usaBanco(ler(arquivo))) alvo = arquivo;
  else {
    for (const hook of hooksImportados(ler(arquivo))) {
      const candidato = acharArquivo(hook);
      if (candidato && /\.(ts|tsx)$/.test(candidato) && usaBanco(ler(candidato))) {
        alvo = candidato;
        break;
      }
    }
  }
  return alvo
    ? { componente: view.componente, arquivo, classe: 'Full', evid: alvo }
    : { componente: view.componente, arquivo, classe: 'Partial', evid: arquivo };
}

/** Linhas da tabela do FEATURE_REGISTRY.md: | view | componente | arquivo | estado | evidência | */
function valorRegistroMarkdown(valor) {
  return valor === '—' ? null : valor.slice(1, -1);
}

function tabelaDoRegistro() {
  return lerDoc('FEATURE_REGISTRY.md').split('\n')
    .map((l) => l.match(/^\| `([\w-]+)` \| `(\w+)` \| (`[^`]+`|—) \| (Full|Partial|Suggested) \| (`[^`]+`|—) \|$/))
    .filter(Boolean)
    .map((m) => ({
      view: m[1],
      componente: m[2],
      arquivo: valorRegistroMarkdown(m[3]),
      classe: m[4],
      evid: valorRegistroMarkdown(m[5]),
    }));
}

test('FEATURE_REGISTRY.md lista exatamente as views do ViewRouter', () => {
  const linhasRegistro = tabelaDoRegistro();
  assert.ok(viewsReais.length > 0, 'nenhuma view encontrada — o teste perdeu o alvo');
  const totalCabecalho = Number((lerDoc('FEATURE_REGISTRY.md').match(/Base: .*?\.\s*(\d+) views/) || [])[1]);
  assert.equal(totalCabecalho, viewsReais.length, 'o cabeçalho de FEATURE_REGISTRY.md ficou para trás do número de views');
  const noDoc = linhasRegistro.map((l) => l.view);
  assert.equal(new Set(noDoc).size, noDoc.length, 'FEATURE_REGISTRY.md repete uma view');
  const esperadas = viewsReais.map((v) => v.view).sort();
  assert.deepEqual(noDoc.slice().sort(), esperadas);
});

test('FEATURE_REGISTRY.md mantém totais sincronizados com a tabela publicada', () => {
  const doc = lerDoc('FEATURE_REGISTRY.md');
  const tabela = tabelaDoRegistro();
  const totais = totaisPorColunaMarkdown(doc, 'Totais');
  for (const classe of ['Full', 'Partial', 'Suggested']) {
    assert.equal(
      totais.get(classe),
      tabela.filter((l) => l.classe === classe).length,
      `total ${classe} de FEATURE_REGISTRY.md divergiu da tabela`,
    );
  }
  assert.equal(totais.get('total'), tabela.length, 'total geral de FEATURE_REGISTRY.md divergiu da tabela');
});

test('FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais', () => {
  const doc = lerDoc('FEATURE_REGISTRY.md');
  assert.ok(
    doc.includes('não se resolve em `src/pages/lazyViews.ts`'),
    'a regra Suggested precisa descrever a classificação real da guarda',
  );
  assert.ok(!doc.includes('FallbackView'), 'FEATURE_REGISTRY.md não pode dizer que a guarda procura FallbackView');
  const linhasRegistro = tabelaDoRegistro();
  for (const linha of linhasRegistro) {
    const real = viewsReais.find((v) => v.view === linha.view);
    assert.ok(real, `\`${linha.view}\` está no registro mas não no ViewRouter`);
    assert.equal(linha.componente, real.componente, `componente de \`${linha.view}\` divergiu`);
    const calc = registroReal(real);
    assert.equal(linha.classe, calc.classe, `classificação de \`${linha.view}\` divergiu do código`);
    assert.equal(linha.arquivo, calc.arquivo, `arquivo de \`${linha.view}\` divergiu do código`);
    if (calc.classe === 'Suggested') {
      assert.equal(linha.evid, null, `view Suggested \`${linha.view}\` deve usar — na evidência`);
      continue;
    }
    assert.ok(
      fs.existsSync(path.join(raiz, linha.arquivo)),
      `FEATURE_REGISTRY.md aponta \`${linha.arquivo}\` para \`${linha.view}\`, que não existe`,
    );
    assert.ok(
      fs.existsSync(path.join(raiz, linha.evid)),
      `evidência \`${linha.evid}\` de \`${linha.view}\` não existe`,
    );
    assert.equal(linha.evid, calc.evid, `evidência de \`${linha.view}\` divergiu do código`);
  }
});

// --------------------------------------------- convenção de testes (TESTING_CONVENTION.md)
test('TESTING_CONVENTION.md aponta só para caminhos que existem', () => {
  const doc = lerDoc('TESTING_CONVENTION.md');
  assert.ok(doc.length > 500, 'TESTING_CONVENTION.md ficou vazio');
  const caminhos = [...doc.matchAll(/`((?:src|tests|scripts|e2e|supabase|\.github)\/[\w./*-]+)`/g)].map((m) => m[1]);
  assert.ok(caminhos.length > 0, 'nenhum caminho citado — o teste perdeu o alvo');
  for (const bruto of caminhos) {
    if (bruto.includes('*')) continue; // globos (ex.: scripts/ci/*.unit.mjs) não são arquivo
    assert.ok(fs.existsSync(path.join(raiz, bruto)), `TESTING_CONVENTION.md cita \`${bruto}\`, que não existe`);
  }
});

function comandoFoldedDaCi(ci, primeiraLinha) {
  const linhas = ci.split('\n');
  const indice = linhas.findIndex((l) => l.trim().startsWith(primeiraLinha));
  assert.notEqual(indice, -1, `ci.yml não tem mais o comando iniciado por \`${primeiraLinha}\``);
  let run = indice - 1;
  while (run >= 0 && !linhas[run].trim().startsWith('run:')) run--;
  assert.ok(run >= 0 && linhas[run].includes('>-'), `comando \`${primeiraLinha}\` não está em bloco run: >-`);
  const indentacao = linhas[indice].match(/^\s*/)[0].length;
  const partes = [];
  for (let i = indice; i < linhas.length; i++) {
    if (!linhas[i].trim()) continue;
    const atual = linhas[i].match(/^\s*/)[0].length;
    if (atual < indentacao) break;
    partes.push(linhas[i].trim());
  }
  return normalizaEspacos(partes.join(' '));
}

test('TESTING_CONVENTION.md descreve os runners reais (configs, scripts e CI)', async () => {
  const doc = lerDoc('TESTING_CONVENTION.md');
  const vitest = ler('vitest.config.ts');
  const contratos = ler('vitest.contracts.config.ts');
  const pacote = JSON.parse(ler('package.json'));
  const ci = ler('.github/workflows/ci.yml');

  // 1. unidade do app: glob do Vitest citado no doc == glob do arquivo
  const globApp = "src/**/*.{test,spec}.{ts,tsx}";
  assert.ok(vitest.includes(globApp), 'o include do vitest.config.ts mudou');
  assert.ok(doc.includes(globApp), `TESTING_CONVENTION.md não cita o glob real da suíte do app (${globApp})`);
  assert.ok(
    !doc.includes('Moram **ao lado do arquivo testado**'),
    'TESTING_CONVENTION.md não pode dizer que todo teste de src mora ao lado do arquivo testado',
  );

  // 2. contratos: o doc cita o glob real da config de contratos e o script certo
  if (doc.includes('tests/contracts/**/*.test.ts')) {
    assert.ok(contratos.includes('tests/contracts/**/*.test.ts'), 'o include da config de contratos mudou');
    assert.equal(pacote.scripts['test:contracts'], 'vitest run --config vitest.contracts.config.ts');
  } else {
    assert.fail('TESTING_CONVENTION.md não descreve a suíte de contratos (tests/contracts/**/*.test.ts)');
  }

  // 3. scripts do package.json citados no doc precisam existir de verdade
  for (const nome of ['test', 'test:contracts', 'test:e2e', 'test:coverage']) {
    assert.ok(pacote.scripts[nome], `package.json perdeu o script \`${nome}\``);
  }
  assert.equal(pacote.scripts.test, 'vitest run');
  assert.equal(pacote.scripts['test:e2e'], 'playwright test');

  // 4. os comandos de CI citados precisam estar no ci.yml, incluindo a linha completa de node:test.
  for (const trecho of [
    "deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1",
    "deno check --config scripts/ci/deno.json --frozen",
  ]) {
    assert.ok(ci.includes(trecho), `ci.yml não tem mais o passo \`${trecho}\``);
    assert.ok(doc.includes(trecho), `TESTING_CONVENTION.md não cita o passo real da CI: \`${trecho}\``);
  }
  const comandoNodeCi = comandoFoldedDaCi(ci, 'node --test scripts/ci/*.unit.mjs');
  const comandoNodeDoc = doc.match(/`(node --test scripts\/ci\/\*\.unit\.mjs[^`]+)`/);
  assert.ok(comandoNodeDoc, 'TESTING_CONVENTION.md não cita o comando node:test da CI');
  assert.equal(
    normalizaEspacos(comandoNodeDoc[1]),
    comandoNodeCi,
    'TESTING_CONVENTION.md divergiu da linha completa de node:test no ci.yml',
  );
  assert.ok(
    !doc.includes('a CI só varre `*.unit.mjs` em\n  `scripts/ci/`'),
    'TESTING_CONVENTION.md não pode reduzir a varredura da CI a scripts/ci/*.unit.mjs',
  );

  // 5. a camada Deno das edges: o doc precisa citar o glob de teste das edges que a CI usa
  assert.ok(ci.includes("git ls-files 'supabase/functions/**/*.test.ts'"), 'a CI perdeu o glob dos testes Deno');
  assert.ok(doc.includes('supabase/functions/**/*.test.ts'), 'TESTING_CONVENTION.md não cita os testes Deno das edges');

  // 6. a convenção de nome do diretório de contratos vale para todos os arquivos de lá
  const arquivosContrato = fs.readdirSync(path.join(raiz, 'tests/contracts'));
  assert.ok(arquivosContrato.length > 0, 'tests/contracts ficou vazio');
  for (const arquivo of arquivosContrato) {
    assert.match(arquivo, /\.test\.ts$/, `tests/contracts/${arquivo} não segue a convenção *.test.ts`);
  }

  // 7. quarentena do E2E: arquivo, campos e verificador citados no doc existem
  const moduloQuarentena = await import(new URL('../../e2e/quarantine.js', import.meta.url));
  const quarentena = moduloQuarentena.quarentena;
  assert.ok(Array.isArray(quarentena), 'e2e/quarantine.js perdeu a lista `quarentena`');
  const verificador = ler('scripts/ci/check-quarantine.mjs');
  for (const campo of ['spec', 'motivo', 'issue', 'prazo']) {
    assert.ok(verificador.includes(`'${campo}'`), `check-quarantine.mjs não exige mais \`${campo}\``);
    assert.ok(doc.includes(`\`${campo}\``), `TESTING_CONVENTION.md não documenta o campo \`${campo}\` da quarentena`);
  }
  assert.ok(doc.includes('scripts/ci/check-quarantine.mjs'), 'TESTING_CONVENTION.md não cita o verificador da quarentena');

  // 8. a quarentena real respeita a convenção que o doc descreve (prazo em AAAA-MM-DD)
  for (const item of quarentena) {
    assert.match(item.prazo, /^\d{4}-\d{2}-\d{2}$/, `quarentena de ${item.spec} sem prazo ISO`);
  }
});
