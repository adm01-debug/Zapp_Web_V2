import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AISuggestions } from '../AISuggestions';

const invokeMock = vi.hoisted(() => vi.fn());
const toastFn = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: toastFn }) }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };

vi.mock('framer-motion', () => {
  const passthrough = (tag: 'div' | 'button') =>
    ({ children, ...props }: AnyProps) => {
      const Tag = tag;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <Tag {...(props as any)}>{children}</Tag>;
    };
  return {
    motion: { div: passthrough('div'), button: passthrough('button') },
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

const messages = [
  { id: 'm1', content: 'Oi, tenho interesse', sender: 'contact' as const, timestamp: new Date() },
  { id: 'm2', content: 'Claro, posso ajudar', sender: 'agent' as const, timestamp: new Date() },
];

const suggestionFor = (contactName: string) => ([
  { type: 'direct' as const, text: `Sugestão do contato ${contactName}`, emoji: '✨', source: null },
]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe('AISuggestions — resposta não sobrevive à troca de contato (IA-048)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra as sugestões quando o contato não muda durante a requisição', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    render(
      <AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle('Sugestões de IA'));

    await act(async () => {
      pending.resolve({ data: { suggestions: suggestionFor('Ana') }, error: null });
    });

    expect(await screen.findByText(/Sugestão do contato Ana/)).toBeInTheDocument();
  });

  it('DESCARTA sugestões em voo ao trocar de contato (não vazam para o rascunho do novo)', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    const { rerender } = render(
      <AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    // Contato trocado com a promessa ainda pendente.
    rerender(
      <AISuggestions messages={messages} contactName="Bruno" contactId="contact-B" onSelectSuggestion={vi.fn()} />,
    );

    await act(async () => {
      pending.resolve({ data: { suggestions: suggestionFor('Ana') }, error: null });
    });

    expect(screen.queryByText(/Sugestão do contato Ana/)).not.toBeInTheDocument();
    // O painel segue aberto, porém vazio: nada de "Usar" com texto do contato anterior.
    expect(screen.getByText('Copilot IA')).toBeInTheDocument();
    expect(screen.getByText('Clique para gerar sugestões')).toBeInTheDocument();
  });

  it('NÃO descarta por mensagem viva: novas mensagens no mesmo contato mantêm a requisição', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    const { rerender } = render(
      <AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    rerender(
      <AISuggestions
        messages={[...messages, { id: 'm3', content: 'nova', sender: 'contact' as const, timestamp: new Date() }]}
        contactName="Ana"
        contactId="contact-A"
        onSelectSuggestion={vi.fn()}
      />,
    );

    await act(async () => {
      pending.resolve({ data: { suggestions: suggestionFor('Ana') }, error: null });
    });

    expect(await screen.findByText(/Sugestão do contato Ana/)).toBeInTheDocument();
  });
});
