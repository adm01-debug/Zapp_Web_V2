import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockRpc, mockToast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
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
    mockToast.error.mockReset();
    mockToast.success.mockReset();
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
  });

  it('axe button-name sem violações no diálogo de encerramento', async () => {
    const { container } = render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId="50000000-0000-0000-0000-000000000001"
      />,
    );

    const results = await axe(container, { runOnly: { type: 'rule', values: ['button-name'] } });
    expect(results).toHaveNoViolations();
  });
});
