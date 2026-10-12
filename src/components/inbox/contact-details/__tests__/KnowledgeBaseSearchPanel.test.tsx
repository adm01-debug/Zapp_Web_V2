import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Accordion } from '@/components/ui/accordion';
import { KnowledgeBaseSearchPanel } from '../KnowledgeBaseSearchPanel';
import { KB_SECTION_VALUE } from '../knowledgeBaseText';

/**
 * Base de Conhecimento nos detalhes do contato.
 *
 * O hook `useKnowledgeBaseSearch` NÃO é mockado: o teste dirige a tela de verdade
 * (espera de 300 ms, mínimo de 2 letras, RPC `search_knowledge_base` só com
 * artigos publicados no banco) e mocka apenas o cliente Supabase, como manda a
 * guarda de rede da suíte.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, warning: mocks.toastWarning },
}));

const ARTIGOS = [
  {
    id: 'art-1',
    title: 'Contrato de serviço',
    content: 'O contrato de serviço é enviado por e-mail depois da assinatura.\nEm caso de dúvida, fale com o time comercial.',
    category: 'Comercial',
    tags: ['contrato'],
    rank: 0.9,
  },
  {
    id: 'art-2',
    title: 'Prazo de entrega',
    content: 'O prazo de entrega é de 7 dias úteis.',
    category: 'Logística',
    tags: [],
    rank: 0.4,
  },
];

function renderPainel(props: Parameters<typeof KnowledgeBaseSearchPanel>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Accordion type="multiple" defaultValue={[KB_SECTION_VALUE]}>
        <KnowledgeBaseSearchPanel {...props} />
      </Accordion>
    </QueryClientProvider>,
  );
}

const campoBusca = () => screen.getByLabelText('Buscar na base de conhecimento');

const digitar = (valor: string) => fireEvent.change(campoBusca(), { target: { value: valor } });

/** Espera passar o debounce de 300 ms do hook (com folga para o microtask do react-query). */
const passarDebounce = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: ARTIGOS, error: null });
});

describe('KnowledgeBaseSearchPanel — consulta', () => {
  it('com uma letra não busca e explica o mínimo', async () => {
    renderPainel();
    digitar('c');
    await passarDebounce();

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.getByTestId('kb-dica')).toHaveTextContent('Digite ao menos 2 letras');
  });

  it('espera os 300 ms antes de chamar a RPC e então lista título e trecho com o termo realçado', async () => {
    renderPainel();
    digitar('contrato');

    // Ainda dentro do debounce: nada foi para a RPC.
    expect(mocks.rpc).not.toHaveBeenCalled();

    await passarDebounce();

    expect(mocks.rpc).toHaveBeenCalledWith('search_knowledge_base', {
      search_query: 'contrato',
      max_results: 5,
    });
    expect(await screen.findByRole('button', { name: 'Ler o artigo: Contrato de serviço' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ler o artigo: Prazo de entrega' })).toBeInTheDocument();
    expect(document.querySelectorAll('mark').length).toBeGreaterThan(0);
  });

  it('sem resultado publicado mostra o vazio explicativo', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    renderPainel();
    digitar('contrato');
    await passarDebounce();

    expect(await screen.findByTestId('sidebar-empty-kb-sem-resultado')).toHaveTextContent('Nenhum artigo publicado');
  });

  it('carrega em esqueleto de brilho enquanto a busca não volta', async () => {
    mocks.rpc.mockReturnValue(new Promise(() => {}));
    renderPainel();
    digitar('contrato');
    await passarDebounce();

    const carregando = await screen.findByTestId('kb-carregando');
    expect(carregando.querySelectorAll('[data-testid="shimmer-skeleton"]').length).toBeGreaterThan(0);
  });

  it('o botão de limpar esvazia a busca e some com os resultados', async () => {
    renderPainel();
    digitar('contrato');
    await passarDebounce();
    expect(await screen.findByRole('button', { name: 'Ler o artigo: Contrato de serviço' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Limpar busca'));
    expect(campoBusca()).toHaveValue('');
    expect(screen.queryByTestId('kb-resultado')).not.toBeInTheDocument();
  });
});

describe('KnowledgeBaseSearchPanel — leitura do artigo', () => {
  it('abre o artigo com o conteúdo completo e fecha no Esc', async () => {
    renderPainel();
    digitar('contrato');
    await passarDebounce();
    fireEvent.click(await screen.findByRole('button', { name: 'Ler o artigo: Contrato de serviço' }));

    // O painel de leitura entra depois da saída da lista (AnimatePresence mode="wait").
    const leitura = await screen.findByTestId('kb-leitura');
    expect(leitura).toHaveTextContent('O contrato de serviço é enviado por e-mail depois da assinatura.');
    expect(leitura).toHaveTextContent('Em caso de dúvida, fale com o time comercial.');

    fireEvent.keyDown(leitura, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('kb-leitura')).not.toBeInTheDocument());
  });
});

describe('KnowledgeBaseSearchPanel — inserir no texto', () => {
  it('entrega o corpo do artigo ao compositor, avisa e não envia nada', async () => {
    const onInsertText = vi.fn().mockReturnValue(true);
    renderPainel({ onInsertText });
    digitar('contrato');
    await passarDebounce();

    const chamadasAntes = mocks.rpc.mock.calls.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Inserir no texto: Prazo de entrega' }));

    expect(onInsertText).toHaveBeenCalledWith('O prazo de entrega é de 7 dias úteis.');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Trecho inserido no rascunho.');
    // Inserir no rascunho não é enviar: nenhuma chamada nova ao banco.
    expect(mocks.rpc.mock.calls.length).toBe(chamadasAntes);
    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });

  it('quando não há compositor escutando, avisa em vez de fingir que inseriu', async () => {
    const onInsertText = vi.fn().mockReturnValue(false);
    renderPainel({ onInsertText });
    digitar('contrato');
    await passarDebounce();
    fireEvent.click(await screen.findByRole('button', { name: 'Ler o artigo: Contrato de serviço' }));

    fireEvent.click(screen.getByRole('button', { name: 'Inserir no texto: Contrato de serviço' }));

    expect(mocks.toastWarning).toHaveBeenCalledWith('Não foi possível inserir o trecho no rascunho agora.');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    // A leitura continua aberta para o atendente tentar de novo.
    expect(await screen.findByTestId('kb-leitura')).toBeInTheDocument();
  });
});
