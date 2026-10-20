/**
 * Sussurro — marcar como lido SÓ o que é destinado ao atendente.
 *
 * Prova, com o componente REAL e um react-query de verdade (sem mock do useQuery),
 * que abrir o painel:
 *  - atualiza `is_read` filtrando `target_agent_id = perfil atual` (a policy de
 *    UPDATE de `whisper_messages` só permite mexer nas linhas endereçadas a mim);
 *  - zera o selo vermelho do destinatário depois da atualização;
 *  - NÃO marca como lida a linha endereçada a outro atendente (o selo dele
 *    continua aceso);
 *  - falha do banco mantém o selo aceso, sem derrubar o painel.
 */
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhisperMode } from '../WhisperMode';

type Linha = Record<string, unknown>;
type ResultadoFake = { data: Linha[] | null; error: { message: string } | null };

const h = vi.hoisted(() => {
  const estado = {
    rows: [] as Linha[],
    perfilId: null as string | null,
    falhaUpdate: null as { message: string } | null,
    updates: [] as Array<{ tabela: string; patch: Linha | null; filtros: Array<[string, unknown]> }>,
  };

  function criarBuilder(tabela: string) {
    const filtros: Array<[string, unknown]> = [];
    let modo: 'select' | 'update' = 'select';
    let patch: Linha | null = null;

    const combina = (linha: Linha) =>
      filtros.every(([coluna, valor]) =>
        Array.isArray(valor) ? valor.includes(linha[coluna]) : linha[coluna] === valor,
      );

    const finalizar = (): Promise<ResultadoFake> => {
      const linhas = estado.rows.filter(combina);
      if (modo === 'update') {
        estado.updates.push({ tabela, patch, filtros: [...filtros] });
        if (estado.falhaUpdate) return Promise.resolve({ data: null, error: estado.falhaUpdate });
        linhas.forEach((linha) => Object.assign(linha, patch));
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: linhas, error: null });
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (valor: Linha) => { modo = 'update'; patch = valor; return builder; },
      eq: (coluna: string, valor: unknown) => { filtros.push([coluna, valor]); return builder; },
      in: (coluna: string, valor: unknown[]) => { filtros.push([coluna, valor]); return builder; },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => finalizar().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then: (resolve: (valor: ResultadoFake) => unknown) => finalizar().then(resolve),
    };
    return builder;
  }

  const supabase = {
    from: vi.fn((tabela: string) => criarBuilder(tabela)),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  };

  return { estado, supabase };
});

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => false,
  motion: {
    ...(await importOriginal<typeof import('framer-motion')>()).motion,
    div: ({ children, ...props }: ComponentProps<'div'> & Record<string, unknown>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role="tooltip">{children}</div>,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    profile: h.estado.perfilId ? { id: h.estado.perfilId, role: 'agent', name: 'Atendente' } : null,
  }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

function sussurro(over: Partial<Linha> = {}): Linha {
  return {
    id: 'w1',
    contact_id: 'c1',
    sender_id: 'sup-1',
    target_agent_id: 'a1',
    content: 'Orientação',
    is_read: false,
    created_at: '2026-10-15T10:00:00.000Z',
    ...over,
  };
}

function renderComProvedor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WhisperMode contactId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.estado.rows = [];
  h.estado.perfilId = null;
  h.estado.falhaUpdate = null;
  h.estado.updates = [];
  h.supabase.from.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('WhisperMode — marcar como lido só o destinatário', () => {
  it('(1) o destinatário abre o painel: o UPDATE fica restrito a ele e o selo zera', async () => {
    h.estado.perfilId = 'a1';
    h.estado.rows = [sussurro({ target_agent_id: 'a1' })];

    renderComProvedor();
    const botao = await screen.findByRole('button', { name: /sussurro/i });
    await waitFor(() => expect(within(botao).getByText('1')).toBeInTheDocument());

    fireEvent.click(botao);

    await waitFor(() => expect(h.estado.updates).toHaveLength(1));
    expect(h.estado.updates[0].patch).toEqual({ is_read: true });
    expect(h.estado.updates[0].filtros).toEqual(
      expect.arrayContaining([
        ['contact_id', 'c1'],
        ['target_agent_id', 'a1'],
        ['is_read', false],
      ]),
    );

    // O selo do botão some depois do refetch, e a linha virou lida no "banco".
    await waitFor(() => expect(within(screen.getByRole('button', { name: /sussurro/i })).queryByText('1')).toBeNull());
    expect(h.estado.rows[0].is_read).toBe(true);
  });

  it('(2) segundo agente: marca só a linha endereçada a ele, a do outro destinatário fica não lida', async () => {
    // a2 enxerga uma linha endereçada a ele e outra endereçada a a1 (remetente dela).
    h.estado.perfilId = 'a2';
    h.estado.rows = [
      sussurro({ id: 'w2', sender_id: 'sup-1', target_agent_id: 'a2' }),
      sussurro({ id: 'w3', sender_id: 'a2', target_agent_id: 'a1' }),
    ];

    renderComProvedor();
    const botao = await screen.findByRole('button', { name: /sussurro/i });

    fireEvent.click(botao);

    await waitFor(() => expect(h.estado.updates).toHaveLength(1));
    expect(h.estado.updates[0].filtros).toEqual(
      expect.arrayContaining([
        ['contact_id', 'c1'],
        ['target_agent_id', 'a2'],
        ['is_read', false],
      ]),
    );

    const porId: Record<string, Linha> = Object.fromEntries(h.estado.rows.map((linha) => [linha.id, linha]));
    expect(porId.w2.is_read).toBe(true);   // a dele virou lida
    expect(porId.w3.is_read).toBe(false);  // a de a1 segue não lida → o selo de a1 não zera
  });

  it('(3) falha do banco mantém o selo aceso e o painel de pé', async () => {
    h.estado.perfilId = 'a1';
    h.estado.rows = [sussurro({ target_agent_id: 'a1' })];
    h.estado.falhaUpdate = { message: 'permission denied' };

    renderComProvedor();
    const botao = await screen.findByRole('button', { name: /sussurro/i });
    await waitFor(() => expect(within(botao).getByText('1')).toBeInTheDocument());

    fireEvent.click(botao);
    await waitFor(() => expect(h.estado.updates).toHaveLength(1));

    expect(within(screen.getByRole('button', { name: /sussurro/i })).getByText('1')).toBeInTheDocument();
    expect(h.estado.rows[0].is_read).toBe(false);
  });
});
