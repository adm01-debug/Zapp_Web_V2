import { describe, expect, it } from 'vitest';
import { queryClient } from '../queryClient';
import { shouldRetryQuery } from '../queryRetry';

/**
 * `retry: 2` numerico (queryClient.ts) repetia QUALQUER erro: 401/403
 * (permissao negada), 42P01 (tabela inexistente) e PGRST301 (JWT vencido)
 * demoravam ~6s para aparecer e ainda geravam carga inutil no banco.
 * `shouldRetryQuery` para os permanentes na hora e mantem as 2 tentativas
 * para os transitorios.
 */

function err(partial: Record<string, unknown>): Error {
  return Object.assign(new Error(String(partial['message'] ?? 'erro')), partial);
}

describe('shouldRetryQuery — erro permanente nao repete', () => {
  it('status HTTP 401/403/404: false ja na primeira falha', () => {
    for (const status of [401, 403, 404]) {
      const e = err({ status, message: `HTTP ${status}` });
      expect(shouldRetryQuery(0, e), `status ${status}`).toBe(false);
      expect(shouldRetryQuery(5, e), `status ${status}`).toBe(false);
    }
  });

  it('codigos Postgres 42501/42P01/42703: false', () => {
    for (const code of ['42501', '42P01', '42703']) {
      expect(shouldRetryQuery(0, err({ code, message: 'erro pg' })), code).toBe(false);
    }
  });

  it('PGRST116/PGRST301: false', () => {
    expect(shouldRetryQuery(0, err({ code: 'PGRST116', message: '0 rows' }))).toBe(false);
    expect(shouldRetryQuery(0, err({ code: 'PGRST301', message: 'jwt' }))).toBe(false);
  });

  it('erro de validacao (ZodError): false', () => {
    const zod = new Error('invalid input');
    zod.name = 'ZodError';
    expect(shouldRetryQuery(0, zod)).toBe(false);
  });

  it('mensagem textual "permission denied" / "does not exist": false', () => {
    expect(shouldRetryQuery(0, new Error('permission denied for table contacts'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('relation "x" does not exist'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('JWT expired'))).toBe(false);
  });
});

describe('shouldRetryQuery — erro transitorio repete ate 2 vezes', () => {
  it('falha de rede: repete na 1a e 2a falha, para na 3a', () => {
    const e = new Error('Failed to fetch');
    expect(shouldRetryQuery(0, e)).toBe(true);
    expect(shouldRetryQuery(1, e)).toBe(true);
    expect(shouldRetryQuery(2, e)).toBe(false);
  });

  it('HTTP 5xx: repete', () => {
    const e = err({ status: 503, message: 'Service Unavailable' });
    expect(shouldRetryQuery(0, e)).toBe(true);
    expect(shouldRetryQuery(1, e)).toBe(true);
    expect(shouldRetryQuery(2, e)).toBe(false);
  });

  it('timeout: repete', () => {
    const e = new Error('timeout after 10000ms');
    expect(shouldRetryQuery(0, e)).toBe(true);
    expect(shouldRetryQuery(1, e)).toBe(true);
    expect(shouldRetryQuery(2, e)).toBe(false);
  });

  it('erro nao classificado mantem o comportamento anterior (repete ate 2)', () => {
    const e = new Error('algo inesperado');
    expect(shouldRetryQuery(0, e)).toBe(true);
    expect(shouldRetryQuery(1, e)).toBe(true);
    expect(shouldRetryQuery(2, e)).toBe(false);
  });

  it('erro nao-objeto nao lanca e continua retentavel', () => {
    expect(shouldRetryQuery(0, 'falha')).toBe(true);
    expect(shouldRetryQuery(0, null)).toBe(true);
    expect(shouldRetryQuery(0, undefined)).toBe(true);
  });
});

describe('queryClient — retry aplicado nas queries', () => {
  it('usa shouldRetryQuery e nao repete 401', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry;
    expect(typeof retry).toBe('function');
    const fn = retry as (count: number, error: unknown) => boolean;
    expect(fn(0, err({ status: 401, message: 'unauthorized' }))).toBe(false);
    expect(fn(0, new Error('Failed to fetch'))).toBe(true);
    expect(fn(2, new Error('Failed to fetch'))).toBe(false);
  });

  it('mutations continuam sem retry automatico', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('mantem os defaults de staleTime/gcTime', () => {
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(1000 * 60 * 5);
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(1000 * 60 * 30);
  });
});
