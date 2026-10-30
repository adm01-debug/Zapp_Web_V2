import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * HZ2-003 — quando a RPC `sentiment_trend` falha, o card de tendência tem que
 * AVISAR. Antes o erro morria no hook (o card mostrava "Sem dados de
 * sentimento no período", isto é, fingia período vazio).
 */

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: () => Promise.resolve({ data: null, error: new Error('rpc fora do ar') }) },
}));

vi.mock('@/hooks/analytics/useRecentSentimentAlerts', () => ({
  useRecentSentimentAlerts: () => ({ data: undefined }),
}));

import { SentimentTrendChart } from '../SentimentTrendChart';

const renderComQuery = () =>
  render(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
      React.createElement(SentimentTrendChart, {}),
    ),
  );

describe('SentimentTrendChart — erro da série (HZ2-003)', () => {
  it('mostra o aviso de falha, e não o empty state de período sem dados', async () => {
    renderComQuery();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar a tendência de sentimento')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Sem dados de sentimento no período')).not.toBeInTheDocument();
  });
});
