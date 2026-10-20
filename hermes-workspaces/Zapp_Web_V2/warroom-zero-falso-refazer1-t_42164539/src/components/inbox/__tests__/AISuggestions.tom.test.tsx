import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
];

const oneSuggestion = (text: string) => ([
  { type: 'direct' as const, text, emoji: '✓', source: null },
]);

/** Uma chamada bem-sucedida do endpoint com a sugestão pedida. */
const resolveWith = (text: string) => ({ data: { suggestions: oneSuggestion(text) }, error: null });

/** O corpo que o componente mandou na enésima chamada (0 = primeira). */
const bodyOf = (call: number) =>
  invokeMock.mock.calls[call]?.[1]?.body as { context?: string; messages?: unknown[] } | undefined;

describe('AISuggestions — chips de tom (SL-063)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra os 4 chips de tom (Mais formal/casual/curta/detalhada) junto da sugestão', async () => {
    invokeMock.mockResolvedValue(resolveWith('Resposta base'));

    render(<AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Sugestões de IA'));

    expect(await screen.findByText(/Resposta base/)).toBeInTheDocument();
    for (const label of ['Mais formal', 'Mais casual', 'Mais curta', 'Mais detalhada']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('clicar em "Mais formal" REGENERA a sugestão pelo endpoint, com o tom no pedido', async () => {
    invokeMock
      .mockResolvedValueOnce(resolveWith('Resposta base'))
      .mockResolvedValueOnce(resolveWith('Resposta formal'));

    render(<AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    await screen.findByText(/Resposta base/);

    fireEvent.click(screen.getByRole('button', { name: 'Mais formal' }));

    // Regenerou de verdade: uma segunda chamada ao endpoint, com o tom no campo
    // que o handler injeta no prompt (`context`) — não é reescrita local na tela.
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)?.context).toMatch(/formal/i);
    expect(bodyOf(1)?.messages).toHaveLength(1);

    // E a tela passa a mostrar a sugestão regenerada, não a antiga.
    expect(await screen.findByText(/Resposta formal/)).toBeInTheDocument();
    expect(screen.queryByText(/Resposta base/)).not.toBeInTheDocument();
  });

  it('o chip usado fica marcado e clicar nele de novo volta à sugestão sem tom', async () => {
    invokeMock
      .mockResolvedValueOnce(resolveWith('Resposta base'))
      .mockResolvedValueOnce(resolveWith('Resposta curta'))
      .mockResolvedValueOnce(resolveWith('Resposta neutra'));

    render(<AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    await screen.findByText(/Resposta base/);

    const chipCurta = screen.getByRole('button', { name: 'Mais curta' });
    expect(chipCurta).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chipCurta);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)?.context).toMatch(/curto|curta/i);
    expect(screen.getByRole('button', { name: 'Mais curta' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Mais curta' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3));
    expect(bodyOf(2)?.context).toBeUndefined();
    expect(await screen.findByText(/Resposta neutra/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mais curta' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('trocar de contato descarta a sugestão E o tom escolhido', async () => {
    invokeMock.mockResolvedValue(resolveWith('Resposta base'));

    const { rerender } = render(
      <AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    await screen.findByText(/Resposta base/);

    fireEvent.click(screen.getByRole('button', { name: 'Mais casual' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));

    rerender(<AISuggestions messages={messages} contactName="Bruno" contactId="contact-B" onSelectSuggestion={vi.fn()} />);

    // O painel segue aberto, porém sem sugestão nem chip ativo do contato anterior.
    await waitFor(() => expect(screen.queryByText(/Resposta base/)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Mais casual' })).not.toBeInTheDocument();

    // E a próxima geração do contato novo NÃO carrega o tom do contato antigo.
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3));
    expect(bodyOf(2)?.context).toBeUndefined();
  });

  it('tom que falhou não fica grudado: a próxima geração do mesmo contato sai sem tom', async () => {
    invokeMock
      .mockResolvedValueOnce(resolveWith('Resposta base'))
      .mockResolvedValueOnce({ data: null, error: new Error('falha na IA') })
      .mockResolvedValueOnce(resolveWith('Resposta nova'));

    render(<AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    await screen.findByText(/Resposta base/);

    fireEvent.click(screen.getByRole('button', { name: 'Mais formal' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)?.context).toMatch(/formal/i);

    // A falha fecha o painel; ao reabrir, o tom que falhou não volta marcado.
    await waitFor(() => expect(screen.queryByText(/Resposta base/)).not.toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3));
    expect(bodyOf(2)?.context).toBeUndefined();
    expect(await screen.findByText(/Resposta nova/)).toBeInTheDocument();
  });
});
