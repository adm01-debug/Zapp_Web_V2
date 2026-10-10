import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToolPanel } from '../ai-tools/ToolPanel';

vi.mock('framer-motion', () => {
  const passthrough = (tag: 'div' | 'button') =>
    ({ children, ...props }: { children?: unknown; [key: string]: unknown }) => {
      const Tag = tag;
      return <Tag {...props}>{children}</Tag>;
    };
  return {
    motion: { div: passthrough('div'), button: passthrough('button') },
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children}</>,
  };
});

describe('ToolPanel — acessibilidade', () => {
  it('botão de fechar tem aria-label acessível', () => {
    render(
      <TooltipProvider>
        <ToolPanel isOpen={true} onClose={vi.fn()} icon={null} title="Teste" />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: /fechar painel/i })).toBeInTheDocument();
  });

  it('axe: sem violações de button-name', async () => {
    const { container } = render(
      <TooltipProvider>
        <ToolPanel isOpen={true} onClose={vi.fn()} icon={null} title="Teste" />
      </TooltipProvider>,
    );
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['button-name'] },
    });
    expect(results).toHaveNoViolations();
  });
});