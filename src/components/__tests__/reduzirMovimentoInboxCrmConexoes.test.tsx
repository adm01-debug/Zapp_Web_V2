/**
 * Reduzir movimento — Inbox, CRM e Conexões (7 telas).
 *
 * Antes: as telas montavam fundos decorativos com laço infinito (AuroraBorealis,
 * FloatingParticles) e entradas animadas sem consultar `prefers-reduced-motion`.
 * Com a preferência ligada a animação continuava. O `reducedMotion` do
 * framer-motion NÃO corta laços de opacidade — por isso o gating é explícito.
 *
 * Aqui os componentes são os REAIS: o InboxEmptyChat roda com o framer-motion de
 * verdade (sem mock) e as telas com os hooks mínimos; os fundos decorativos viram
 * marcadores para provar que a tela deixa de montá-los com a preferência ligada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';

const reduzido = vi.hoisted(() => ({ value: false }));

/**
 * Mesmo padrão do E63/LocationPicker: mantém o framer-motion REAL e substitui só o
 * `useReducedMotion` (o singleton interno da lib não reage a um matchMedia tardio).
 */
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduzido.value };
});

/** matchMedia também responde à preferência (o `MotionConfig` real lê a consulta). */
function definirReduzido(v: boolean): void {
  reduzido.value = v;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? v : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const fonte = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── Marcadores: os fundos decorativos com laço infinito ──────────────────────
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => <div data-testid="aurora" /> }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => <div data-testid="particulas" /> }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: () => <div data-testid="page-header" /> }));
vi.mock('@/components/ui/empty-state', () => ({ EmptyState: () => <div data-testid="empty-state" /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// ── Hooks: shapes mínimos. O alvo é o fundo decorativo na raiz da tela ────────
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('@/hooks/chat/useGroupsManager', () => ({
  GROUP_CATEGORIES: [],
  useGroupsManager: () => ({
    groups: [], connections: [], search: '', setSearch: vi.fn(), categoryFilter: 'all',
    setCategoryFilter: vi.fn(), isLoading: false, isSyncing: false, selectedGroups: new Set<string>(),
    filteredGroups: [], handleAutoSync: vi.fn(), handleAddGroup: vi.fn(async () => true),
    handleDeleteGroup: vi.fn(), handleBroadcast: vi.fn(async () => ({ sent: 0 })),
    toggleGroupSelection: vi.fn(), selectGroup: vi.fn(), selectAllGroups: vi.fn(),
    handleCategoryChange: vi.fn(), getConnectionName: () => '',
  }),
}));

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({
    queues: [], loading: false, createQueue: vi.fn(), updateQueue: vi.fn(),
    deleteQueue: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(),
  }),
}));
vi.mock('@/hooks/business/useQueueGoals', () => ({
  useQueueGoals: () => ({ goals: {} }),
  useQueueGoalMetrics: () => ({ metrics: {} }),
  QUEUE_GOAL_METRICS: [],
  goalMetricPercent: () => null,
  worstCrossedGoalBand: () => null,
  formatGoalMetricValue: (v: number) => String(v),
}));
vi.mock('@/components/queues/CreateQueueDialog', () => ({ CreateQueueDialog: () => null }));
vi.mock('@/components/queues/EditQueueDialog', () => ({ EditQueueDialog: () => null }));
vi.mock('@/components/queues/AddMemberDialog', () => ({ AddMemberDialog: () => null }));
vi.mock('@/components/queues/QueueGoalsDialog', () => ({ QueueGoalsDialog: () => null }));
vi.mock('@/components/queues/QueueAlertsDisplay', () => ({ QueueAlertsDisplay: () => null }));
vi.mock('@/components/queues/QueueCard', () => ({ QueueCard: () => null }));

vi.mock('@/hooks/business/useClientWallet', () => ({
  useClientWallet: () => ({
    loading: false, rules: [], agents: [], connections: [],
    newRule: { name: '', agent_id: '', whatsapp_connection_id: '', priority: 0 },
    setNewRule: vi.fn(), isAddDialogOpen: false, setIsAddDialogOpen: vi.fn(),
    handleAddRule: vi.fn(), handleDeleteRule: vi.fn(), handleToggleActive: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      return chain;
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/inbox/useConnectionsManager', () => ({
  useConnectionsManager: () => ({
    connections: [], loading: false, isAddDialogOpen: false, setIsAddDialogOpen: vi.fn(),
    qrCodeDialog: { open: false, status: 'loading', qrCode: null, connectionName: '', errorMessage: '' },
    newConnection: { name: '', phone_number: '' }, setNewConnection: vi.fn(), isCreating: false,
    syncingHistory: null, setSyncingHistory: vi.fn(), evolutionLoading: false,
    handleAddConnection: vi.fn(), handleShowQrCode: vi.fn(), handleRefreshQrCode: vi.fn(),
    handleCopyId: vi.fn(), handleDisconnect: vi.fn(), handleSetDefault: vi.fn(),
    handleDelete: vi.fn(), closeQrDialog: vi.fn(),
  }),
}));
vi.mock('@/components/connections/ConnectionCard', () => ({ ConnectionCard: () => null }));
vi.mock('@/components/connections/NumberReputationMonitor', () => ({ NumberReputationMonitor: () => null }));
vi.mock('@/components/connections/BusinessHoursDialog', () => ({ BusinessHoursDialog: () => null }));
vi.mock('@/components/connections/ConnectionQueuesDialog', () => ({ ConnectionQueuesDialog: () => null }));
vi.mock('@/components/connections/InstanceSettingsDialog', () => ({ InstanceSettingsDialog: () => null }));
vi.mock('@/hooks/ui/useCustomShortcuts', () => ({
  useCustomShortcuts: () => ({ shortcuts: {}, formatShortcut: () => [] }),
}));
vi.mock('@/hooks/shortcuts/defaultShortcuts', () => ({
  listarAtalhosEditaveis: () => [],
}));
vi.mock('@/components/shared/ConversationEmptyState', () => ({
  ConversationEmptyState: () => <div data-testid="conversation-empty-state" />,
}));

import { InboxEmptyChat } from '@/components/inbox/InboxEmptyChat';
import { GroupsView } from '@/components/groups/GroupsView';
import { QueuesView } from '@/components/queues/QueuesView';
import { ClientWalletView } from '@/components/wallet/ClientWalletView';
import { ConnectionsView } from '@/components/connections/ConnectionsView';

beforeEach(() => { definirReduzido(false); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── Inbox: o vazio do chat foi refatorado para ConversationEmptyState (sem animações próprias) ──
describe('InboxEmptyChat — sem movimento contínuo', () => {
  it('com a preferência ligada renderiza sem erro', () => {
    definirReduzido(true);
    render(<InboxEmptyChat />);
  });

  it('controle: sem a preferência também renderiza sem erro', () => {
    definirReduzido(false);
    render(<InboxEmptyChat />);
  });
});

// ── Telas com fundo decorativo: aurora/partículas só entram sem a preferência ─
describe('telas decoradas — aurora e partículas somem com a preferência ligada', () => {
  const casos: Array<[string, () => ReactElement]> = [
    ['Grupos', () => <GroupsView />],
    ['Filas', () => <QueuesView />],
    ['Carteira de Clientes', () => <ClientWalletView />],
    ['Conexões', () => <ConnectionsView />],
  ];

  it.each(casos)('%s: com prefers-reduced-motion os fundos não são montados', (_nome, Montar) => {
    definirReduzido(true);
    render(<Montar />);
    expect(screen.queryByTestId('aurora')).toBeNull();
    expect(screen.queryByTestId('particulas')).toBeNull();
  });

  it.each(casos)('%s: controle — sem a preferência os fundos continuam', (_nome, Montar) => {
    definirReduzido(false);
    render(<Montar />);
    expect(screen.getByTestId('aurora')).toBeTruthy();
    expect(screen.getByTestId('particulas')).toBeTruthy();
  });
});

// ── Agenda e CRM 360: guarda via MotionConfig (não há laço próprio) ──────────
describe('guarda de movimento nas telas sem laço próprio', () => {
  it('ScheduleCalendarView envolve a tela em MotionConfig reducedMotion="user"', () => {
    expect(fonte('../schedule/ScheduleCalendarView.tsx')).toContain('MotionConfig reducedMotion="user"');
  });

  it('CRM360ExplorerView envolve a tela em MotionConfig reducedMotion="user"', () => {
    expect(fonte('../crm360/CRM360ExplorerView.tsx')).toContain('MotionConfig reducedMotion="user"');
  });
});
