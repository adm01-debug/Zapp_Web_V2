/**
 * TL-008 / F76 — o bloco de texto do Painel 02 (COMPOSIÇÃO).
 *
 * Vermelho antes da correção: o campo era um `<textarea>` de `rows` fixos, sem
 * contador, sem autosize e sem validar as variáveis digitadas — `{{telefone}}`
 * passava calado e um texto acima do teto do servidor ainda habilitava a
 * revisão.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

// Rebase em dia/2026-10-09 (TL-007): a região 01 passou a renderizar a tabela
// via `@tanstack/react-virtual`, que depende de medições de layout que o
// jsdom não fornece. Mesmo dublê já aceito em
// `MultiplixView.lista-virtualizada.test.tsx`/`MultiplixView.tres-regioes.test.tsx`.
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
      destino_e164: '+551****9999',
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
  MultiplixMonitor: ({ dispatchId }: { dispatchId: string }) => (
    <div data-testid="monitor">monitor:{dispatchId}</div>
  ),
}));

import MultiplixView from '@/components/multiplix/MultiplixView';

// O jsdom não calcula layout: `scrollHeight` é sempre 0. A altura medida é
// simulada em função do próprio conteúdo para provar que o autosize acompanha o
// texto e para no teto.
Object.defineProperty(window.HTMLTextAreaElement.prototype, 'scrollHeight', {
  configurable: true,
  get(this: HTMLTextAreaElement) {
    return 40 + (this.value?.length ?? 0) * 4;
  },
});

const campoMensagem = () => screen.getByLabelText('Mensagem') as HTMLTextAreaElement;
const botaoSalvarRascunho = () => screen.getByRole('button', { name: /^salvar rascunho$/i });

async function selecionarEmpresaA() {
  fireEvent.change(screen.getByLabelText('Buscar por nome'), { target: { value: 'a' } });
  fireEvent.click(screen.getByRole('button', { name: /buscar/i }));
  fireEvent.click(await screen.findByLabelText('Selecionar Empresa A'));
}

describe('MultiplixView — bloco de texto do Painel 02 (TL-008)', () => {
  beforeEach(() => {
    h.createDispatch.mockReset();
    h.searchMutate.mockReset();
  });

  it('autosize: a altura acompanha o conteúdo e para no teto do bloco', () => {
    render(<MultiplixView />);

    fireEvent.change(campoMensagem(), { target: { value: 'Olá' } });
    expect(campoMensagem().style.height).toBe('52px'); // 40 + 3*4

    fireEvent.change(campoMensagem(), { target: { value: 'a'.repeat(200) } });
    expect(campoMensagem().style.height).toBe('320px'); // 40 + 800, limitado ao teto
  });

  it('contador mostra os caracteres digitados contra o teto do servidor', () => {
    render(<MultiplixView />);

    expect(screen.getByText('0/65536 caracteres')).toBeInTheDocument();

    fireEvent.change(campoMensagem(), { target: { value: 'Olá {{empresa}}!' } });
    expect(screen.getByText('16/65536 caracteres')).toBeInTheDocument();
  });

  it('variável desconhecida acusa na hora; as conhecidas não acusam', () => {
    render(<MultiplixView />);

    fireEvent.change(campoMensagem(), { target: { value: 'Olá {{empresa}}, {{saudacao}}!' } });
    expect(screen.queryByText(/Variáveis desconhecidas/)).not.toBeInTheDocument();
    expect(campoMensagem().getAttribute('aria-invalid')).toBe('false');

    fireEvent.change(campoMensagem(), { target: { value: 'Olá {{telefone}}!' } });
    expect(screen.getByText('Variáveis desconhecidas: {{telefone}}')).toBeInTheDocument();
    expect(campoMensagem().getAttribute('aria-invalid')).toBe('true');
  });

  it('os botões de variável inserem no cursor, não no fim do texto', () => {
    render(<MultiplixView />);

    fireEvent.change(campoMensagem(), { target: { value: 'Olá !' } });
    campoMensagem().setSelectionRange(4, 4);
    fireEvent.click(screen.getByRole('button', { name: 'inserir a empresa na mensagem' }));

    expect(campoMensagem().value).toBe('Olá {{empresa}}!');
  });

  it('autosize recalcula a altura depois de inserir variável por botão', () => {
    render(<MultiplixView />);

    fireEvent.change(campoMensagem(), { target: { value: 'a' } });
    expect(campoMensagem().style.height).toBe('44px');

    campoMensagem().setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'inserir a empresa na mensagem' }));

    expect(campoMensagem().value).toBe('a{{empresa}}');
    expect(campoMensagem().style.height).toBe('88px');
  });

  it('autosize volta ao mínimo depois de limpar o texto ao salvar', async () => {
    h.createDispatch.mockResolvedValueOnce({ id: '', recipientCount: 1 });
    render(<MultiplixView />);
    await selecionarEmpresaA();
    fireEvent.change(screen.getByLabelText('Nome do disparo'), { target: { value: 'Convite feira' } });
    fireEvent.change(campoMensagem(), { target: { value: 'a'.repeat(200) } });
    expect(campoMensagem().style.height).toBe('320px');

    fireEvent.click(botaoSalvarRascunho());

    await waitFor(() => expect(campoMensagem().value).toBe(''));
    expect(campoMensagem().style.height).toBe('40px');
  });

  it('acima do limite o contador acusa e a revisão fica bloqueada', async () => {
    render(<MultiplixView />);
    await selecionarEmpresaA();
    fireEvent.change(screen.getByLabelText('Nome do disparo'), { target: { value: 'Convite feira' } });

    fireEvent.change(campoMensagem(), { target: { value: 'Olá {{empresa}}!' } });
    expect(botaoSalvarRascunho()).toBeEnabled();

    fireEvent.change(campoMensagem(), { target: { value: 'a'.repeat(65537) } });
    expect(screen.getByText('65537/65536 caracteres')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Acima do limite de 65536 caracteres');
    expect(botaoSalvarRascunho()).toBeDisabled();
    expect(screen.getByRole('button', { name: /^salvar e iniciar agora$/i })).toBeDisabled();

    fireEvent.change(campoMensagem(), { target: { value: 'Olá {{empresa}}!' } });
    expect(botaoSalvarRascunho()).toBeEnabled();
  });

  it('o bloco de texto com avisos passa nas regras estruturais do axe', async () => {
    const { container } = render(<MultiplixView />);

    fireEvent.change(campoMensagem(), { target: { value: 'Olá {{telefone}}!' } });

    expect(await axe(container)).toHaveNoViolations();
  });
});
