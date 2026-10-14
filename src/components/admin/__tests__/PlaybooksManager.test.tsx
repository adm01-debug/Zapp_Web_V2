import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * PG-08 — PlaybooksManager: ordem íntegra ao salvar, exclusão confirmada e
 * validada, erro de carga explícito, trava do salvar e cartão operável pelo
 * teclado. O Supabase é mockado com um builder encadeável: `select().order()`
 * devolve `state.list`; qualquer mutação (insert/update/delete) devolve
 * `state.mutation`, para provar o que acontece quando o banco nega.
 */
const h = vi.hoisted(() => {
  const state = {
    list: { data: [] as unknown, error: null as unknown },
    mutation: { error: null as unknown },
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    deletes: [] as Array<[string, unknown]>,
  };

  const from = (_table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    let mutated = false;
    b.select = () => b;
    b.order = () => b;
    b.insert = (payload: Record<string, unknown>) => { mutated = true; state.inserts.push(payload); return b; };
    b.update = (payload: Record<string, unknown>) => { mutated = true; state.updates.push(payload); return b; };
    b.delete = () => { mutated = true; return b; };
    b.eq = (col: string, val: unknown) => { if (mutated) state.deletes.push([col, val]); return b; };
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(mutated ? state.mutation : state.list).then(resolve);
    return b;
  };

  return { state, from: vi.fn(from) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PlaybooksManager } from '../PlaybooksManager';
import { toast } from 'sonner';

function playbook(over: Record<string, unknown> = {}) {
  return {
    id: 'pb-1',
    name: 'Playbook A',
    description: 'Descrição A',
    category: 'sales',
    steps: [{ order: 1, title: 'Passo um', description: '', tips: '' }],
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.list = { data: [], error: null };
  h.state.mutation = { error: null };
  h.state.inserts = [];
  h.state.updates = [];
  h.state.deletes = [];
});

describe('PlaybooksManager (PG-08)', () => {
  it('renumera a ordem ao salvar: passo vazio é descartado e os demais ficam 1,2', async () => {
    render(<PlaybooksManager />);
    await screen.findByText('Nenhum playbook criado');

    fireEvent.click(screen.getByRole('button', { name: /Novo Playbook/ }));
    fireEvent.change(screen.getByPlaceholderText('Nome do playbook'), { target: { value: 'Fluxo' } });

    // Três passos, o do MEIO sem título: sem renumeração gravaria 1 e 3.
    fireEvent.click(screen.getByRole('button', { name: /Adicionar passo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar passo/ }));
    const titulos = screen.getAllByPlaceholderText('Título do passo');
    fireEvent.change(titulos[0], { target: { value: 'Primeiro' } });
    fireEvent.change(titulos[2], { target: { value: 'Terceiro' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(h.state.inserts).toHaveLength(1));
    expect(h.state.inserts[0].steps).toEqual([
      { order: 1, title: 'Primeiro', description: '', tips: '' },
      { order: 2, title: 'Terceiro', description: '', tips: '' },
    ]);
    expect(h.state.inserts[0].is_active).toBe(true);
  });

  it('trava o salvar: clique duplo grava um único playbook', async () => {
    render(<PlaybooksManager />);
    await screen.findByText('Nenhum playbook criado');

    fireEvent.click(screen.getByRole('button', { name: /Novo Playbook/ }));
    fireEvent.change(screen.getByPlaceholderText('Nome do playbook'), { target: { value: 'Fluxo' } });

    const salvar = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(salvar);
    fireEvent.click(salvar);

    await waitFor(() => expect(h.state.inserts).toHaveLength(1));
    expect(h.state.inserts).toHaveLength(1);
  });

  it('excluir só apaga depois da confirmação e não anuncia sucesso quando o banco nega', async () => {
    h.state.list = { data: [playbook()], error: null };
    h.state.mutation = { error: { message: 'permission denied for table playbooks' } };
    render(<PlaybooksManager />);

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir playbook' }));
    // Ainda não falou com o banco: a confirmação abre antes.
    expect(h.state.deletes).toHaveLength(0);

    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao remover'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(h.state.deletes).toEqual([['id', 'pb-1']]);
  });

  it('anuncia sucesso e recarrega quando o banco aceita a remoção', async () => {
    h.state.list = { data: [playbook()], error: null };
    h.state.mutation = { error: null };
    render(<PlaybooksManager />);

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir playbook' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Playbook removido'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('erro de carga é explícito e não vira "Nenhum playbook criado"', async () => {
    h.state.list = { data: null, error: { message: 'boom' } };
    render(<PlaybooksManager />);

    expect(await screen.findByText('Não foi possível carregar os playbooks. Tente novamente.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum playbook criado')).not.toBeInTheDocument();
  });

  it('abre o detalhe pelo teclado (Enter no cartão focável)', async () => {
    h.state.list = { data: [playbook()], error: null };
    render(<PlaybooksManager />);

    const card = await screen.findByRole('article', { name: 'Abrir playbook Playbook A' });
    expect(card).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(card, { key: 'Enter' });

    expect(await screen.findByText('Passo um')).toBeInTheDocument();
  });
});
