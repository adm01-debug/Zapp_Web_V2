import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutomationCard } from '../AutomationCard';
import type { AutomationRow } from '../useAutomations';

/**
 * Não existe motor de execução automática ligado à tabela `automations`
 * (sem edge function, cron ou trigger de banco que leia/dispare `actions`):
 * nenhuma automação dispara de verdade, seja ela marcada como ligada ou não.
 * O card não pode afirmar "Ativo" — isso leva o usuário a crer que a
 * automação está rodando. O rótulo precisa deixar claro que é apenas uma
 * configuração salva, sem execução automática real por trás.
 */

function buildAutomation(overrides: Partial<AutomationRow> = {}): AutomationRow {
  return {
    id: 'auto-1',
    name: 'Boas-vindas',
    description: 'Mensagem automática de boas-vindas',
    is_active: true,
    trigger_type: 'new_message',
    trigger_config: {},
    actions: [],
    created_by: 'u1',
    last_triggered_at: null,
    trigger_count: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const noop = () => {};

describe('AutomationCard — honestidade do status (sem motor de execução real)', () => {
  it('automação com is_active=true NÃO afirma "Ativo" (não há execução automática real)', () => {
    render(
      <AutomationCard
        automation={buildAutomation({ is_active: true })}
        onToggle={noop}
        onEdit={noop}
        onDelete={noop}
        onDuplicate={noop}
      />
    );

    expect(screen.queryByText('Ativo')).toBeNull();
    expect(screen.getByText('Configurada')).toBeTruthy();
  });

  it('automação com is_active=false NÃO afirma "Inativo" e usa rótulo consistente', () => {
    render(
      <AutomationCard
        automation={buildAutomation({ is_active: false })}
        onToggle={noop}
        onEdit={noop}
        onDelete={noop}
        onDuplicate={noop}
      />
    );

    expect(screen.queryByText('Inativo')).toBeNull();
    expect(screen.getByText('Pausada')).toBeTruthy();
  });

  it('o badge explica, no title, que a execução automática ainda não está disponível', () => {
    render(
      <AutomationCard
        automation={buildAutomation({ is_active: true })}
        onToggle={noop}
        onEdit={noop}
        onDelete={noop}
        onDuplicate={noop}
      />
    );

    expect(screen.getByText('Configurada').getAttribute('title')).toMatch(
      /execução automática ainda não está disponível/i
    );
  });
});
