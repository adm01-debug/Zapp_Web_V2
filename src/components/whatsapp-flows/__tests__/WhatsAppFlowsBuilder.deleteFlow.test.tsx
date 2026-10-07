import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * R2-API-053 (#226) — `deleteFlow` descartava o resultado do DELETE e anunciava
 * "Flow removido" mesmo com `error` do PostgREST. O teste prova o contrato da tela:
 * erro vira toast destrutivo (sem mensagem de sucesso) e o sucesso continua igual.
 */

const mocks = vi.hoisted(() => ({
  tableFrom: vi.fn(),
  deleteEq: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.tableFrom },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

// O PageHeader arrasta roteador e contexto de layout; o contrato aqui é o da exclusão.
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

import { WhatsAppFlowsBuilder } from '../WhatsAppFlowsBuilder';

const FLOWS = [
  {
    id: 'flow-1',
    name: 'Fluxo de boas-vindas',
    description: 'Formulário inicial',
    flow_json: {},
    screens: [],
    status: 'draft',
    whatsapp_flow_id: null,
    created_at: '2026-10-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tableFrom.mockImplementation(() => ({
    select: () => ({ order: () => Promise.resolve({ data: FLOWS, error: null }) }),
    delete: () => ({ eq: (column: string, value: string) => mocks.deleteEq(column, value) }),
    insert: () => Promise.resolve({ error: null }),
  }));
  mocks.deleteEq.mockResolvedValue({ error: null });
});

describe('WhatsAppFlowsBuilder.deleteFlow — confirma só depois da persistência', () => {
  it('falha do DELETE mostra erro e NÃO anuncia "Flow removido"', async () => {
    mocks.deleteEq.mockResolvedValue({ error: { message: 'rls denied' } });
    render(<WhatsAppFlowsBuilder />);

    const botao = await screen.findByLabelText('Excluir flow');
    fireEvent.click(botao);

    await waitFor(() => expect(mocks.deleteEq).toHaveBeenCalledWith('id', 'flow-1'));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Flow removido' }));
  });

  it('DELETE aceito anuncia "Flow removido"', async () => {
    render(<WhatsAppFlowsBuilder />);

    const botao = await screen.findByLabelText('Excluir flow');
    fireEvent.click(botao);

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Flow removido' }))
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});
