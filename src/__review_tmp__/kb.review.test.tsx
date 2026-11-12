import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn(async () => ({ data: [{ id: 'a1', title: 'Prazo', content: 'X', category: 'L', tags: [], rank: 1 }], error: null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));
import { KnowledgeBaseSearchPanel } from '@/components/inbox/KnowledgeBaseSearchPanel';

describe('review KB', () => {
  it('flash de "Nenhum artigo" durante o debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><KnowledgeBaseSearchPanel onInsertText={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'prazo' } });
    // antes do debounce de 300ms:
    console.log('ANTES_DEBOUNCE empty=', !!screen.queryByTestId('kb-empty'), 'loading=', !!screen.queryByTestId('kb-loading'));
    await act(async () => { vi.advanceTimersByTime(350); });
    await act(async () => { await Promise.resolve(); });
    await screen.findByText('Prazo');
    // apaga até 1 letra: hint + resultados antigos ao mesmo tempo
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'p' } });
    console.log('UMA_LETRA hint=', !!screen.queryByText(/ao menos 2 letras/), 'resultados=', !!screen.queryByText('Prazo'));
    // espaços: "  a" -> trim 1 mas debounced length 3 dispara RPC
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  a' } });
    await act(async () => { vi.advanceTimersByTime(350); });
    console.log('RPC_CALLS', JSON.stringify(rpc.mock.calls.map((c) => (c as unknown[])[1])));
    vi.useRealTimers();
    expect(true).toBe(true);
  });
});
