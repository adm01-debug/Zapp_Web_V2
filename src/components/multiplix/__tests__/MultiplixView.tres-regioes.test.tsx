/**
 * TL-006 / F72 — a tela Multiplix mostra as TRÊS regiões ao mesmo tempo
 * (01 PÚBLICO / 02 COMPOSIÇÃO / 03 PRÉVIA & REVISÃO) e a composição vive na
 * própria tela, não em um diálogo fechado (`MultiplixComposerDialog`).
 *
 * Vermelho antes da correção: as regiões 02 e 03 não existiam, o rodapé de
 * ações não existia e os campos de composição só apareciam dentro do diálogo
 * — que o Radix nem monta enquanto está fechado.
 *
 * Rebase em dia/2026-10-09 (TL-007): a região 01 passou a renderizar a tabela
 * via `@tanstack/react-virtual`, que depende de medições de layout que o jsdom
 * não fornece (clientHeight fica 0 sem layout real). Mesmo dublê já aceito em
 * `MultiplixView.lista-virtualizada.test.tsx` e em
 * `src/components/inbox/__tests__/VirtualizedRealtimeList.test.tsx`: delega
 * para as opções do componente (count/estimateSize) e devolve uma janela —
 * com 1-2 linhas de teste, a janela cobre todas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
    {
      company_id: 'c2',
      company_name: 'Empresa B',
      ramo_atividade: 'Indústria',
      uf: 'MG',
      destino_e164: null,
      destino_origem: 'sem_destino',
      motivo_inclusao: 'fornecedor',
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
  MultiplixMonitor: ({ dispatchId, onBack }: { dispatchId: string; onBack: () => void }) => (
    <div data-testid="monitor">
      monitor:{dispatchId}
      <button type="button" onClick={onBack}>Voltar</button>
    </div>
  ),
}));

import MultiplixView from '@/components/multiplix/MultiplixView';

/** Busca no painel 01 e marca a Empresa A. */
async function selecionarEmpresaA() {
  fireEvent.change(screen.getByLabelText('Buscar por nome'), { target: { value: 'a' } });
  fireEvent.click(screen.getByRole('button', { name: /buscar/i }));
  fireEvent.click(await screen.findByLabelText('Selecionar Empresa A'));
}

describe('MultiplixView — 3 regiões simultâneas + rodapé (TL-006)', () => {
  beforeEach(() => {
    h.createDispatch.mockReset();
    h.searchMutate.mockReset();
  });

  it('mostra as três regiões ao mesmo tempo, não uma por vez (wizard)', () => {
    render(<MultiplixView />);

    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('PÚBLICO')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('COMPOSIÇÃO')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(screen.getByText('PRÉVIA & REVISÃO')).toBeInTheDocument();
  });

  it('compõe na própria tela: os campos existem sem abrir nenhum diálogo', () => {
    render(<MultiplixView />);

    expect(screen.getByLabelText('Nome do disparo')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toBeInTheDocument();
    expect(screen.getByLabelText('Visualizar como')).toBeInTheDocument();
  });

  it('a prévia da região 03 mostra a mensagem com a empresa do destinatário', async () => {
    render(<MultiplixView />);
    await selecionarEmpresaA();

    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá {{empresa}}!' } });

    expect(screen.getByText('Olá Empresa A!')).toBeInTheDocument();
  });

  it('o rodapé cria o disparo com o texto composto na tela, abre o monitor e limpa a seleção ao voltar', async () => {
    h.createDispatch.mockResolvedValue({ id: 'd9', recipientCount: 1 });
    render(<MultiplixView />);
    await selecionarEmpresaA();
    expect(screen.getByLabelText('Selecionar Empresa A')).toBeChecked();

    fireEvent.change(screen.getByLabelText('Nome do disparo'), { target: { value: 'Convite feira' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá {{empresa}}!' } });

    fireEvent.click(screen.getByRole('button', { name: /^salvar e iniciar agora$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar agora' }));

    await waitFor(() =>
      expect(h.createDispatch).toHaveBeenCalledWith({
        name: 'Convite feira',
        messageTemplate: 'Olá {{empresa}}!',
        companyIds: ['c1'],
        startNow: true,
        confirmOverLimit: false,
      }),
    );
    expect(await screen.findByTestId('monitor')).toHaveTextContent('monitor:d9');

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByLabelText('Selecionar Empresa A')).not.toBeChecked();
  });
});
