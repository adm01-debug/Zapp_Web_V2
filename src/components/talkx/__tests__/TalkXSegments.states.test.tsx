import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * X047b — matriz de estados, linha da tela Segmentos.
 *
 * A regra da etapa: consulta que falhou mostra o ERRO, nunca a tela vazia. Antes, a
 * tela decidia à mão (`isLoading ? esqueleto : segments.length === 0 ? vazio : …`).
 *
 * Caso que este teste protege: esta tela tem DOIS vazios — o real
 * (`segments.length === 0`, estado da consulta, foi para a prop `empty`) e o filtrado
 * (`filtered.length === 0`, consequência do filtro, ficou no conteúdo). Sob erro, nenhum
 * dos dois pode aparecer.
 */

const refetch = vi.fn();

vi.mock('@/hooks/integrations/useTalkXSegments', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: [],
      isLoading: false,
      isError: true,
      error: new Error('falha exclusiva X047b'),
      refetch,
      createSegment: { mutate: vi.fn() },
      updateSegment: { mutate: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

import { TalkXSegments } from '../TalkXSegments';

describe('matriz de estados — TalkXSegments (X047b)', () => {
  it('consulta com erro: mostra o erro e NÃO o vazio da consulta', () => {
    const { container } = render(<TalkXSegments onUseCampaign={vi.fn()} />);
    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
  });

  it('consulta com erro: não mostra nenhum dos vazios da tela', () => {
    render(<TalkXSegments onUseCampaign={vi.fn()} />);
    expect(screen.queryByText('Nenhum segmento salvo')).toBeNull();
    expect(screen.queryByText('Nenhum segmento encontrado')).toBeNull();
  });
});
