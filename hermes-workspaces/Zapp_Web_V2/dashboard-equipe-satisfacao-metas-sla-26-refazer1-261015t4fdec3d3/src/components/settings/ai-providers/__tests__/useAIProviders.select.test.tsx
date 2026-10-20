import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * N-216 — Provedores de IA: select explícito sem api_key_secret_name.
 *
 * Antes: .select('*') trazia o nome do secret para o navegador.
 * Depois: select explícito lista só as colunas da lista, sem api_key_secret_name.
 */

const selectArg = vi.hoisted(() => ({ value: '' }));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = (cols: string) => {
      selectArg.value = cols;
      return builder;
    };
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: tabela === 'ai_providers' ? [] : [],
        error: null,
      }).then(resolve);
    return builder;
  };
  return { supabase: { from: (tabela: string) => cadeia(tabela) } };
});

import { AIProvidersManager } from '@/components/settings/AIProvidersManager';

describe('N-216 — select não inclui api_key_secret_name', () => {
  it('.select() chama com colunas explícitas e sem api_key_secret_name', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <AIProvidersManager />
      </QueryClientProvider>,
    );

    await screen.findByText('Nenhum provedor configurado.');

    expect(selectArg.value).not.toContain('api_key_secret_name');
    expect(selectArg.value).not.toBe('*');
  });
});