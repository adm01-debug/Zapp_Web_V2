import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AISuggestions } from '../AISuggestions';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('framer-motion', () => {
  const passthrough = (tag: 'div' | 'span' | 'button') =>
    ({ children, ...props }: { children?: unknown; [key: string]: unknown }) => {
      const Tag = tag;
      return <Tag {...props}>{children}</Tag>;
    };
  return {
    motion: { div: passthrough('div'), span: passthrough('span'), button: passthrough('button') },
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children}</>,
  };
});

const messages = [
  { id: 'm1', content: 'Hello', sender: 'agent' as const, timestamp: new Date().toISOString() },
  { id: 'm2', content: 'Hi', sender: 'contact' as const, timestamp: new Date().toISOString() },
];

describe('AISuggestions — acessibilidade', () => {
  it('botão de abertura tem title acessível', () => {
    invokeMock.mockResolvedValue({ data: { suggestions: [] }, error: null });

    render(
      <TooltipProvider>
        <AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByTitle('Sugestões de IA')).toBeInTheDocument();
  });

  it('axe: sem violações de button-name no painel fechado', async () => {
    invokeMock.mockResolvedValue({ data: { suggestions: [] }, error: null });

    const { container } = render(
      <TooltipProvider>
        <AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />
      </TooltipProvider>,
    );

    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['button-name'] },
    });
    expect(results).toHaveNoViolations();
  });

  it('axe: sem violações de button-name no painel aberto', async () => {
    invokeMock.mockResolvedValue({ data: { suggestions: [{ type: 'direct' as const, text: 'Sugestão', emoji: '✨', source: null }] }, error: null });

    const { container } = render(
      <TooltipProvider>
        <AISuggestions messages={messages} contactName="Ana" contactId="contact-A" onSelectSuggestion={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTitle('Sugestões de IA'));

    await new Promise(resolve => setTimeout(resolve, 50));

    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['button-name'] },
    });
    expect(results).toHaveNoViolations();
  });
});