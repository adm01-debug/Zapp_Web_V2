import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { AutomationCard } from '../AutomationCard';
import type { AutomationRow } from '../useAutomations';

function buildAutomation(overrides: Partial<AutomationRow> = {}): AutomationRow {
  return {
    id: 'a1',
    name: 'Boas-vindas',
    description: 'desc',
    is_active: true,
    trigger_type: 'new_message',
    trigger_config: {},
    actions: [],
    created_by: null,
    last_triggered_at: null,
    trigger_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as AutomationRow;
}

describe('AutomationCard — N-184 nomes acessíveis', () => {
  it('o interruptor tem nome acessível com o nome da automação e aria-checked reflete o estado', () => {
    const { rerender } = render(
      <AutomationCard
        automation={buildAutomation({ is_active: true })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    const sw = screen.getByRole('switch', { name: 'Ativar automação Boas-vindas' });
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'true');

    rerender(
      <AutomationCard
        automation={buildAutomation({ is_active: false })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    expect(screen.getByRole('switch', { name: 'Ativar automação Boas-vindas' })).toHaveAttribute('aria-checked', 'false');
  });

  it('o card mostra o nome da automação e há botão com nome acessível incluindo o nome', () => {
    render(
      <AutomationCard
        automation={buildAutomation()}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    expect(screen.getByText('Boas-vindas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar automação Boas-vindas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicar automação Boas-vindas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir automação Boas-vindas' })).toBeInTheDocument();
  });

  it('o card não tem violações de acessibilidade (axe)', async () => {
    const { container } = render(
      <AutomationCard
        automation={buildAutomation()}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('acionar o interruptor chama onToggle', () => {
    const onToggle = vi.fn();
    render(
      <AutomationCard
        automation={buildAutomation()}
        onToggle={onToggle}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Ativar automação Boas-vindas' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
