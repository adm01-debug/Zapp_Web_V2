import { act, render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const C = '33333333-3333-4333-8333-333333333333';

let conversas: Array<{ id: string; name: string }> = [];
let carregando = false;
vi.mock('@/hooks/chat/useTeamChat', () => ({
  useTeamConversations: () => ({ data: conversas, isLoading: carregando }),
}));
vi.mock('@/hooks/chat/useTeamChatNotifications', () => ({
  useActiveTeamChatConversation: () => undefined,
}));
vi.mock('../TeamConversationList', () => ({
  TeamConversationList: ({ conversations, onSelect }: { conversations: Array<{ id: string }>; onSelect: (id: string) => void }) => (
    <div>
      {conversations.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)}>{`abrir-${c.id}`}</button>
      ))}
    </div>
  ),
}));
vi.mock('../TeamChatPanel', () => ({
  TeamChatPanel: ({ conversation, onToggleDetails }: { conversation: { id: string }; onToggleDetails: () => void }) => (
    <div>
      <div data-testid="painel">{conversation.id}</div>
      <button onClick={onToggleDetails}>detalhes</button>
    </div>
  ),
}));
vi.mock('../TeamMemberDetails', () => ({
  TeamMemberDetails: ({ conversation }: { conversation: { id: string } }) => <div data-testid="detalhes">{conversation.id}</div>,
}));
vi.mock('../NewConversationDialog', () => ({ NewConversationDialog: () => null }));

import { TeamChatView } from '../TeamChatView';

describe('TeamChatView — deep-link ?cid=', () => {
  beforeEach(() => {
    conversas = [{ id: A, name: 'A' }, { id: B, name: 'B' }];
    carregando = false;
    window.history.replaceState({}, '', '/');
  });

  const notificar = (cid: string) => act(() => {
    window.history.pushState({}, '', `/?view=team-chat&cid=${cid}`);
    window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view: 'team-chat' } }));
  });
  const cidNaUrl = () => new URLSearchParams(window.location.search).get('cid');

  it('seleciona a conversa do ?cid= e remove o parâmetro da URL', () => {
    window.history.replaceState({}, '', `/?view=team-chat&cid=${A}`);
    render(<TeamChatView />);
    expect(screen.getByTestId('painel').textContent).toBe(A);
    expect(new URLSearchParams(window.location.search).get('cid')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('view')).toBe('team-chat');
  });

  it('recarga da lista não desfaz a conversa que o usuário escolheu depois', () => {
    window.history.replaceState({}, '', `/?view=team-chat&cid=${A}`);
    const { rerender } = render(<TeamChatView />);
    fireEvent.click(screen.getByText(`abrir-${B}`));
    expect(screen.getByTestId('painel').textContent).toBe(B);

    conversas = [...conversas]; // nova referência, como no refetch do realtime
    rerender(<TeamChatView />);
    expect(screen.getByTestId('painel').textContent).toBe(B);
  });

  it('nova notificação com a tela aberta troca para a conversa do novo ?cid=', () => {
    render(<TeamChatView />);
    act(() => {
      window.history.pushState({}, '', `/?view=team-chat&cid=${B}`);
      window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view: 'team-chat' } }));
    });
    expect(screen.getByTestId('painel').textContent).toBe(B);
    expect(new URLSearchParams(window.location.search).get('cid')).toBeNull();
  });

  it('cid que não pertence ao usuário é ignorado e sai da URL', () => {
    window.history.replaceState({}, '', '/?view=team-chat&cid=33333333-3333-4333-8333-333333333333');
    render(<TeamChatView />);
    expect(screen.queryByTestId('painel')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('cid')).toBeNull();
  });

  it('a mesma notificação duas vezes seguidas não deixa ?cid= pendurado na URL', () => {
    render(<TeamChatView />);
    notificar(A);
    notificar(A);
    expect(screen.getByTestId('painel').textContent).toBe(A);
    expect(cidNaUrl()).toBeNull();
  });

  it('cid repetido não reabre a conversa depois que o usuário trocou de conversa e remontou a tela', () => {
    const { unmount } = render(<TeamChatView />);
    notificar(A);
    notificar(A);
    fireEvent.click(screen.getByText(`abrir-${B}`));
    unmount();
    render(<TeamChatView />);
    expect(screen.queryByTestId('painel')).toBeNull();
  });

  it('enquanto a lista carrega o deep-link espera; quando ela chega com a conversa, abre', () => {
    carregando = true;
    conversas = [];
    window.history.replaceState({}, '', `/?view=team-chat&cid=${A}`);
    const { rerender } = render(<TeamChatView />);
    expect(screen.queryByTestId('painel')).toBeNull();
    carregando = false;
    conversas = [{ id: A, name: 'A' }];
    rerender(<TeamChatView />);
    expect(screen.getByTestId('painel').textContent).toBe(A);
  });

  it('lista carregada SEM a conversa do deep-link descarta o pedido: ela não abre sozinha quando surgir depois', () => {
    window.history.replaceState({}, '', `/?view=team-chat&cid=${C}`);
    const { rerender } = render(<TeamChatView />);
    expect(screen.queryByTestId('painel')).toBeNull();
    conversas = [...conversas, { id: C, name: 'C' }];
    rerender(<TeamChatView />);
    expect(screen.queryByTestId('painel')).toBeNull();
  });

  it('aplicar o deep-link fecha o painel de detalhes da conversa anterior', () => {
    render(<TeamChatView />);
    fireEvent.click(screen.getByText(`abrir-${A}`));
    fireEvent.click(screen.getByText('detalhes'));
    expect(screen.getByTestId('detalhes').textContent).toBe(A);
    notificar(B);
    expect(screen.getByTestId('painel').textContent).toBe(B);
    expect(screen.queryByTestId('detalhes')).toBeNull();
  });
});
