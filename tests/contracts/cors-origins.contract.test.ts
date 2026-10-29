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
 * (supabase/functions/_shared/cors-origins.ts, fonte única da política) e espelhados em
 * scripts/edge-deploy/allowed-origins.json.
 */
const CANONICO_VERCEL = 'https://zapp-web-v2.vercel.app';
const CANONICO_DOMINIO = 'https://zappweb.app.br';

import { allowedOriginFor } from '../../supabase/functions/_shared/cors-origins.ts';

const allowedOriginsJson = require(
  nodePath.resolve(__dirname, '../../scripts/edge-deploy/allowed-origins.json'),
);

describe('CORS das edge functions — endereços canônicos de produção', () => {
  const source = read('supabase/functions/_shared/cors-origins.ts');
  const allowListBlock = source.slice(
    source.indexOf('export const EXACT_ALLOWED_ORIGINS'),
    source.indexOf('/** Origem devolvida'),
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
    expect(source).toContain(`export const FALLBACK_ORIGIN = '${CANONICO_VERCEL}'`);
    const allowedOriginFor = source.slice(source.indexOf('export function allowedOriginFor'));
    expect(allowedOriginFor).toContain('FALLBACK_ORIGIN');
  });

  it('os padrões de origem seguem restritos a este projeto e ao local', () => {
    const bloco = source.slice(
      source.indexOf('export const ORIGIN_PATTERNS'),
      source.indexOf('export function isAllowedOrigin'),
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

  it('as duas superfícies de CORS (validation.ts e schemas.ts) usam a mesma política', () => {
    const validation = read('supabase/functions/_shared/validation.ts');
    const schemas = read('supabase/functions/_shared/schemas.ts');
    // Nenhuma das duas guarda uma lista própria nem um Allow-Origin fixo.
    for (const fonte of [validation, schemas]) {
      expect(fonte).toContain("from './cors-origins.ts'".replace(/'/g, fonte === schemas ? '"' : "'"));
      expect(/lovable/i.test(fonte)).toBe(false);
      expect(fonte).not.toContain('EXACT_ALLOWED_ORIGINS = new Set');
    }
    const linhas = schemas.split('\n').filter((linha) => /Access-Control-Allow-Origin/i.test(linha));
    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) expect(linha).toContain('allowedOriginFor(req)');
  });

  it('allowedOriginFor reflete as origens oficiais e recusa parecidas', () => {
    const req = (origin?: string) =>
      new Request('https://edge.invalid/x', origin ? { headers: { origin } } : undefined);
    expect(allowedOriginFor(req(CANONICO_DOMINIO))).toBe(CANONICO_DOMINIO);
    expect(allowedOriginFor(req(CANONICO_VERCEL))).toBe(CANONICO_VERCEL);
    expect(allowedOriginFor(undefined)).toBe(CANONICO_VERCEL);
    expect(allowedOriginFor(req())).toBe(CANONICO_VERCEL);
    for (const o of [
      'https://zappweb.app.br.evil.example',
      'https://evilzappweb.app.br',
      'https://www.zappweb.app.br',
      'http://zappweb.app.br',
      'https://zappweb.app.br:8443',
    ]) {
      expect(allowedOriginFor(req(o))).toBe(CANONICO_VERCEL);
    }
  });
});
