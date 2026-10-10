import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ObjectionDetector } from '../ObjectionDetector';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
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

const allMessages = [
  { id: 'm1', content: 'Achei o preço acima do esperado', sender: 'contact', timestamp: new Date().toISOString() },
  { id: 'm2', content: 'Posso explicar', sender: 'agent', timestamp: new Date().toISOString() },
];
const lastMessages = ['Achei o preço acima do esperado'];

describe('ObjectionDetector — acessibilidade', () => {
  it('componente renderiza sem erros', () => {
    render(
      <TooltipProvider>
        <ObjectionDetector contactId="test" lastMessages={lastMessages} allMessages={allMessages} />
      </TooltipProvider>,
    );
    expect(screen.getByText(/detectar objeções/i)).toBeInTheDocument();
  });

  it('axe: sem violações de button-name', async () => {
    const { container } = render(
      <TooltipProvider>
        <ObjectionDetector contactId="test" lastMessages={lastMessages} allMessages={allMessages} />
      </TooltipProvider>,
    );
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['button-name'] },
    });
    expect(results).toHaveNoViolations();
  });
});