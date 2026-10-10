/**
 * F78 / TL-010 — Multiplix: a conta "N contatos × M blocos = N×M mensagens" fica
 * SEMPRE visível na região 02 (COMPOSIÇÃO) da tela, e o nome do disparo deixa de
 * ser obrigatório ("dá para enviar sem nomear").
 *
 * Este cartão (TL-006, "3 regiões simultâneas") moveu a composição de um diálogo
 * (`MultiplixComposerDialog`, removido) para dentro da própria `MultiplixView`.
 * O TL-010 tinha entregue a conta N×M e o título opcional NO DIÁLOGO; este
 * arquivo porta o mesmo comportamento (e os mesmos casos) para a tela, contra o
 * componente REAL — substitui
 * `MultiplixComposerDialog.contagem.test.tsx` (apagado com o diálogo).
 *
 * O que este teste prova, contra o `MultiplixView` real:
 *  1. a conta aparece sempre e acompanha a seleção (região 01) e a composição
 *     (região 02) — 0 selecionado/0 bloco -> 0 mensagens; com seleção e bloco
 *     preenchido -> N×1 mensagens;
 *  2. sem nome digitado o disparo SAI com o título sugerido (público + assunto)
 *     — o `mutateAsync` recebe o nome sugerido, não string vazia;
 *  3. o nome digitado continua mandando (a sugestão é só sugestão);
 *  4. sem mensagem o envio continua bloqueado (o bloco de texto não foi
 *     dispensado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// A região 01 renderiza a tabela via `@tanstack/react-virtual`, que depende de
// medições de layout que o jsdom não fornece. Mesmo dublê de
// `MultiplixView.tres-regioes.test.tsx` / `MultiplixView.lista-virtualizada.test.tsx`.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: (i: number) => number }) => {
    const size = options.estimateSize(0);
    const visible = Math.min(options.count, 25);
    return {
      getTotalSize: () => options.count * size,
      getVirtualItems: () =>
        Array.from({ length: visible }, (_, index) => ({
          index, size, start: index * size, end: (index + 1) * size, key: index, lane: 0,
        })),
      measure: () => {},
      measureElement: () => {},
    };
  },
}));

const h = vi.hoisted(() => ({
  rows: [
    {
      company_id: 'c1',
      company_name: 'Empresa A',
      ramo_atividade: 'Comércio',
      uf: 'SP',
      destino_e164: '+5511999999999',
      destino_origem: 'contato_pessoa',
      motivo_inclusao: 'cliente',
    },
  ],
  searchMutate: vi.fn(),
  createDispatch: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatchesList: () => ({ data: [], refetch: h.refetch }),
  useCreateMultiplixDispatch: () => ({ mutateAsync: h.createDispatch, isPending: false }),
}));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  useMultiplixRamos: () => ({ data: [], isLoading: false }),
  useMultiplixUfs: () => ({ data: [], isLoading: false }),
  useMultiplixSearch: () => ({
    mutate: (_vars: unknown, opts?: { onSuccess?: (rows: unknown) => void }) => {
      h.searchMutate(_vars);
      opts?.onSuccess?.(h.rows);
    },
    isPending: false,
    isError: false,
    error: null,
  }),
  useMultiplixCount: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {
    count = 0;
    limit: number | null = null;
  },
}));

vi.mock('@/components/multiplix/MultiplixMonitor', () => ({
  MultiplixMonitor: () => <div data-testid="monitor" />,
}));

import MultiplixView from '@/components/multiplix/MultiplixView';

const MENSAGEM_PLACEHOLDER = 'Olá {{empresa}}, {{saudacao}}!';

async function selecionarEmpresaA() {
  fireEvent.change(screen.getByLabelText('Buscar por nome'), { target: { value: 'a' } });
  fireEvent.click(screen.getByRole('button', { name: /buscar/i }));
  fireEvent.click(await screen.findByLabelText('Selecionar Empresa A'));
}

function escreverMensagem(valor: string) {
  fireEvent.change(screen.getByPlaceholderText(MENSAGEM_PLACEHOLDER), { target: { value: valor } });
}

function contagem() {
  return screen.getByTestId('multiplix-contagem-mensagens');
}

beforeEach(() => {
  h.createDispatch.mockReset();
  h.searchMutate.mockReset();
  h.createDispatch.mockResolvedValue({ id: 'd1', recipientCount: 1 });
});

describe('MultiplixView — conta N×M e título opcional na região 02 (F78/TL-010)', () => {
  it('mostra a conta sempre visível e acompanha seleção + composição', async () => {
    render(<MultiplixView />);

    // Sem seleção nem composição: 0 contatos × 0 blocos = 0 mensagens.
    expect(contagem()).toHaveTextContent('0 contatos × 0 blocos = 0 mensagens');

    await selecionarEmpresaA();
    expect(contagem()).toHaveTextContent('1 contato × 0 blocos = 0 mensagens');

    escreverMensagem('Convite feira 2026');
    expect(contagem()).toHaveTextContent('1 contato × 1 bloco = 1 mensagem');
  });

  it('envia SEM nomear: o disparo sai com o título sugerido (público + assunto)', async () => {
    render(<MultiplixView />);
    await selecionarEmpresaA();

    escreverMensagem('Convite feira 2026\nSegunda linha do corpo');
    fireEvent.click(screen.getByRole('button', { name: /^salvar rascunho$/i }));

    await waitFor(() => expect(h.createDispatch).toHaveBeenCalledTimes(1));
    expect(h.createDispatch.mock.calls[0][0]).toMatchObject({
      name: 'Multiplix · 1 contato · Convite feira 2026',
      messageTemplate: 'Convite feira 2026\nSegunda linha do corpo',
      companyIds: ['c1'],
      startNow: false,
    });
  });

  it('usa o título digitado quando existe (a sugestão é editável)', async () => {
    render(<MultiplixView />);
    await selecionarEmpresaA();

    fireEvent.change(screen.getByLabelText('Nome do disparo'), { target: { value: 'Feira 2027' } });
    escreverMensagem('Olá!');
    fireEvent.click(screen.getByRole('button', { name: /^salvar rascunho$/i }));

    await waitFor(() => expect(h.createDispatch).toHaveBeenCalledTimes(1));
    expect(h.createDispatch.mock.calls[0][0]).toMatchObject({
      name: 'Feira 2027',
      companyIds: ['c1'],
    });
  });

  it('mantém o envio bloqueado sem mensagem (o bloco de texto continua exigido)', async () => {
    render(<MultiplixView />);
    await selecionarEmpresaA();

    expect(screen.getByRole('button', { name: /^salvar rascunho$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^salvar e iniciar agora$/i })).toBeDisabled();
  });
});
