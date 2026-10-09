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
 * POR QUE AST (typescript) E NÃO REGEX: o defeito é a FORMA SINTÁTICA da declaração, e regex erra
 * nos dois sentidos. (a) Falso positivo: `// import 'pdfjs-dist'` num comentário, ou a string
 * `const exemplo = "import 'pdfjs-dist'"`, ou um import quebrado em várias linhas com comentário no
 * meio — o revisor recusou contratos desta área que quebravam com reformatação. (b) Falso negativo:
 * um stripper de comentários ingênuo engole código depois de um `//` que está dentro de um literal.
 * A AST não tem nenhum dos dois problemas: comentário e literal não são declaração, e o
 * `import(...)` dinâmico é uma CallExpression (nunca uma ImportDeclaration), então é aceito por
 * construção — sem lista de exceções.
 *
 * ESCOPO DA VARREDURA: `src/**` RECURSIVO, com três exclusões explícitas, todas de arquivo que não
 * emite código de produção:
 *   - diretório `__tests__` (o cartão M01 usa `vi.mock('pdfjs-dist')` nos testes, e `vi.mock` não é
 *     import);
 *   - `*.test.*` / `*.spec.*` fora de `__tests__` (existem 8 desses hoje em `src/`);
 *   - `*.d.ts` (declaração: nada é emitido).
 * O e2e/ e as Edge Functions ficam fora: a D03 é sobre o bundle do navegador.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SRC = resolve(ROOT, 'src');
const PACOTE = 'pdfjs-dist';

/** `pdfjs-dist` ou qualquer sub-caminho dele (`pdfjs-dist/build/pdf.mjs`). */
function ehPdfjs(specifier: string): boolean {
  return specifier === PACOTE || specifier.startsWith(`${PACOTE}/`);
}

type Achado = { linha: number; descricao: string };

/**
 * Extrai os especifiers de `import`/`export`/`require` nomeados do módulo, seguindo o padrão
 * TS/JS (string literal). O specifier é `undefined` quando o nó não declara módulo
 * (`import x from "y"` sempre declara; `export { x }` sem `from` não).
 */
function specifierDe(no: ts.Node): string | undefined {
  if (ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) {
    const modulo = no.moduleSpecifier;
    if (modulo && ts.isStringLiteral(modulo)) return modulo.text;
    return undefined;
  }
  if (ts.isImportEqualsDeclaration(no) && ts.isExternalModuleReference(no.moduleReference)) {
    const expressao = no.moduleReference.expression;
    if (expressao && ts.isStringLiteral(expressao)) return expressao.text;
  }
  return undefined;
}

/**
 * Todos os bindings nomeados da declaração são `type` (`import { type A, type B } from 'x'`)?
 *
 * Aceita as duas listas nomeadas (`NamedImportBindings` no import, `NamedExports` no export) e
 * exige que a lista EXISTA e não esteja vazia. `import * as ns from 'x'` (`NamespaceImport`) traz
 * o namespace inteiro em tempo de execução: é tratado EXPLICITAMENTE como não-tipo, e não pela
 * ausência do campo `.elements` — era essa a suposição implícita que deixava o namespace passar
 * como só-tipo em qualquer refatoração futura.
 */
function soBindingsDeTipo(named: ts.NamedImportBindings | ts.NamedExports | undefined): boolean {
  if (named === undefined || ts.isNamespaceImport(named)) return false;
  const elementos = named.elements;
  return elementos.length > 0 && elementos.every((elemento) => elemento.isTypeOnly);
}

/**
 * Declarações ESTÁTICAS de `pdfjs-dist` na fonte. Devolve `[]` quando o arquivo carrega a
 * biblioteca só por `import(...)` dinâmico. Todas as descrições são fixas (o teste compara com
 * elas e com as linhas), então a função é o sujeito testado pela tabela de casos.
 */
function cargasEstaticasDePdfjs(fonte: string, nomeDoArquivo = 'arquivo.ts'): Achado[] {
  const scriptKind = nomeDoArquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const arquivo = ts.createSourceFile(nomeDoArquivo, fonte, ts.ScriptTarget.Latest, true, scriptKind);
  const achados: Achado[] = [];

  const anotar = (no: ts.Node, descricao: string) => {
    achados.push({ linha: arquivo.getLineAndCharacterOfPosition(no.getStart(arquivo)).line + 1, descricao });
  };

  const visitar = (no: ts.Node): void => {
    const specifier = specifierDe(no);
    if (specifier !== undefined && ehPdfjs(specifier)) {
      // `import { type A } from 'x'` é só-tipo pelos bindings inline, mas `import padrao, { type A }`
      // NÃO é: o binding DEFAULT é valor e puxa o módulo. Por isso os bindings inline só decidem
      // quando não existe `importClause.name` (nenhum binding de valor antes da lista).
      const somenteTipo = ts.isImportDeclaration(no)
        ? no.importClause?.isTypeOnly === true ||
          (no.importClause?.name === undefined && soBindingsDeTipo(no.importClause?.namedBindings))
        : ts.isExportDeclaration(no)
          ? no.isTypeOnly || soBindingsDeTipo(no.namedExports)
          : false; // `import x = require(...)` nunca é só tipo
      if (!somenteTipo) {
        const forma = ts.isImportDeclaration(no)
          ? `import estático de '${specifier}'`
          : ts.isExportDeclaration(no)
            ? `export ... from '${specifier}'`
            : `import ... = require('${specifier}')`;
        anotar(no, forma);
      }
    } else if (
      ts.isCallExpression(no) &&
      ts.isIdentifier(no.expression) &&
      no.expression.text === 'require' &&
      no.arguments.length > 0 &&
      ts.isStringLiteral(no.arguments[0]) &&
      ehPdfjs(no.arguments[0].text)
    ) {
      anotar(no, `require('${no.arguments[0].text}')`);
    }
    no.forEachChild(visitar);
  };

  visitar(arquivo);
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

describe('contrato M03 — pdfjs-dist só carrega sob demanda', () => {
  it('a varredura alcança src/** de produção (e só ele)', () => {
    const arquivos = arquivosDeProducao(SRC);
    // A varredura tem de ser vasta e alcançar a aba Arquivos: sem isto, uma varredura vazia
    // passaria no teste seguinte para sempre (o contrato mais frágil no momento mais importante).
    expect(arquivos.length).toBeGreaterThan(500);
    expect(arquivos).toContain(resolve(SRC, 'components/inbox/tabs/FileThumb.tsx'));
    expect(arquivos.filter((arquivo) => arquivo.includes('__tests__'))).toEqual([]);
    expect(arquivos.filter((arquivo) => /\.(test|spec)\.tsx?$/.test(basename(arquivo)))).toEqual([]);
    for (const arquivo of arquivos) expect(arquivo.startsWith(SRC)).toBe(true);
  });

  // Único ajuste de tempo deste arquivo: esta é a única verificação do repositório que parseia
  // TODO o src/** com o compilador, e o teto padrão de 5 s do `vitest.contracts.config.ts` (o
  // config principal usa 15 s) fazia o contrato acusar vermelho FALSO quando a máquina estava
  // ocupada — foi esse o vermelho que a fábrica viu e atribuiu a um cartão de volume, com o
  // arquivo idêntico ao da base. A folga é medida: o mesmo teste leva ~2 s com a máquina livre,
  // ~6 s com os 24 núcleos ocupados e ~26 s com a caixa inteira carregada (o teto de 60 s cobre a
  // pior carga observada). Nada afrouxa aqui: as asserções são exatamente as mesmas e um import
  // estático continua reprovado — a reprovação é por CONTEÚDO, nunca pelo tempo.
  it('nenhum arquivo de produção em src/** carrega pdfjs-dist de forma estática', { timeout: 60_000 }, () => {
    const violacoes: string[] = [];
    for (const arquivo of arquivosDeProducao(SRC)) {
      for (const achado of cargasEstaticasDePdfjs(lerFonte(arquivo), arquivo)) {
        violacoes.push(`${rel(arquivo)}:${achado.linha} — ${achado.descricao}`);
      }
    }
    expect(
      violacoes,
      'Use `const pdfjs = await import(\'pdfjs-dist\')` (dinâmico): um import estático puxa a biblioteca para o bundle inicial e estoura o teto de 343 KB (decisão D03).',
    ).toEqual([]);
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

  it.each(casos)('$nome', ({ codigo, esperado }) => {
    expect(cargasEstaticasDePdfjs(codigo).map((achado) => achado.descricao)).toEqual(esperado);
  });

  it('um arquivo com import estático LIDO DO DISCO é reprovado (e a linha é a certa)', () => {
    // Prova o caminho real do contrato (ler arquivo → julgar), num arquivo temporário: é o
    // formato exato que o defeito teria em src/ quando alguém quebrar a D03.
    const dir = mkdtempSync(join(tmpdir(), 'contrato-pdfjs-'));
    try {
      const alvo = join(dir, 'carga-estatica.tmp.ts');
      writeFileSync(alvo, "const linha = 1;\nimport { getDocument } from 'pdfjs-dist';\n");
      expect(
        cargasEstaticasDePdfjs(lerFonte(alvo), alvo).map((achado) => [achado.linha, achado.descricao]),
      ).toEqual([[2, "import estático de 'pdfjs-dist'"]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pdfjs-dist está em dependencies (bundle do app), nunca em devDependencies', () => {
    const pacote = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const versao = pacote.dependencies?.[PACOTE];
    expect(versao, 'pdfjs-dist precisa estar em dependencies: é dependência de runtime da prévia de PDF.').toBeTruthy();
    expect(versao).toMatch(/^\^?\d+\.\d+\.\d+/);
    expect(pacote.devDependencies?.[PACOTE], 'em devDependencies a biblioteca não existe no deploy do app.').toBeUndefined();
  });
});
