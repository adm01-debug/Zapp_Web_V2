import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { CustomFieldsSection } from '../CustomFieldsSection';

/**
 * Estes testes renderizam a seção REAL com o hook REAL
 * (`useContactCustomFields`), mockando só a borda do Supabase. Assim a prova
 * cobre a cadeia inteira que a tela usa (componente → hook → query), e não um
 * mock que já traz a resposta pronta.
 */

type Res = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[],
    selectError: null as unknown,
    writeError: null as unknown,
    upsertPayloads: [] as Record<string, unknown>[],
    updatePayloads: [] as Record<string, unknown>[],
    updateIds: [] as string[],
    deleteIds: [] as string[],
    deletePromise: null as Promise<Res> | null,
  };

  const from = (_table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: state.rows, error: state.selectError }),
      upsert: (payload: Record<string, unknown>) => {
        state.upsertPayloads.push(payload);
        return Promise.resolve({ error: state.writeError });
      },
      update: (payload: Record<string, unknown>) => {
        state.updatePayloads.push(payload);
        return {
          eq: (_col: string, id: string) => {
            state.updateIds.push(id);
            return Promise.resolve({ error: state.writeError });
          },
        };
      },
      delete: () => ({
        eq: (_col: string, id: string) => {
          state.deleteIds.push(id);
          return state.deletePromise ?? Promise.resolve({ error: state.writeError });
        },
      }),
    };
    return builder;
  };

  return { state, supabase: { from } };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';

const state = h.state;

const rowCPF = {
  id: 'cf1',
  contact_id: 'c1',
  field_name: 'CPF',
  field_value: '123.456.789-00',
  field_type: 'text',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

function renderSection() {
  return render(
    <Accordion type="multiple" defaultValue={['customFields']}>
      <CustomFieldsSection contactId="c1" />
    </Accordion>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [rowCPF];
  state.selectError = null;
  state.writeError = null;
  state.upsertPayloads = [];
  state.updatePayloads = [];
  state.updateIds = [];
  state.deleteIds = [];
  state.deletePromise = null;
});

describe('CustomFieldsSection — campos personalizados no painel do contato', () => {
  it('lista os campos do contato com nome e valor', async () => {
    renderSection();
    expect(await screen.findByText('CPF')).toBeInTheDocument();
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();
  });

  it('sem campos mostra o vazio e ainda oferece Adicionar campo', async () => {
    state.rows = [];
    renderSection();
    expect(await screen.findByText('Nenhum campo personalizado neste contato.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adicionar campo/ })).toBeInTheDocument();
  });

  it('cria um campo novo e grava no servidor', async () => {
    renderSection();
    await screen.findByText('CPF');

    fireEvent.click(screen.getByRole('button', { name: /Adicionar campo/ }));
    fireEvent.change(screen.getByLabelText('Nome do campo'), { target: { value: 'Matrícula' } });
    fireEvent.change(screen.getByLabelText('Valor do campo'), { target: { value: 'A-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(state.upsertPayloads).toEqual([
        { contact_id: 'c1', field_name: 'Matrícula', field_value: 'A-42', field_type: 'text' },
      ]),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it('edição na linha: Enter salva o novo valor', async () => {
    renderSection();
    await screen.findByText('CPF');

    fireEvent.click(screen.getByRole('button', { name: 'Editar CPF' }));
    const input = screen.getByLabelText('Editar valor de CPF');
    expect(input).toHaveValue('123.456.789-00');

    fireEvent.change(input, { target: { value: '999.888.777-66' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(state.updatePayloads).toEqual([{ field_value: '999.888.777-66' }]));
    expect(state.updateIds).toEqual(['cf1']);
    expect(await screen.findByText('999.888.777-66')).toBeInTheDocument();
  });

  it('edição na linha: Esc cancela sem gravar', async () => {
    renderSection();
    await screen.findByText('CPF');

    fireEvent.click(screen.getByRole('button', { name: 'Editar CPF' }));
    const input = screen.getByLabelText('Editar valor de CPF');
    fireEvent.change(input, { target: { value: 'alterado' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByLabelText('Editar valor de CPF')).not.toBeInTheDocument();
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();
    expect(state.updatePayloads).toHaveLength(0);
  });

  it('edição na linha: o check também salva', async () => {
    renderSection();
    await screen.findByText('CPF');

    fireEvent.click(screen.getByRole('button', { name: 'Editar CPF' }));
    fireEvent.change(screen.getByLabelText('Editar valor de CPF'), { target: { value: 'novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar CPF' }));

    await waitFor(() => expect(state.updateIds).toEqual(['cf1']));
  });

  it('excluir exige confirmação e só remove no servidor', async () => {
    renderSection();
    await screen.findByText('CPF');

    fireEvent.click(screen.getByRole('button', { name: 'Remover CPF' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Remover campo personalizado/)).toBeInTheDocument();
    // antes de confirmar nada foi apagado
    expect(state.deleteIds).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(state.deleteIds).toEqual(['cf1']));
    await waitFor(() => expect(screen.queryByText('CPF')).not.toBeInTheDocument());
  });

  it('não some da lista antes de o servidor confirmar (exclusão)', async () => {
    let resolveDelete: (value: Res) => void = () => {};
    state.deletePromise = new Promise<Res>((resolve) => {
      resolveDelete = resolve;
    });

    renderSection();
    await screen.findByText('CPF');

    fireEvent.click(screen.getByRole('button', { name: 'Remover CPF' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    // servidor ainda não respondeu: linha continua e nenhum sucesso foi anunciado
    expect(screen.getByText('CPF')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();

    resolveDelete({ error: null });

    await waitFor(() => expect(screen.queryByText('CPF')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalled();
  });

  it('quando a RLS recusa a escrita, a seção passa a somente leitura', async () => {
    state.writeError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "contact_custom_fields"',
    };

    renderSection();
    await screen.findByText('CPF');

    fireEvent.click(screen.getByRole('button', { name: /Adicionar campo/ }));
    fireEvent.change(screen.getByLabelText('Nome do campo'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Valor do campo'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByTestId('custom-fields-readonly')).toBeInTheDocument();
    // some com as ações que o banco negaria
    expect(screen.queryByRole('button', { name: 'Editar CPF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover CPF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adicionar campo/ })).not.toBeInTheDocument();
    // o valor continua visível em leitura
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();
  });
});
