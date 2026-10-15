import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { ConversationMemorySection } from '../ConversationMemorySection';

/**
 * O componente REAL é renderizado; só o cliente Supabase é mockado (a resposta
 * crua do banco), então nada do texto exibido vem do mock. A cadeia de leitura é
 * a mesma que `useNextBestAction` usa (select → eq → maybeSingle) e a de escrita
 * é o upsert com `onConflict: 'contact_id'` — o stub guarda o que foi enviado e
 * atualiza a linha, então a releitura depois de salvar enxerga o que foi gravado.
 */
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

const h = vi.hoisted(() => {
  const state = {
    row: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
    saveError: null as { message: string } | null,
    upserts: [] as Array<{ payload: Record<string, unknown>; opts?: unknown }>,
    hold: false,
    release: null as null | (() => void),
  };
  const maybeSingle = vi.fn(async () => ({ data: state.row, error: state.error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn((payload: Record<string, unknown>, opts?: unknown) => {
    state.upserts.push({ payload, opts });
    const commit = () => {
      if (!state.saveError) {
        state.row = { ...(state.row ?? {}), ...payload, updated_at: '2024-03-06T09:00:00.000Z' };
      }
      return { error: state.saveError };
    };
    if (state.hold) {
      return new Promise((resolve) => { state.release = () => resolve(commit()); });
    }
    return Promise.resolve(commit());
  });
  const from = vi.fn((_table: string) => ({ select, upsert }));
  return { state, from, select, eq, maybeSingle, upsert };
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

async function abrirEdicao() {
  renderSection();
  await waitFor(() => expect(screen.getByTestId('memoria-editar')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('memoria-editar'));
  await waitFor(() => expect(screen.getByTestId('memoria-formulario')).toBeInTheDocument());
}

describe('ConversationMemorySection — memória da conversa (somente leitura)', () => {
  beforeEach(() => {
    h.state.row = rowCompleta;
    h.state.error = null;
    h.state.saveError = null;
    h.state.upserts = [];
    h.state.hold = false;
    h.state.release = null;
    h.maybeSingle.mockClear();
    h.upsert.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
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
    // Contato sem memória ainda pode registrar a primeira (é o caso do conserto).
    expect(screen.getByTestId('memoria-editar')).toBeInTheDocument();
  });

  it('falha de leitura não vira estado vazio (não afirma que não há memória)', async () => {
    h.state.error = { message: 'row-level security' };
    renderSection();

    await waitFor(() =>
      expect(screen.getByTestId('memoria-erro')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('sidebar-empty-memoria-vazia')).not.toBeInTheDocument();
    // Sem leitura confiável não há edição: não se edita o que não se enxerga.
    expect(screen.queryByTestId('memoria-editar')).not.toBeInTheDocument();
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

describe('ConversationMemorySection — editar e salvar à mão', () => {
  beforeEach(() => {
    h.state.row = rowCompleta;
    h.state.error = null;
    h.state.saveError = null;
    h.state.upserts = [];
    h.state.hold = false;
    h.state.release = null;
    h.maybeSingle.mockClear();
    h.upsert.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  it('salva o rascunho por upsert e a memória relida mostra o que ficou gravado', async () => {
    await abrirEdicao();

    // O formulário abre com o que está na tela (o rascunho parte do real).
    expect(screen.getByLabelText('Resumo comercial')).toHaveValue('Cliente recorrente de brindes corporativos.');
    expect(screen.getByLabelText(/Pendências/)).toHaveValue('Confirmar CNPJ\nFechar pedido mínimo');

    fireEvent.change(screen.getByLabelText('Resumo comercial'), {
      target: { value: 'Cliente quer fechar o pedido até sexta.' },
    });
    fireEvent.change(screen.getByLabelText(/Pendências/), {
      target: { value: 'Confirmar CNPJ\nEnviar amostra\n\n' },
    });
    fireEvent.change(screen.getByLabelText(/Promessas/), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('memoria-salvar'));

    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(1));
    expect(h.upsert.mock.calls[0][0]).toEqual({
      contact_id: 'c1',
      commercial_summary: 'Cliente quer fechar o pedido até sexta.',
      pending_items: ['Confirmar CNPJ', 'Enviar amostra'],
      promises_made: [],
    });
    expect(h.upsert.mock.calls[0][1]).toEqual({ onConflict: 'contact_id' });

    // Grava, avisa e relê o banco: o que aparece depois é o que foi salvo.
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Memória da conversa atualizada.'));
    await waitFor(() => expect(screen.queryByTestId('memoria-formulario')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Cliente quer fechar o pedido até sexta.')).toBeInTheDocument());
    expect(screen.getByText('Enviar amostra')).toBeInTheDocument();
    expect(h.maybeSingle.mock.calls.length).toBeGreaterThan(1);
  });

  it('resumo em branco é gravado como nulo (não grava string vazia)', async () => {
    await abrirEdicao();

    fireEvent.change(screen.getByLabelText('Resumo comercial'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('memoria-salvar'));

    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(1));
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ commercial_summary: null });
  });

  it('erro ao salvar avisa no toast pt-BR, mantém o rascunho e não sai da edição', async () => {
    h.state.saveError = { message: 'new row violates row-level security policy' };
    await abrirEdicao();

    fireEvent.change(screen.getByLabelText('Resumo comercial'), { target: { value: 'Resumo que não salvou.' } });
    fireEvent.click(screen.getByTestId('memoria-salvar'));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Não foi possível salvar a memória da conversa.'),
    );
    expect(toastMock.success).not.toHaveBeenCalled();

    // O erro fica visível na tela e o texto digitado não é perdido.
    const alerta = await screen.findByTestId('memoria-erro-salvar');
    expect(alerta).toHaveAttribute('role', 'alert');
    expect(alerta).toHaveTextContent('Não foi possível salvar a memória da conversa. Tente de novo.');
    expect(screen.getByTestId('memoria-formulario')).toBeInTheDocument();
    expect(screen.getByLabelText('Resumo comercial')).toHaveValue('Resumo que não salvou.');
  });

  it('enquanto grava o botão vira "Salvando..." e fica bloqueado (não grava duas vezes)', async () => {
    h.state.hold = true;
    await abrirEdicao();

    fireEvent.click(screen.getByTestId('memoria-salvar'));

    await waitFor(() => expect(screen.getByTestId('memoria-salvar')).toHaveTextContent('Salvando...'));
    expect(screen.getByTestId('memoria-salvar')).toBeDisabled();
    expect(screen.getByTestId('memoria-descartar')).toBeDisabled();
    fireEvent.click(screen.getByTestId('memoria-salvar'));
    expect(h.upsert).toHaveBeenCalledTimes(1);

    h.state.release?.();
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
  });

  it('descartar sai da edição sem gravar e joga o rascunho fora', async () => {
    await abrirEdicao();

    fireEvent.change(screen.getByLabelText('Resumo comercial'), { target: { value: 'Rascunho abandonado' } });
    fireEvent.click(screen.getByTestId('memoria-descartar'));

    expect(h.upsert).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('memoria-formulario')).not.toBeInTheDocument());
    expect(screen.getByText('Cliente recorrente de brindes corporativos.')).toBeInTheDocument();
    expect(screen.queryByText('Rascunho abandonado')).not.toBeInTheDocument();

    // Reabrir não traz o rascunho descartado de volta.
    fireEvent.click(screen.getByTestId('memoria-editar'));
    expect(screen.getByLabelText('Resumo comercial')).toHaveValue('Cliente recorrente de brindes corporativos.');
  });

  it('os campos têm teto de 2000 caracteres e o contador acompanha', async () => {
    await abrirEdicao();

    const resumo = screen.getByLabelText('Resumo comercial');
    expect(resumo).toHaveAttribute('maxlength', '2000');
    expect(screen.getByTestId('memoria-limite-resumo')).toHaveTextContent(
      `${'Cliente recorrente de brindes corporativos.'.length}/2000`,
    );

    fireEvent.change(resumo, { target: { value: 'a'.repeat(2500) } });

    expect((resumo as HTMLTextAreaElement).value).toHaveLength(2000);
    expect(screen.getByTestId('memoria-limite-resumo')).toHaveTextContent('2000/2000');
  });
});
