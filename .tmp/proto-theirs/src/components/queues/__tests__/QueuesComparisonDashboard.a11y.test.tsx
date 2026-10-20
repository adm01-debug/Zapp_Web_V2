/**
 * N-085 — Botões "Voltar" e "Abrir fila" têm nome acessível.
 *
 * Prova no componente REAL (QueuesComparisonDashboard) que os dois
 * botões icon-only possuem aria-label legível por leitor de tela,
 * conforme o critério de aceite do cartão.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/queues/QueuesComparisonCharts', () => ({ QueuesComparisonCharts: () => null }));
vi.mock('@/components/queues/PeriodSelector', () => ({ PeriodSelector: () => null }));
vi.mock('@/hooks/business/useQueuesComparison', () => ({
  useQueuesComparison: () => ({
    queuesPerformance: [
      { id: 'q1', name: 'Suporte', color: '#3B82F6', totalContacts: 10, assignedContacts: 8, waitingContacts: 2, totalMessages: 50, avgMessagesPerContact: 5, agentsCount: 3 },
    ],
    loading: false,
  }),
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <QueuesComparisonDashboard />
    </MemoryRouter>,
  );
}

import { QueuesComparisonDashboard } from '../QueuesComparisonDashboard';

describe('QueuesComparisonDashboard — acessibilidade', () => {
  it('botão Voltar tem aria-label "Voltar"', () => {
    renderDashboard();
    const backButton = screen.getByRole('button', { name: 'Voltar' });
    expect(backButton).toBeInTheDocument();
  });

  it('botão de abrir fila tem aria-label que inclui o nome da fila', () => {
    renderDashboard();
    const openButton = screen.getByRole('button', { name: /Abrir fila Suporte/ });
    expect(openButton).toBeInTheDocument();
  });
});