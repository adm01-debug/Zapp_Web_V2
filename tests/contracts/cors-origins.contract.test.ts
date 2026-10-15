import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as nodePath from 'node:path';

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * W61: Contrato dos endereços canônicos no CORS das edge functions.
 *
 * Os endereços de produção são definidos em EXACT_ALLOWED_ORIGINS
 * (supabase/functions/_shared/validation.ts) e espelhados em
 * scripts/edge-deploy/allowed-origins.json.
 */
const CANONICO_VERCEL = 'https://zapp-web-v2.vercel.app';
const CANONICO_DOMINIO = 'https://zappweb.app.br';

const allowedOriginsJson = require(
  nodePath.resolve(__dirname, '../../scripts/edge-deploy/allowed-origins.json'),
);

describe('CORS das edge functions — endereços canônicos de produção', () => {
  const source = read('supabase/functions/_shared/validation.ts');
  const allowListBlock = source.slice(
    source.indexOf('export const EXACT_ALLOWED_ORIGINS'),
    source.indexOf('const ORIGIN_PATTERNS'),
  );

  it('mantém o endereço canônico Vercel na allow-list', () => {
    expect(allowListBlock).toContain(`'${CANONICO_VERCEL}'`);
  });

  it('mantém o domínio oficial de produção na allow-list (W61)', () => {
    expect(allowListBlock).toContain(`'${CANONICO_DOMINIO}'`);
  });

  it('allowed-origins.json contém todos os canônicos (W61)', () => {
    expect(allowedOriginsJson.exact).toContain(CANONICO_VERCEL);
    expect(allowedOriginsJson.exact).toContain(CANONICO_DOMINIO);
  });

  it('não aceita nenhum host do Lovable na allow-list', () => {
    expect(allowListBlock).not.toMatch(/lovable/i);
  });

  it('usa o Vercel canônico como fallback quando a origem não é permitida', () => {
    const getCors = source.slice(source.indexOf('export function getCorsHeaders'));
    expect(getCors).toContain(`'${CANONICO_VERCEL}'`);
  });

  it('os padrões de origem seguem restritos a este projeto e ao local', () => {
    const bloco = source.slice(
      source.indexOf('const ORIGIN_PATTERNS'),
      source.indexOf('function isAllowedOrigin'),
    );
    const padroes = bloco
      .split('\n')
      .map((linha) => linha.trim().replace(/,$/, ''))
      .filter((linha) => linha.startsWith('/^'));
    expect(padroes).toEqual([
      '/^https:\\/\\/zappwebv2-[a-z0-9-]+-juca1\\.vercel\\.app$/',
      '/^http:\\/\\/localhost(?::\\d{1,5})?$/',
      '/^http:\\/\\/127\\.0\\.0\\.1(?::\\d{1,5})?$/',
    ]);
  });

  it('a segunda superfície de CORS (schemas.ts) aponta só para o canônico Vercel', () => {
    const linhas = read('supabase/functions/_shared/schemas.ts')
      .split('\n')
      .filter((linha) => /Access-Control-Allow-Origin/i.test(linha));
    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) {
      expect(linha).not.toMatch(/lovable/i);
      expect(linha).toContain(CANONICO_VERCEL);
    }
  });
});
