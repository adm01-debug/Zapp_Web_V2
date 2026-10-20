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

describe('MobileHeader — botões do cabeçalho com 44 px no celular', () => {
  it('os 3 botões (menu, busca, notificações) têm área mínima de 44×44', () => {
    render(
      <MobileHeader
        {...baseProps}
        currentView="tasks"
        onSearchOpen={vi.fn()}
        onNotificationsOpen={vi.fn()}
      />,
    );

    const menuBtn = screen.getByRole('button', { name: 'Abrir menu' });
    const searchBtn = screen.getByRole('button', { name: 'Buscar' });
    const notifBtn = screen.getByRole('button', { name: 'Notificações' });

    expect(menuBtn).toHaveClass('w-11', 'h-11');
    expect(searchBtn).toHaveClass('w-11', 'h-11');
    expect(notifBtn).toHaveClass('w-11', 'h-11');
  });
});
