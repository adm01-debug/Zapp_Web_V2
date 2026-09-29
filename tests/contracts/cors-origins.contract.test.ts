import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Contrato do endereço canônico no CORS das edge functions.
 *
 * O projeto tem UM endereço de produção: `https://zapp-web-v2.vercel.app`
 * (ver `docs/runbooks/deploy.md`). Os demais endereços que já serviram o app
 * ficaram fora: eram publicados por fora do fluxo GitHub → Vercel e por isso
 * entregavam build velho (sem as correções mergeadas).
 *
 * Antes da correção estes testes falham: a allow-list aceitava os hosts antigos.
 */
const CANONICO = 'https://zapp-web-v2.vercel.app';

describe('CORS das edge functions — um único endereço canônico', () => {
  const source = read('supabase/functions/_shared/validation.ts');
  const allowList = source.slice(
    source.indexOf('const EXACT_ALLOWED_ORIGINS'),
    source.indexOf('const ORIGIN_PATTERNS'),
  );

  it('mantém o endereço canônico de produção na allow-list', () => {
    expect(allowList).toContain(`'${CANONICO}'`);
  });

  it('tem exatamente um endereço exato na allow-list', () => {
    const exatos = allowList.match(/'https?:\/\/[^']+'/g) ?? [];
    expect(exatos).toEqual([`'${CANONICO}'`]);
  });

  it('não aceita nenhum host do Lovable na allow-list', () => {
    expect(allowList).not.toMatch(/lovable/i);
  });

  it('não aceita o endereço antigo servido por nginx na allow-list', () => {
    expect(allowList).not.toContain('zappweb.app.br');
  });

  it('usa o canônico como fallback quando a origem não é permitida', () => {
    const getCors = source.slice(source.indexOf('export function getCorsHeaders'));
    expect(getCors).toContain(`'${CANONICO}'`);
  });
});
