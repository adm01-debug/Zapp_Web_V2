import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileHeader } from '@/components/mobile/MobileHeader';

const baseProps = {
  onMenuOpen: vi.fn(),
  agentName: 'Ana Souza',
};

describe('MobileHeader — rótulo da view no cabeçalho mobile', () => {
  it('mostra "Tarefas" quando a view é tasks', () => {
    render(<MobileHeader {...baseProps} currentView="tasks" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tarefas');
  });

  it('continua rotulando a view pipeline legada (fallback do id)', () => {
    render(<MobileHeader {...baseProps} currentView="pipeline" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pipeline');
  });
});
