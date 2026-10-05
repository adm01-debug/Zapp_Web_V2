import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutomationEditorDialog } from '../AutomationEditorDialog';
import type { AutomationRow } from '../useAutomations';

// R2-MOD-001 (item 98): o editor de automações reutilizava o estado do registro
// anterior. O `AutomationsManager` mantém o `AutomationEditorDialog` SEMPRE
// montado (só troca a prop `automation` e o `open`), então qualquer estado
// inicializado por `useState(valorInicial)` na montagem ficava preso no primeiro
// registro aberto. Estes testes reproduzem a troca de registro via `rerender`
// — exatamente o que o manager faz ao abrir outro card.

const NOTE_A = 'Ex: Boas-vindas Automáticas';
const NOTE_MSG = 'Digite a mensagem automática...';

function makeRow(overrides: Partial<AutomationRow>): AutomationRow {
  return {
    id: 'id-base',
    name: 'Base',
    description: null,
    is_active: true,
    trigger_type: 'new_message',
    trigger_config: {},
    actions: [],
    created_by: null,
    last_triggered_at: null,
    trigger_count: 0,
    created_at: '2026-10-05T00:00:00Z',
    updated_at: '2026-10-05T00:00:00Z',
    ...overrides,
  };
}

const rowA = makeRow({
  id: 'auto-a',
  name: 'Automacao A',
  description: 'descricao A',
  actions: [{ type: 'send_message', config: { message: 'mensagem A' } }],
});

const rowB = makeRow({
  id: 'auto-b',
  name: 'Automacao B',
  description: 'descricao B',
  actions: [{ type: 'send_message', config: { message: 'mensagem B' } }],
});

function renderDialog(automation: AutomationRow | null, open = true) {
  return render(
    <AutomationEditorDialog
      open={open}
      onOpenChange={vi.fn()}
      automation={automation}
      onSave={vi.fn(async () => {})}
    />
  );
}

describe('AutomationEditorDialog — estado por registro (R2-MOD-001)', () => {
  it('mostra os dados do registro aberto', () => {
    renderDialog(rowA);
    expect((screen.getByPlaceholderText(NOTE_A) as HTMLInputElement).value).toBe('Automacao A');
    expect((screen.getByPlaceholderText(NOTE_MSG) as HTMLInputElement).value).toBe('mensagem A');
  });

  it('ao trocar de registro (mesmo componente montado), não reaproveita o estado do anterior', () => {
    const { rerender } = renderDialog(rowA);
    expect((screen.getByPlaceholderText(NOTE_A) as HTMLInputElement).value).toBe('Automacao A');

    // O manager troca a prop `automation` sem desmontar o diálogo.
    rerender(
      <AutomationEditorDialog
        open
        onOpenChange={vi.fn()}
        automation={rowB}
        onSave={vi.fn(async () => {})}
      />
    );

    expect((screen.getByPlaceholderText(NOTE_A) as HTMLInputElement).value).toBe('Automacao B');
    expect((screen.getByPlaceholderText(NOTE_MSG) as HTMLInputElement).value).toBe('mensagem B');
  });

  it('ao abrir "Nova Automação" depois de editar um registro, começa vazio', () => {
    const { rerender } = renderDialog(rowA);

    // Fecha (open=false) e reabre sem registro selecionado.
    rerender(
      <AutomationEditorDialog
        open={false}
        onOpenChange={vi.fn()}
        automation={rowA}
        onSave={vi.fn(async () => {})}
      />
    );
    rerender(
      <AutomationEditorDialog
        open
        onOpenChange={vi.fn()}
        automation={null}
        onSave={vi.fn(async () => {})}
      />
    );

    expect((screen.getByPlaceholderText(NOTE_A) as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText(NOTE_MSG) as HTMLInputElement).value).toBe('');
  });
});
