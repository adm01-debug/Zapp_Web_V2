/**
 * Deep-link do Chat da Equipe com React Query REAL (retry: false) por trás da lista.
 *
 * O teste vizinho (`TeamChatView.deeplink.test.tsx`) dubla o hook da lista; aqui a
 * lista vem de um `useQuery` de verdade sobre um "servidor" em memória, então a
 * recarga (`refetch`) e a troca de `data` seguem a semântica real do React Query.
 *
 * Regras travadas:
 *  - notificação de conversa que não existe (nem após a recarga) NÃO tira o usuário
 *    da conversa que ele tinha aberta;
 *  - o mesmo cid notificado de novo depois de descartado recarrega a lista outra vez
 *    e abre a conversa se ela passou a existir.
 */
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => ({
  servidor: [] as Array<{ id: string; name: string }>,
  buscas: 0,
  // Espelha `enabled: !!profile` do hook real: sem perfil a lista não busca.
  perfil: true,
}));

vi.mock('@/hooks/chat/useTeamChat', () => ({
  useTeamConversations: () =>
    useQuery({
      queryKey: ['team-conversations-teste'],
      queryFn: async () => {
        h.buscas += 1;
        return h.servidor.slice();
      },
      enabled: h.perfil,
      retry: false,
    }),
}));
vi.mock('@/hooks/chat/useTeamChatNotifications', () => ({
  useActiveTeamChatConversation: () => undefined,
}));
vi.mock('../TeamConversationList', () => ({
  TeamConversationList: ({ conversations, onSelect, loading }: { conversations: Array<{ id: string }>; onSelect: (id: string) => void; loading?: boolean }) => (
    <div data-testid="lista" data-loading={loading ? 'sim' : 'nao'}>
      {conversations.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)}>{`abrir-${c.id}`}</button>
      ))}
    </div>
  ),
}));
vi.mock('../TeamChatPanel', () => ({
  TeamChatPanel: ({ conversation }: { conversation: { id: string } }) => (
    <div data-testid="painel">{conversation.id}</div>
  ),
}));
vi.mock('../TeamMemberDetails', () => ({ TeamMemberDetails: () => null }));
vi.mock('../NewConversationDialog', () => ({ NewConversationDialog: () => null }));

import { TeamChatView } from '../TeamChatView';

function cenario() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const arvore = () => (
    <QueryClientProvider client={client}>
      <TeamChatView />
    </QueryClientProvider>
  );
  const r = render(arvore());
  return { ...r, rerenderArvore: () => r.rerender(arvore()) };
}

const notificar = (cid: string) =>
  act(() => {
    window.history.pushState({}, '', `/?view=team-chat&cid=${cid}`);
    window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view: 'team-chat' } }));
  });

/** Espera a lista assentar: nenhuma busca nova por alguns ciclos. */
async function assentar() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe('TeamChatView — deep-link com React Query real', () => {
  beforeEach(() => {
    h.servidor = [{ id: B, name: 'B' }];
    h.buscas = 0;
    h.perfil = true;
    window.history.replaceState({}, '', '/?view=team-chat');
  });

  it('notificação de conversa ausente (descartada após a recarga) mantém o painel na conversa aberta', async () => {
    cenario();
    fireEvent.click(await screen.findByText(`abrir-${B}`));
    expect(screen.getByTestId('painel').textContent).toBe(B);
    const buscasAntes = h.buscas;

    notificar(A); // A não existe para o usuário
    await assentar();

    expect(h.buscas).toBe(buscasAntes + 1); // recarregou uma vez antes de descartar
    expect(screen.getByTestId('painel').textContent).toBe(B);
  });

  it('cid descartado, depois a conversa passa a existir e chega nova notificação: recarrega e abre', async () => {
    cenario();
    fireEvent.click(await screen.findByText(`abrir-${B}`));

    notificar(A);
    await assentar();
    const buscasDepoisDoDescarte = h.buscas;

    // A conversa A passa a existir no servidor, mas a lista em cache ainda não a tem.
    h.servidor = [...h.servidor, { id: A, name: 'A' }];
    notificar(A);

    await waitFor(() => expect(screen.getByTestId('painel').textContent).toBe(A));
    expect(h.buscas).toBe(buscasDepoisDoDescarte + 1);
  });

  it('?cid= aberto por URL antes do perfil carregar espera a primeira busca real e abre a conversa', async () => {
    h.servidor = [{ id: A, name: 'A' }, { id: B, name: 'B' }];
    h.perfil = false; // query desabilitada: isLoading=false, sem dados
    window.history.replaceState({}, '', `/?view=team-chat&cid=${A}`);
    const { rerenderArvore } = cenario();
    await assentar();
    expect(h.buscas).toBe(0); // não recarregou nem descartou com a lista vazia de "sem perfil"
    expect(screen.queryByTestId('painel')).toBeNull();

    h.perfil = true; // perfil chegou
    rerenderArvore();

    await waitFor(() => expect(screen.getByTestId('painel').textContent).toBe(A));
    expect(h.buscas).toBe(1);
  });

  it('perfil que nunca carrega: a lista NÃO fica presa em "carregando" (comportamento da main)', async () => {
    h.perfil = false;
    cenario();
    await assentar();
    expect(screen.getByTestId('lista').getAttribute('data-loading')).toBe('nao');
    expect(h.buscas).toBe(0);
  });
});
