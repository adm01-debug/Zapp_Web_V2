import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X047b — matriz de estados, linha da tela Supressão.
 *
 * A regra da etapa: consulta que falhou mostra o ERRO, nunca a tela vazia. Antes, a
 * tela decidia à mão (`isLoading ? esqueleto : blacklist.length === 0 ? vazio : …`).
 *
 * Caso que este teste protege: esta tela tem DOIS vazios — o real
 * (`blacklist.length === 0`, estado da consulta, foi para a prop `empty`) e o filtrado
 * (`filtered.length === 0`, consequência do filtro, ficou no conteúdo). Sob erro, nenhum
 * dos dois pode aparecer: a tela não pode dizer "nenhum contato" quando a busca falhou.
 */

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.is = () => chain;
  chain.order = () => Promise.resolve({ data: null, error: new Error('falha exclusiva X047b') });
  chain.limit = () => Promise.resolve({ data: [], error: null });
  return { supabase: { from: () => chain } };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => Promise.resolve({ data: [], error: null });
    chain.limit = () => Promise.resolve({ data: [], error: null });
    return chain;
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

import { TalkXSuppression } from '../TalkXSuppression';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('matriz de estados — TalkXSuppression (X047b)', () => {
  it('consulta com erro: mostra o erro e NÃO o vazio da consulta', async () => {
    const { container } = wrap(<TalkXSuppression />);
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    });
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
  });

  it('consulta com erro: não mostra nenhum dos vazios da tela', async () => {
    wrap(<TalkXSuppression />);
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    });
    expect(screen.queryByText('Nenhum contato na lista de supressão')).toBeNull();
    expect(screen.queryByText('Nenhum resultado')).toBeNull();
  });
});
