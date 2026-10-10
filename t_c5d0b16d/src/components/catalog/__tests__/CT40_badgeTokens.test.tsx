/**
 * CT-40 — aceite de fonte: o módulo do catálogo não usa cor literal.
 *
 * Contrato do plano: "zerar `text-white`/`violet-500` restantes por tokens
 * (`text-primary-foreground`, `--badge-new`)" e "grep de cores literais no
 * módulo = 0".
 *
 * Este teste varre os componentes de produção do módulo
 * (`src/components/catalog/*.tsx`, sem `__tests__/`) e falha se algum repetir
 * `text-white`, `bg-violet-500` ou um hexadecimal literal. Também confere que
 * o token `--badge-new` existe em `tokens.css` — sem ele o Aceite seria só
 * cosmético. Os arquivos de teste ficam de fora (as fixtures de cor usam hex
 * de mock de propósito, como o `color_hex` dos produtos/variantes).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const catalogDir = path.resolve(__dirname, '..');

const arquivosDeProducao = readdirSync(catalogDir)
  .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  .filter((f) => !f.includes('.test.'));

const fonte = (f: string) => readFileSync(path.join(catalogDir, f), 'utf8');

describe('CT-40 — o módulo não usa cor literal', () => {
  it('nenhum arquivo de produção usa `text-white`', () => {
    const comBranco = arquivosDeProducao.filter((f) => /\btext-white\b/.test(fonte(f)));
    expect(comBranco).toEqual([]);
  });

  it('nenhum arquivo de produção usa `bg-violet-500`', () => {
    const comVioleta = arquivosDeProducao.filter((f) => /\bbg-violet-500\b/.test(fonte(f)));
    expect(comVioleta).toEqual([]);
  });

  it('nenhum arquivo de produção usa hexadecimal literal', () => {
    const comHex = arquivosDeProducao.filter((f) => /#[0-9a-fA-F]{6}\b/.test(fonte(f)));
    expect(comHex).toEqual([]);
  });
});

describe('CT-40 — o token `--badge-new` existe em tokens.css', () => {
  const tokens = readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');

  it('define `--badge-new` com um valor hsl', () => {
    expect(tokens).toMatch(/--badge-new:\s*\d/);
  });

  it('as badges do Kit consomem o token via `hsl(var(--badge-new))`', () => {
    const consumidores = arquivosDeProducao.filter((f) => /hsl\(var\(--badge-new\)\)/.test(fonte(f)));
    expect(consumidores.length).toBeGreaterThan(0);
  });
});
