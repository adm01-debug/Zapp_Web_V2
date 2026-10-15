import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import React from 'react';

/**
 * F59 · dead letter do Multiplix visível no cartão "Saúde da integração".
 *
 * A migration 20261002651230 criou `count_multiplix_dead_letters` e
 * `list_multiplix_dead_letters` "sem tela nova": só quem rodava SQL enxergava a
 * fila morta. O cartão existente agora mostra o contador e uma lista somente
 * leitura dos últimos itens.
 *
 * A prova renderiza o componente REAL — e, com ele, o hook REAL — com o cliente
 * Supabase mockado (a guarda de rede em src/test/setup.ts barra o destino real).
 * Os dois caminhos que importam aqui: contador com valor, e leitura NEGADA pelo
 * gate admin/supervisor dentro da RPC, que precisa virar "—", nunca 0.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    erroContagem: null as unknown,
    contagem: 3,
    itens: [] as Record<string, unknown>[],
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string) => {
      if (fn === 'count_multiplix_dead_letters') {
        return Promise.resolve(
          estado.erroContagem ? { data: null, error: estado.erroContagem } : { data: estado.contagem, error: null },
        );
      }
      if (fn === 'list_multiplix_dead_letters') {
        return Promise.resolve({ data: estado.itens, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  },
}));

// A saúde do CRM/TalkX segue respondendo: ela não é o que está em prova aqui.
vi.mock('@/lib/crmIntegration', () => ({
  callCRMIntegration: () => Promise.resolve({
    data: {
      external_reachable: true,
      queue: {
        pending: 2, processing: 0, failed: 0, dead_letter: 0,
        succeeded_24h: 9, succeeded_without_link: 0,
        oldest_ready_age_seconds: 5, generated_at: '2026-10-15T12:00:00Z',
      },
    },
  }),
}));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => true }));
vi.mock('@/hooks/integrations/useExternalDB', () => ({
  useExternalSelect: () => ({ data: { data: [], meta: { record_count: 0 } }, isLoading: false }),
}));

import { AdminCRMDashboard } from '@/components/admin/AdminCRMDashboard';

const ITEM = {
  item_id: '11111111-2222-3333-4444-555555555555',
  dispatch_id: 'dddddddd-2222-3333-4444-555555555555',
  dispatch_name: 'Campanha Outubro',
  attempt_count: 3,
  error_class: 'whatsapp_400_invalid_payload',
  error_message: 'payload recusado pelo provedor',
  failed_at: '2026-10-15T10:30:00Z',
  next_attempt_at: null,
  destino_mascarado: '*********4321',
};

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    React.createElement(MemoryRouter, null,
      React.createElement(QueryClientProvider, { client },
        React.createElement(AdminCRMDashboard))),
  );
}

const contador = () => screen.findByLabelText('Dead letters do Multiplix');

describe('AdminCRMDashboard — dead letter do Multiplix', () => {
  beforeEach(() => {
    estado.erroContagem = null;
    estado.contagem = 3;
    estado.itens = [];
  });

  it('mostra o contador real devolvido pela RPC', async () => {
    estado.contagem = 4;
    renderizar();

    const valor = await contador();
    expect(valor).toHaveTextContent('4');
    expect(screen.queryByText('Dados não disponíveis')).toBeNull();
  });

  it('leitura negada mostra "—" e "Dados não disponíveis", nunca 0', async () => {
    estado.erroContagem = new Error('multiplix_dead_letters_forbidden');
    renderizar();

    const valor = await contador();
    await waitFor(() => expect(valor).toHaveTextContent('—'));
    expect(valor).not.toHaveTextContent('0');
    expect(screen.getByText('Dados não disponíveis')).toBeInTheDocument();
  });

  it('a lista somente leitura traz id, horário e motivo — e nada de destino/payload', async () => {
    estado.contagem = 1;
    estado.itens = [ITEM];
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: /Ver últimos itens/ }));

    const lista = await screen.findByRole('list');
    expect(within(lista).getByText('#11111111')).toBeInTheDocument();
    expect(within(lista).getByText('whatsapp_400_invalid_payload')).toBeInTheDocument();
    expect(within(lista).getByText(/15\/10\/2026/)).toBeInTheDocument();
    // Sem payload e sem destino, mesmo mascarado.
    expect(within(lista).queryByText(/4321/)).toBeNull();
    expect(within(lista).queryByText(/payload recusado pelo provedor/)).toBeNull();
  });

  it('sem violações de acessibilidade (contador + lista abertos)', async () => {
    estado.contagem = 1;
    estado.itens = [ITEM];
    const { container } = renderizar();

    await contador();
    fireEvent.click(screen.getByRole('button', { name: /Ver últimos itens/ }));
    await screen.findByText('whatsapp_400_invalid_payload');

    expect(await axe(container)).toHaveNoViolations();
  });
});
