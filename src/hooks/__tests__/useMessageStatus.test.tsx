import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
});
const mockRemoveChannel = vi.fn();
const mockLogError = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError, debug: vi.fn(), info: vi.fn() },
}));

import { useMessageStatus } from '@/hooks/chat/useMessageStatus';

// A cadeia e' montada com espioes nomeados porque o mock anterior ignorava os
// ARGUMENTOS de `eq`: trocar `sender = 'agent'` por outro valor mantinha os
// resultados simulados e o teste passava (apontado por Devin na #3238).
let cadeia: {
  select: ReturnType<typeof vi.fn>;
  eqContato: ReturnType<typeof vi.fn>;
  eqRemetente: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
};

function montarCadeia(resposta: { data: unknown; error: unknown }) {
  const not = vi.fn().mockResolvedValue(resposta);
  const eqRemetente = vi.fn().mockReturnValue({ not });
  const eqContato = vi.fn().mockReturnValue({ eq: eqRemetente });
  const select = vi.fn().mockReturnValue({ eq: eqContato });
  cadeia = { select, eqContato, eqRemetente, not };
  return { select };
}

const mockStatuses = [
  { id: 'm1', status: 'sent', status_updated_at: '2024-01-01T10:00:00Z' },
  { id: 'm2', status: 'delivered', status_updated_at: '2024-01-01T10:01:00Z' },
  { id: 'm3', status: 'read', status_updated_at: '2024-01-01T10:02:00Z' },
  { id: 'm4', status: 'failed', status_updated_at: '2024-01-01T10:03:00Z' },
];

describe('useMessageStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(montarCadeia({ data: mockStatuses, error: null }));
  });

  it('initializes with empty status map when no contactId', () => {
    const { result } = renderHook(() => useMessageStatus());
    expect(result.current.statusUpdates.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches statuses when contactId provided', async () => {
    const { result } = renderHook(() => useMessageStatus('c1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // A assercao original era `size >= 0`, que nenhuma quebra do hook reprova.
    // O mapa tem de conter as 4 mensagens dobradas, indexadas por id, e
    // getMessageStatus tem de ler desse mapa (useMessageStatus.ts:39-49,104-109).
    expect(mockFrom).toHaveBeenCalledWith('messages');
    // Os argumentos da consulta tambem sao contrato: so' mensagens DO AGENTE,
    // daquele contato, com status preenchido (useMessageStatus.ts:28-31).
    expect(cadeia.select).toHaveBeenCalledWith('id, status, status_updated_at');
    expect(cadeia.eqContato).toHaveBeenCalledWith('contact_id', 'c1');
    expect(cadeia.eqRemetente).toHaveBeenCalledWith('sender', 'agent');
    expect(cadeia.not).toHaveBeenCalledWith('status', 'is', null);
    expect([...result.current.statusUpdates.keys()]).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(result.current.getMessageStatus('m2')).toBe('delivered');
    expect(result.current.getMessageStatus('m4')).toBe('failed');
    expect(result.current.getMessageStatus('inexistente')).toBeUndefined();
  });

  it('exposes getMessageStatus function', async () => {
    const { result } = renderHook(() => useMessageStatus('c1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.getMessageStatus).toBe('function');
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue(montarCadeia({ data: null, error: new Error('DB error') }));

    const { result } = renderHook(() => useMessageStatus('c1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Erro de consulta nao pode virar estado: o mapa fica vazio em vez de
    // receber status inventado, e a falha e registrada em vez de engolida
    // (useMessageStatus.ts:33-36).
    expect(result.current.statusUpdates.size).toBe(0);
    expect(mockLogError).toHaveBeenCalled();
  });

  it('clears status when contactId changes to undefined', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id?: string }) => useMessageStatus(id),
      { initialProps: { id: 'c1' } as { id?: string } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    
    rerender({ id: undefined });
    expect(result.current.statusUpdates.size).toBe(0);
  });
});
