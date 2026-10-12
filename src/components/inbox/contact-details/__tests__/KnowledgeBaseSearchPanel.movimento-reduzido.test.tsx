import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Accordion } from '@/components/ui/accordion';
import { KnowledgeBaseSearchPanel } from '../KnowledgeBaseSearchPanel';
import { KB_SECTION_VALUE } from '../knowledgeBaseText';

/**
 * Movimento reduzido no painel "Base de Conhecimento".
 *
 * `useReducedMotion` do framer-motion é trocado por uma chave do teste (mesmo
 * padrão do KpiCard) porque a preferência real é lida uma única vez por módulo.
 * O `data-motion` do kit de microinterações dá a prova determinística de qual
 * caminho está ativo; no caminho reduzido, a leitura não ganha eixo X.
 */

const motion = vi.hoisted(() => ({ reduce: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => motion.reduce };
});

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn() },
}));

const ARTIGO = {
  id: 'art-1',
  title: 'Contrato de serviço',
  content: 'O contrato de serviço é enviado por e-mail depois da assinatura.',
  category: 'Comercial',
  tags: [],
  rank: 0.9,
};

function renderPainel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Accordion type="multiple" defaultValue={[KB_SECTION_VALUE]}>
        <KnowledgeBaseSearchPanel />
      </Accordion>
    </QueryClientProvider>,
  );
}

const digitar = (valor: string) =>
  fireEvent.change(screen.getByLabelText('Buscar na base de conhecimento'), { target: { value: valor } });

const passarDebounce = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [ARTIGO], error: null });
});

afterEach(() => {
  motion.reduce = false;
  cleanup();
});

describe('KnowledgeBaseSearchPanel — movimento reduzido', () => {
  it('com a preferência ligada, a espera vira bloco estático e a leitura aparece sem deslocamento', async () => {
    motion.reduce = true;
    mocks.rpc.mockReturnValue(new Promise(() => {}));
    renderPainel();
    digitar('contrato');
    await passarDebounce();

    expect(await screen.findByTestId('kb-carregando')).toHaveTextContent('Buscando artigos…');
    expect(
      screen.getByTestId('kb-carregando').querySelector('[data-motion="reduced"]'),
    ).not.toBeNull();

    mocks.rpc.mockResolvedValue({ data: [ARTIGO], error: null });
    digitar('contrato de');
    await passarDebounce();
    fireEvent.click(await screen.findByRole('button', { name: 'Ler o artigo: Contrato de serviço' }));

    const leitura = await screen.findByTestId('kb-leitura');
    expect(leitura).toHaveTextContent('O contrato de serviço é enviado por e-mail depois da assinatura.');
    expect(leitura.getAttribute('style') ?? '').not.toContain('translateX');
  });

  it('com a preferência desligada o mesmo kit se declara em movimento cheio', async () => {
    motion.reduce = false;
    mocks.rpc.mockReturnValue(new Promise(() => {}));
    renderPainel();
    digitar('contrato');
    await passarDebounce();

    expect(
      (await screen.findByTestId('kb-carregando')).querySelector('[data-motion="full"]'),
    ).not.toBeNull();
  });
});
