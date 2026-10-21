import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AISuggestions } from '../AISuggestions';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: { suggestions: [] }, error: null })) } },
}));
vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('framer-motion', () => {
  const passthrough =
    (tag: 'div' | 'button') =>
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

const messages = [{ id: 'm1', content: 'Oi', sender: 'contact' as const, timestamp: new Date() }];

describe('AISuggestions — botão de fechar com nome acessível (A11Y-13)', () => {
  it('nomeia o botão de fechar o painel de sugestões', () => {
    render(
      <AISuggestions messages={messages} contactName="Ana" contactId="ct1" onSelectSuggestion={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle('Sugestões de IA'));
    expect(screen.getByRole('button', { name: 'Fechar sugestões' })).toBeInTheDocument();
  });
});
