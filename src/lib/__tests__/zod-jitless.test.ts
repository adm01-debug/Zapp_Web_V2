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

describe('@/lib/zod — Zod sem eval (CSP sem unsafe-eval)', () => {
  it('liga jitless na configuração global e continua validando', () => {
    expect(z.config().jitless).toBe(true);
    const schema = z.object({ email: z.string().email(), idade: z.number().int() });
    expect(schema.safeParse({ email: 'a@b.co', idade: 3 }).success).toBe(true);
    expect(schema.safeParse({ email: 'x', idade: 1.5 }).success).toBe(false);
  });

  it('nenhum módulo do app importa o valor `z` direto de "zod" (só via @/lib/zod)', () => {
    const diretos = arquivosFonte(SRC)
      .filter((f) => relative(SRC, f) !== join('lib', 'zod.ts'))
      .filter((f) => /^import\s+\{[^}]*\bz\b[^}]*\}\s+from\s+['"]zod['"]/m.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(diretos).toEqual([]);
  });
});
