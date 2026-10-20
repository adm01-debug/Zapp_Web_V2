import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockRpc, mockInvoke, mockToast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockInvoke: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc, functions: { invoke: mockInvoke } },
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
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
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

describe('CloseConversationDialog', () => {
  it('reuses its idempotency key after a lost RPC response', async () => {
    mockRpc.mockReset();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ data: { sent: true }, error: null });
    mockToast.error.mockReset();
    mockToast.success.mockReset();
    mockToast.info.mockReset();
    mockRpc
      .mockResolvedValueOnce({ data: null, error: new Error('response lost') })
      .mockResolvedValueOnce({ data: [{ conversation_status: 'resolved' }], error: null });

    render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId="50000000-0000-0000-0000-000000000001"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));

    expect(mockRpc.mock.calls[0][0]).toBe('close_conversation_atomic');
    expect(mockRpc.mock.calls[0][1].p_client_request_id)
      .toBe(mockRpc.mock.calls[1][1].p_client_request_id);
    // A pesquisa só sai após o encerramento CONFIRMADO, e uma vez só.
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
  });

  it('dispara a pesquisa CSAT (csat-auto-send) ao encerrar, com contact_id e closure_id', async () => {
    mockRpc.mockReset();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ data: { sent: true }, error: null });
    mockToast.info.mockReset();
    mockRpc.mockResolvedValueOnce({
      data: [{ conversation_status: 'resolved', closure_id: '70000000-0000-0000-0000-0000000000c1' }],
      error: null,
    });

    render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId="50000000-0000-0000-0000-000000000009"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith('csat-auto-send', {
      body: {
        contact_id: '50000000-0000-0000-0000-000000000009',
        closure_id: '70000000-0000-0000-0000-0000000000c1',
      },
    });
    await waitFor(() =>
      expect(mockToast.info).toHaveBeenCalledWith('Pesquisa de satisfação enviada ao cliente'),
    );
  });

  it('não desfaz o encerramento quando a Edge de CSAT falha', async () => {
    mockRpc.mockReset();
    mockInvoke.mockReset();
    mockToast.info.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    const onOpenChange = vi.fn();
    mockInvoke.mockResolvedValue({ data: null, error: new Error('edge down') });
    mockRpc.mockResolvedValueOnce({
      data: [{ conversation_status: 'resolved', closure_id: '70000000-0000-0000-0000-0000000000c2' }],
      error: null,
    });

    render(
      <CloseConversationDialog
        open
        onOpenChange={onOpenChange}
        contactId="50000000-0000-0000-0000-000000000010"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Conversa encerrada com registro'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(mockToast.info).toHaveBeenCalledWith(
        'Conversa encerrada, mas a pesquisa de satisfação não pôde ser enviada.',
      ),
    );
    expect(mockToast.error).not.toHaveBeenCalled();
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
