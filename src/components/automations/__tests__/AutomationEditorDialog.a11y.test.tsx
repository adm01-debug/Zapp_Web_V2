import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { AutomationEditorDialog } from '../AutomationEditorDialog';
import type { AutomationRow } from '../useAutomations';

// N-184: os dois Select do editor (gatilho e ação) não tinham nome acessível.
// Este arquivo renderiza o `AutomationEditorDialog` REAL (Dialog e Select do
// Radix, sem mock nenhum) para provar o nome pelo papel (combobox) e o axe
// zerado no mesmo componente que roda em produção.

function buildRow(): AutomationRow {
  return {
    id: 'auto-1',
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
  } as AutomationRow;
}

function renderEditor() {
  return render(
    <AutomationEditorDialog open onOpenChange={vi.fn()} automation={buildRow()} onSave={vi.fn(async () => {})} />,
  );
}

describe('AutomationEditorDialog — N-184 nome nos seletores (componente real)', () => {
  it('os dois combobox do editor têm nome acessível pelo rótulo visível', () => {
    renderEditor();
    expect(screen.getByRole('combobox', { name: 'Gatilho (Quando executar?)' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Ação (O que fazer?)' })).toBeInTheDocument();
  });

  it('o editor (Dialog real) não tem violações de acessibilidade (axe)', async () => {
    renderEditor();
    const resultado = await axe(document.body, { rules: { region: { enabled: false } } });
    expect(resultado.violations).toEqual([]);
  });
});
