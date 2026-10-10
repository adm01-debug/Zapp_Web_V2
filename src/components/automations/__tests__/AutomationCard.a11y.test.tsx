import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AutomationRow } from '../useAutomations';
import { AutomationCard } from '../AutomationCard';

function buildAutomation(overrides: Partial<AutomationRow>): AutomationRow {
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

describe('AutomationCard — nomes acessíveis', () => {
  it('o interruptor de ativação tem aria-label "Ativar automação"', () => {
    render(
      <AutomationCard
        automation={buildAutomation()}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />
    );
    expect(screen.getByRole('switch', { name: 'Ativar automação' })).toBeInTheDocument();
  });

  it('o interruptor sem aria-label não existe (controle sem nome acessível)', () => {
    render(
      <AutomationCard
        automation={buildAutomation()}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />
    );
    expect(screen.queryByRole('switch', { name: '' })).not.toBeInTheDocument();
  });
});