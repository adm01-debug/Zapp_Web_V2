import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc, mockToast, mockFrom } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
  mockFrom: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc, from: mockFrom },
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: React.ReactNode }) => (
    <div><button type="button" onClick={() => onValueChange('resolved')}>Escolher motivo</button>{children}</div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SelectTrigger: ({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <div role="combobox" aria-label={ariaLabel}>{children}</div>
  ),
  SelectValue: () => null,
}));

import { axe } from 'vitest-axe';
import { CloseConversationDialog } from '../CloseConversationDialog';

const CONTACT_ID = '50000000-0000-0000-0000-000000000001';

/** Estado real do contato lido pela tela (contacts.conversation_status). */
function mockConversationStatus(status: string | null, error: unknown = null) {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          error
            ? { data: null, error }
            : { data: status === null ? null : { conversation_status: status }, error: null },
      }),
    }),
  }));
}

function erroComCodigo(codigo: string, mensagem: string) {
  return Object.assign(new Error(mensagem), { code: codigo });
}

function renderDialog(props: Partial<React.ComponentProps<typeof CloseConversationDialog>> = {}) {
  return render(
    <CloseConversationDialog open onOpenChange={vi.fn()} contactId={CONTACT_ID} {...props} />,
  );
}

beforeEach(() => {
  mockRpc.mockReset();
  mockToast.error.mockReset();
  mockToast.success.mockReset();
  mockFrom.mockReset();
});

describe('CloseConversationDialog — ações válidas por estado', () => {
  it('estado open: oferece Encerrar e Arquivar, não oferece Reabrir', async () => {
    mockConversationStatus('open');
    renderDialog();

    expect(await screen.findByRole('button', { name: 'Encerrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desarquivar / Reabrir' })).not.toBeInTheDocument();
    expect(screen.getByText('Estado atual: Aberto')).toBeInTheDocument();
  });

  it('estado waiting: oferece Encerrar e Reabrir, não oferece Arquivar', async () => {
    mockConversationStatus('waiting');
    renderDialog();

    expect(await screen.findByRole('button', { name: 'Encerrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desarquivar / Reabrir' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.getByText('Estado atual: Aguardando')).toBeInTheDocument();
  });

  it('estado resolved: oferece Reabrir e Arquivar, não oferece Encerrar', async () => {
    mockConversationStatus('resolved');
    renderDialog();

    expect(await screen.findByRole('button', { name: 'Desarquivar / Reabrir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encerrar' })).not.toBeInTheDocument();
    expect(screen.getByText('Estado atual: Resolvido')).toBeInTheDocument();
  });

  it('estado archived: oferece só Reabrir', async () => {
    mockConversationStatus('archived');
    renderDialog();

    expect(await screen.findByRole('button', { name: 'Desarquivar / Reabrir' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encerrar' })).not.toBeInTheDocument();
    expect(screen.getByText('Estado atual: Arquivado')).toBeInTheDocument();
  });

  it('não inventa ação quando o estado não pôde ser lido: avisa e oferece tentar de novo', async () => {
    mockConversationStatus(null, new Error('sem permissão de leitura'));
    renderDialog();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível verificar o estado da conversa.',
    );
    expect(screen.queryByRole('button', { name: 'Encerrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desarquivar / Reabrir' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});

describe('CloseConversationDialog — ações', () => {
  it('reuses its idempotency key after a lost RPC response', async () => {
    mockConversationStatus('open');
    mockRpc
      .mockResolvedValueOnce({ data: null, error: new Error('response lost') })
      .mockResolvedValueOnce({ data: [{ conversation_status: 'resolved' }], error: null });

    renderDialog();

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));

    expect(mockRpc.mock.calls[0][0]).toBe('close_conversation_atomic');
    expect(mockRpc.mock.calls[0][1].p_client_request_id)
      .toBe(mockRpc.mock.calls[1][1].p_client_request_id);
  });

  it('arquiva a conversa via set_conversation_status com p_next archived e avisa a lista', async () => {
    mockRpc.mockReset();
    mockToast.error.mockReset();
    mockToast.success.mockReset();
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const onOpenChange = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <CloseConversationDialog
        open
        onOpenChange={onOpenChange}
        contactId="50000000-0000-0000-0000-000000000001"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));

    expect(mockRpc).toHaveBeenCalledWith(
      'set_conversation_status',
      expect.objectContaining({
        p_contact_id: '50000000-0000-0000-0000-000000000001',
        p_next: 'archived',
        p_reason: 'resolved',
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled());
    expect(mockToast.error).not.toHaveBeenCalled();

    const changed = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event): event is CustomEvent => event instanceof CustomEvent && event.type === 'zapp:contact-status-changed');
    expect(changed?.detail).toEqual({
      contactId: '50000000-0000-0000-0000-000000000001',
      status: 'archived',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    dispatchSpy.mockRestore();
  });

  it('desarquiva/reabre a conversa via set_conversation_status com p_next open', async () => {
    mockRpc.mockReset();
    mockToast.error.mockReset();
    mockToast.success.mockReset();
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId="50000000-0000-0000-0000-000000000002"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar / Reabrir' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));

    expect(mockRpc).toHaveBeenCalledWith(
      'set_conversation_status',
      expect.objectContaining({
        p_contact_id: '50000000-0000-0000-0000-000000000002',
        p_next: 'open',
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled());

    const changed = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event): event is CustomEvent => event instanceof CustomEvent && event.type === 'zapp:contact-status-changed');
    expect(changed?.detail).toEqual({
      contactId: '50000000-0000-0000-0000-000000000002',
      status: 'open',
    });
    dispatchSpy.mockRestore();
  });

  it('mostra erro e mantém o diálogo aberto quando a RPC de arquivar falha', async () => {
    mockRpc.mockReset();
    mockToast.error.mockReset();
    mockToast.success.mockReset();
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('permission denied') });
    const onOpenChange = vi.fn();

    render(
      <CloseConversationDialog
        open
        onOpenChange={onOpenChange}
        contactId="50000000-0000-0000-0000-000000000003"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());

    expect(mockToast.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('CloseConversationDialog — acessibilidade (N-044)', () => {
  it('comboboxes de motivo, resultado e destino têm nome acessível', () => {
    render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId="50000000-0000-0000-0000-000000000001"
      />,
    );

    const comboboxes = screen.getAllByRole('combobox', { name: /motivo|resultado|destino/i });
    expect(comboboxes).toHaveLength(3);
    // O terceiro seletor tem rótulo visível "Classificação": o nome acessível
    // precisa conter esse texto (WCAG 2.5.3 label-in-name), senão quem usa
    // comando de voz não consegue acionar o campo pelo nome que enxerga.
    expect(screen.getByRole('combobox', { name: /classificação/i })).toBeInTheDocument();
  });

  it('axe aria-input-field-name sem violações no diálogo de encerramento', async () => {
    const { container } = render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId="50000000-0000-0000-0000-000000000001"
      />,
    );

    const results = await axe(container, { runOnly: { type: 'rule', values: ['aria-input-field-name'] } });
    expect(results).toHaveNoViolations();
  });
});
