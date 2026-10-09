import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Prova de que a lacuna fechou: `useInboxFilterTags` não fala mais com o Supabase
 * direto — quem lê `contacts` é `src/services/inbox.service.ts`.
 *
 * O cliente Supabase está ENVENENADO neste teste: qualquer uso dele falha de
 * propósito. Como o hook só passa se a fonte de dados for a camada de serviços, um
 * `supabase.from(...)` reintroduzido no hook deixa este teste vermelho.
 */
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      throw new Error('o hook não pode chamar o Supabase direto: use a camada de serviços');
    },
  },
}));

vi.mock('@/services/inbox.service', () => ({
  fetchInboxFilterTags: vi.fn(async () => [
    { id: 'Comum', name: 'Comum', color: '#6366f1' },
    { id: 'Raro', name: 'Raro', color: '#6366f1' },
  ]),
}));

import { useInboxFilterTags } from '../useInboxFilterTags';
import { fetchInboxFilterTags } from '@/services/inbox.service';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useInboxFilterTags — fala com a camada de serviços, não com o Supabase', () => {
  it('delega a leitura ao serviço e devolve as etiquetas dele', async () => {
    const { result } = renderHook(() => useInboxFilterTags(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(fetchInboxFilterTags).toHaveBeenCalledTimes(1);
    expect((result.current.data ?? []).map((t) => t.name)).toEqual(['Comum', 'Raro']);
  });
});
