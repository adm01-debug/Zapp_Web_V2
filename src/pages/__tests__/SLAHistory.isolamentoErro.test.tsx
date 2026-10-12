/**
 * Isolamento de erro na página de Histórico de SLA.
 *
 * Comportamento portado da V3 (SectionErrorBoundary): o bloco de histórico que
 * falha mostra o aviso no lugar dele em vez de derrubar a página inteira. O
 * teste renderiza a PÁGINA real e derruba o bloco — a Sidebar tem de continuar.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('@/components/sla/SLAHistoryDashboard', () => ({
  SLAHistoryDashboard: () => {
    throw new Error('falha proposital no bloco de histórico');
  },
}));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));

import SLAHistoryPage from '@/pages/SLAHistory';

describe('SLAHistory (página) — isolamento de erro por bloco', () => {
  it('o bloco de histórico que lança erro mostra aviso e a página continua', () => {
    render(<SLAHistoryPage />);

    expect(screen.getByText('Erro em "Histórico de SLA"')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });
});
