import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X047b — matriz de estados, linha da tela Analytics.
 *
 * A regra da etapa: consulta que falhou mostra o ERRO, nunca a tela vazia. Antes, a
 * tela tinha três returns antecipados em sequência (isError / isLoading / vazio).
 *
 * Caso que este teste protege: com `isError` E lista vazia ao mesmo tempo, a tela tem de
 * mostrar o erro — o vazio perde. Se a ordem for invertida (ou se alguém tirar o isError
 * da checagem do boundary), ela volta a dizer "nenhuma campanha para analisar" quando na
 * verdade a consulta falhou.
 *
 * Aqui o estado entra por prop (o pai é quem consulta), então o teste não precisa de
 * provider de query.
 */

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

import { TalkXAnalytics } from '../TalkXAnalytics';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('matriz de estados — TalkXAnalytics (X047b)', () => {
  it('erro com lista vazia: mostra o erro e NÃO o vazio', () => {
    const { container } = wrap(<TalkXAnalytics campaigns={[]} isLoading={false} isError />);
    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    expect(screen.queryByText('Nenhuma campanha para analisar')).toBeNull();
  });

  it('carregando: mostra o esqueleto, não o erro', () => {
    const { container } = wrap(<TalkXAnalytics campaigns={[]} isLoading isError={false} />);
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
  });

  it('vazio sem erro: aí sim mostra o vazio', () => {
    const { container } = wrap(<TalkXAnalytics campaigns={[]} isLoading={false} isError={false} />);
    expect(screen.getByText('Nenhuma campanha para analisar')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeTruthy();
  });
});
