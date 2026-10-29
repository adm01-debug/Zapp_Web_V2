import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CSATDashboard } from '../CSATDashboard';
import { useCSAT, type CSATStats } from '@/hooks/business/useCSAT';
import type { UseMutationResult } from '@tanstack/react-query';

vi.mock('@/hooks/business/useCSAT', () => ({
  useCSAT: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
      <div {...props}>{children}</div>,
  },
}));

const mockUseCSAT = vi.mocked(useCSAT);

const mockStats: CSATStats = {
  average: 4.2,
  total: 100,
  distribution: { 5: 50, 4: 30, 3: 10, 2: 5, 1: 5 },
  trend: 12,
};

describe('CSATDashboard', () => {
  beforeEach(() => {
    mockUseCSAT.mockReturnValue({
      stats: mockStats,
      surveys: [],
      isLoading: false,
      submitSurvey: vi.fn() as unknown as UseMutationResult<void, Error, { contact_id: string; agent_id?: string; rating: number; feedback?: string }>,
    });
  });

  it('ToggleGroup tem 3 botões de período (hoje, semana, mês)', () => {
    render(<CSATDashboard />);
    const buttons = screen.getAllByRole('radio');
    expect(buttons.length).toBe(3);
    const labels = buttons.map(b => b.textContent);
    expect(labels).toContain('Hoje');
    expect(labels).toContain('Semana');
    expect(labels).toContain('Mês');
  });

  it('barras de progresso têm aria-label com nome da nota', () => {
    render(<CSATDashboard />);
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBe(5);
    progressBars.forEach(bar => {
      expect(bar).toHaveAttribute('aria-label');
      expect(bar.getAttribute('aria-label')).toMatch(/\d+ estrelas/);
    });
  });

  it('sem violações de acessibilidade', async () => {
    const { container } = render(<CSATDashboard />);
    const resultado = await axe(container);
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });

  it('clicar no item ativo não desmarca nem quebra a tela', () => {
    render(<CSATDashboard />);
    const buttons = screen.getAllByRole('radio');
    const firstButton = buttons[0];
    firstButton.click();
    expect(firstButton).toBeInTheDocument();
    expect(screen.getByText(/Satisfação do Cliente/i)).toBeInTheDocument();
  });

  it('clicar em outro item não quebra a tela', () => {
    render(<CSATDashboard />);
    const buttons = screen.getAllByRole('radio');
    const secondButton = buttons[1];
    secondButton.click();
    expect(secondButton).toBeInTheDocument();
    expect(screen.getByText(/Satisfação do Cliente/i)).toBeInTheDocument();
  });

  it('nenhum aria-controls aponta para id inexistente', () => {
    render(<CSATDashboard />);
    const controls = document.querySelectorAll('[aria-controls]');
    controls.forEach(control => {
      const targetId = control.getAttribute('aria-controls');
      expect(document.getElementById(targetId!)).not.toBeNull();
    });
  });
});