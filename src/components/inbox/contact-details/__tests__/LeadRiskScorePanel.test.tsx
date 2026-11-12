import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadRiskScorePanel } from '../LeadRiskScorePanel';

const h = vi.hoisted(() => {
  const state = {
    row: null as Record<string, unknown> | null,
    readError: null as { message: string } | null,
    writeError: null as { message: string } | null,
    pending: false,
    isAdmin: false,
  };
  const updateEq = vi.fn(async () => ({ error: state.writeError }));
  const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: updateEq }));
  const maybeSingle = vi.fn(() =>
    state.pending ? new Promise(() => {}) : Promise.resolve({ data: state.row, error: state.readError }),
  );
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
  const from = vi.fn(() => ({ select, update }));
  return { state, from, update, updateEq };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from } }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isAdmin: h.state.isAdmin }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LeadRiskScorePanel contactId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.state.row = { lead_score: 85, risk_score: 20, lead_origin: 'referral', consent_status: 'granted' };
  h.state.readError = null;
  h.state.writeError = null;
  h.state.pending = false;
  h.state.isAdmin = false;
  vi.clearAllMocks();
});

describe('LeadRiskScorePanel — score e LGPD', () => {
  it('carregando mostra esqueleto', () => {
    h.state.pending = true;
    renderPanel();
    expect(screen.getByTestId('lead-risk-loading')).toBeInTheDocument();
  });

  it('mostra os valores salvos no contato', async () => {
    renderPanel();
    expect(await screen.findByTestId('lead-score-value')).toHaveTextContent('85');
    expect(screen.getByTestId('risk-score-value')).toHaveTextContent('20');
    expect(screen.getAllByRole('slider')).toHaveLength(2);
    expect(screen.getByRole('slider', { name: 'Lead score' })).toBeInTheDocument();
  });

  it('contato sem valores começa em 0 e sem origem', async () => {
    h.state.row = { lead_score: null, risk_score: null, lead_origin: null, consent_status: null };
    renderPanel();
    expect(await screen.findByTestId('lead-score-value')).toHaveTextContent('0');
    expect(screen.getByText('Selecione a origem')).toBeInTheDocument();
  });

  it('falha de leitura mostra erro com "Tentar novamente", não um formulário zerado', async () => {
    h.state.readError = { message: 'rls' };
    renderPanel();
    expect(await screen.findByTestId('lead-risk-error')).toHaveTextContent('Não foi possível ler os scores');
    expect(screen.queryByTestId('lead-risk-form')).toBeNull();
  });

  it('Salvar fica desabilitado sem mudança e grava só o campo alterado', async () => {
    renderPanel();
    const save = await screen.findByRole('button', { name: 'Salvar alterações' });
    expect(save).toBeDisabled();

    const slider = screen.getByRole('slider', { name: 'Lead score' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(screen.getByTestId('lead-score-value')).toHaveTextContent('90');
    expect(save).toBeEnabled();

    fireEvent.click(save);
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ lead_score: 90 }));
    expect(h.updateEq).toHaveBeenCalledWith('id', 'c1');
  });

  it('não admin vê o consentimento só para leitura (o banco descarta a troca)', async () => {
    renderPanel();
    expect(await screen.findByTestId('consent-readonly')).toHaveTextContent('Concedido');
    expect(screen.getByText('Só administrador altera o consentimento.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Consentimento LGPD' })).toBeNull();
  });

  it('admin escolhe o consentimento entre os valores aceitos pelo banco', async () => {
    h.state.isAdmin = true;
    renderPanel();
    expect(await screen.findByRole('combobox', { name: 'Consentimento LGPD' })).toBeInTheDocument();
    expect(screen.queryByTestId('consent-readonly')).toBeNull();
  });
});
