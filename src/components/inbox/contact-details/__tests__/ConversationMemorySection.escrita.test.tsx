import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { ConversationMemorySection } from '../ConversationMemorySection';

/**
 * Escrita da memória da conversa — resgate do ConversationMemoryPanel da V3.
 *
 * Os dois primeiros casos são as GUARDAS: sem elas, uma resposta de leitura
 * atrasada (o atendente trocou de conversa) faria o UPDATE cair na linha de
 * OUTRO contato. Eram os dois casos que a `main` não tinha como testar, porque
 * não tinha escrita.
 *
 * O componente REAL é renderizado; só o cliente Supabase é mockado.
 */
const h = vi.hoisted(() => {
  const state = {
    row: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
    erroAoGravar: null as { message: string } | null,
  };
  const maybeSingle = vi.fn(async () => ({ data: state.row, error: state.error }));
  const eqLeitura = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: eqLeitura }));

  // update(...).eq(...).eq(...) — as duas chamadas de `eq` são registradas.
  const eqUpdate2 = vi.fn(async (_coluna: string, _valor: string) => ({ error: state.erroAoGravar }));
  const eqUpdate1 = vi.fn((_coluna: string, _valor: string) => ({ eq: eqUpdate2 }));
  const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: eqUpdate1 }));
  const insert = vi.fn(async (_payload: Record<string, unknown>) => ({ error: state.erroAoGravar }));

  const from = vi.fn((_table: string) => ({ select, update, insert }));
  const getUser = vi.fn(async () => ({ data: { user: { id: 'perfil-1' } } }));
  return { state, from, select, eqLeitura, maybeSingle, update, eqUpdate1, eqUpdate2, insert, getUser };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from, auth: { getUser: h.getUser } },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

const ROW_DO_CONTATO = {
  id: 'mem-1',
  contact_id: 'c1',
  facts: ['Compra para revenda'],
  objections_handled: [],
  promises_made: [],
  pending_items: [],
  commercial_summary: null,
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

async function abrirEdicao(rotulo: RegExp) {
  await waitFor(() => expect(screen.getByRole('button', { name: rotulo })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: rotulo }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.row = null;
  h.state.error = null;
  h.state.erroAoGravar = null;
});

describe('memória da conversa — escrita', () => {
  it('o UPDATE sempre carrega o filtro por contact_id, nunca só por id', async () => {
    h.state.row = ROW_DO_CONTATO;
    renderSection();

    await abrirEdicao(/editar memória/i);
    fireEvent.change(screen.getByLabelText(/novo fato/i), { target: { value: 'Pediu nota fiscal' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar fato/i }));
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(h.update).toHaveBeenCalled());
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.eqUpdate1).toHaveBeenCalledWith('id', 'mem-1');
    expect(h.eqUpdate2).toHaveBeenCalledWith('contact_id', 'c1');
    // O conteúdo digitado chega ao banco, junto do que já existia.
    expect(h.update.mock.calls[0][0]).toMatchObject({
      contact_id: 'c1',
      facts: ['Compra para revenda', 'Pediu nota fiscal'],
      updated_by: 'perfil-1',
    });
  });

  it('memória cujo contact_id não é o atual não é atualizada: grava INSERT, não UPDATE', async () => {
    // Linha de OUTRO contato (resposta atrasada): o id dela não pode virar alvo.
    h.state.row = { ...ROW_DO_CONTATO, id: 'mem-de-outro', contact_id: 'c99' };
    renderSection();

    await abrirEdicao(/editar memória/i);
    fireEvent.change(screen.getByLabelText(/novo fato/i), { target: { value: 'Fato do contato atual' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar fato/i }));
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(h.insert).toHaveBeenCalled());
    expect(h.update).not.toHaveBeenCalled();
    expect(h.insert.mock.calls[0][0]).toMatchObject({ contact_id: 'c1' });
  });

  it('contato sem memória: dá para registrar a primeira, e vira INSERT', async () => {
    h.state.row = null;
    renderSection();

    await abrirEdicao(/registrar memória/i);
    fireEvent.change(screen.getByLabelText(/nova pendência/i), { target: { value: 'Confirmar CNPJ' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar pendência/i }));
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(h.insert).toHaveBeenCalled());
    expect(h.insert.mock.calls[0][0]).toMatchObject({
      contact_id: 'c1',
      pending_items: ['Confirmar CNPJ'],
    });
  });

  it('remover item tira da lista que vai ao banco', async () => {
    h.state.row = { ...ROW_DO_CONTATO, facts: ['Fica', 'Sai'] };
    renderSection();

    await abrirEdicao(/editar memória/i);
    fireEvent.click(screen.getByRole('button', { name: /remover fato: Sai/i }));
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(h.update).toHaveBeenCalled());
    expect(h.update.mock.calls[0][0]).toMatchObject({ facts: ['Fica'] });
  });

  it('falha ao salvar mantém o que foi escrito na tela e avisa', async () => {
    h.state.row = ROW_DO_CONTATO;
    h.state.erroAoGravar = { message: 'RLS' };
    renderSection();

    await abrirEdicao(/editar memória/i);
    fireEvent.change(screen.getByLabelText(/novo fato/i), { target: { value: 'Não some' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar fato/i }));
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(screen.getByTestId('memoria-erro-salvar')).toBeInTheDocument());
    // Segue em edição, com o texto digitado ainda visível.
    expect(screen.getByText('Não some')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^salvar$/i })).toBeInTheDocument();
  });

  it('falha de LEITURA não abre edição: oferece tentar novamente', async () => {
    h.state.error = { message: 'permission denied' };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('memoria-erro')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /editar memória|registrar memória/i })).toBeNull();

    const chamadasAntes = h.maybeSingle.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    await waitFor(() => expect(h.maybeSingle.mock.calls.length).toBeGreaterThan(chamadasAntes));
  });
});
