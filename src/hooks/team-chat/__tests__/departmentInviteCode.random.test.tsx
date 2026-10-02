import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * O codigo do convite de departamento e uma credencial: quem digita o codigo
 * entra no departamento. Sorteado com `Math.random()` (PRNG previsivel) ele e
 * adivinhavel — e o formato NAO pode mudar, porque o banco consome exatamente
 * este formato: `department_invites.code` e `text NOT NULL UNIQUE` (migration
 * 20260927400000) e a RPC `accept_department_invite` procura por
 * `code = upper(trim(p_code))`. Ou seja: 8 caracteres MAIUSCULOS de base36,
 * nem um a mais nem um a menos.
 *
 * `secureRandomChars(8, BASE36_MAIUSCULO)` preserva alfabeto e tamanho byte a
 * byte, entao o formato que o banco le continua identico.
 */
const f = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        f.inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

import { useCreateDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';

const FORMATO_CONVITE = /^[A-Z0-9]{8}$/;
const ALFABETO_CONVITE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

async function criarConvite(departmentId = 'dep-1'): Promise<string> {
  const { result } = renderHook(() => useCreateDepartmentInvite(departmentId), {
    wrapper: TestQueryWrapper,
  });

  await act(async () => {
    await result.current.mutateAsync('Ana');
  });

  const convites = f.inserts.filter((insert) => insert.table === 'department_invites');
  const ultimoConvite = convites[convites.length - 1];
  return String(ultimoConvite?.payload.code ?? '');
}

describe('useCreateDepartmentInvite — codigo do convite', () => {
  beforeEach(() => {
    f.inserts.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sorteia o codigo por crypto.getRandomValues (nao por Math.random)', async () => {
    const espiao = vi.spyOn(globalThis.crypto, 'getRandomValues');

    await criarConvite();

    // 8 caracteres, um sorteio sem vies por caractere.
    expect(espiao.mock.calls.length).toBeGreaterThanOrEqual(8);
  });

  it('mantem o formato que o banco consome: 8 caracteres base36 maiusculo', async () => {
    const codigo = await criarConvite();

    expect(codigo).toMatch(FORMATO_CONVITE);
    for (const caractere of codigo) expect(ALFABETO_CONVITE).toContain(caractere);
    // upper(trim(p_code)) no banco: o codigo gravado ja tem de ser maiusculo.
    expect(codigo).toBe(codigo.toUpperCase());
  });

  it('grava o codigo em department_invites e dois convites nunca saem iguais', async () => {
    const primeiro = await criarConvite();
    const segundo = await criarConvite();

    expect(f.inserts.some((insert) => insert.table === 'department_invites')).toBe(true);
    expect(primeiro).toMatch(FORMATO_CONVITE);
    expect(segundo).toMatch(FORMATO_CONVITE);
    expect(primeiro).not.toBe(segundo);
  });
});
