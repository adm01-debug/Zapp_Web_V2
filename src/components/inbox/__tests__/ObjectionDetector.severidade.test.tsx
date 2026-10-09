import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ObjectionDetector } from '../ObjectionDetector';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// framer-motion em jsdom: passthrough (mesmo padrão de AISuggestions.ia048.test.tsx).
type AnyProps = Record<string, unknown> & { children?: ReactNode };

vi.mock('framer-motion', () => {
  const passthrough = (tag: 'div' | 'span' | 'button') =>
    ({ children, ...props }: AnyProps) => {
      const Tag = tag;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <Tag {...(props as any)}>{children}</Tag>;
    };
  return {
    motion: { div: passthrough('div'), span: passthrough('span'), button: passthrough('button') },
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

const allMessages = [
  { id: 'm1', content: 'Achei o preço acima do esperado', sender: 'contact', timestamp: new Date().toISOString() },
  { id: 'm2', content: 'Posso explicar', sender: 'agent', timestamp: new Date().toISOString() },
];
const lastMessages = ['Achei o preço acima do esperado'];

interface Objecao {
  objection: string;
  counterArgument: string;
  confidence: number;
  nivel: 'Baixo' | 'Médio' | 'Alto';
}

// Limiares do chip: >0,8 Alto · >0,5 Médio · resto Baixo (mesmos do derivePriority).
// O caso de 0,8 e o de 0,4 são as bordas: 0,8 ainda é "Médio", não "Alto".
const objecoes: Objecao[] = [
  { objection: 'Prazo de entrega', counterArgument: 'Ana, o prazo...', confidence: 0.9, nivel: 'Alto' },
  { objection: 'Frete', counterArgument: 'Ana, o frete...', confidence: 0.8, nivel: 'Médio' },
  { objection: 'Forma de pagamento', counterArgument: 'Ana, parcelamos...', confidence: 0.6, nivel: 'Médio' },
  { objection: 'Garantia', counterArgument: 'Ana, a garantia...', confidence: 0.4, nivel: 'Baixo' },
];

const respostaCom = (objs: Objecao[]) => ({
  data: { content: JSON.stringify(objs.map(({ objection, counterArgument, confidence }) => ({ objection, counterArgument, confidence }))) },
  error: null,
});

function renderDetector() {
  return render(
    <TooltipProvider>
      <ObjectionDetector
        contactId="contact-A"
        contactName="Ana"
        lastMessages={lastMessages}
        allMessages={allMessages}
      />
    </TooltipProvider>,
  );
}

async function analisar() {
  renderDetector();
  fireEvent.click(screen.getByRole('button', { name: /Detectar objeções/ }));
  await screen.findByText(objecoes[0].objection);
}

/** Cabeçalho da objeção (o <button> que abre/fecha o card) — onde vivem os chips. */
function cabecalhoDa(objection: string): HTMLElement {
  const alvo = screen.getByText(objection).closest('button');
  if (!alvo) throw new Error(`cabeçalho da objeção "${objection}" não encontrado`);
  return alvo;
}

describe('ObjectionDetector — badge de contagem e chip de severidade (ETAPA-40b/SL-064)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra um chip de severidade em cada objeção, com o nível tirado da confiança', async () => {
    invokeMock.mockResolvedValue(respostaCom(objecoes));

    await analisar();

    for (const obj of objecoes) {
      expect(within(cabecalhoDa(obj.objection)).getByText(obj.nivel)).toBeInTheDocument();
    }
    // 0,8 é a borda do "Alto": ainda é Médio.
    expect(within(cabecalhoDa('Frete')).queryByText('Alto')).not.toBeInTheDocument();
  });

  it('o chip diz a que se refere o nível (nome acessível "Severidade da objeção")', async () => {
    invokeMock.mockResolvedValue(respostaCom(objecoes));

    await analisar();

    expect(within(cabecalhoDa('Prazo de entrega')).getByTitle('Severidade da objeção: Alto')).toBeInTheDocument();
    expect(within(cabecalhoDa('Garantia')).getByTitle('Severidade da objeção: Baixo')).toBeInTheDocument();
  });

  it('não perde o que a tela já mostrava: a confiança (%) segue ao lado do chip', async () => {
    invokeMock.mockResolvedValue(respostaCom(objecoes));

    await analisar();

    const cabecalho = cabecalhoDa('Prazo de entrega');
    expect(within(cabecalho).getByText('Alto')).toBeInTheDocument();
    expect(within(cabecalho).getByText('90%')).toBeInTheDocument();
  });

  it('mantém o badge de contagem com o total de objeções detectadas', async () => {
    invokeMock.mockResolvedValue(respostaCom(objecoes));

    await analisar();

    expect(screen.getByText(String(objecoes.length))).toBeInTheDocument();
    expect(screen.getByText('Objeções detectadas')).toBeInTheDocument();
  });
});
