/**
 * CT-40 — aceite de fonte: o módulo do catálogo não usa cor literal.
 *
 * Contrato do plano: "zerar `text-white`/`violet-500` restantes por tokens
 * (`text-primary-foreground`, `--violeta`)" e "grep de cores literais no
 * módulo = 0".
 *
 * Este teste varre os componentes de produção do módulo
 * (`src/components/catalog/*.tsx`, sem `__tests__/`) e falha se algum repetir
 * `text-white`, `bg-violet-500` ou um hexadecimal literal. Também confere que
 * o token `--violeta` existe em `tokens.css` — sem ele o Aceite seria só
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

describe('CT-40 — o violeta consolidado é o token das badges', () => {
  const tokens = readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');

  it('o tokens.css publica `--violeta` (consolidação t_290f3cdc)', () => {
    expect(tokens).toMatch(/--violeta:\s*\d/);
  });

  it('as badges do Kit consomem o par `bg-violeta`/`text-violeta-foreground`', () => {
    const consumidores = arquivosDeProducao.filter((f) => /bg-violeta\b/.test(fonte(f)));
    expect(consumidores.length).toBeGreaterThan(0);
  });
});
