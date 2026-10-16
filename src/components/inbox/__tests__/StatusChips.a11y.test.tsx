import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { StatusChips } from '../conversation-list/StatusChips';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

// Só o hook de dados é dublado (o componente exige AuthProvider via useAuth);
// os botões/chips são os REAIS — nenhum primitivo de UI é mockado.
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-user-1' }, profile: { id: 'perfil-atual-1' } }),
}));

// Cartão t_90dcdcc8, item 4 [refazer 1]: os chips de filtro funcionam como seleção única
// (Todas/Não lidas/etc) mas não anunciavam papel/estado ao leitor de tela.
// São filtros do mesmo painel, não abas com tabpanels: grupo nomeado e
// botões nativos com aria-pressed preservam teclado e anunciam o ativo.
//
// O componente é renderizado REAL (sem dublê de primitivo de UI): os chips são
// `<button>` nativos, então o axe enxerga o markup de verdade.

function makeConversation(id: string): ConversationWithMessages {
  return {
    contact: { id, assigned_to: null } as ConversationWithMessages['contact'],
    messages: [{ id: `m-${id}` } as never],
    unreadCount: 0,
    lastMessage: null,
  };
}

const conversations: ConversationWithMessages[] = [makeConversation('c1'), makeConversation('c2')];

/** Impactos sérios segundo o aceite (mesma régua da skill de a11y do repo). */
const SERIOUS = new Set(['critical', 'serious']);
const ids = (violations: { id: string }[]) => violations.map((v) => v.id).sort();

describe('StatusChips — nome/papel acessível (t_90dcdcc8)', () => {
  it('o grupo de filtros é nomeado', () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);
    const tablist = screen.getByRole('group', { name: 'Filtros de conversa' });
    expect(tablist).toBeInTheDocument();
    expect(tablist).toBe(screen.getByTestId('status-chips'));
  });

  it('cada chip é um botão e só o ativo fica aria-pressed', () => {
    render(<StatusChips conversations={conversations} chipTab="unread" onChipTabChange={() => {}} />);

    const tabs = screen.getAllByRole('button');
    expect(tabs).toHaveLength(6);

    expect(screen.getByTestId('status-chip-unread')).toHaveAttribute('aria-pressed', 'true');
    for (const id of ['all', 'attending', 'waiting', 'resolved', 'archived']) {
      expect(screen.getByTestId(`status-chip-${id}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

describe('StatusChips — axe: sem violação séria (t_90dcdcc8)', () => {
  it('os filtros não têm violações critical/serious', async () => {
    render(<StatusChips conversations={conversations} chipTab="all" onChipTabChange={() => {}} />);

    const results = await axe(document.body);
    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });

  /**
   * Controle: prova que o matcher acusa violação REAL. Um `<button>` só de ícone
   * sem nome viola `button-name` (critical) — é exatamente o defeito corrigido.
   * Se o axe nunca rodasse, o controle (e o teste acima) deixaria de reprovar.
   */
  it('controle: um botão só de ícone sem nome CONTÉM button-name', async () => {
    render(
      <button type="button">
        <span data-testid="icone" />
      </button>,
    );
    const results = await axe(document.body);

    expect(ids(results.violations)).toContain('button-name');
  });
});
