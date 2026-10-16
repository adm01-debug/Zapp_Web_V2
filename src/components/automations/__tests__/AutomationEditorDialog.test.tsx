import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

// R2-MOD-001 (item 98): o editor de automações reutilizava o estado do registro
// anterior. O `AutomationsManager` mantém o `AutomationEditorDialog` SEMPRE
// montado (só troca a prop `automation` e o `open`), então qualquer estado
// inicializado por `useState(valorInicial)` na montagem ficava preso no primeiro
// registro aberto. Estes testes reproduzem a troca de registro via `rerender`
// — exatamente o que o manager faz ao abrir outro card.
//
// R2-MOD-002 (#99): salvar uma automação existente substituía `trigger_config`
// (condições) por `{}` e a lista de `actions` por uma única ação incompleta.
// Estes testes pinam o contrato: renomear preserva a configuração que a UI não
// edita, `send_notification` mantém `message`, e a troca de tipo não arrasta
// configuração obsoleta para o novo tipo.

const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

// O Radix Select não responde a `fireEvent` no jsdom, então este mock deixa cada
// Select publicar o próprio `onValueChange` por contexto e transforma cada
// SelectItem num botão que o dispara — é o que permite TROCAR o tipo de ação.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const SelectContext = React.createContext<(value: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" data-value={value} onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
  };
});

import { AutomationEditorDialog } from '../AutomationEditorDialog';
import type { AutomationRow } from '../useAutomations';

const NOTE_NAME = 'Ex: Boas-vindas Automáticas';
const NOTE_MSG = 'Digite a mensagem automática...';

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

function renderDialog(automation: AutomationRow | null, onSave = vi.fn(async () => {}), open = true) {
  return render(
    <AutomationEditorDialog open={open} onOpenChange={vi.fn()} automation={automation} onSave={onSave} />
  );
}

describe('AutomationEditorDialog — estado por registro (R2-MOD-001)', () => {
  const rowA = buildAutomation({
    id: 'auto-a',
    name: 'Automacao A',
    description: 'descricao A',
    actions: [{ type: 'send_message', config: { message: 'mensagem A' } }],
  });
  const rowB = buildAutomation({
    id: 'auto-b',
    name: 'Automacao B',
    description: 'descricao B',
    actions: [{ type: 'send_message', config: { message: 'mensagem B' } }],
  });

  it('mostra os dados do registro aberto', () => {
    renderDialog(rowA);
    expect((screen.getByPlaceholderText(NOTE_NAME) as HTMLInputElement).value).toBe('Automacao A');
    expect((screen.getByPlaceholderText(NOTE_MSG) as HTMLInputElement).value).toBe('mensagem A');
  });

  it('ao trocar de registro (mesmo componente montado), não reaproveita o estado do anterior', () => {
    const { rerender } = renderDialog(rowA);
    expect((screen.getByPlaceholderText(NOTE_NAME) as HTMLInputElement).value).toBe('Automacao A');

    // O manager troca a prop `automation` sem desmontar o diálogo.
    rerender(
      <AutomationEditorDialog open onOpenChange={vi.fn()} automation={rowB} onSave={vi.fn(async () => {})} />
    );

    expect((screen.getByPlaceholderText(NOTE_NAME) as HTMLInputElement).value).toBe('Automacao B');
    expect((screen.getByPlaceholderText(NOTE_MSG) as HTMLInputElement).value).toBe('mensagem B');
  });

  it('ao abrir "Nova Automação" depois de editar um registro, começa vazio', () => {
    const { rerender } = renderDialog(rowA);

    // Fecha (open=false) e reabre sem registro selecionado.
    rerender(
      <AutomationEditorDialog open={false} onOpenChange={vi.fn()} automation={rowA} onSave={vi.fn(async () => {})} />
    );
    rerender(
      <AutomationEditorDialog open onOpenChange={vi.fn()} automation={null} onSave={vi.fn(async () => {})} />
    );

    expect((screen.getByPlaceholderText(NOTE_NAME) as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText(NOTE_MSG) as HTMLInputElement).value).toBe('');
  });
});

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

    renderDialog(automation, onSave);

    fireEvent.change(screen.getByPlaceholderText(NOTE_NAME), { target: { value: 'Boas-vindas v2' } });
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

    renderDialog(automation, onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Partial<AutomationRow>;

    expect(payload.actions).toEqual([{ type: 'assign_agent', config: { agent_id: 'agent-9' } }]);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('#99: renomear e salvar uma automação send_notification preserva config.message intacto', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const automation = buildAutomation({
      name: 'Avisar equipe',
      trigger_config: { channel: 'internal' },
      // send_notification também exige `message`; antes ele era apagado no save
      // e a validação bloqueava salvar/renomear esse tipo.
      actions: [{ type: 'send_notification', config: { message: 'Novo lead chegou', priority: 'high' } }],
    });

    renderDialog(automation, onSave);

    fireEvent.change(screen.getByPlaceholderText(NOTE_NAME), { target: { value: 'Avisar equipe v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Partial<AutomationRow>;

    expect(payload.name).toBe('Avisar equipe v2');
    expect(payload.actions).toEqual([
      { type: 'send_notification', config: { message: 'Novo lead chegou', priority: 'high' } },
    ]);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('#99: troca send_notification → send_message salva pelo diálogo só chaves compatíveis', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const automation = buildAutomation({
      actions: [{
        type: 'send_notification',
        config: { message: 'Novo lead chegou', priority: 'high', delay_seconds: 5 },
      }],
    });

    renderDialog(automation, onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Mensagem' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Partial<AutomationRow>;

    expect(payload.actions).toEqual([
      { type: 'send_message', config: { message: 'Novo lead chegou', delay_seconds: 5 } },
    ]);
  });

  it('#99: troca add_tag → assign_agent chega ao onSave, remove tag_id e preserva chaves desconhecidas', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const automation = buildAutomation({
      actions: [{
        type: 'add_tag',
        config: { tag_id: 'tag-1', delay_seconds: 5, team_id: 'team-2', strategy: 'round_robin' },
      }],
    });

    renderDialog(automation, onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Atribuir Agente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Partial<AutomationRow>;

    expect(payload.actions).toEqual([
      {
        type: 'assign_agent',
        config: { delay_seconds: 5, team_id: 'team-2', strategy: 'round_robin' },
      },
    ]);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('#99: nova automação "Enviar Notificação" coleta a mensagem em vez de salvar ação vazia', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog(null, onSave);

    // O tipo é oferecido no seletor; o editor tem de oferecer o campo da chave
    // `message`, que ACTION_CONFIG_OWNERS declara válida para send_notification.
    fireEvent.change(screen.getByPlaceholderText(NOTE_NAME), { target: { value: 'Avisar equipe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Notificação' }));
    fireEvent.change(screen.getByPlaceholderText(NOTE_MSG), { target: { value: 'Novo lead chegou' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Partial<AutomationRow>;

    expect(payload.actions).toEqual([
      { type: 'send_notification', config: { message: 'Novo lead chegou' } },
    ]);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('#99: editar a mensagem de uma notificação existente chega ao onSave sem perder os outros parâmetros', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const automation = buildAutomation({
      actions: [{ type: 'send_notification', config: { message: 'Antigo', priority: 'high' } }],
    });

    renderDialog(automation, onSave);

    fireEvent.change(screen.getByPlaceholderText(NOTE_MSG), { target: { value: 'Novo texto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Partial<AutomationRow>;

    expect(payload.actions).toEqual([
      { type: 'send_notification', config: { message: 'Novo texto', priority: 'high' } },
    ]);
  });
});
