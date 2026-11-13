import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactFirstResponseSLA } from '../ContactFirstResponseSLA';

const h = vi.hoisted(() => ({
  result: { data: null, error: null } as { data: unknown; error: unknown },
  pending: false,
}));

vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchSLA: vi.fn(() => (h.pending ? new Promise(() => {}) : Promise.resolve(h.result))),
  },
}));

function renderSLA() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactFirstResponseSLA contactId="c1" />
    </QueryClientProvider>,
  );
}

const row = (breached: boolean | null, at: string | null) => ({
  data: { first_response_breached: breached, first_response_at: at, resolution_breached: null, resolved_at: null },
  error: null,
});

beforeEach(() => {
  h.result = { data: null, error: null };
  h.pending = false;
});

describe('ContactFirstResponseSLA', () => {
  it('carregando mostra esqueleto', () => {
    h.pending = true;
    renderSLA();
    expect(screen.getByTestId('sla-loading')).toBeInTheDocument();
  });

  it('violado', async () => {
    h.result = row(true, '2026-11-01T10:00:00Z');
    renderSLA();
    expect(await screen.findByTestId('sla-first-response')).toHaveTextContent('Violado');
  });

  it('respondido no prazo', async () => {
    h.result = row(false, '2026-11-01T10:00:00Z');
    renderSLA();
    expect(await screen.findByTestId('sla-first-response')).toHaveTextContent('No prazo');
  });

  it('sem resposta e sem violação = pendente (não "no prazo")', async () => {
    h.result = row(false, null);
    renderSLA();
    expect(await screen.findByTestId('sla-first-response')).toHaveTextContent('Pendente');
  });

  it('sem linha em conversation_sla mostra vazio honesto', async () => {
    renderSLA();
    expect(await screen.findByTestId('sla-empty')).toHaveTextContent('Sem medição de SLA');
  });

  it('erro de leitura não vira vazio', async () => {
    h.result = { data: null, error: { message: 'rls' } };
    renderSLA();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler o SLA');
  });

  it('não mostra resolução nem tags de IA', async () => {
    h.result = row(false, '2026-11-01T10:00:00Z');
    renderSLA();
    await screen.findByTestId('sla-first-response');
    expect(screen.queryByText(/Resolução/i)).toBeNull();
    expect(screen.queryByText(/Tags geradas por IA/i)).toBeNull();
  });
});
