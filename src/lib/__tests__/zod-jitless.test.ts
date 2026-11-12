/**
 * CSP report-only de produção (12/11): `schemas-*.js` (zod/v4/core/schemas.js)
 * fazia `new Function("")` para testar se podia compilar validadores — a CSP do
 * app não tem 'unsafe-eval' e reportava a violação a cada carregamento.
 * `@/lib/zod` liga `jitless` e é a única porta de entrada do Zod v4 no app.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@/lib/zod';

const SRC = join(__dirname, '..', '..');

function arquivosFonte(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivosFonte(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

/**
 * `true` se a fonte importa ou reexporta um VALOR de `zod`, `zod/v4` ou
 * `zod/mini` (named, namespace, default, `export … from`). `import type` e
 * listas só com `type X` não contam: tipo não executa nada. `zod/v3` (legado,
 * sem compilador) fica de fora.
 */
function importaValorDoZod(fonte: string): boolean {
  const declaracao = /^\s*(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]zod(?:\/v4|\/mini)?['"]/gm;
  for (const m of fonte.matchAll(declaracao)) {
    if (m[2]) continue; // import type / export type
    const clausula = m[3].trim();
    const soChaves = clausula.match(/^\{([\s\S]*)\}$/);
    if (soChaves) {
      const itens = soChaves[1].split(',').map((i) => i.trim()).filter(Boolean);
      if (itens.length > 0 && itens.every((i) => i.startsWith('type '))) continue;
    }
    return true;
  }
  return false;
}

describe('@/lib/zod — Zod sem eval (CSP sem unsafe-eval)', () => {
  it('liga jitless na configuração global e continua validando', () => {
    expect(z.config().jitless).toBe(true);
    const schema = z.object({ email: z.string().email(), idade: z.number().int() });
    expect(schema.safeParse({ email: 'a@b.co', idade: 3 }).success).toBe(true);
    expect(schema.safeParse({ email: 'x', idade: 1.5 }).success).toBe(false);
  });

  it('nenhum módulo do app importa VALOR do Zod v4 direto (só via @/lib/zod)', () => {
    const permitidos = new Set([join('lib', 'zod.ts'), join('lib', 'zodJitless.ts')]);
    const diretos = arquivosFonte(SRC)
      .filter((f) => !permitidos.has(relative(SRC, f)))
      .filter((f) => importaValorDoZod(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(diretos).toEqual([]);
  });

  it('o detector do guard pega todas as formas de import/export de valor e ignora só tipo', () => {
    const pega = [
      "import { z } from 'zod';",
      'import { z } from "zod/v4";',
      "import { object, string } from 'zod/mini';",
      "import * as z from 'zod';",
      "import z from 'zod';",
      "import z, { type ZodType } from 'zod';",
      "export { z } from 'zod';",
      "export * from 'zod/v4';",
      "import {\n  z,\n  type ZodError,\n} from 'zod';",
      "import React from 'react';\nimport type { A } from 'zod';\nimport { z } from 'zod/v4';",
    ];
    const ignora = [
      "import type { ZodType } from 'zod';",
      "import { type ZodType, type infer as Infer } from 'zod';",
      "export type { ZodType } from 'zod';",
      "import { z } from '@/lib/zod';",
      "import { z } from 'zod/v3';",
      "import { zodResolver } from '@hookform/resolvers/zod';",
      "import React from 'react';\nimport type { ZodType } from 'zod';",
    ];
    for (const fonte of pega) expect(importaValorDoZod(fonte), fonte).toBe(true);
    for (const fonte of ignora) expect(importaValorDoZod(fonte), fonte).toBe(false);
  });

  it('main.tsx liga o jitless ANTES de qualquer outro import', () => {
    const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');
    const primeiroImport = main.match(/^import\s[^;]+;/m)?.[0];
    expect(primeiroImport).toMatch(/['"]\.\/lib\/zodJitless['"]/);
  });
});
