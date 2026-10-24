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
  SelectTrigger: ({ children, id, 'aria-label': ariaLabel }: { children: React.ReactNode; id?: string; 'aria-label'?: string }) => (
    <div role="combobox" id={id} aria-label={ariaLabel}>{children}</div>
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

  it('arquivar pede confirmação antes de chamar a RPC', async () => {
    mockConversationStatus('open');
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const onOpenChange = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderDialog({ onOpenChange });

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar' }));

    expect(screen.getByText('Arquivar esta conversa? Ela sai da caixa de entrada e pode ser reaberta depois.'))
      .toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar arquivamento' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));

    // O motivo escolhido é o do ENCERRAMENTO: arquivar não pode registrá-lo como
    // `p_reason` (a FSM ignoraria no destino 'archived', mas seria dado enganoso).
    expect(mockRpc).toHaveBeenCalledWith(
      'set_conversation_status',
      expect.objectContaining({
        p_contact_id: CONTACT_ID,
        p_next: 'archived',
      }),
    );
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_reason');
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled());
    expect(mockToast.error).not.toHaveBeenCalled();

    const changed = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event): event is CustomEvent => event instanceof CustomEvent && event.type === 'zapp:contact-status-changed');
    expect(changed?.detail).toEqual({ contactId: CONTACT_ID, status: 'archived' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    dispatchSpy.mockRestore();
  });

  it('falha genérica ao arquivar: avisa, mantém o diálogo aberto e não anuncia sucesso', async () => {
    mockConversationStatus('open');
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('network down') });
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange });

    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar arquivamento' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(
      'Não foi possível arquivar a conversa.',
    ));
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('desarquiva/reabre a conversa via set_conversation_status com p_next open', async () => {
    mockConversationStatus('resolved');
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Desarquivar / Reabrir' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));

    expect(mockRpc).toHaveBeenCalledWith(
      'set_conversation_status',
      expect.objectContaining({
        p_contact_id: CONTACT_ID,
        p_next: 'open',
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled());

    const changed = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event): event is CustomEvent => event instanceof CustomEvent && event.type === 'zapp:contact-status-changed');
    expect(changed?.detail).toEqual({ contactId: CONTACT_ID, status: 'open' });
    dispatchSpy.mockRestore();
  });
});

describe('CloseConversationDialog — tradução do erro por código', () => {
  it('23514 (transição inválida): avisa que já foi encerrada, recarrega a lista e mantém o estado real', async () => {
    mockConversationStatus('open');
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: erroComCodigo('23514', 'invalid_transition resolved -> resolved'),
    });
    const onClosed = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderDialog({ onClosed });

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(
      'Esta conversa já foi encerrada ou mudou de estado. A lista foi atualizada.',
    ));
    expect(onClosed).toHaveBeenCalledTimes(1);

    const changed = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event): event is CustomEvent => event instanceof CustomEvent && event.type === 'zapp:contact-status-changed');
    expect(changed?.detail).toEqual({ contactId: CONTACT_ID, status: 'resolved' });
    dispatchSpy.mockRestore();
  });

  it('42501 (sem permissão): mensagem própria e diálogo aberto', async () => {
    mockConversationStatus('open');
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: erroComCodigo('42501', 'contact_not_authorized'),
    });
    const onOpenChange = vi.fn();
    const onClosed = vi.fn();

    renderDialog({ onOpenChange, onClosed });

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(
      'Você não tem permissão para alterar esta conversa.',
    ));
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('22023 (dados inválidos): pede revisão dos campos', async () => {
    mockConversationStatus('open');
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: erroComCodigo('22023', 'invalid_conversation_closure'),
    });

    renderDialog();

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(
      'Os dados informados são inválidos. Revise motivo, resultado e classificação.',
    ));
  });

  it('23505 (registro divergente): pede reabrir o diálogo', async () => {
    mockConversationStatus('open');
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: erroComCodigo('23505', 'closure_request_id_reused_with_different_payload'),
    });

    renderDialog();

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(
      'Este encerramento já foi registrado com outros dados. Reabra o diálogo e tente novamente.',
    ));
  });

  it('erro sem código conhecido cai na mensagem genérica do encerramento', async () => {
    mockConversationStatus('open');
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('response lost') });

    renderDialog();

    fireEvent.click(screen.getAllByRole('button', { name: 'Escolher motivo' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(
      'Não foi possível encerrar a conversa. Nenhuma alteração parcial foi salva.',
    ));
  });

  it('transição inválida ao arquivar também recarrega a lista', async () => {
    mockConversationStatus('open');
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: erroComCodigo('23514', 'invalid_transition resolved -> archived'),
    });
    const onClosed = vi.fn();

    renderDialog({ onClosed });

    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar arquivamento' }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(mockToast.error).toHaveBeenCalledWith(
      'Esta conversa já foi encerrada ou mudou de estado. A lista foi atualizada.',
    );
  });
});

describe('CloseConversationDialog — acessibilidade', () => {
  it('cada campo tem Label com htmlFor apontando para o id do controle', async () => {
    mockConversationStatus('open');
    renderDialog();

    const pares: [string, string][] = [
      ['Motivo do encerramento *', 'close-reason'],
      ['Resultado', 'close-outcome'],
      ['Classificação', 'close-classification'],
      ['Observações', 'close-notes'],
    ];

    await screen.findByRole('button', { name: 'Encerrar' });
    for (const [texto, id] of pares) {
      expect(screen.getByText(texto)).toHaveAttribute('for', id);
      expect(document.getElementById(id)).not.toBeNull();
    }
    // A associação vale no DOM: o label encontra o controle.
    expect(screen.getByLabelText('Observações')).toHaveAttribute('id', 'close-notes');
  });

  it('comboboxes de motivo, resultado e destino têm nome acessível', async () => {
    mockConversationStatus('open');
    renderDialog();

    await screen.findByRole('button', { name: 'Encerrar' });
    const comboboxes = screen.getAllByRole('combobox', { name: /motivo|resultado|destino/i });
    expect(comboboxes).toHaveLength(3);
    // O terceiro seletor tem rótulo visível "Classificação": o nome acessível
    // precisa conter esse texto (WCAG 2.5.3 label-in-name), senão quem usa
    // comando de voz não consegue acionar o campo pelo nome que enxerga.
    expect(screen.getByRole('combobox', { name: /classificação/i })).toBeInTheDocument();
  });

  it('axe aria-input-field-name sem violações no diálogo de encerramento', async () => {
    mockConversationStatus('open');
    const { container } = renderDialog();

    await screen.findByRole('button', { name: 'Encerrar' });
    const results = await axe(container, { runOnly: { type: 'rule', values: ['aria-input-field-name'] } });
    expect(results).toHaveNoViolations();
  });
});
