/**
 * P2 (#449) — "Notificações mobile usam lista vazia local e contador fixado em zero".
 *
 * O `MobileShell` guardava `useState<Notification[]>([])` e alimentava com essa
 * lista vazia o painel e o contador do sino; o `UnreadCount` do header vinha do
 * prop `unreadNotifications` que a página passava fixo em `0`.
 *
 * PE-31: a página passou a entregar os totais REAIS (`unreadNotifications` de
 * conversas do Chat e `teamsUnread` do Teams) — por isso este arquivo não fixa
 * mais `0` e passa a travar também os selos da barra inferior.
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
  // PE-31: o total de CONVERSAS não lidas do Chat e o do Teams vêm da página
  // (`useInboxUnreadTotal`); o contador do sino é outro número, do hook de
  // notificações. Os valores aqui são altos de propósito: qualquer selo que
  // ainda estivesse cravado em `0` apareceria como ausente.
  unreadNotifications: 3,
  teamsUnread: 2,
};

/** Selos da barra inferior (Chat/Equipe) — o botão tem o rótulo como nome acessível. */
function seloDoItem(nome: string): string | null {
  return screen.getByRole('button', { name: nome }).querySelector('span.rounded-full')?.textContent ?? null;
}

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

  it('mostra o contador real de notificações no sino, sem depender do total de conversas', () => {
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

describe('MobileShell — selos de não lidas da barra inferior (PE-31)', () => {
  it('mostra o selo do Chat e o do Teams com os totais que a página entrega', () => {
    render(<MobileShell {...props} />);

    expect(seloDoItem('Chat')).toBe('3');
    expect(seloDoItem('Equipe')).toBe('2');
  });

  it('os outros itens da barra continuam sem selo', () => {
    render(<MobileShell {...props} />);

    expect(seloDoItem('Email')).toBeNull();
    expect(seloDoItem('Contatos')).toBeNull();
    expect(seloDoItem('Mais')).toBeNull();
  });

  it('sem conversa não lida (0) nenhum dos dois itens mostra selo', () => {
    render(<MobileShell {...props} unreadNotifications={0} teamsUnread={0} />);

    expect(seloDoItem('Chat')).toBeNull();
    expect(seloDoItem('Equipe')).toBeNull();
  });

  it('acima de 99 o selo vira 99+ nos dois itens', () => {
    render(<MobileShell {...props} unreadNotifications={150} teamsUnread={120} />);

    expect(seloDoItem('Chat')).toBe('99+');
    expect(seloDoItem('Equipe')).toBe('99+');
  });
});
