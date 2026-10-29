/**
 * Cartão t_5a418ba3 — paridade V3 na a11y do que cerca reação, lote e menu do
 * inbox (A14 do V3 + nomes acessíveis + tokens do placeholder de apagada).
 *
 * Cada teste renderiza o componente REAL e pergunta à árvore acessível (role e
 * nome), não ao CSS: é o que o leitor de tela enxerga.
 *   1. `BulkActionsToolbar` — o `AnimatePresence` era desmontado junto com o
 *      `return null` do topo, então a animação de saída nunca rodava; e a barra
 *      não tinha `role="toolbar"` nem anúncio da contagem.
 *   2. `MessageReactions` — badges, emojis do seletor e barra rápida eram
 *      `button` só com emoji, sem nome acessível nem estado (`aria-pressed`).
 *   3. `AdvancedMessageMenu` — o gatilho e os campos de cada diálogo não tinham
 *      `aria-label`/`htmlFor`+`id`.
 *   4. `DeletedMessagePlaceholder` — a cor da mensagem apagada vinha de
 *      `amber-500` (cor literal) em vez dos tokens `--warning`/`--warning-text`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O `useReducedMotion` do framer-motion lê um singleton inicializado uma única
// vez; trocar o `matchMedia` depois não adianta. Aqui ele vira um interruptor.
const movimento = { reduzido: true };
vi.mock('framer-motion', async () => {
  const real = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...real, useReducedMotion: () => movimento.reduzido };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me-auth-id' } }),
}));
// O menu avançado lê o papel do usuário (useUserRole → useAppBootstrap → react-query).
// Aqui o papel vem direto, como no teste irmão AdvancedMessageMenu.menu-avancado.
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isSupervisor: false, loading: false }),
}));
vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [], loading: false }),
}));
vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [], isLoading: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ sendStatusMessage: vi.fn(async () => undefined) }),
}));
vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: vi.fn(async () => undefined),
  sendRichOutboundMessage: vi.fn(async () => undefined),
}));

import { BulkActionsToolbar } from '@/components/inbox/BulkActionsToolbar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MessageReactions, QuickReactionBar } from '@/components/inbox/MessageReactions';
import { AdvancedMessageMenu } from '@/components/inbox/AdvancedMessageMenu';
import { DeletedMessagePlaceholder } from '@/components/inbox/DeletedMessagePlaceholder';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Barra({ quantidade }: { quantidade: number }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BulkActionsToolbar
          selectedCount={quantidade}
          onMarkAsRead={vi.fn()}
          onTransfer={vi.fn()}
          onArchive={vi.fn()}
          onClearSelection={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('BulkActionsToolbar — barra do lote', () => {
  it('faz a animação de saída: a barra some DEPOIS do AnimatePresence, não de uma vez', async () => {
    const { rerender } = render(<Barra quantidade={2} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();

    rerender(<Barra quantidade={0} />);

    // `AnimatePresence` mantém o filho montado durante o `exit`. No código
    // anterior (`if (selectedCount === 0) return null`) a barra já não existiria
    // nesta linha — a saída piscava fora sem animação.
    expect(screen.queryByRole('toolbar')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('expõe a barra como toolbar nomeada e anuncia a contagem', () => {
    render(<Barra quantidade={2} />);

    const barra = screen.getByRole('toolbar', { name: 'Ações em lote' });
    expect(within(barra).getByRole('button', { name: 'Limpar seleção' })).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: 'Marcar como lido' })).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: 'Transferir' })).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();

    const contagem = within(barra).getByTestId('bulk-selection-count');
    expect(contagem).toHaveAttribute('aria-live', 'polite');
    expect(contagem).toHaveTextContent('2 selecionados');
  });

  it('não tem violação de axe com a barra aberta', async () => {
    const { container } = render(<Barra quantidade={3} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------

const reacaoPendente = {
  reactions: [
    { emoji: '👍', user_id: 'outra-pessoa', user_name: 'Outra' },
    { emoji: '🔥', user_id: 'profile-1', user_name: 'Eu' },
  ],
  addReaction: vi.fn(async () => undefined),
  removeReaction: vi.fn(async () => undefined),
  hasReacted: vi.fn((emoji: string) => emoji === '🔥'),
  isReacting: false,
  currentProfileId: 'profile-1',
};

vi.mock('@/hooks/chat/useMessageReactions', () => ({
  useMessageReactions: () => reacaoPendente,
}));

describe('MessageReactions — nome e estado de cada reação', () => {
  beforeEach(() => {
    reacaoPendente.hasReacted = vi.fn((emoji: string) => emoji === '🔥');
    reacaoPendente.addReaction = vi.fn(async () => undefined);
  });

  it('nomeia o badge e marca como pressionada a reação do próprio usuário', () => {
    render(<MessageReactions messageId="m1" />);

    const meu = screen.getByRole('button', { name: 'Reação 🔥: 1 reação' });
    expect(meu).toHaveAttribute('aria-pressed', 'true');

    const dela = screen.getByRole('button', { name: 'Reação 👍: 1 reação' });
    expect(dela).toHaveAttribute('aria-pressed', 'false');
  });

  it('nomeia os emojis do seletor (badge × picker)', async () => {
    render(<MessageReactions messageId="m1" />);

    const abre = screen.getByRole('button', { name: 'Adicionar reação' });
    expect(abre).toHaveAttribute('aria-expanded', 'false');
    expect(abre).toHaveAttribute('aria-haspopup', 'dialog');

    fireEvent.click(abre);

    const seletor = await screen.findByRole('group', { name: 'Escolha uma reação' });
    const naoReagiu = within(seletor).getByRole('button', { name: 'Reagir com 👍' });
    expect(naoReagiu).toHaveAttribute('aria-pressed', 'false');
    // `showExtended` desligado: o seletor traz só as 6 do WhatsApp.
    expect(within(seletor).queryByRole('button', { name: 'Reagir com 🔥' })).not.toBeInTheDocument();
  });

  it('não tem violação de axe com o seletor aberto', async () => {
    render(<MessageReactions messageId="m1" showExtended />);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar reação' }));
    const seletor = await screen.findByRole('group', { name: 'Escolha uma reação' });
    expect(within(seletor).getAllByRole('button', { name: /^Reagir com / }).length).toBeGreaterThan(0);

    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('QuickReactionBar — reação rápida', () => {
  it('nomeia os emojis da barra e do picker estendido', async () => {
    render(<QuickReactionBar messageId="m1" />);

    expect(screen.getAllByTestId('quick-reaction-emoji').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Reagir com 👍' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    const mais = screen.getByRole('button', { name: 'Mais reações' });
    expect(mais).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mais);

    const picker = await screen.findByRole('group', { name: 'Escolha uma reação' });
    expect(within(picker).getByRole('button', { name: 'Reagir com 🎉' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(picker).getByRole('button', { name: 'Reagir com 🔥' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(await axe(document.body)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------

describe('AdvancedMessageMenu — menu avançado', () => {
  function abrirMenu() {
    render(
      <TooltipProvider>
        <AdvancedMessageMenu contactId="c1" instanceName="inst" recipientNumber="5511999999999" />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções de mensagem' }));
  }

  it('nomeia o gatilho do menu', () => {
    render(
      <TooltipProvider>
        <AdvancedMessageMenu contactId="c1" instanceName="inst" recipientNumber="5511999999999" />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Mais opções de mensagem' })).toBeInTheDocument();
  });

  it('liga cada rótulo ao seu campo nos diálogos', async () => {
    abrirMenu();

    fireEvent.click(await screen.findByRole('button', { name: 'Enquete' }));
    const dialogoEnquete = await screen.findByRole('dialog');
    expect(within(dialogoEnquete).getByLabelText('Pergunta')).toBeInTheDocument();
    expect(within(dialogoEnquete).getByLabelText('Seleções permitidas')).toBeInTheDocument();
    expect(within(dialogoEnquete).getByLabelText('Opção 1 da enquete')).toBeInTheDocument();
    expect(within(dialogoEnquete).getByLabelText('Opção 2 da enquete')).toBeInTheDocument();
  });

  it('liga o rótulo ao campo de contato e não tem violação de axe', async () => {
    abrirMenu();

    fireEvent.click(await screen.findByRole('button', { name: 'Cartão de Contato' }));
    const dialogoContato = await screen.findByRole('dialog');
    expect(within(dialogoContato).getByLabelText('Nome completo *')).toBeInTheDocument();
    expect(within(dialogoContato).getByLabelText('Telefone *')).toBeInTheDocument();
    expect(within(dialogoContato).getByLabelText('Empresa')).toBeInTheDocument();
    expect(within(dialogoContato).getByLabelText('E-mail')).toBeInTheDocument();

    expect(await axe(document.body)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------

describe('DeletedMessagePlaceholder — tokens em vez de cor literal', () => {
  it('recebida usa o par de tokens do amarelo', () => {
    const { container } = render(<DeletedMessagePlaceholder isSent={false} content="oi" />);

    const html = container.innerHTML;
    expect(html).toContain('bg-warning/5');
    expect(html).toContain('border-warning/20');
    expect(html).toContain('bg-warning/10');
    expect(html).toContain('text-[hsl(var(--warning-text))]');
    expect(html).not.toMatch(/amber/);
  });

  it('não tem violação de axe', async () => {
    const { container } = render(<DeletedMessagePlaceholder isSent={false} content="oi" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
