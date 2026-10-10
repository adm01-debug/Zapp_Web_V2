import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    loadMoreError: null,
    reconciling: false,
    searchPending: false,
    totalCount: 2,
    hasMore: false,
    loadMore: vi.fn(async () => false),
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
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollBy = vi.fn();
  });

  it('mostra os dados reais e mantém o atendimento mais antigo selecionado', () => {
    renderView();
    const activeCard = screen.getByRole('button', { name: 'Ana Compras' });
    expect(within(activeCard).getByText('Acme')).toBeInTheDocument();
    expect(within(activeCard).getByText('Compradora')).toBeInTheDocument();
    expect(within(activeCard).getByText('Preciso de cem caixas')).toBeInTheDocument();
    expect(activeCard).toHaveAttribute('tabindex', '0');
    expect(within(activeCard).getByText('2 mensagens aguardando resposta')).toBeInTheDocument();
    const queueCard = screen.getByRole('button', { name: 'Selecionar Ana Compras' });
    expect(queueCard).toHaveAttribute('aria-pressed', 'true');
    expect(queueCard).toHaveAccessibleDescription(/Empresa: Acme[\s\S]*Cargo: Compradora[\s\S]*Última mensagem: Preciso de cem caixas/);
    const fallback = activeCard.querySelector('.bg-zinc-950.text-white');
    expect(fallback).toHaveTextContent('AC');
  });

  it('navega manualmente sem autoplay e oferece fallback para áudio e cadastro incompleto', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo atendimento' }));

    const activeCard = screen.getByRole('button', { name: 'Bruno Financeiro' });
    expect(activeCard).toHaveAttribute('tabindex', '0');
    expect(within(activeCard).getByText('Empresa não informada')).toBeInTheDocument();
    expect(within(activeCard).getByText('Cargo não informado')).toBeInTheDocument();
    expect(within(activeCard).getByText('Mensagem de áudio')).toBeInTheDocument();
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

  it('move a seleção e o foco juntos ao navegar pela faixa inferior com o teclado', async () => {
    renderView();
    const ana = screen.getByRole('button', { name: 'Selecionar Ana Compras' });
    ana.focus();

    fireEvent.keyDown(ana, { key: 'ArrowRight' });

    const bruno = screen.getByRole('button', { name: 'Selecionar Bruno Financeiro' });
    await waitFor(() => expect(bruno).toHaveFocus());
    expect(bruno).toHaveAttribute('aria-pressed', 'true');
    expect(bruno).toHaveAccessibleDescription(/Empresa: Empresa não informada[\s\S]*Cargo: Cargo não informado[\s\S]*Última mensagem: Mensagem de áudio/);
  });

  it('não usa as setas de busca, departamento ou ações para mover o carrossel', () => {
    renderView();
    const controls = [
      screen.getByRole('combobox', { name: 'Departamento' }),
      screen.getByRole('textbox', { name: 'Buscar na fila TALK ME' }),
      screen.getByRole('button', { name: 'Atualizar fila' }),
      screen.getByRole('button', { name: 'Aceitar e conversar' }),
    ];

    for (const control of controls) {
      control.focus();
      fireEvent.keyDown(control, { key: 'ArrowRight' });
      fireEvent.keyDown(control, { key: 'ArrowLeft' });
    }

    expect(screen.getByRole('button', { name: 'Ana Compras' })).toHaveAttribute('aria-current', 'true');
  });

  it('bloqueia o aceite enquanto a busca nova ainda não foi reconciliada', () => {
    renderView(controller({ search: 'novo termo', searchPending: true }));
    expect(screen.queryByRole('button', { name: 'Aceitar e conversar' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Carregando atendimentos' })).toBeInTheDocument();
  });

  it('sincroniza a seleção da faixa inferior com o cartão principal sem aceitar o contato', () => {
    const ctrl = controller();
    renderView(ctrl);

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bruno Financeiro' }));

    expect(screen.getByRole('button', { name: 'Bruno Financeiro' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Selecionar Bruno Financeiro' })).toHaveAttribute('aria-pressed', 'true');
    expect(ctrl.claim).not.toHaveBeenCalled();
  });

  it('aceita exatamente o contato selecionado na faixa inferior', async () => {
    const ctrl = controller();
    renderView(ctrl);

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bruno Financeiro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar e conversar' }));

    await waitFor(() => expect(ctrl.claim).toHaveBeenCalledWith('contact-2'));
    expect(ctrl.claim).not.toHaveBeenCalledWith('contact-1');
  });

  it('seleciona o próximo contato disponível quando o atual sai da fila', async () => {
    const { rerender } = render(
      <TooltipProvider>
        <TalkMeView open onOpenChange={vi.fn()} controller={controller()} onAccepted={vi.fn()} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bruno Financeiro' }));
    const bruno = screen.getByRole('button', { name: 'Bruno Financeiro' });
    bruno.focus();

    rerender(
      <TooltipProvider>
        <TalkMeView
          open
          onOpenChange={vi.fn()}
          controller={controller({ items: [first], totalCount: 1, hasMore: false })}
          onAccepted={vi.fn()}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ana Compras' })).toHaveAttribute('aria-current', 'true'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ana Compras' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Selecionar Ana Compras' })).toHaveAttribute('aria-pressed', 'true');
    expect(toast.info).toHaveBeenCalledWith('O atendimento anterior saiu da fila. Exibimos o próximo disponível.');
  });

  it('congela seleção e navegação enquanto o aceite está em andamento', () => {
    renderView(controller({ claimingContactId: 'contact-1' }));

    expect(screen.getByRole('button', { name: 'Atendimento anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próximo atendimento' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Selecionar Bruno Financeiro' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Assumindo…' })).toBeDisabled();
  });

  it('desloca a faixa inferior sem alterar o contato pronto para aceite', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Ver próximos contatos na fila' }));

    expect(HTMLElement.prototype.scrollBy).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ana Compras' })).toHaveAttribute('aria-current', 'true');
  });

  it('permite arrastar a faixa sem selecionar o cartão sob o ponteiro', () => {
    renderView();
    const viewport = screen.getByLabelText('Contatos aguardando atendimento');

    fireEvent.pointerDown(viewport, { pointerId: 1, isPrimary: true, clientX: 240, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 1, isPrimary: true, clientX: 120, clientY: 104 });
    fireEvent.pointerUp(viewport, { pointerId: 1, isPrimary: true, clientX: 120, clientY: 104 });
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bruno Financeiro' }));

    expect(viewport.scrollLeft).toBe(120);
    expect(screen.getByRole('button', { name: 'Ana Compras' })).toHaveAttribute('aria-current', 'true');
  });

  it('carrega a página seguinte quando o usuário avança além do último cartão carregado', () => {
    const loadMore = vi.fn(async () => false);
    renderView(controller({ items: [first], totalCount: 51, hasMore: true, loadMore }));

    fireEvent.click(screen.getByRole('button', { name: 'Próximo atendimento' }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('conclui a intenção de avanço quando o próximo cartão chega pela paginação', async () => {
    function PaginatedHarness() {
      const [items, setItems] = useState([first]);
      const loadMore = vi.fn(async () => {
        setItems([first, second]);
        return true;
      });
      return (
        <TooltipProvider>
          <TalkMeView
            open
            onOpenChange={vi.fn()}
            controller={controller({ items, totalCount: 2, hasMore: items.length < 2, loadMore })}
            onAccepted={vi.fn()}
          />
        </TooltipProvider>
      );
    }
    render(<PaginatedHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Próximo atendimento' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bruno Financeiro' })).toHaveAttribute('aria-current', 'true'));
  });

  it('mantém a fila visível e permite repetir quando apenas a próxima página falha', () => {
    const loadMore = vi.fn(async () => true);
    renderView(controller({ loadMoreError: 'Não foi possível carregar mais atendimentos.', loadMore }));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar mais atendimentos.');
    expect(screen.getByRole('button', { name: 'Ana Compras' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});
