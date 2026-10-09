/**
 * M03 — CONTRATO: `pdfjs-dist` só carrega SOB DEMANDA na aba Arquivos.
 *
 * Plano: docs/plans/PLANO_MINIATURAS_E_FIGURINHAS_ARQUIVOS_2026-10-07.md (decisões D01/D03).
 * A prévia de PDF é a única razão de a biblioteca existir no projeto, e ela é grande: precisa
 * ficar FORA do bundle inicial (teto de 343 KB, ver scripts/ci/bundle-budget.mjs). Uma única
 * linha `import ... from 'pdfjs-dist'` em qualquer arquivo de produção puxa a biblioteca inteira
 * para o grafo estático e quebra o orçamento — é isso que este contrato impede.
 *
 * O que conta como CARGA ESTÁTICA (falha):
 *   - `import padrao from 'pdfjs-dist'`, `import * as pdfjs from 'pdfjs-dist'`,
 *     `import { getDocument } from 'pdfjs-dist'`, `import 'pdfjs-dist'` (efeito colateral);
 *   - `import pdfjs, { type PDFPageProxy } from 'pdfjs-dist'` — o DEFAULT binding é valor, então a
 *     declaração carrega o módulo mesmo que os bindings nomeados sejam só de tipo;
 *   - `import { type PDFPageProxy, getDocument } from 'pdfjs-dist'` — MISTO: um único binding de
 *     valor já tira a declaração do caso "só tipo";
 *   - `export { x } from 'pdfjs-dist'` / `export * from 'pdfjs-dist'`;
 *   - `import pdfjs = require('pdfjs-dist')`;
 *   - `require('pdfjs-dist')`;
 *   - qualquer SUB-CAMINHO (`pdfjs-dist/build/pdf.mjs`, `pdfjs-dist/build/pdf.worker.min.mjs`).
 * O que é PERMITIDO:
 *   - `await import('pdfjs-dist')` / `import('pdfjs-dist/build/...')` — carregamento dinâmico,
 *     que é justamente o caminho escolhido na D03;
 *   - `import type { PDFDocumentProxy } from 'pdfjs-dist'` e
 *     `import { type PDFPageProxy } from 'pdfjs-dist'` — binding puramente de TIPO: o compilador
 *     (esbuild/vite) apaga a declaração antes de emitir, então não entra byte nenhum no bundle.
 *
 * POR QUE ANALISADOR LÉXICO E NÃO REGEX: o defeito é a FORMA SINTÁTICA da declaração,
 * e regex crua erra nos dois sentidos. (a) Falso positivo: `// import 'pdfjs-dist'` num
 * comentário, ou a string `const exemplo = "import 'pdfjs-dist'"`, ou um import quebrado em
 * várias linhas com comentário no meio — o revisor recusou contratos desta área que quebravam
 * com reformatação. (b) Falso negativo: um stripper de comentários ingênuo engole código depois
 * de um `//` que está dentro de um literal. O lexer abaixo ignora comentários/literais e só
 * considera tokens reais de `import`/`export`/`require`; `import(...)` dinâmico é chamada e fica
 * permitido por construção — sem lista de exceções.
 *
 * ESCOPO DA VARREDURA: `src/**` RECURSIVO, com três exclusões explícitas, todas de arquivo que não
 * emite código de produção:
 *   - diretório `__tests__` (o cartão M01 usa `vi.mock('pdfjs-dist')` nos testes, e `vi.mock` não é
 *     import);
 *   - `*.test.*` / `*.spec.*` fora de `__tests__` (existem 8 desses hoje em `src/`);
 *   - `*.d.ts` (declaração: nada é emitido).
 * O e2e/ e as Edge Functions ficam fora: a D03 é sobre o bundle do navegador.
 */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const denoGlobal = (globalThis as { Deno?: { test?: (nome: string, fn: CaseFn) => void } }).Deno;
const IS_DENO = typeof denoGlobal?.test === 'function';

type CaseFn = () => void | Promise<void>;
let registrar: (nome: string, fn: CaseFn) => void;
if (IS_DENO) {
  registrar = (nome, fn) => { denoGlobal!.test!(nome, fn); };
} else {
  // Specifier não-literal: o Deno não tenta resolver 'vitest' no `deno check`
  // (que roda com --frozen e sem essa dependência); sob Node o vitest resolve.
  const spec = 'vit' + 'est';
  const mod = (await import(spec)) as { it: (nome: string, fn: CaseFn) => void };
  registrar = (nome, fn) => { mod.it(nome, fn); };
}

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = resolve(ROOT, 'src');
const PACOTE = 'pdfjs-dist';

/** `pdfjs-dist` ou qualquer sub-caminho dele (`pdfjs-dist/build/pdf.mjs`). */
function ehPdfjs(specifier: string): boolean {
  return specifier === PACOTE || specifier.startsWith(`${PACOTE}/`);
}

type Achado = { linha: number; descricao: string };
type Token = { texto: string; inicio: number; fim: number; tipo: 'id' | 'string' | 'pontuacao' };

const ehInicioIdentificador = (ch: string) => /[A-Za-z_$]/.test(ch);
const ehParteIdentificador = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

function linhaDe(fonte: string, posicao: number): number {
  let linha = 1;
  for (let i = 0; i < posicao; i += 1) if (fonte.charCodeAt(i) === 10) linha += 1;
  return linha;
}

function pularComentarioLinha(fonte: string, i: number): number {
  let cursor = i + 2;
  while (cursor < fonte.length && fonte[cursor] !== '\n') cursor += 1;
  return cursor;
}

function pularComentarioBloco(fonte: string, i: number): number {
  let cursor = i + 2;
  while (cursor < fonte.length && !(fonte[cursor] === '*' && fonte[cursor + 1] === '/')) cursor += 1;
  return Math.min(cursor + 2, fonte.length);
}

function pularLiteral(fonte: string, i: number): number {
  const aspas = fonte[i];
  let cursor = i + 1;
  while (cursor < fonte.length) {
    if (fonte[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (fonte[cursor] === aspas) return cursor + 1;
    cursor += 1;
  }
  return fonte.length;
}

function valorStringLiteral(raw: string): string {
  // Os specifiers reais do projeto são literais simples; estes escapes cobrem os casos válidos
  // sem avaliar código arbitrário.
  return raw.slice(1, -1).replace(/\\(['"`\\])/g, '$1');
}

function tokensDe(fonte: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < fonte.length) {
    const ch = fonte[i];
    const prox = fonte[i + 1];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '/' && prox === '/') {
      i = pularComentarioLinha(fonte, i);
      continue;
    }
    if (ch === '/' && prox === '*') {
      i = pularComentarioBloco(fonte, i);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const fim = pularLiteral(fonte, i);
      tokens.push({ texto: valorStringLiteral(fonte.slice(i, fim)), inicio: i, fim, tipo: 'string' });
      i = fim;
      continue;
    }
    if (ehInicioIdentificador(ch)) {
      const inicio = i;
      i += 1;
      while (i < fonte.length && ehParteIdentificador(fonte[i])) i += 1;
      tokens.push({ texto: fonte.slice(inicio, i), inicio, fim: i, tipo: 'id' });
      continue;
    }
    tokens.push({ texto: ch, inicio: i, fim: i + 1, tipo: 'pontuacao' });
    i += 1;
  }
  return tokens;
}

function fimDaInstrucao(tokens: Token[], inicio: number): number {
  for (let i = inicio; i < tokens.length; i += 1) {
    if (tokens[i].texto === ';') return i;
  }
  return tokens.length;
}

function todosBindingsInlineSaoTipo(tokens: Token[], abreChaves: number, fechaChaves: number): boolean {
  if (abreChaves < 0 || fechaChaves <= abreChaves + 1) return false;
  let esperaBinding = true;
  let viuBinding = false;
  for (let i = abreChaves + 1; i < fechaChaves; i += 1) {
    const token = tokens[i];
    if (token.texto === ',') {
      esperaBinding = true;
      continue;
    }
    if (!esperaBinding) continue;
    if (token.texto !== 'type') return false;
    viuBinding = true;
    esperaBinding = false;
  }
  return viuBinding;
}

function importSomenteTipo(tokens: Token[], inicio: number, indiceFrom: number): boolean {
  const primeiro = tokens[inicio + 1];
  if (!primeiro) return false;
  if (primeiro.texto === 'type') return true;
  if (primeiro.texto !== '{') return false; // default, namespace e import misto têm binding de valor.
  let profundidade = 0;
  for (let i = inicio + 1; i < indiceFrom; i += 1) {
    if (tokens[i].texto === '{') profundidade += 1;
    if (tokens[i].texto === '}') {
      profundidade -= 1;
      if (profundidade === 0) return todosBindingsInlineSaoTipo(tokens, inicio + 1, i);
    }
  }
  return false;
}

function exportSomenteTipo(tokens: Token[], inicio: number, indiceFrom: number): boolean {
  const primeiro = tokens[inicio + 1];
  if (!primeiro) return false;
  if (primeiro.texto === 'type') return true;
  const abreChaves = tokens.findIndex((token, indice) => indice > inicio && indice < indiceFrom && token.texto === '{');
  if (abreChaves === -1) return false;
  const fechaChaves = tokens.findIndex((token, indice) => indice > abreChaves && indice < indiceFrom && token.texto === '}');
  return todosBindingsInlineSaoTipo(tokens, abreChaves, fechaChaves);
}

/**
 * Declarações ESTÁTICAS de `pdfjs-dist` na fonte. Devolve `[]` quando o arquivo carrega a
 * biblioteca só por `import(...)` dinâmico. Todas as descrições são fixas (o teste compara com
 * elas e com as linhas), então a função é o sujeito testado pela tabela de casos.
 */
function cargasEstaticasDePdfjs(fonte: string, _nomeDoArquivo = 'arquivo.ts'): Achado[] {
  const tokens = tokensDe(fonte);
  const achados: Achado[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.texto === 'import') {
      const seguinte = tokens[i + 1];
      if (!seguinte || seguinte.texto === '(') continue; // import(...) dinâmico.

      const fim = fimDaInstrucao(tokens, i);
      const indiceRequire = tokens.findIndex((t, indice) => indice > i && indice < fim && t.texto === 'require');
      if (indiceRequire !== -1) {
        const specifier = tokens[indiceRequire + 2];
        if (tokens[indiceRequire + 1]?.texto === '(' && specifier?.tipo === 'string' && ehPdfjs(specifier.texto)) {
          achados.push({ linha: linhaDe(fonte, token.inicio), descricao: `import ... = require('${specifier.texto}')` });
        }
        i = fim;
        continue;
      }

      if (seguinte.tipo === 'string') {
        if (ehPdfjs(seguinte.texto)) {
          achados.push({ linha: linhaDe(fonte, token.inicio), descricao: `import estático de '${seguinte.texto}'` });
        }
        i = fim;
        continue;
      }

      const indiceFrom = tokens.findIndex((t, indice) => indice > i && indice < fim && t.texto === 'from');
      const specifier = indiceFrom === -1 ? undefined : tokens[indiceFrom + 1];
      if (specifier?.tipo === 'string' && ehPdfjs(specifier.texto) && !importSomenteTipo(tokens, i, indiceFrom)) {
        achados.push({ linha: linhaDe(fonte, token.inicio), descricao: `import estático de '${specifier.texto}'` });
      }
      i = fim;
      continue;
    }

    if (token.texto === 'export') {
      const fim = fimDaInstrucao(tokens, i);
      const indiceFrom = tokens.findIndex((t, indice) => indice > i && indice < fim && t.texto === 'from');
      const specifier = indiceFrom === -1 ? undefined : tokens[indiceFrom + 1];
      if (specifier?.tipo === 'string' && ehPdfjs(specifier.texto) && !exportSomenteTipo(tokens, i, indiceFrom)) {
        achados.push({ linha: linhaDe(fonte, token.inicio), descricao: `export ... from '${specifier.texto}'` });
      }
      i = fim;
      continue;
    }

    if (token.texto === 'require' && tokens[i + 1]?.texto === '(' && tokens[i + 2]?.tipo === 'string') {
      const specifier = tokens[i + 2].texto;
      if (ehPdfjs(specifier)) {
        achados.push({ linha: linhaDe(fonte, token.inicio), descricao: `require('${specifier}')` });
      }
    }
  }

  return achados;
}

/** Arquivos de PRODUÇÃO sob um diretório (ver "ESCOPO DA VARREDURA" no cabeçalho). */
function arquivosDeProducao(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name !== '__tests__' && entrada.name !== 'node_modules') arquivosDeProducao(caminho, acumulado);
      continue;
    }
    if (!/\.tsx?$/.test(entrada.name)) continue;
    if (/\.d\.ts$/.test(entrada.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entrada.name)) continue;
    acumulado.push(caminho);
  }
  return acumulado.sort();
}

const rel = (absoluto: string) => absoluto.slice(ROOT.length + 1);
const lerFonte = (absoluto: string) => readFileSync(absoluto, 'utf8');

registrar('contrato M03 — a varredura alcança src/** de produção (e só ele)', () => {
  const arquivos = arquivosDeProducao(SRC);
    // A varredura tem de ser vasta e alcançar a aba Arquivos: sem isto, uma varredura vazia
    // passaria no teste seguinte para sempre (o contrato mais frágil no momento mais importante).
  assert.ok(arquivos.length > 500);
  assert.ok(arquivos.includes(resolve(SRC, 'components/inbox/tabs/FileThumb.tsx')));
  assert.deepEqual(arquivos.filter((arquivo) => arquivo.includes('__tests__')), []);
  assert.deepEqual(arquivos.filter((arquivo) => /\.(test|spec)\.tsx?$/.test(basename(arquivo))), []);
  for (const arquivo of arquivos) assert.equal(arquivo.startsWith(SRC), true);
});

registrar('contrato M03 — nenhum arquivo de produção em src/** carrega pdfjs-dist de forma estática', () => {
  const violacoes: string[] = [];
  for (const arquivo of arquivosDeProducao(SRC)) {
    for (const achado of cargasEstaticasDePdfjs(lerFonte(arquivo), arquivo)) {
      violacoes.push(`${rel(arquivo)}:${achado.linha} — ${achado.descricao}`);
    }
  }
  assert.deepEqual(
    violacoes,
    [],
    'Use `const pdfjs = await import(\'pdfjs-dist\')` (dinâmico): um import estático puxa a biblioteca para o bundle inicial e estoura o teto de 343 KB (decisão D03).',
  );
});

const casos: Array<{ nome: string; codigo: string; esperado: string[] }> = [
    {
      nome: 'import default de valor',
      codigo: "import pdfjs from 'pdfjs-dist';\n",
      esperado: ["import estático de 'pdfjs-dist'"],
    },
    {
      nome: 'import namespace de valor',
      codigo: "import * as pdfjs from 'pdfjs-dist';\n",
      esperado: ["import estático de 'pdfjs-dist'"],
    },
    {
      nome: 'import nomeado de valor',
      codigo: "import { getDocument } from 'pdfjs-dist';\n",
      esperado: ["import estático de 'pdfjs-dist'"],
    },
    {
      nome: 'import só de efeito colateral',
      codigo: "import 'pdfjs-dist';\n",
      esperado: ["import estático de 'pdfjs-dist'"],
    },
    {
      nome: 'sub-caminho do worker',
      codigo: "import worker from 'pdfjs-dist/build/pdf.worker.min.mjs';\n",
      esperado: ["import estático de 'pdfjs-dist/build/pdf.worker.min.mjs'"],
    },
    {
      nome: 'reescrito em várias linhas e com comentário no meio (a regex quebraria aqui)',
      codigo: 'import {\n  // o worker tenta entrar por aqui\n  getDocument,\n  GlobalWorkerOptions,\n} from "pdfjs-dist";\n',
      esperado: ["import estático de 'pdfjs-dist'"],
    },
    {
      nome: 'require estático',
      codigo: "const pdfjs = require('pdfjs-dist');\n",
      esperado: ["require('pdfjs-dist')"],
    },
    {
      nome: 'import x = require',
      codigo: "import pdfjs = require('pdfjs-dist');\n",
      esperado: ["import ... = require('pdfjs-dist')"],
    },
    {
      nome: 'reexport do módulo',
      codigo: "export { getDocument } from 'pdfjs-dist';\n",
      esperado: ["export ... from 'pdfjs-dist'"],
    },
    {
      nome: 'comentário de linha citando o import (não é declaração)',
      codigo: "// nunca faça: import { getDocument } from 'pdfjs-dist'\nexport const pronto = true;\n",
      esperado: [],
    },
    {
      nome: 'comentário de bloco citando o import',
      codigo: "/* import 'pdfjs-dist' era o caminho antigo */\nexport const pronto = true;\n",
      esperado: [],
    },
    {
      nome: 'string com o texto do import (não é declaração)',
      codigo: "export const exemplo = \"import 'pdfjs-dist'\";\n",
      esperado: [],
    },
    {
      nome: 'import dinâmico — o caminho permitido pela D03',
      codigo: "export const carregar = async () => {\n  const pdfjs = await import('pdfjs-dist');\n  return pdfjs;\n};\n",
      esperado: [],
    },
    {
      nome: 'import dinâmico do worker com sufixo ?url',
      codigo: "export const worker = () => import('pdfjs-dist/build/pdf.worker.min.mjs?url');\n",
      esperado: [],
    },
    {
      nome: 'import type — apagado pelo compilador',
      codigo: "import type { PDFDocumentProxy } from 'pdfjs-dist';\nexport type D = PDFDocumentProxy;\n",
      esperado: [],
    },
    {
      nome: 'só bindings inline de tipo no import nomeado — apagado pelo compilador',
      codigo: "import { type PDFPageProxy } from 'pdfjs-dist';\nexport type P = PDFPageProxy;\n",
      esperado: [],
    },
    {
      nome: 'default de valor com binding nomeado de tipo — o default puxa a biblioteca',
      codigo: "import pdfjs, { type PDFPageProxy } from 'pdfjs-dist';\nexport type P = PDFPageProxy;\nexport const carregado = pdfjs;\n",
      esperado: ["import estático de 'pdfjs-dist'"],
    },
    {
      nome: 'import nomeado misto (type + valor) — um valor basta para carregar',
      codigo: "import { type PDFPageProxy, getDocument } from 'pdfjs-dist';\nexport type P = PDFPageProxy;\nexport const carregado = getDocument;\n",
      esperado: ["import estático de 'pdfjs-dist'"],
    },
    {
      nome: 'pacote de nome parecido não é o alvo',
      codigo: "import { analisar } from 'pdfjs-dist-legado';\nimport { util } from 'pdfjs-utils';\n",
      esperado: [],
    },
  ];

for (const { nome, codigo, esperado } of casos) {
  registrar(`contrato M03 — ${nome}`, () => {
    assert.deepEqual(cargasEstaticasDePdfjs(codigo).map((achado) => achado.descricao), esperado);
  });
}

registrar('contrato M03 — um arquivo com import estático é reprovado (e a linha é a certa)', () => {
  // Prova o caminho do contrato sem escrever arquivo temporário: o comando de CI deste contrato
  // roda só com --allow-read, então a amostra precisa ser em memória e ainda preservar o nome/linha.
  const alvo = 'carga-estatica.tmp.ts';
  const fonte = "const linha = 1;\nimport { getDocument } from 'pdfjs-dist';\n";
  assert.deepEqual(
    cargasEstaticasDePdfjs(fonte, alvo).map((achado) => [achado.linha, achado.descricao]),
    [[2, "import estático de 'pdfjs-dist'"]],
  );
});

registrar('contrato M03 — pdfjs-dist está em dependencies (bundle do app), nunca em devDependencies', () => {
  const pacote = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const versao = pacote.dependencies?.[PACOTE];
  assert.ok(versao, 'pdfjs-dist precisa estar em dependencies: é dependência de runtime da prévia de PDF.');
  assert.match(versao, /^\^?\d+\.\d+\.\d+/);
  assert.equal(
    pacote.devDependencies?.[PACOTE],
    undefined,
    'em devDependencies a biblioteca não existe no deploy do app.',
  );
});
