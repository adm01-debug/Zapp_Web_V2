import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Item do cartão t_945354b5 — `WhatsAppFlowsBuilder`:
 *  - `updateFlowScreens` descartava o erro do UPDATE e a UI já tinha mudado, então
 *    uma falha de gravação parecia sucesso. Contrato: só confirma (muda a tela)
 *    depois que o banco aceitou; erro vira toast destrutivo e a tela fica como estava.
 *  - `fetchFlows` ignorava o erro do SELECT (lista vazia mentirosa). Contrato: erro
 *    vira toast + estado de erro visível, sem anunciar "Nenhum WhatsApp Flow".
 *  - o badge 'Publicado' era decidido só pelo `status`, que a tela nunca altera.
 *    Contrato: 'Publicado' exige publicação real (`published_at`), senão 'Rascunho'.
 */

const mocks = vi.hoisted(() => ({
  tableFrom: vi.fn(),
  selectOrder: vi.fn(),
  updateEq: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.tableFrom } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle, actions }: { title?: string; subtitle?: string; actions?: import('react').ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {actions}
    </div>
  ),
}));

import { WhatsAppFlowsBuilder } from '../WhatsAppFlowsBuilder';

function flowRow(over: Record<string, unknown> = {}) {
  return {
    id: 'flow-1',
    name: 'Meu Flow',
    description: 'desc',
    flow_json: {},
    status: 'draft',
    whatsapp_flow_id: null,
    published_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    screens: [{ id: 's1', title: 'Tela 1', layout: [{ id: 'c1', type: 'TextHeading', text: 'Oi' }] }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectOrder.mockResolvedValue({ data: [flowRow()], error: null });
  mocks.tableFrom.mockImplementation(() => ({
    select: () => ({ order: mocks.selectOrder }),
    update: () => ({ eq: (col: string, val: string) => mocks.updateEq(col, val) }),
    insert: () => Promise.resolve({ error: null }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }));
  mocks.updateEq.mockResolvedValue({ error: null });
});

describe('WhatsAppFlowsBuilder — salvar confirma só depois de gravar', () => {
  it('a tela não muda antes de o banco aceitar a gravação', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    mocks.updateEq.mockImplementation(
      () => new Promise((resolve) => { resolveSave = resolve; }),
    );

    render(<WhatsAppFlowsBuilder />);
    await screen.findByText('Meu Flow');
    fireEvent.click(screen.getByText('Meu Flow'));
    await screen.findByText('Editor de WhatsApp Flow');

    // estado inicial: 1 componente na tela
    expect(screen.getByText('1 componentes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Título' }));
    await waitFor(() => expect(mocks.updateEq).toHaveBeenCalledWith('id', 'flow-1'));

    // gravação ainda pendente: NÃO pode aparecer o 2º componente (sem otimismo)
    expect(screen.getByText('1 componentes')).toBeTruthy();
    expect(screen.queryByText('2 componentes')).toBeNull();

    resolveSave({ error: null });
    await waitFor(() => expect(screen.getByText('2 componentes')).toBeTruthy());
  });

  it('falha ao salvar vira toast de erro e mantém a tela como estava', async () => {
    mocks.updateEq.mockResolvedValue({ error: { message: 'rls denied' } });

    render(<WhatsAppFlowsBuilder />);
    await screen.findByText('Meu Flow');
    fireEvent.click(screen.getByText('Meu Flow'));
    await screen.findByText('Editor de WhatsApp Flow');

    fireEvent.click(screen.getByRole('button', { name: 'Título' }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Erro ao salvar o flow', variant: 'destructive' }),
      ),
    );
    expect(screen.getByText('1 componentes')).toBeTruthy();
    expect(screen.queryByText('2 componentes')).toBeNull();
  });
});

describe('WhatsAppFlowsBuilder — erro ao carregar não vira lista vazia', () => {
  it('erro do SELECT mostra estado de erro e não anuncia "Nenhum WhatsApp Flow"', async () => {
    mocks.selectOrder.mockResolvedValue({ data: null, error: { message: 'boom' } });

    render(<WhatsAppFlowsBuilder />);

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Erro ao carregar os flows', variant: 'destructive' }),
      ),
    );
    await screen.findByText('Não foi possível carregar os WhatsApp Flows');
    expect(screen.queryByText('Nenhum WhatsApp Flow')).toBeNull();
  });
});

describe("WhatsAppFlowsBuilder — badge 'Publicado' exige publicação real", () => {
  it('status published sem published_at continua "Rascunho"', async () => {
    mocks.selectOrder.mockResolvedValue({
      data: [
        flowRow({ id: 'f1', name: 'Sem publicar', status: 'published', published_at: null }),
        flowRow({ id: 'f2', name: 'Publicado de verdade', status: 'published', published_at: '2026-10-01T00:00:00.000Z' }),
      ],
      error: null,
    });

    render(<WhatsAppFlowsBuilder />);
    await screen.findByText('Sem publicar');

    expect(screen.getAllByText('Rascunho')).toHaveLength(1);
    expect(screen.getAllByText('Publicado')).toHaveLength(1);
  });
});
