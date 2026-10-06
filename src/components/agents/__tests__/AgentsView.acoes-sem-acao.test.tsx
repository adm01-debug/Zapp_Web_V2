/**
 * R2-AUTH-014 (P2, item #243) — "Menus de gerenciamento de agentes possuem
 * opções clicáveis sem ação".
 *
 * O `AgentsView` renderizava o botão "Filtrar" e o menu de cada agente
 * ("Editar" / "Configurações" / "Desativar") clicáveis e SEM nenhum
 * `onClick`/`onSelect`: o controle prometia uma ação e o clique não fazia nada
 * (não abria diálogo, não filtrava, não mudava conta). A tela ainda não conduz
 * a nenhuma superfície de gerenciamento de agente com o agente escolhido — a
 * Administração → Usuários existe, mas não é alcançável a partir daqui —, então
 * a correção é apresentar os controles como INDISPONÍVEIS (desabilitados):
 * nenhuma promessa de ação que a tela não cumpre.
 *
 * Prova: o componente renderizado é o REAL (`AgentsView`); só os dados vêm de
 * um `useAgents` mockado. O menu do agente abre pelo teclado (ArrowDown), como
 * o usuário faria no trigger (`aria-haspopup="menu"`, o contrato do Radix).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { agent } = vi.hoisted(() => ({
  agent: {
    id: 'p1',
    user_id: 'u1',
    name: 'Ana Souza',
    email: 'ana@empresa.com',
    avatar_url: null,
    role: 'agent',
    job_title: null,
    department: null,
    phone: null,
    is_active: true,
    max_chats: 5,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    activeChats: 2,
    status: 'online' as const,
    queues: [],
  },
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({
    agents: [agent],
    stats: {
      onlineCount: 1,
      awayCount: 0,
      offlineCount: 0,
      totalActiveChats: 2,
      totalAgents: 1,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));

// Radix abre o menu com `scrollIntoView` no item destacado; o jsdom não implementa.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import { AgentsView } from '../AgentsView';

const MENU_LABEL = 'Ações do atendente Ana Souza';

function renderView() {
  // `ConfigurePermissionsDialog` (sempre montado, fechado) usa `useQuery`.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgentsView />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * O trigger do menu é o botão do Radix (`aria-haspopup="menu"`) — localizado pelo
 * próprio contrato de ARIA, não por classe. Abre pelo teclado (ArrowDown), como o
 * usuário faria.
 */
function abrirMenuDoAgente(): void {
  const trigger = document.querySelector('[aria-haspopup="menu"]');
  expect(trigger).not.toBeNull();
  fireEvent.keyDown(trigger as HTMLElement, { key: 'ArrowDown' });
}

describe('AgentsView — controles de gerenciamento não podem ser clicáveis sem ação (#243 / R2-AUTH-014)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('apresenta "Filtrar" como indisponível, em vez de um botão clicável e morto', () => {
    renderView();

    expect(screen.getByRole('button', { name: 'Filtrar' })).toBeDisabled();
  });

  it('menu do agente: Editar, Configurações e Desativar aparecem indisponíveis (nada de opção morta)', () => {
    renderView();

    abrirMenuDoAgente();

    for (const label of ['Editar', 'Configurações', 'Desativar']) {
      expect(screen.getByRole('menuitem', { name: label })).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('o gatilho do menu (só ícone) tem nome acessível — dá para chegar nele pelo teclado/leitor de tela', () => {
    renderView();

    expect(screen.getByRole('button', { name: MENU_LABEL })).toBeInTheDocument();
  });

  it('nada sumiu: a grade continua listando o atendente e a busca continua filtrando', () => {
    renderView();

    expect(screen.getByText('Ana Souza')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Buscar atendentes...'), { target: { value: 'zzz' } });

    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
  });
});
