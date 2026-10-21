/**
 * Contato → Compras/Propostas (cartão t_a242ef97). Prova os quatro defeitos da tela:
 *  1. total somava as canceladas e não dizia o que excluía;
 *  2. `new Date(valor inválido)` derrubava a lista inteira (RangeError do date-fns);
 *  3. valor R$ 0,00 desaparecia (`{p.amount && ...}` com 0 falso);
 *  4. duplo clique em "Criar" disparava dois inserts.
 * Mais o estado de erro da consulta (não pode cair no "Nenhum registro").
 *
 * Vermelho antes: sem data-testid do total, `getByTestId` estoura; a data inválida
 * lança RangeError no render; "R$ 0,00" não existe; o 2º clique chama insert 2×.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  refetch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  estado: { data: [] as Record<string, unknown>[], isLoading: false, isError: false },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { initial, animate, exit, transition, variants, whileHover, whileTap, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
}));

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/logger', () => ({ log: h.log, getLogger: () => h.log, createLogger: () => h.log }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert: h.insert }) },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/hooks/crm/useContactCrm360', () => ({ contactCrm360Key: (id: string) => ['crm360', id] }));
vi.mock('@/hooks/crm/useContactPurchases', () => ({
  useContactPurchases: () => ({ ...h.estado, refetch: h.refetch }),
  contactPurchasesKey: (id: string) => ['purchases', id],
}));

import { ContactPurchasesPanel } from '../ContactPurchasesPanel';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  title: 'Registro',
  description: null,
  amount: 100,
  currency: 'BRL',
  status: 'approved',
  purchase_type: 'purchase',
  purchased_at: null,
  created_at: '2026-03-10T12:00:00.000Z',
  ...over,
});

function abrirDialogo() {
  fireEvent.click(screen.getByRole('button', { name: /Novo/ }));
  fireEvent.change(screen.getByPlaceholderText('Título'), { target: { value: 'Peça X' } });
}

describe('ContactPurchasesPanel — total, data, valor e duplo clique', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.estado.data = [];
    h.estado.isLoading = false;
    h.estado.isError = false;
  });

  it('total soma só o que não está cancelado e diz "(sem cancelados)"', () => {
    h.estado.data = [
      row({ id: 'a', amount: 1200, status: 'approved' }),
      row({ id: 'b', title: 'Venda cancelada', amount: 800, status: 'cancelled' }),
    ];

    render(<ContactPurchasesPanel contactId="c1" profileId="p1" />);

    expect(screen.getByTestId('total-compras')).toHaveTextContent('R$ 1.200,00 (sem cancelados)');
    // a cancelada continua visível na lista (só sai do total)
    expect(screen.getByText('Venda cancelada')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('data inválida vira "—", a lista sobrevive e purchased_at tem preferência', () => {
    h.estado.data = [
      row({ id: 'a', title: 'Quebrada', created_at: 'não é data' }),
      row({ id: 'b', title: 'Boa' }),
      row({ id: 'c', title: 'Comprada', purchased_at: '2026-01-05T12:00:00.000Z' }),
    ];

    render(<ContactPurchasesPanel contactId="c1" profileId="p1" />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('10/03/26')).toBeInTheDocument();
    // purchased_at (05/01) em vez de created_at (10/03)
    expect(screen.getByText('05/01/26')).toBeInTheDocument();
    expect(screen.getByText('Boa')).toBeInTheDocument();
  });

  it('valor R$ 0,00 aparece na linha e no total', () => {
    h.estado.data = [row({ id: 'a', amount: 0 })];

    render(<ContactPurchasesPanel contactId="c1" profileId="p1" />);

    expect(screen.getByText('R$ 0,00')).toBeInTheDocument();
    expect(screen.getByTestId('total-compras')).toHaveTextContent('R$ 0,00 (sem cancelados)');
  });

  it('falha da consulta mostra erro com "Tentar de novo" (não o vazio)', () => {
    h.estado.isError = true;

    render(<ContactPurchasesPanel contactId="c1" profileId="p1" />);

    expect(screen.getByText('Falha ao carregar compras e propostas.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum registro de compra/proposta')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it('duplo clique em Criar gera um único insert', async () => {
    let resolver: (v: unknown) => void = () => {};
    h.insert.mockReturnValue(new Promise((r) => { resolver = r; }));

    render(<ContactPurchasesPanel contactId="c1" profileId="p1" />);
    abrirDialogo();

    const criar = screen.getByRole('button', { name: 'Criar' });
    fireEvent.click(criar);
    fireEvent.click(criar);

    await waitFor(() => expect(h.insert).toHaveBeenCalledTimes(1));
    expect(h.insert).toHaveBeenCalledTimes(1);

    resolver({ error: null });
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Registro adicionado'));
  });

  it('valor negativo ou acima do teto bloqueia o envio', () => {
    h.insert.mockResolvedValue({ error: null });

    render(<ContactPurchasesPanel contactId="c1" profileId="p1" />);
    abrirDialogo();

    const valor = screen.getByPlaceholderText('Valor (R$)');
    fireEvent.change(valor, { target: { value: '-5' } });

    expect(screen.getByText(/Informe um valor entre/)).toBeInTheDocument();
    const criar = screen.getByRole('button', { name: 'Criar' });
    expect(criar).toBeDisabled();
    fireEvent.click(criar);
    expect(h.insert).not.toHaveBeenCalled();

    fireEvent.change(valor, { target: { value: '100000001' } });
    expect(screen.getByText(/Informe um valor entre/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar' })).toBeDisabled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('sem profileId não há como registrar', () => {
    h.insert.mockResolvedValue({ error: null });

    render(<ContactPurchasesPanel contactId="c1" profileId={null} />);
    abrirDialogo();

    expect(screen.getByText(/Usuário não identificado/)).toBeInTheDocument();
    const criar = screen.getByRole('button', { name: 'Criar' });
    expect(criar).toBeDisabled();
    fireEvent.click(criar);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('não tem violação do axe', async () => {
    h.estado.data = [
      row({ id: 'a', amount: 1200, status: 'approved' }),
      row({ id: 'b', title: 'Venda cancelada', amount: 0, status: 'cancelled' }),
    ];

    const { container } = render(<ContactPurchasesPanel contactId="c1" profileId="p1" />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
