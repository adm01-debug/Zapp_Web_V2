/**
 * Selo do sussurro — o NÚMERO vem do hook de contagem, não da lista do painel.
 *
 * Prova o caminho completo do selo: a contagem carregada é a do banco (só o que
 * é meu e não lido), abrir o painel grava o "lido" com o recorte certo
 * (contact_id + target_agent_id = eu + is_read false) e o selo baixa; se a
 * gravação FALHA, o selo continua mostrando o número bom e o usuário recebe um
 * aviso em pt-BR (não some um aviso que ele ainda não leu).
 */
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhisperMode } from '../WhisperMode';

type MotionDivProps = ComponentProps<'div'> & {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  variants?: unknown;
  transition?: unknown;
};

const h = vi.hoisted(() => ({
  naoLidos: 2,
  erroAoMarcar: null as { message: string } | null,
  updatePayloads: [] as Array<Record<string, unknown>>,
  filtrosUpdate: [] as Array<[string, unknown]>,
  toast: vi.fn(),
  agentes: [] as Array<Record<string, unknown>>,
}));

function countThenable() {
  return {
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ count: h.naoLidos, error: null }).then(resolve),
  };
}

function listaThenable() {
  return {
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => ({
      select: (_colunas: string, opcoes?: { count?: string; head?: boolean }) => {
        if (tabela === 'whisper_messages' && opcoes?.head) {
          const countChain: Record<string, unknown> = {
            eq: () => countChain,
            neq: () => countThenable(),
          };
          return countChain;
        }
        if (tabela === 'profiles') {
          return { in: () => listaThenable() };
        }
        const listaChain: Record<string, unknown> = {
          eq: () => listaChain,
          order: () => listaChain,
          limit: () => listaThenable(),
        };
        void _colunas;
        return listaChain;
      },
      update: (payload: Record<string, unknown>) => {
        h.updatePayloads.push(payload);
        const chain: Record<string, unknown> = {
          eq: (coluna: string, valor: unknown) => {
            h.filtrosUpdate.push([coluna, valor]);
            return chain;
          },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ error: h.erroAoMarcar }).then(resolve),
        };
        return chain;
      },
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(
    (...args: unknown[]) => h.toast(...args),
    {
      error: (...args: unknown[]) => h.toast(...args),
      success: (...args: unknown[]) => h.toast(...args),
    },
  ),
}));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => false,
  motion: {
    ...(await importOriginal<typeof import('framer-motion')>()).motion,
    div: ({ children, initial, animate, exit, variants, transition: _transition, ...props }: MotionDivProps) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'me', role: 'supervisor', name: 'Supervisor Teste' } }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: h.agentes, isLoading: false, error: null, refetch: vi.fn() }),
}));

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <WhisperMode contactId="c1" targetAgentId="a1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.naoLidos = 2;
  h.erroAoMarcar = null;
  h.updatePayloads = [];
  h.filtrosUpdate = [];
  h.agentes = [];
  h.toast.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('WhisperMode — selo do contador de sussurros', () => {
  it('(1) mostra a contagem do banco e baixa o selo quando o painel marca como lido', async () => {
    renderizar();

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());

    // Abrir o painel dispara o "marcar como lido": o banco (mock) passa a ter 0.
    fireEvent.click(screen.getByRole('button', { name: /sussurro/i }));
    h.naoLidos = 0;

    await waitFor(() => expect(h.updatePayloads).toEqual([{ is_read: true }]));
    expect(h.filtrosUpdate).toEqual([
      ['contact_id', 'c1'],
      ['target_agent_id', 'me'],
      ['is_read', false],
    ]);

    await waitFor(() => expect(screen.queryByText('2')).not.toBeInTheDocument());
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('(2) erro de gravação mantém o contador e avisa em pt-BR', async () => {
    h.naoLidos = 3;
    h.erroAoMarcar = { message: 'row-level security' };
    renderizar();

    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sussurro/i }));

    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));
    expect(h.toast).toHaveBeenCalledWith('Não foi possível marcar os sussurros como lidos.');
    // O selo continua: o aviso ainda não foi lido de fato.
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
