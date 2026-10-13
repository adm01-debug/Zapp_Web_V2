/**
 * Cartão: reabrir/desarquivar conversa na LINHA da lista (Zapp Web V2).
 *
 * Prova, na linha REAL (VirtualizedRealtimeList), que:
 * 1) Resolvida/arquivada oferece Reabrir/Desarquivar; conversa ativa NÃO oferece.
 * 2) A ação passa por confirmação leve e só então chama o handler (que fala com a
 *    RPC reopen_conversation no hook — aqui só o contrato da linha é provado).
 * 3) O estado de espera bloqueia o segundo clique.
 *
 * O virtualizer é mockado (jsdom não mede layout) e o AlertDialog é mockado pelo
 * mesmo motivo dos outros diálogos Radix no repositório: o estado de `open` do
 * Radix não é confiável sob fireEvent — o componente ConversationReopenDialog é
 * REAL, só a casca Radix é substituída.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode, ComponentProps } from 'react';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { AgentLite } from '@/hooks/crm/useAgentsLite';

const mocks = vi.hoisted(() => ({ useApplicableSLA: vi.fn() }));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number }) => ({
    getTotalSize: () => options.count * 80,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({ index, size: 80, start: index * 80, key: index })),
    measure: vi.fn(),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-1' }, profile: { id: 'profile-1' } }),
}));

vi.mock('@/hooks/crm/useAgentsLite', () => ({ useAgentsLite: () => new Map<string, AgentLite>() }));
vi.mock('@/hooks/ui/useDensity', () => ({ useDensity: () => ({ density: 'comfortable' }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/sla/useApplicableSLA', () => ({ useApplicableSLA: mocks.useApplicableSLA }));
vi.mock('@/components/inbox/SLAIndicator', () => ({ SLAIndicator: () => null }));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div role="alertdialog">{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => (
    <button type="button" disabled={disabled}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, disabled }: { children: ReactNode; onClick?: (e: React.MouseEvent) => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

import { VirtualizedRealtimeList } from '@/components/inbox/VirtualizedRealtimeList';

function makeConversation(status: string | null, id = 'contact-1'): ConversationWithMessages {
  return {
    contact: {
      id,
      name: 'Cliente Teste',
      channel_type: null,
      assigned_to: null,
      tags: [],
      ai_priority: null,
      ai_sentiment: null,
      contact_type: null,
      company: null,
      avatar_url: null,
      created_at: '2026-10-13T10:00:00Z',
      updated_at: '2026-10-13T10:00:00Z',
      conversation_status: status,
    } as unknown as ConversationWithMessages['contact'],
    messages: [],
    unreadCount: 0,
    lastMessage: null,
  };
}

function renderList(
  conversations: ConversationWithMessages[],
  extraProps: Partial<ComponentProps<typeof VirtualizedRealtimeList>> = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VirtualizedRealtimeList
        conversations={conversations}
        selectedContactId={null}
        onSelectConversation={vi.fn()}
        {...extraProps}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.useApplicableSLA.mockReturnValue({
    data: { firstResponseMinutes: 5, resolutionMinutes: 60, ruleName: 'Padrão do Sistema', ruleId: null },
  });
});

describe('VirtualizedRealtimeList — reabrir/desarquivar na linha', () => {
  it('resolvida oferece "Reabrir conversa" e arquivada oferece "Desarquivar conversa"', () => {
    renderList([makeConversation('resolved', 'res-1'), makeConversation('archived', 'arc-1')], {
      onReopen: vi.fn(),
    });

    expect(screen.getByLabelText('Reabrir conversa')).toBeInTheDocument();
    expect(screen.getByLabelText('Desarquivar conversa')).toBeInTheDocument();
  });

  it('conversa ativa (open/waiting) não oferece reabertura', () => {
    renderList([makeConversation('open', 'open-1'), makeConversation('waiting', 'wait-1')], {
      onReopen: vi.fn(),
    });

    expect(screen.queryByLabelText('Reabrir conversa')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Desarquivar conversa')).not.toBeInTheDocument();
  });

  it('sem handler (lista usada sem ações) a reabertura não aparece', () => {
    renderList([makeConversation('resolved', 'res-2')]);

    expect(screen.queryByLabelText('Reabrir conversa')).not.toBeInTheDocument();
  });

  it('desarquivar pede confirmação e só então chama o handler com o contato da linha', async () => {
    const onReopen = vi.fn().mockResolvedValue(undefined);
    renderList([makeConversation('archived', 'arc-9')], { onReopen });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Desarquivar conversa'));
    expect(onReopen).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Desarquivar conversa?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar' }));

    await waitFor(() => expect(onReopen).toHaveBeenCalledWith('arc-9'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('estado de espera bloqueia o segundo clique até a RPC responder', async () => {
    let resolver: (() => void) | undefined;
    const onReopen = vi.fn(() => new Promise<void>((resolve) => { resolver = resolve; }));
    renderList([makeConversation('resolved', 'res-9')], { onReopen });

    fireEvent.click(screen.getByLabelText('Reabrir conversa'));
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(onReopen).toHaveBeenCalledTimes(1));
    const confirmar = screen.getByRole('button', { name: 'Reabrir' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.click(confirmar);
    expect(onReopen).toHaveBeenCalledTimes(1);

    resolver?.();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('falha da RPC mantém o diálogo aberto com o motivo', async () => {
    const onReopen = vi.fn().mockRejectedValue(new Error('boom'));
    renderList([makeConversation('resolved', 'res-err')], { onReopen });

    fireEvent.click(screen.getByLabelText('Reabrir conversa'));
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
