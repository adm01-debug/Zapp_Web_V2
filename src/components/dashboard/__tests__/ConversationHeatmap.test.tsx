import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { axe } from 'vitest-axe';
import ConversationHeatmap from '../ConversationHeatmap';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
      <div {...props}>{children}</div>,
  },
}));

const mockData = [
  { day: 0, hour: 9, value: 5, count: 3 },
  { day: 0, hour: 10, value: 12, count: 8 },
  { day: 1, hour: 9, value: 3, count: 2 },
];

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

describe('ConversationHeatmap', () => {
  it('ToggleGroup tem 3 botões de métrica (volume, resposta, satisfação)', () => {
    renderWithProviders(<ConversationHeatmap data={mockData} />);
    const buttons = screen.getAllByRole('radio');
    expect(buttons.length).toBe(3);
    const labels = buttons.map(b => b.textContent);
    expect(labels).toContain('Volume');
    expect(labels).toContain('Resposta');
    expect(labels).toContain('Satisfação');
  });

  it('mapa de calor scrollável tem tabIndex=0 e nome acessível', () => {
    renderWithProviders(<ConversationHeatmap data={mockData} />);
    const scrollable = screen.getByRole('region', { name: /mapa de calor/i });
    expect(scrollable).toHaveAttribute('tabindex', '0');
  });

  it('sem violações de acessibilidade', async () => {
    const { container } = renderWithProviders(<ConversationHeatmap data={mockData} />);
    const resultado = await axe(container);
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });

  it('clicar no item ativo não desmarca nem quebra a tela', () => {
    renderWithProviders(<ConversationHeatmap data={mockData} />);
    const buttons = screen.getAllByRole('radio');
    const firstButton = buttons[0];
    firstButton.click();
    expect(screen.getByRole('region', { name: /mapa de calor/i })).toBeInTheDocument();
    expect(firstButton).toBeInTheDocument();
  });

  it('clicar em outro item não quebra a tela', () => {
    renderWithProviders(<ConversationHeatmap data={mockData} />);
    const buttons = screen.getAllByRole('radio');
    const secondButton = buttons[1];
    secondButton.click();
    expect(screen.getByRole('region', { name: /mapa de calor/i })).toBeInTheDocument();
  });

  it('nenhum aria-controls aponta para id inexistente', () => {
    renderWithProviders(<ConversationHeatmap data={mockData} />);
    const controls = document.querySelectorAll('[aria-controls]');
    controls.forEach(control => {
      const targetId = control.getAttribute('aria-controls');
      expect(document.getElementById(targetId!)).not.toBeNull();
    });
  });
});