/**
 * Testes de `src/components/meta-capi/MetaCAPIView.tsx` — a tela de Meta
 * Conversions API, hoje em modo demonstração (nada é enviado à Meta).
 *
 * A tela REAL é montada com o hook real `useMetaCAPIData` (React Query); a única
 * fronteira dublada é o `supabase.from` das tabelas `meta_capi_events` e
 * `global_settings`. Trava: o aviso de demonstração, o botão "Configurar"
 * desabilitado, os contadores, a lista de eventos, o estado vazio e o de erro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const h = vi.hoisted(() => ({
  eventsResult: { data: [] as unknown[], error: null as unknown },
  settingsResult: { data: [] as unknown[], error: null as unknown },
  tabelas: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      h.tabelas.push(table);
      if (table === 'meta_capi_events') {
        return {
          select: () => ({ order: () => ({ limit: () => Promise.resolve(h.eventsResult) }) }),
        };
      }
      if (table === 'global_settings') {
        return { select: () => ({ in: () => Promise.resolve(h.settingsResult) }) };
      }
      throw new Error(`tabela inesperada na tela: ${table}`);
    },
  },
}));

import { MetaCAPIView } from '../MetaCAPIView';

function evento(over: Record<string, unknown>) {
  return {
    id: 'e1',
    event_name: 'Purchase',
    event_time: '2026-11-10T12:00:00.000Z',
    contact_id: null,
    pixel_id: null,
    action_source: 'website',
    custom_data: {},
    sent_to_meta: false,
    created_at: '2026-11-10T12:00:00.000Z',
    ...over,
  };
}

function cenario() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <MetaCAPIView />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function valorDoCard(rotulo: string) {
  const card = screen.getByText(rotulo).closest('div')!.parentElement!;
  return card.querySelector('p')!.textContent;
}

describe('MetaCAPIView (demonstração)', () => {
  beforeEach(() => {
    h.eventsResult = { data: [], error: null };
    h.settingsResult = { data: [], error: null };
    h.tabelas = [];
  });

  it('anuncia o modo demonstração e mantém "Configurar" desabilitado', async () => {
    cenario();

    expect(screen.getByRole('heading', { name: 'Meta Conversions API' })).toBeInTheDocument();
    expect(screen.getByText('Funcionalidade em demonstração')).toBeInTheDocument();
    expect(screen.getByText(/ainda não foi implementado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Configurar/ })).toBeDisabled();

    expect(await screen.findByText('Nenhum evento registrado')).toBeInTheDocument();
  });

  it('sem eventos nem configuração: contadores zerados, pixel não configurado e estado vazio', async () => {
    cenario();

    expect(await screen.findByText('Nenhum evento registrado')).toBeInTheDocument();
    expect(valorDoCard('Total Eventos')).toBe('0');
    expect(valorDoCard('Marcados como enviados')).toBe('0');
    expect(valorDoCard('Pixel ID')).toBe('Não configurado');
    expect(valorDoCard('Auto-tracking')).toBe('Inativo');
    expect(h.tabelas).toEqual(expect.arrayContaining(['meta_capi_events', 'global_settings']));
  });

  it('com eventos e configuração: conta enviados, mostra pixel, auto-tracking e a lista', async () => {
    h.eventsResult = {
      data: [
        evento({ id: 'e1', event_name: 'Purchase', sent_to_meta: true }),
        evento({ id: 'e2', event_name: 'Lead', sent_to_meta: false, action_source: 'chat' }),
        evento({ id: 'e3', event_name: 'Purchase', sent_to_meta: false }),
      ],
      error: null,
    };
    h.settingsResult = {
      data: [
        { key: 'meta_pixel_id', value: '123456789' },
        { key: 'meta_capi_auto_track', value: 'true' },
      ],
      error: null,
    };
    cenario();

    expect(await screen.findByText('123456789')).toBeInTheDocument();
    expect(valorDoCard('Total Eventos')).toBe('3');
    expect(valorDoCard('Marcados como enviados')).toBe('1');
    expect(valorDoCard('Auto-tracking')).toBe('Ativo');

    expect(screen.getAllByText('Enviado')).toHaveLength(1);
    expect(screen.getAllByText('Pendente')).toHaveLength(2);
    expect(screen.getByText(/^chat •/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum evento registrado')).not.toBeInTheDocument();

    const compra = screen.getByText('Compra').closest('div')!;
    expect(within(compra).getByText('2')).toBeInTheDocument();
    const lead = screen.getAllByText('Lead').find((el) => el.tagName === 'P')!.closest('div')!;
    expect(within(lead).getByText('1')).toBeInTheDocument();
  });

  it('erro ao carregar eventos aparece como alerta de erro', async () => {
    h.eventsResult = { data: [], error: new Error('permission denied') };
    cenario();

    expect(await screen.findByText('Não foi possível carregar os eventos')).toBeInTheDocument();
    expect(screen.getByText('Funcionalidade em demonstração')).toBeInTheDocument();
  });
});
