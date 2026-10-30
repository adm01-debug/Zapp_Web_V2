import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';

// Cartão t_90dcdcc8, item 1 [refazer 1]: o botão "mais opções" (MoreVertical)
// não tinha nome acessível — leitor de tela anunciava só "botão".
//
// O que a recusa mandou corrigir aqui:
// - o teste anterior dublava `@/components/ui/dropdown-menu` (o próprio
//   primitivo que dá papel ao gatilho) e esperava o rótulo genérico
//   "Mais opções da conexão". A ponta do dia já traz o rótulo específico
//   `Ações da conexão ${connection.name}` — este teste trava ELE, com o
//   DropdownMenu REAL, o Button REAL e o Card REAL. Só hooks de dados são
//   dublados (useUserRole, supabase, toast); framer-motion é passthrough que
//   repassa todas as props (incluindo as de a11y).

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: {
        div: ({ children, ...props }: { children?: import('react').ReactNode } & Record<string, unknown>) => (
          <div {...props}>{children}</div>
        ),
      },
      useReducedMotion: vi.fn(() => null),
  };
});
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: false, isSupervisor: false, roles: [], loading: false }),
}));
vi.mock('../BusinessHoursIndicator', () => ({ BusinessHoursIndicator: () => null }));

import { ConnectionCard } from '../ConnectionCard';

const connection = {
  id: 'conn-1',
  name: 'Principal',
  phone_number: '+55 11 90000-0000',
  instance_id: 'inst-1',
  status: 'connected',
  qr_code: null,
  is_default: true,
  created_at: '2026-10-08T00:00:00Z',
};
const props = {
  connection,
  syncingHistory: null,
  onShowQrCode: vi.fn(),
  onCopyId: vi.fn(),
  onDisconnect: vi.fn(),
  onSetDefault: vi.fn(),
  onDelete: vi.fn(),
  onBusinessHours: vi.fn(),
  onQueues: vi.fn(),
  onSettings: vi.fn(),
  onSyncHistory: vi.fn(),
};

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConnectionCard {...props} />
    </QueryClientProvider>,
  );
}

/** Impactos sérios segundo o aceite (mesma régua da skill de a11y do repo). */
const SERIOUS = new Set(['critical', 'serious']);
const ids = (violations: { id: string }[]) => violations.map((v) => v.id).sort();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConnectionCard — nome acessível do menu (t_90dcdcc8)', () => {
  it('o botão de mais opções nomeia a conexão', () => {
    renderCard();
    const botao = screen.getByRole('button', { name: 'Ações da conexão Principal' });
    expect(botao).toBeInTheDocument();
  });
});

describe('ConnectionCard — axe: sem violação séria (t_90dcdcc8)', () => {
  it('o card não tem violações critical/serious', async () => {
    renderCard();

    const results = await axe(document.body);
    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });

  /**
   * Controle: prova que o matcher acusa violação REAL. Um `<button>` só de ícone
   * sem nome viola `button-name` (critical) — é exatamente o defeito corrigido.
   * Se o axe nunca rodasse, o controle (e o teste acima) deixariam de reprovar.
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
