import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// t_f2a68e4c: os quatro controles sem efeito do AgentsView (`Filtrar`, `Editar`,
// `Configurações`, `Desativar`) passam a ser apresentados como indisponíveis:
// `disabled` + motivo visível/`title` no botão e `aria-disabled=true` nos itens de
// menu. A prova de que os itens não são ativáveis é o menu continuar ABERTO depois
// do clique e do Enter — um item habilitado fecha o menu ao ser selecionado.
//
// O teste monta o componente real e mocka só o hook que a tela consome
// (`@/hooks/crm/useAgents`, importado no topo do AgentsView).

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({
    agents: [
      {
        id: 'agent-1',
        user_id: 'user-1',
        name: 'Ana Souza',
        email: 'ana@empresa.com',
        avatar_url: null,
        role: 'agent',
        job_title: null,
        department: null,
        phone: null,
        is_active: true,
        max_chats: 5,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-10-06T12:00:00.000Z',
        activeChats: 2,
        status: 'online',
        queues: [],
      },
    ],
    stats: { onlineCount: 1, awayCount: 0, offlineCount: 0, totalActiveChats: 2, totalAgents: 1 },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { AgentsView } from '../AgentsView';

// PageHeader usa useNavigate/useLocation: a tela precisa de um Router.
// AgentsView compõe InviteAgentDialog/ConfigurePermissionsDialog, que usam
// react-query — daí o QueryClientProvider.
function renderAgentsView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AgentsView />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Gatilho do cartão do atendente: o Radix o marca com `aria-haspopup="menu"`.
// Localizar por esse atributo (e não pelo nome acessível, que é provado no teste 2)
// mantém as provas de clique/teclado independentes do rótulo do gatilho.
function gatilhoDoMenu() {
  const gatilho = screen
    .getAllByRole('button')
    .find((botao) => botao.getAttribute('aria-haspopup') === 'menu');
  if (!gatilho) throw new Error('gatilho do menu do atendente não encontrado');
  return gatilho;
}

function abrirMenuPorClique() {
  fireEvent.pointerDown(gatilhoDoMenu(), { button: 0, ctrlKey: false });
}

function abrirMenuPorTeclado() {
  const gatilho = gatilhoDoMenu();
  gatilho.focus();
  fireEvent.keyDown(gatilho, { key: 'Enter' });
  return gatilho;
}

const ACOES_INDISPONIVEIS = [
  { nome: /Editar/, motivo: /Editar atendente: ainda não disponível nesta tela/ },
  { nome: /Configurações/, motivo: /Configurações do atendente: ainda não disponível nesta tela/ },
  { nome: /Desativar/, motivo: /Desativar atendente: ainda não disponível nesta tela/ },
];

describe('AgentsView — controles sem efeito ficam indisponíveis', () => {
  it('o botão Filtrar fica desabilitado e diz o motivo (não parece acionável)', () => {
    renderAgentsView();

    const filtrar = screen.getByRole('button', { name: /Filtrar/ });

    expect(filtrar).toBeDisabled();
    expect(filtrar).toHaveAttribute('aria-disabled', 'true');
    // Motivo do usuário que enxerga (title/face) e do leitor de tela (nome acessível).
    expect(filtrar).toHaveAttribute('title', 'Filtrar por status: ainda não disponível nesta tela');
    expect(filtrar).toHaveAccessibleName(/indisponível/i);

    // Sem handler de clique: clicar não muda nada na tela.
    fireEvent.click(filtrar);
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(filtrar).toBeDisabled();
  });

  it('o gatilho do menu do atendente tem nome acessível', () => {
    renderAgentsView();

    expect(gatilhoDoMenu()).toHaveAccessibleName('Ações de Ana Souza');
  });

  it('abre o menu por clique e os três itens aparecem indisponíveis', async () => {
    renderAgentsView();
    abrirMenuPorClique();

    expect(await screen.findByRole('menu')).toBeInTheDocument();

    for (const { nome, motivo } of ACOES_INDISPONIVEIS) {
      const item = screen.getByRole('menuitem', { name: nome });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAttribute('data-disabled');
      expect(item).toHaveAttribute('title', expect.stringMatching(motivo));
      expect(item).toHaveAccessibleName(/indisponível/i);
    }
  });

  it('clique em item indisponível não ativa nada: o menu continua aberto', async () => {
    renderAgentsView();
    abrirMenuPorClique();

    const editar = await screen.findByRole('menuitem', { name: /Editar/ });
    fireEvent.click(editar);

    // Item habilitado fecharia o menu ao ser selecionado; indisponível não ativa.
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Editar/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Desativar/ })).toBeInTheDocument();
  });

  it('teclado abre o menu e Enter no item indisponível não ativa nem fecha', async () => {
    renderAgentsView();
    abrirMenuPorTeclado();

    const menu = await screen.findByRole('menu');
    expect(menu).toBeInTheDocument();

    const editar = screen.getByRole('menuitem', { name: /Editar/ });
    fireEvent.keyDown(editar, { key: 'Enter' });
    fireEvent.keyDown(editar, { key: ' ' });

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Editar/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    // A navegação por seta não deposita o foco num item indisponível.
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).not.toBe(editar);
  });
});
