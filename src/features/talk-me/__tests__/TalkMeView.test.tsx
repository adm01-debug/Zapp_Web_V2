import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { TalkMeQueueController } from '../useTalkMeQueue';
import type { TalkMeWaitingContact } from '../types';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { TalkMeView } from '../TalkMeView';

const first: TalkMeWaitingContact = {
  contactId: 'contact-1',
  name: 'Ana Compras',
  avatarUrl: null,
  company: 'Acme',
  jobTitle: 'Compradora',
  queueId: 'queue-1',
  queueName: 'Comercial',
  queueColor: '#2563eb',
  waitingSince: '2026-09-30T12:00:00.000Z',
  pendingMessageCount: 2,
  lastMessageId: 'message-1',
  lastMessageContent: 'Preciso de cem caixas',
  lastMessageType: 'text',
  lastMessageMediaUrl: null,
  lastMessageCaption: null,
  lastMessageAt: '2026-09-30T12:05:00.000Z',
  totalCount: 2,
  position: 1,
};

const second: TalkMeWaitingContact = {
  ...first,
  contactId: 'contact-2',
  name: 'Bruno Financeiro',
  company: null,
  jobTitle: null,
  lastMessageId: 'message-2',
  lastMessageContent: '',
  lastMessageType: 'audio',
  pendingMessageCount: 1,
  waitingSince: '2026-09-30T12:10:00.000Z',
  lastMessageAt: '2026-09-30T12:10:00.000Z',
  position: 2,
};

function controller(overrides: Partial<TalkMeQueueController> = {}): TalkMeQueueController {
  return {
    queues: [{ queueId: 'queue-1', name: 'Comercial', color: '#2563eb', waitingCount: 2, oldestWaitingAt: first.waitingSince }],
    selectedQueue: { queueId: 'queue-1', name: 'Comercial', color: '#2563eb', waitingCount: 2, oldestWaitingAt: first.waitingSince },
    selectedQueueId: 'queue-1',
    setSelectedQueueId: vi.fn(),
    items: [first, second],
    search: '',
    setSearch: vi.fn(),
    queuesLoading: false,
    itemsLoading: false,
    loadingMore: false,
    claimingContactId: null,
    queuesError: null,
    itemsError: null,
    searchPending: false,
    totalCount: 2,
    hasMore: false,
    loadMore: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    claim: vi.fn(async (contactId: string) => ({
      contactId,
      queueId: 'queue-1',
      assignedTo: 'profile-1',
      conversationStatus: 'open',
      claimedAt: '2026-09-30T12:20:00.000Z',
    })),
    ...overrides,
  };
}

function renderView(ctrl = controller(), onAccepted = vi.fn(async () => undefined)) {
  const onOpenChange = vi.fn();
  render(
    <TooltipProvider>
      <TalkMeView open onOpenChange={onOpenChange} controller={ctrl} onAccepted={onAccepted} />
    </TooltipProvider>,
  );
  return { ctrl, onAccepted, onOpenChange };
}

describe('TalkMeView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra os dados reais e mantém o atendimento mais antigo selecionado', () => {
    renderView();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Compradora')).toBeInTheDocument();
    expect(screen.getByText('Preciso de cem caixas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ana Compras' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('2 mensagens aguardando resposta')).toBeInTheDocument();
  });

  it('navega manualmente sem autoplay e oferece fallback para áudio e cadastro incompleto', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo atendimento' }));

    expect(screen.getByRole('button', { name: 'Bruno Financeiro' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('Empresa não informada')).toBeInTheDocument();
    expect(screen.getByText('Cargo não informado')).toBeInTheDocument();
    expect(screen.getByText('Mensagem de áudio')).toBeInTheDocument();
  });

  it('aceita uma única identidade e só abre o chat depois da confirmação do servidor', async () => {
    const onAccepted = vi.fn(async () => undefined);
    const ctrl = controller();
    const { onOpenChange } = renderView(ctrl, onAccepted);

    fireEvent.click(screen.getByRole('button', { name: 'Aceitar e conversar' }));
    await waitFor(() => expect(ctrl.claim).toHaveBeenCalledWith('contact-1'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAccepted).toHaveBeenCalledWith('contact-1');
    expect(toast.success).toHaveBeenCalled();
  });

  it('distingue fila vazia de falha de consulta', () => {
    const { rerender } = render(
      <TooltipProvider>
        <TalkMeView open onOpenChange={vi.fn()} controller={controller({ items: [], totalCount: 0 })} onAccepted={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByText('Tudo em dia')).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <TalkMeView open onOpenChange={vi.fn()} controller={controller({ items: [], totalCount: 0, itemsError: 'Falha controlada' })} onAccepted={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Fila temporariamente indisponível');
    expect(screen.getByText('Falha controlada')).toBeInTheDocument();
  });

  it('envia busca ao controlador sem consultar apenas os cartões já carregados', () => {
    const ctrl = controller();
    renderView(ctrl);
    fireEvent.change(screen.getByLabelText('Buscar na fila TALK ME'), { target: { value: 'Acme' } });
    expect(ctrl.setSearch).toHaveBeenCalledWith('Acme');
  });

  it('move a seleção e o foco juntos ao navegar pelo cartão com o teclado', async () => {
    renderView();
    const ana = screen.getByRole('button', { name: 'Ana Compras' });
    ana.focus();

    fireEvent.keyDown(ana, { key: 'ArrowRight' });

    const bruno = await screen.findByRole('button', { name: 'Bruno Financeiro' });
    await waitFor(() => expect(bruno).toHaveFocus());
    expect(bruno).toHaveAttribute('aria-current', 'true');
    expect(bruno).toHaveAccessibleDescription(/Empresa não informada[\s\S]*Cargo não informado[\s\S]*Mensagem de áudio/);
  });

  it('não usa as setas do seletor de departamento para mover o carrossel', () => {
    renderView();
    const department = screen.getByRole('combobox', { name: 'Departamento' });
    department.focus();
    fireEvent.keyDown(department, { key: 'ArrowRight' });

    expect(screen.getByRole('button', { name: 'Ana Compras' })).toHaveAttribute('aria-current', 'true');
  });

  it('bloqueia o aceite enquanto a busca nova ainda não foi reconciliada', () => {
    renderView(controller({ search: 'novo termo', searchPending: true }));
    expect(screen.queryByRole('button', { name: 'Aceitar e conversar' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Carregando atendimentos' })).toBeInTheDocument();
  });
});
