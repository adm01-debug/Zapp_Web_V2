/**
 * t_57b49f87: `removeField` não conferia linhas afetadas — com a RLS bloqueando o delete, o
 * PostgREST responde `{ data: [], error: null }` e a tela dizia "removido" sem nada ter saído.
 * Remover sem efeito precisa virar erro explícito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { deleteCustomField, fetchCustomFields, upsertCustomField } = vi.hoisted(() => ({
  deleteCustomField: vi.fn(),
  fetchCustomFields: vi.fn(),
  upsertCustomField: vi.fn(),
}));

vi.mock('@/services/contact.service', () => ({
  ContactService: { deleteCustomField, fetchCustomFields, upsertCustomField },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) }));

import { useContactCustomFields } from '@/hooks/crm/useContactCustomFields';

const campo = {
  id: 'cf1',
  contact_id: 'c1',
  field_name: 'CPF',
  field_value: '123',
  field_type: 'text',
  created_at: '',
  updated_at: '',
};

describe('useContactCustomFields.removeField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCustomFields.mockResolvedValue({ data: [campo], error: null });
    deleteCustomField.mockResolvedValue({ data: [{ id: 'cf1' }], error: null });
    upsertCustomField.mockResolvedValue({ error: null });
  });

  it('tira o campo da lista quando o servidor confirma a remoção', async () => {
    const { result } = renderHook(() => useContactCustomFields('c1'));
    await waitFor(() => expect(result.current.fields).toHaveLength(1));

    await act(async () => {
      await result.current.removeField('cf1');
    });

    expect(result.current.fields).toHaveLength(0);
  });

  it('lança erro quando NENHUMA linha foi removida (RLS)', async () => {
    deleteCustomField.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useContactCustomFields('c1'));
    await waitFor(() => expect(result.current.fields).toHaveLength(1));

    await expect(
      act(async () => {
        await result.current.removeField('cf1');
      }),
    ).rejects.toThrow(/nada foi removido/i);

    // O campo continua na tela: nada saiu do banco.
    expect(result.current.fields).toHaveLength(1);
  });

  it('lança erro quando o servidor responde com erro', async () => {
    deleteCustomField.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useContactCustomFields('c1'));
    await waitFor(() => expect(result.current.fields).toHaveLength(1));

    await expect(
      act(async () => {
        await result.current.removeField('cf1');
      }),
    ).rejects.toEqual({ message: 'permission denied' });

    expect(result.current.fields).toHaveLength(1);
  });
});
