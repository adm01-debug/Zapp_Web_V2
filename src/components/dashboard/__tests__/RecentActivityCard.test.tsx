import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentActivityCard } from '../overview/RecentActivityCard';

describe('RecentActivityCard', () => {
  it('sem itens, mostra "Sem atividade hoje"', () => {
    render(<RecentActivityCard items={[]} />);
    expect(screen.getByText('Sem atividade hoje')).toBeInTheDocument();
  });

  it('renderiza até 4 linhas com nome, texto e avatar', () => {
    const items = [
      { id: '1', actorName: 'João Silva', actorAvatarUrl: null, text: 'Assumiu conversa com Maria', createdAt: new Date().toISOString() },
      { id: '2', actorName: 'Maria Costa', actorAvatarUrl: null, text: 'Liberou conversa', createdAt: new Date().toISOString() },
    ];
    render(<RecentActivityCard items={items} />);
    expect(screen.getAllByTestId('activity-row')).toHaveLength(2);
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('Assumiu conversa com Maria')).toBeInTheDocument();
  });
});
