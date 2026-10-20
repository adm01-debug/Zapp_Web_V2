/**
 * P2 (#449) — "Notificações mobile usam lista vazia local e contador fixado em zero".
 *
 * O `MobileShell` guardava `useState<Notification[]>([])` e alimentava com essa
 * lista vazia o painel e o contador do sino; o `UnreadCount` do header vinha do
 * prop `unreadNotifications` que a página passa fixo em `0`.
 *
 * O teste renderiza o `MobileShell` REAL (com o `MobileHeader`, o
 * `NotificationsPanel` e o `NotificationItem` reais) e só troca a fonte de dados
 * — o hook de notificações, que é de outra área. O que ele prova é a ligação da
 * tela com essa fonte: a lista aparece, o contador do sino e o do painel mostram
 * o número real de não lidas, "Marcar todas como lidas" chama o hook e o clique
 * num item chama `markAsRead`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Notification } from '@/hooks/system/useNotifications';

const fonteNotificacoes = vi.hoisted(() => ({
  notifications: [] as unknown[],
  unreadCount: 0,
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  loading: false,
}));

vi.mock('@/hooks/system/useNotifications', () => ({
  useNotifications: () => fonteNotificacoes,
}));

// Fora do defeito e do escopo: o drawer monta `useAuth`/react-query. O shell em
// teste continua real.
vi.mock('@/components/mobile/MobileDrawerMenu', () => ({
  MobileDrawerMenu: () => null,
}));

import { MobileShell } from '@/components/mobile/MobileShell';

function notificacao(over: Partial<Notification> & { id: string }): Notification {
  return {
    user_id: 'user-1',
    title: 'Notificação',
    message: 'Mensagem',
    type: 'info',
    is_read: false,
    metadata: {},
    created_at: '2026-10-06T12:00:00.000Z',
    read_at: null,
    ...over,
  };
}

const NAO_LIDA_CONVERSA = notificacao({
  id: 'n-1',
  title: 'Nova conversa atribuída',
  message: 'Ana começou uma conversa com você',
  type: 'info',
});

const NAO_LIDA_TAREFA = notificacao({
  id: 'n-2',
  title: 'Tarefa concluída',
  message: 'O lembrete de orçamento foi concluído',
  type: 'success',
  read_at: null,
});

const props = {
  currentView: 'inbox',
  setCurrentView: vi.fn(),
  profile: { name: 'Ana Agente', avatar_url: null },
  userEmail: 'ana@promobrindes.com',
  signOut: vi.fn(),
  // A página (`src/pages/Index.tsx`) passa este prop fixo em 0: é o contador de
  // CONVERSAS não lidas, não o de notificações.
  unreadNotifications: 0,
};

function abrirPainel() {
  fireEvent.click(screen.getByRole('button', { name: /^Notificações$/ }));
}

beforeEach(() => {
  fonteNotificacoes.notifications = [NAO_LIDA_CONVERSA, NAO_LIDA_TAREFA];
  fonteNotificacoes.unreadCount = 2;
  fonteNotificacoes.markAsRead.mockClear();
  fonteNotificacoes.markAllAsRead.mockClear();
});

describe('MobileShell — central de notificações', () => {
  it('mostra a lista real de notificações no painel', async () => {
    render(<MobileShell {...props} />);

    abrirPainel();

    expect(await screen.findByText('Nova conversa atribuída')).toBeInTheDocument();
    expect(screen.getByText('Ana começou uma conversa com você')).toBeInTheDocument();
    expect(screen.getByText('Tarefa concluída')).toBeInTheDocument();
    expect(screen.queryByText('Tudo em dia!')).not.toBeInTheDocument();
  });

  it('mostra o contador real de não lidas no sino, apesar do unreadNotifications=0', () => {
    render(<MobileShell {...props} />);

    const sino = screen.getByRole('button', { name: /^Notificações$/ });
    expect(sino).toHaveTextContent('2');
  });

  it('mostra o mesmo contador no painel aberto', async () => {
    render(<MobileShell {...props} />);

    abrirPainel();

    expect(await screen.findByText('Nova conversa atribuída')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar todas como lidas' })).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('"Marcar todas como lidas" persiste pelo hook (não só no estado local)', async () => {
    render(<MobileShell {...props} />);

    abrirPainel();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }));

    expect(fonteNotificacoes.markAllAsRead).toHaveBeenCalledTimes(1);
  });

  it('clicar numa notificação marca ela como lida no hook', async () => {
    render(<MobileShell {...props} />);

    abrirPainel();
    fireEvent.click(await screen.findByText('Nova conversa atribuída'));

    expect(fonteNotificacoes.markAsRead).toHaveBeenCalledWith('n-1');
  });

  it('mantém o estado vazio quando não há notificação', async () => {
    fonteNotificacoes.notifications = [];
    fonteNotificacoes.unreadCount = 0;

    render(<MobileShell {...props} />);

    abrirPainel();

    expect(await screen.findByText('Tudo em dia!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).not.toBeInTheDocument();
  });
});
