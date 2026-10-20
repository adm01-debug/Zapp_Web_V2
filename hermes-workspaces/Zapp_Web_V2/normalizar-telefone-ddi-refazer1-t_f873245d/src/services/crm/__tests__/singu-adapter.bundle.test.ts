/**
 * CT-002 — prova de bundle: o adaptador de teste do Singu (mock) não pode
 * entrar no build de produção.
 *
 * O teste empacota o MESMO módulo (`singu-adapter.ts`) com o empacotador do
 * projeto em modo de produção e procura as marcas do mock em tudo o que sai:
 * o código de cada pedaço e o nome de cada arquivo gerado (um `import()`
 * dinâmico viraria um pedaço próprio, com o nome do módulo).
 *
 * O segundo teste é o CONTROLE: empacota o módulo do mock como entrada e exige
 * que as mesmas marcas apareçam — sem ele, uma busca quebrada passaria calada.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { build } from 'vite';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, '../../..');
const adapterEntry = path.resolve(testDir, '../singu-adapter.ts');
const mockEntry = path.resolve(testDir, '../singu-adapter.mock.ts');

interface BuildChunk {
  type: string;
  fileName: string;
  code?: string;
}

/** Símbolos e dados que só existem no módulo do mock. */
const MOCK_SYMBOLS = ['mockAdapter', 'fixture-singu'];
/** Nome do módulo do mock: apareceria no arquivo gerado pelo `import()`. */
const MOCK_MODULE = 'singu-adapter.mock';

async function bundle(entry: string): Promise<{ fileNames: string; text: string }> {
  // `vite build` trata o build como produção porque o NODE_ENV é 'production'
  // (o vitest roda com NODE_ENV=test): fixamos para o build do teste ter as
  // MESMAS definições do build de produção, inclusive `import.meta.env.DEV`.
  vi.stubEnv('NODE_ENV', 'production');
  try {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      mode: 'production',
      resolve: { alias: { '@': srcDir } },
      build: {
        write: false,
        // Sem minificar: o teste precisa enxergar nome de símbolo e dado de teste.
        // (Minificar só esconderia as marcas, não mudaria o que é empacotado.)
        minify: false,
        emptyOutDir: false,
        rollupOptions: {
          input: entry,
          preserveEntrySignatures: 'exports-only',
          // Bibliotecas ficam de fora: o que interessa é o nosso grafo de módulos.
          external: (id: string) => !id.startsWith('.') && !id.startsWith('@/') && !path.isAbsolute(id),
          output: { format: 'es' },
        },
      },
    });

    const chunks: BuildChunk[] = Array.isArray(result)
      ? (result as { output: BuildChunk[] }[]).flatMap((item) => item.output)
      : (result as { output: BuildChunk[] }).output;

    return {
      fileNames: chunks.map((chunk) => chunk.fileName).join('\n'),
      text: chunks.map((chunk) => `${chunk.fileName}\n${chunk.code ?? ''}`).join('\n'),
    };
  } finally {
    vi.unstubAllEnvs();
  }
}

describe('bundle do Singu', () => {
  it('não empacota o adaptador de teste no build de produção', async () => {
    const producao = await bundle(adapterEntry);

    // Prova que o grafo do adaptador real FOI empacotado (senão "não achar o
    // mock" não significaria nada).
    expect(producao.text).toContain('getSinguAdapter');
    expect(producao.text).toContain('getContact360Batch');

    expect(producao.fileNames).not.toContain(MOCK_MODULE);
    for (const symbol of MOCK_SYMBOLS) {
      expect(producao.text, `símbolo "${symbol}" vazou para o pacote de produção`).not.toContain(symbol);
    }
  }, 120_000);

  it('controle: as marcas do mock são encontradas quando ele está no pacote', async () => {
    const canario = await bundle(mockEntry);

    expect(canario.fileNames).toContain(MOCK_MODULE);
    for (const symbol of MOCK_SYMBOLS) {
      expect(canario.text, `símbolo "${symbol}" não foi encontrado no controle`).toContain(symbol);
    }
  }, 120_000);
});
