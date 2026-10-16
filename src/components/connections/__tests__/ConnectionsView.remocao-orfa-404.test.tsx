import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

/**
 * PM-37 [refazer 1] — ponto 2 da recusa: o teste anterior mockava o
 * `handleDelete` e só provava que ele era CHAMADO. Este arquivo usa o
 * `handleDelete` REAL (useConnectionsManager + useEvolutionApi reais, rede
 * mockada no `supabase.functions.invoke`) com o provedor respondendo
 * "instância inexistente", e prova que a LINHA LOCAL sai de verdade:
 * o DELETE local é chamado, o toast é de sucesso e o botão some da tela.
 */
const h = vi.hoisted(() => ({
  toast: vi.fn(),
  reconcile: { so_no_provedor: [] as string[], so_no_banco: [] as string[] },
  deleteInstanceResponse: {} as Record<string, unknown>,
  localDeleteCalls: [] as unknown[][],
  rows: [] as Array<Record<string, unknown>>,
}));

const fantasma = {
  id: 'conn-fantasma', name: 'Fantasma', phone_number: '+55 11 90000-0000', instance_id: 'inst-fantasma',
  status: 'disconnected', qr_code: null, is_default: false, created_at: '2026-10-08T00:00:00Z',
};

function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: [...h.rows], error: null }));
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { value: 'true' }, error: null }));
  chain.delete = vi.fn(() => ({
    eq: (...args: unknown[]) => {
      h.localDeleteCalls.push(args);
      return Promise.resolve({ error: null });
    },
  }));
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => makeChain(),
    functions: {
      invoke: async (fn: string, opts?: { body?: Record<string, unknown> }) => {
        if (fn === 'evolution-api' && opts?.body?.action === 'reconcile-instances') {
          return { data: { ...h.reconcile }, error: null };
        }
        if (fn === 'evolution-api/delete-instance') {
          return { data: { ...h.deleteInstanceResponse }, error: null };
        }
        return { data: {}, error: null };
      },
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...args: unknown[]) => h.toast(...args) }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: false, roles: ['admin'], loading: false }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    // EmptyState (lista vazia pós-exclusão) usa motion.h3/motion.p.
    h3: ({ children }: { children?: React.ReactNode }) => <h3>{children}</h3>,
    p: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
    span: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    // Ilustrações do EmptyState usam motion.g/motion.circle dentro de <svg>.
    g: ({ children }: { children?: React.ReactNode }) => <g>{children}</g>,
    circle: ({ children }: { children?: React.ReactNode }) => <circle>{children}</circle>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => true,
}));
vi.mock('@/components/ui/motion', () => ({
  motion: { div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> },
  StaggeredList: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  StaggeredItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock('../BusinessHoursIndicator', () => ({ BusinessHoursIndicator: () => null }));
vi.mock('../BusinessHoursDialog', () => ({ BusinessHoursDialog: () => null }));
vi.mock('../ConnectionQueuesDialog', () => ({ ConnectionQueuesDialog: () => null }));
vi.mock('../InstanceSettingsDialog', () => ({ InstanceSettingsDialog: () => null }));
vi.mock('../NumberReputationMonitor', () => ({ NumberReputationMonitor: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));

import { ConnectionsView } from '../ConnectionsView';

function toastTitles(): (string | undefined)[] {
  return h.toast.mock.calls.map((call) => (call[0] as { title?: string }).title);
}

function renderView() {
  return render(
    <MemoryRouter>
      <ConnectionsView />
    </MemoryRouter>,
  );
}

async function removerLinhaOrfa() {
  renderView();
  expect(await screen.findByText('Conexões WhatsApp')).toBeTruthy();
  fireEvent.click(await screen.findByText('Verificar agora'));
  fireEvent.click(await screen.findByText('Remover linha órfã'));

  // Confirmação em duas etapas: o primeiro clique não apaga nada.
  expect(await screen.findByText('Excluir Fantasma?')).toBeTruthy();
  expect(h.localDeleteCalls).toHaveLength(0);

  fireEvent.change(screen.getByLabelText(/Digite/i), { target: { value: 'Fantasma' } });
  fireEvent.click(screen.getByRole('button', { name: 'Excluir conexão' }));
}

beforeEach(() => {
  cleanup();
  h.toast.mockClear();
  h.localDeleteCalls = [];
  h.rows = [{ ...fantasma }];
  h.reconcile = { so_no_provedor: ['inst-so-provedor'], so_no_banco: ['inst-fantasma'] };
  h.deleteInstanceResponse = {};
});

describe('ConnectionsView — remoção da linha órfã com handleDelete REAL', () => {
  it("provedor responde 404 (apiStatus): a linha local sai e o sucesso é anunciado", async () => {
    h.deleteInstanceResponse = { error: true, status: 404, message: 'Instância não encontrada na Evolution GO.' };
    await removerLinhaOrfa();

    // O DELETE local saiu com o id da linha órfã (nada de provedor vivo aqui).
    await waitFor(() => expect(h.localDeleteCalls).toHaveLength(1));
    expect(h.localDeleteCalls[0]).toEqual(['id', 'conn-fantasma']);

    // Sucesso anunciado, sem "exclusão pendente" nem "erro ao excluir".
    await waitFor(() => expect(toastTitles()).toContain('Conexão removida'));
    expect(toastTitles()).not.toContain('Erro ao excluir');
    expect(toastTitles()).not.toContain('Exclusão pendente');

    // A linha sumiu do estado: sem conexão carregada, sem botão de remover.
    expect(await screen.findByText('sem conexão carregada nesta tela')).toBeTruthy();
    expect(screen.queryByText('Remover linha órfã')).toBeNull();
  });

  it("provedor responde 'não existe' só na mensagem: a linha local sai do mesmo jeito", async () => {
    h.deleteInstanceResponse = { error: true, message: 'Instance not found' };
    await removerLinhaOrfa();

    await waitFor(() => expect(h.localDeleteCalls).toHaveLength(1));
    expect(h.localDeleteCalls[0]).toEqual(['id', 'conn-fantasma']);
    await waitFor(() => expect(toastTitles()).toContain('Conexão removida'));
    expect(await screen.findByText('sem conexão carregada nesta tela')).toBeTruthy();
  });

  it('qualquer outro erro do provedor continua bloqueando o delete local (TRA-005)', async () => {
    h.deleteInstanceResponse = { error: true, status: 500, message: 'Evolution GO recusou a exclusão' };
    await removerLinhaOrfa();

    await waitFor(() => expect(toastTitles()).toContain('Erro ao excluir'));
    expect(h.localDeleteCalls).toHaveLength(0);
    expect(toastTitles()).not.toContain('Conexão removida');
    // A linha foi mantida: o botão de remover continua oferecido.
    expect(await screen.findByText('Remover linha órfã')).toBeTruthy();
  });
});
