import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ActivityHeatmap } from '../ActivityHeatmap';

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const dadosDeTeste = [
  { date: new Date('2026-10-01'), count: 5, level: 1 as const },
  { date: new Date('2026-10-02'), count: 25, level: 2 as const },
  { date: new Date('2026-10-03'), count: 60, level: 3 as const },
];

describe('ActivityHeatmap — acessibilidade', () => {
  it('SelectTrigger do seletor de período tem aria-label acessível', () => {
    render(<ActivityHeatmap data={dadosDeTeste} />, { wrapper });
    const trigger = screen.getByLabelText('Filtrar período');
    expect(trigger).toBeInTheDocument();
  });

  it('container rolável do mapa recebe foco pelo teclado e tem nome acessível', () => {
    render(<ActivityHeatmap data={dadosDeTeste} />, { wrapper });
    const region = screen.getByRole('region', { name: /mapa de atividade/i });
    expect(region).toHaveAttribute('tabIndex', '0');
  });

  it('axe: zero violações de scrollable-region-focusable e select-name', async () => {
    const { container } = render(<ActivityHeatmap data={dadosDeTeste} />, { wrapper });
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const ids = results.violations.map((v) => v.id);
    expect(ids.filter((id) => id === 'scrollable-region-focusable')).toEqual([]);
    expect(ids.filter((id) => id === 'button-name' || id === 'select-name')).toEqual([]);
  });
});
