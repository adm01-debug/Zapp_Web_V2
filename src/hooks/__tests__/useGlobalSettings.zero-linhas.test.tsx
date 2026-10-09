/**
 * R2-AUTH-030 (item 255) — a atualização de uma configuração global que não afeta
 * nenhuma linha não é sucesso.
 *
 * O PostgREST devolve `{ error: null }` quando o `update ... eq('key', ...)` casa zero
 * linhas (chave ausente na tabela ou escrita barrada pela policy): sem isto, a tela
 * anunciava "Configuração atualizada" sem nada ter sido gravado. Aqui o teste chama o
 * hook REAL e exige que a promessa rejeite, sem mexer no estado local.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockOrder = vi.hoisted(() => vi.fn());
const mockSelectAposUpdate = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => ({ select: mockSelectAposUpdate })));
const mockUpdate = vi.hoisted(() => vi.fn(() => ({ eq: mockEq })));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: mockOrder })),
      update: mockUpdate,
    })),
  },
}));

vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { useGlobalSettings } from '@/hooks/system/useGlobalSettings';
import { log } from '@/lib/logger';

const linhas = [
  { id: 's1', key: 'user_creation', value: 'enabled', description: null },
];

describe('useGlobalSettings — zero linhas afetadas não é sucesso (R2-AUTH-030)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockReturnValue({ select: mockSelectAposUpdate });
    mockOrder.mockResolvedValue({ data: linhas, error: null });
  });

  it('rejeita a atualização quando nenhuma linha é atualizada e mantém o estado local', async () => {
    mockSelectAposUpdate.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useGlobalSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getSetting('user_creation')).toBe('enabled');

    await expect(
      result.current.updateSetting('user_creation', 'disabled'),
    ).rejects.toThrow(/Nenhum registro de global_settings/);

    expect(log.error).toHaveBeenCalled();
    expect(result.current.getSetting('user_creation')).toBe('enabled');
  });

  it('aceita a atualização e reflete o novo valor quando a linha é devolvida', async () => {
    mockSelectAposUpdate.mockResolvedValue({ data: [{ key: 'user_creation' }], error: null });

    const { result } = renderHook(() => useGlobalSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateSetting('user_creation', 'disabled');
    });

    await waitFor(() => expect(result.current.getSetting('user_creation')).toBe('disabled'));
    expect(log.error).not.toHaveBeenCalled();
  });
});
