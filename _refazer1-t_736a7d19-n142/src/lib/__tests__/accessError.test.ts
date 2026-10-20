import { describe, it, expect } from 'vitest';
import {
  ACCESS_DENIED_MESSAGE,
  describeAccessError,
  isAccessDeniedError,
} from '@/lib/rlsError';

// ── isAccessDeniedError — entradas que não são objeto ────────────────────────

describe('isAccessDeniedError — entradas inválidas', () => {
  it('false para null', () => expect(isAccessDeniedError(null)).toBe(false));
  it('false para undefined', () => expect(isAccessDeniedError(undefined)).toBe(false));
  it('false para string', () => expect(isAccessDeniedError('42501')).toBe(false));
  it('false para número', () => expect(isAccessDeniedError(42501)).toBe(false));
  it('false para Error sem código de acesso', () =>
    expect(isAccessDeniedError(new Error('NetworkError'))).toBe(false));
});

// ── isAccessDeniedError — códigos ────────────────────────────────────────────

describe('isAccessDeniedError — código', () => {
  it('true para 42501 (RLS)', () => expect(isAccessDeniedError({ code: '42501' })).toBe(true));
  it('true para PGRST301', () => expect(isAccessDeniedError({ code: 'PGRST301' })).toBe(true));
  it('false para outro código', () => expect(isAccessDeniedError({ code: '23503' })).toBe(false));
});

// ── isAccessDeniedError — status HTTP ────────────────────────────────────────

describe('isAccessDeniedError — status HTTP', () => {
  it('true para 403', () => expect(isAccessDeniedError({ status: 403 })).toBe(true));
  it('true para statusCode 403', () => expect(isAccessDeniedError({ statusCode: 403 })).toBe(true));
  it('false para 401', () => expect(isAccessDeniedError({ status: 401 })).toBe(false));
  it('false para 500', () => expect(isAccessDeniedError({ status: 500 })).toBe(false));
});

// ── isAccessDeniedError — mensagem do RLS ────────────────────────────────────

describe('isAccessDeniedError — mensagem', () => {
  it('true para "row-level security"', () =>
    expect(isAccessDeniedError({ message: 'new row violates row-level security policy for table "x"' })).toBe(true));
  it('true para "permission denied"', () =>
    expect(isAccessDeniedError({ message: 'permission denied for table contacts' })).toBe(true));
  it('true para "insufficient privilege"', () =>
    expect(isAccessDeniedError({ message: 'ERROR: insufficient privilege' })).toBe(true));
  it('false para mensagem genérica', () =>
    expect(isAccessDeniedError({ message: 'timeout' })).toBe(false));
  it('false para objeto sem campos conhecidos', () =>
    expect(isAccessDeniedError({ foo: 'bar' })).toBe(false));
});

// ── describeAccessError — caminho NEGADO ─────────────────────────────────────

describe('describeAccessError — acesso negado', () => {
  it('devolve a mensagem fixa para código 42501', () =>
    expect(describeAccessError({ code: '42501' })).toBe(ACCESS_DENIED_MESSAGE));
  it('devolve a mensagem fixa para status 403', () =>
    expect(describeAccessError({ status: 403 })).toBe(ACCESS_DENIED_MESSAGE));
  it('devolve a mensagem fixa para PGRST301', () =>
    expect(describeAccessError({ code: 'PGRST301' })).toBe(ACCESS_DENIED_MESSAGE));

  it('NÃO vaza o nome da tabela nem da policy da mensagem crua', () => {
    const cru = {
      code: '42501',
      message: 'new row violates row-level security policy for table "contatos_secretos"',
    };
    const saida = describeAccessError(cru);
    expect(saida).toBe(ACCESS_DENIED_MESSAGE);
    expect(saida).not.toContain('contatos_secretos');
    expect(saida).not.toContain('policy');
    expect(saida).not.toContain('table');
    expect(saida).not.toContain('row-level security');
    expect(saida).not.toContain('42501');
  });

  it('a mensagem negada é sempre a MESMA, sem o texto original', () => {
    const a = describeAccessError({ code: '42501', message: 'permission denied for table a' });
    const b = describeAccessError({ code: '42501', message: 'permission denied for table b' });
    expect(a).toBe(b);
  });
});

// ── describeAccessError — caminho permitido/outro erro ───────────────────────

describe('describeAccessError — outros erros', () => {
  it('erro não-RLS NÃO vira "acesso negado"', () =>
    expect(describeAccessError({ code: '23503', message: 'foreign key violation' })).not.toBe(ACCESS_DENIED_MESSAGE));

  it('devolve texto genérico (não vazio) para erro desconhecido', () => {
    const saida = describeAccessError(new Error('NetworkError'));
    expect(typeof saida).toBe('string');
    expect(saida.length).toBeGreaterThan(0);
    expect(saida).not.toBe(ACCESS_DENIED_MESSAGE);
  });

  it('devolve texto genérico para null/undefined', () => {
    expect(describeAccessError(null).length).toBeGreaterThan(0);
    expect(describeAccessError(undefined).length).toBeGreaterThan(0);
    expect(describeAccessError(null)).not.toBe(ACCESS_DENIED_MESSAGE);
  });

  it('não ecoa a mensagem original de um erro que não é de acesso', () => {
    const saida = describeAccessError({ message: 'duplicate key value violates unique constraint "users_email_key"' });
    expect(saida).not.toContain('users_email_key');
  });
});
