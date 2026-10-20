/**
 * SL-154 · DEC-1 — gate de cobertura do módulo do Catálogo.
 *
 * Antes desta decisão o `coverage.include` do vitest.config.ts media só `src/lib/**`
 * + `src/services/**` (mais dois escopos pontuais já promovidos): o módulo
 * `src/components/catalog/**` NÃO entrava no gate padrão (`bun run test:coverage`,
 * o que o CI roda) e só era medido por override de CLI
 * (`--coverage.include='src/components/catalog/**'`, ver docs/catalogo/HANDOFF_v1.md §3.1).
 *
 * O teste CARREGA a config com o mesmo loader que o Vite usa (`loadConfigFromFile`) e
 * confere o valor EFETIVO, não o texto do arquivo:
 *   1. o escopo do Catálogo entra no `coverage.include`;
 *   2. um mesmo glob do gate alcança TODOS os arquivos do módulo — e nenhum de fora;
 *   3. o Catálogo tem piso próprio, cobrindo o módulo inteiro, de 80% em lines e branches.
 */
import { readdirSync } from "node:fs";
import { join, matchesGlob, relative, resolve } from "node:path";
import { cwd } from "node:process";
import { loadConfigFromFile } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

type Piso = { lines?: number; branches?: number };

const MODULO = "src/components/catalog";

/** Arquivo real do módulo: o glob do gate tem de alcançá-lo. */
const AMOSTRA_DO_MODULO = `${MODULO}/CatalogRail.tsx`;

/** Arquivo real de outro escopo: o glob do Catálogo não pode alcançá-lo. */
const FORA_DO_MODULO = "src/components/contacts/ContactForm.tsx";

let include: string[] = [];
let thresholds: Record<string, number | Piso> = {};

/** Arquivos de produção do módulo (sem os testes, que o `coverage.exclude` tira do gate). */
function arquivosDoModulo(): string[] {
  const raiz = resolve(cwd());
  return readdirSync(resolve(raiz, MODULO), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    // `e.parentPath` já é ABSOLUTO (Node >= 20.12 com withFileTypes): usa-se relative(raiz, ...)
    // e NÃO se prefixa MODULO de novo — o prefixo duplicado gerava
    // "src/components/catalog/src/components/catalog/X.tsx".
    .map((e) => relative(raiz, join(e.parentPath ?? raiz, e.name)).replace(/\\/g, "/"))
    .filter((f) => !f.includes("__tests__") && !/\.(test|spec)\./.test(f));
}

beforeAll(async () => {
  const carregada = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    resolve(cwd(), "vitest.config.ts"),
    cwd(),
  );
  const coverage = (
    carregada?.config as unknown as {
      test?: { coverage?: { include?: string[]; thresholds?: Record<string, number | Piso> } };
    }
  )?.test?.coverage;
  include = coverage?.include ?? [];
  thresholds = coverage?.thresholds ?? {};
});

describe("gate de cobertura do módulo do Catálogo (SL-154 · DEC-1)", () => {
  it("o escopo src/components/catalog/** entra no coverage.include", () => {
    expect(include.some((glob) => matchesGlob(AMOSTRA_DO_MODULO, glob))).toBe(true);
  });

  it("um mesmo glob do gate mede todos os arquivos do módulo e nenhum de fora", () => {
    const arquivos = arquivosDoModulo();
    expect(arquivos.length).toBeGreaterThanOrEqual(20);
    // Formato do caminho: a lista tem de conter um arquivo REAL do módulo. Sem esta asserção um
    // caminho duplicado ("src/components/catalog/src/components/catalog/X.tsx") ainda casaria
    // com o glob e o teste passaria com o glob errado.
    expect(arquivos).toContain(AMOSTRA_DO_MODULO);

    const globDoModulo = include.find((glob) => arquivos.every((arquivo) => matchesGlob(arquivo, glob)));
    expect(globDoModulo).toBeDefined();
    expect(matchesGlob(FORA_DO_MODULO, globDoModulo as string)).toBe(false);
  });

  it("o módulo do Catálogo tem piso próprio, cobrindo o módulo inteiro, de 80% em lines e branches", () => {
    const arquivos = arquivosDoModulo();
    const chaveDoModulo = Object.keys(thresholds).find((chave) =>
      arquivos.every((arquivo) => matchesGlob(arquivo, chave)),
    );
    expect(chaveDoModulo).toBeDefined();

    const piso = thresholds[chaveDoModulo as string] as Piso;
    expect(piso.lines).toBeGreaterThanOrEqual(80);
    expect(piso.branches).toBeGreaterThanOrEqual(80);
  });
});
