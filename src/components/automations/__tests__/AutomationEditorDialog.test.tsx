import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// R2-MOD-002 (#99): salvar uma automação existente substituía `trigger_config`
// (condições) por `{}` e a lista de `actions` por uma única ação incompleta.
// Estes testes pinam o contrato: renomear preserva a configuração que a UI não
// edita, e cada tipo de ação valida os parâmetros obrigatórios.

const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}));

import { AutomationEditorDialog } from '../AutomationEditorDialog';
import type { AutomationRow } from '../useAutomations';

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

describe('AutomationEditorDialog (R2-MOD-002)', () => {
  beforeEach(() => {
    mockToast.error.mockReset();
    mockToast.success.mockReset();
  });

  it('renomear preserva trigger_config e todas as ações existentes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const automation = buildAutomation({
      trigger_type: 'keyword',
      trigger_config: { keywords: ['oi', 'olá'], match: 'any' },
      actions: [
        { type: 'send_message', config: { message: 'Olá!', delay_seconds: 3 } },
        { type: 'add_tag', config: { tag_id: 'tag-1' } },
      ],
    });

    render(<AutomationEditorDialog open onOpenChange={vi.fn()} automation={automation} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText('Ex: Boas-vindas Automáticas'), {
      target: { value: 'Boas-vindas v2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Partial<AutomationRow>;

    expect(payload.name).toBe('Boas-vindas v2');
    // condições preservadas (antes viravam {})
    expect(payload.trigger_config).toEqual({ keywords: ['oi', 'olá'], match: 'any' });
    // lista inteira de ações preservada, com os campos que a UI não edita (delay_seconds)
    expect(payload.actions).toEqual([
      { type: 'send_message', config: { message: 'Olá!', delay_seconds: 3 } },
      { type: 'add_tag', config: { tag_id: 'tag-1' } },
    ]);
  });

  it('preserva os parâmetros de um tipo cuja configuração a UI não edita', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const automation = buildAutomation({
      actions: [{ type: 'assign_agent', config: { agent_id: 'agent-9' } }],
    });

    render(<AutomationEditorDialog open onOpenChange={vi.fn()} automation={automation} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Partial<AutomationRow>;

    expect(payload.actions).toEqual([{ type: 'assign_agent', config: { agent_id: 'agent-9' } }]);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('bloqueia salvar um tipo cujo parâmetro obrigatório está ausente', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const automation = buildAutomation({
      // configuração incompleta persistida: add_tag sem tag_id
      actions: [{ type: 'add_tag', config: {} }],
    });

    render(<AutomationEditorDialog open onOpenChange={onOpenChange} automation={automation} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('recarrega o formulário ao abrir outra automação, sem herdar estado', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const primeira = buildAutomation({
      id: 'a1',
      name: 'Primeira',
      actions: [{ type: 'send_message', config: { message: 'um' } }],
    });
    const segunda = buildAutomation({
      id: 'b2',
      name: 'Segunda',
      actions: [{ type: 'send_message', config: { message: 'dois' } }],
    });

    const { rerender } = render(
      <AutomationEditorDialog open onOpenChange={vi.fn()} automation={primeira} onSave={onSave} />,
    );
    const campoNome = () => screen.getByPlaceholderText('Ex: Boas-vindas Automáticas') as HTMLInputElement;
    expect(campoNome().value).toBe('Primeira');

    rerender(<AutomationEditorDialog open onOpenChange={vi.fn()} automation={segunda} onSave={onSave} />);
    expect(campoNome().value).toBe('Segunda');
    expect((screen.getByPlaceholderText('Digite a mensagem automática...') as HTMLInputElement).value).toBe('dois');
  });
});
