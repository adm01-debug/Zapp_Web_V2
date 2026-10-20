import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { ConversationMemorySection } from '../ConversationMemorySection';

/**
 * O componente REAL é renderizado; só o cliente Supabase é mockado (a resposta
 * crua do banco), então nada do texto exibido vem do mock. Mesmo formato de
 * cadeia que `useNextBestAction` usa para esta tabela: select → eq → maybeSingle.
 */
const h = vi.hoisted(() => {
  const state = {
    row: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
  };
  const maybeSingle = vi.fn(async () => ({ data: state.row, error: state.error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((_table: string) => ({ select }));
  return { state, from, select, eq, maybeSingle };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const rowCompleta = {
  id: 'mem-1',
  facts: ['Prefere entrega pela manhã', 'Compra para revenda'],
  objections_handled: ['Achou o frete caro — frete grátis oferecido'],
  promises_made: ['Enviar a tabela de preços até sexta'],
  pending_items: ['Confirmar CNPJ', 'Fechar pedido mínimo'],
  commercial_summary: 'Cliente recorrente de brindes corporativos.',
  cumulative_summary: null,
  updated_at: '2024-03-05T12:00:00.000Z',
};

function renderSection() {
  return render(
    <Accordion type="multiple" defaultValue={['memoria']}>
      <ConversationMemorySection contactId="c1" index={3} />
    </Accordion>,
  );
}

describe('ConversationMemorySection — memória da conversa (somente leitura)', () => {
  beforeEach(() => {
    h.state.row = rowCompleta;
    h.state.error = null;
    h.maybeSingle.mockClear();
  });

  it('mostra os fatos lembrados, os resumos e a data do registro', async () => {
    renderSection();

    await waitFor(() => expect(screen.getByText('Prefere entrega pela manhã')).toBeInTheDocument());
    expect(screen.getByText('Compra para revenda')).toBeInTheDocument();
    expect(screen.getByText('Achou o frete caro — frete grátis oferecido')).toBeInTheDocument();
    expect(screen.getByText('Enviar a tabela de preços até sexta')).toBeInTheDocument();
    expect(screen.getByText('Confirmar CNPJ')).toBeInTheDocument();
    expect(screen.getByText('Cliente recorrente de brindes corporativos.')).toBeInTheDocument();

    // Rótulos dos 4 grupos do que o app guarda em conversation_memory.
    expect(screen.getByText('Fatos relevantes')).toBeInTheDocument();
    expect(screen.getByText('Objeções tratadas')).toBeInTheDocument();
    expect(screen.getByText('Promessas feitas')).toBeInTheDocument();
    expect(screen.getByText('Pendências')).toBeInTheDocument();

    // A data é a do banco (updated_at), não o relógio do navegador.
    expect(screen.getByText(/Atualizado em/)).toBeInTheDocument();
    expect(screen.getByText(/2024/)).toBeInTheDocument();

    // Consulta pelo contato dono da seção, na tabela certa.
    expect(h.from).toHaveBeenCalledWith('conversation_memory');
    expect(h.eq).toHaveBeenCalledWith('contact_id', 'c1');
  });

  it('sem memória para o contato mostra o estado vazio (e não inventa data)', async () => {
    h.state.row = null;
    renderSection();

    await waitFor(() =>
      expect(screen.getByTestId('sidebar-empty-memoria-vazia')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Nenhuma memória registrada/)).toBeInTheDocument();
    expect(screen.queryByText(/Atualizado em/)).not.toBeInTheDocument();
  });

  it('falha de leitura não vira estado vazio (não afirma que não há memória)', async () => {
    h.state.error = { message: 'row-level security' };
    renderSection();

    await waitFor(() =>
      expect(screen.getByTestId('memoria-erro')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('sidebar-empty-memoria-vazia')).not.toBeInTheDocument();
  });

  it('lista longa é cortada em 5 itens e o restante é informado', async () => {
    h.state.row = {
      ...rowCompleta,
      facts: [],
      objections_handled: [],
      promises_made: [],
      pending_items: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
    };
    renderSection();

    await waitFor(() => expect(screen.getByText('p5')).toBeInTheDocument());
    expect(screen.getByText('p1')).toBeInTheDocument();
    expect(screen.queryByText('p6')).not.toBeInTheDocument();
    expect(screen.getByText('+2 pendências')).toBeInTheDocument();
  });

  it('valores não textuais do jsonb não viram "[object Object]"', async () => {
    h.state.row = {
      ...rowCompleta,
      facts: [{ produto: 'Caneca', qtd: 50 }],
      objections_handled: [],
      promises_made: [],
      pending_items: [],
    };
    renderSection();

    await waitFor(() => expect(screen.getByText('{"produto":"Caneca","qtd":50}')).toBeInTheDocument());
  });
});
