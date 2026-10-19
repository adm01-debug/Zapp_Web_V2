/**
 * Acessibilidade: botão "Limpar busca" (X) e filtro de período têm nome acessível.
 *
 * Regressão: o X do campo de busca e o SelectTrigger do filtro de data não
 * tinham `aria-label`, ficando invisíveis para leitores de tela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

const h = vi.hoisted(() => {
  const rows = [
    {
      id: 'm00001', content: '', transcription: 'mensagem de teste', media_url: null,
      created_at: new Date(Date.UTC(2026, 9, 6, 12, 0, 0)).toISOString(),
      contact_id: 'c1',
      contacts: { id: 'c1', name: 'Contato Teste', phone: '5511900000000', avatar_url: null },
    },
  ];
  const state = { fail: false };

  function makeQuery() {
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      not: () => q,
      order: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        if (state.fail) return Promise.resolve(resolve({ data: null, error: { message: 'timeout' } }));
        const data = from === null ? rows : rows.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { makeQuery, state };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));

import { TranscriptionsHistoryView } from '../TranscriptionsHistoryView';

describe('TranscriptionsHistoryView — acessibilidade (N-202)', () => {
  beforeEach(() => { h.state.fail = false; });

  it('o botão X de limpar busca tem aria-label', async () => {
    render(<TranscriptionsHistoryView />);

    // O input de busca aparece após o carregamento dos dados.
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Buscar em transcrições...')).toBeInTheDocument(),
    );

    const input = screen.getByPlaceholderText('Buscar em transcrições...');
    fireEvent.change(input, { target: { value: 'teste' } });

    expect(screen.getByRole('button', { name: /limpar busca/i })).toBeInTheDocument();

    // Com o X renderizado, a barra de filtros não tem violação de
    // acessibilidade (o helper `axe` e o matcher `toHaveNoViolations` são os
    // mesmos dos outros testes de a11y; `color-contrast` fica fora porque o
    // jsdom não tem layout — mesmo padrão do WelcomeModal/TourOverlay).
    // O escopo é a barra que contém o X e o combobox: o `h3` do grupo de
    // contato (heading-order, fora do escopo deste cartão) fica de fora da
    // varredura — ele continua visível no `document.body` para outro cartão.
    const barra = input.closest('div.flex-wrap');
    expect(barra).not.toBeNull();
    expect(await axe(barra as HTMLElement, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations();
  });

  it('o SelectTrigger do filtro de período tem aria-label', async () => {
    render(<TranscriptionsHistoryView />);

    // O SelectTrigger aparece após o carregamento dos dados.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /filtrar período/i })).toBeInTheDocument(),
    );
  });
});
