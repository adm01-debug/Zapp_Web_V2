/**
 * Padronização do cabeçalho do grupo de telas do "Gestão" (auditoria de UX 10/10).
 *
 * Critério de pronto do cartão: as telas do grupo usam o MESMO PageHeader com
 * trilha consistente. CRM 360° montava um `<h1>` próprio com badge ao lado e a
 * Agenda trazia o título dentro do `CardHeader`, sem trilha — dois padrões
 * diferentes, agora unificados.
 *
 * Contatos é a EXCEÇÃO deliberada do grupo: o topo do módulo não tem cabeçalho
 * visual (título, subtítulo e ações saíram no plano
 * PLANO_CONTATOS_CABECALHO_BOTAO_VERDE_50_ETAPAS_2026-09-30; o cadastro é feito
 * pelo botão verde flutuante). O lote 880 (025d0258dc) reintroduziu o PageHeader
 * ali por padronização; esta asserção guarda a decisão de produto — só `h1`
 * `sr-only`, sem trilha.
 */
import type { ReactNode } from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------- dublês comuns
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'usuario-teste' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: true, loading: false, hasRole: () => true }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => true }));

// Contatos — estado e filhos dublados (só a casca/cabeçalho interessa aqui).
vi.mock('@/components/contacts/useContactsViewState', () => ({
  useContactsViewState: () => ({
    viewMode: 'grid', setViewMode: vi.fn(), gridColumns: 3, setGridColumns: vi.fn(),
    isMergeOpen: false, setIsMergeOpen: vi.fn(),
    isCompareOpen: false, setIsCompareOpen: vi.fn(),
    groupByCompany: false, setGroupByCompany: vi.fn(),
    isBulkTagOpen: false, setIsBulkTagOpen: vi.fn(),
    detailContact: null, setDetailContact: vi.fn(),
    handleApplyPreset: vi.fn(), handleToggleSelect: vi.fn(), handleSelectAll: vi.fn(), handleContactClick: vi.fn(),
    crud: {
      contacts: [], totalCount: 0, loading: false, hasMore: false,
      contactCountByType: {}, uniqueCompanies: [], uniqueJobTitles: [], uniqueTags: [],
      searchInput: '', debouncedSearch: '', handleSearchChange: vi.fn(), clearSearch: vi.fn(),
      activeTab: 'all', setActiveTab: vi.fn(),
      filterCompany: '', setFilterCompany: vi.fn(), filterJobTitle: '', setFilterJobTitle: vi.fn(),
      filterTag: '', setFilterTag: vi.fn(), filterDateRange: '', setFilterDateRange: vi.fn(),
      sortBy: 'name', setSortBy: vi.fn(), showLegacy: false, setShowLegacy: vi.fn(),
      activeFiltersCount: 0, clearFilters: vi.fn(), page: 1, setPage: vi.fn(), pageSize: 20,
      loadMore: vi.fn(), loadPrevious: vi.fn(), refetch: vi.fn(), profile: null,
      scrollContainerRef: { current: null }, isSubmitting: false,
      deleteTarget: null, setDeleteTarget: vi.fn(),
      showSuccess: false, setShowSuccess: vi.fn(),
      isAddDialogOpen: false, setIsAddDialogOpen: vi.fn(),
      isEditDialogOpen: false, setIsEditDialogOpen: vi.fn(), editingContact: null,
      showFilters: false, setShowFilters: vi.fn(), isCRMSearchOpen: false, setIsCRMSearchOpen: vi.fn(),
      selectedIds: [], setSelectedIds: vi.fn(), newContact: {}, openContactChat: vi.fn(),
      handleAddContact: vi.fn(), handleEditContact: vi.fn(), handleDeleteContact: vi.fn(),
      openEditDialog: vi.fn(), handleCancelForm: vi.fn(), handleNewContactChange: vi.fn(),
      handleEditContactChange: vi.fn(), invalidateContactAggregates: vi.fn(),
    },
  }),
}));
vi.mock('@/components/contacts/contactPermissions', () => ({
  canChangeSelectedContactsType: () => true, canDeleteSelectedContacts: () => true, canMergeContacts: () => true,
}));
vi.mock('@/hooks/crm/useExternalContact360Batch', () => ({ useExternalContact360Batch: () => ({ lookup: () => null }) }));
vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({ useCRMAdminAccess: () => true }));
vi.mock('@/components/ui/scroll-to-top', () => ({ ScrollToTopButton: () => null }));
vi.mock('@/contexts/LayoutScrollContext', () => ({ useLayoutScroll: () => ({ current: null }) }));
vi.mock('@/components/contacts/ContactDialogs', () => ({ ContactDialogs: () => null }));
vi.mock('@/components/contacts/ContactMergeDialog', () => ({ ContactMergeDialog: () => null }));
vi.mock('@/components/contacts/ContactCompareDialog', () => ({ ContactCompareDialog: () => null }));
vi.mock('@/components/contacts/ContactBulkTagDialog', () => ({ ContactBulkTagDialog: () => null }));
vi.mock('@/components/contacts/ContactStatsCards', () => ({ ContactStatsCards: () => null }));
vi.mock('@/components/contacts/ContactTypeTabs', () => ({ ContactTypeTabs: () => null }));
vi.mock('@/components/contacts/ContactToolbar', () => ({ ContactToolbar: () => null }));
vi.mock('@/components/contacts/ContactResultsSummary', () => ({ ContactResultsSummary: () => null }));
vi.mock('@/components/contacts/ContactContentArea', () => ({ ContactContentArea: () => null }));
vi.mock('@/components/contacts/ContactDetailPanel', () => ({ ContactDetailPanel: () => null }));
vi.mock('@/components/contacts/BulkActionsBar', () => ({ BulkActionsBar: () => null }));
vi.mock('@/components/contacts/ContactCRMDialog', () => ({ ContactCRMDialog: () => null }));

// CRM 360° — filhos dublados.
vi.mock('@/components/crm360/CRM360StatsCards', () => ({ CRM360StatsCards: () => null }));
vi.mock('@/components/crm360/CompanyFormDialog', () => ({ CompanyFormDialog: () => null }));
vi.mock('@/components/crm360/ContactFormDialog', () => ({ ContactFormDialog: () => null }));
vi.mock('@/components/crm360/DataExplorerTable', () => ({ DataExplorerTable: () => null }));

// Agendamentos — fonte de dados dublada.
vi.mock('@/hooks/chat/useScheduledMessages', () => ({
  useScheduledMessages: () => ({
    messages: [], isLoading: false, isError: false,
    refetch: vi.fn(), cancelMessage: vi.fn(),
  }),
}));
vi.mock('@/hooks/crm/useAgents', () => ({ useAgents: () => ({ agents: [], isLoading: false }) }));

// Segurança — painéis dublados (o alvo é a navegação dos 2 cards admin).
vi.mock('@/components/security/SecuritySettingsPanel', () => ({ SecuritySettingsPanel: () => null }));
vi.mock('@/components/security/SecurityOverview', () => ({ SecurityOverview: () => null }));
vi.mock('@/components/security/DevicesPanel', () => ({ DevicesPanel: () => null }));
vi.mock('@/components/security/PasskeysPanel', () => ({ PasskeysPanel: () => null }));
vi.mock('@/components/security/SecurityNotificationsPanel', () => ({ SecurityNotificationsPanel: () => null }));
vi.mock('@/components/security/BlockedIPsPanel', () => ({ BlockedIPsPanel: () => null }));
vi.mock('@/components/security/IPWhitelistPanel', () => ({ IPWhitelistPanel: () => null }));
vi.mock('@/components/security/GeoBlockingPanel', () => ({ GeoBlockingPanel: () => null }));
vi.mock('@/components/security/PasswordResetRequestsPanel', () => ({ PasswordResetRequestsPanel: () => null }));
vi.mock('@/components/security/RateLimitRealtimeAlerts', () => ({ RateLimitRealtimeAlerts: () => null }));
vi.mock('@/components/security/RateLimitConfigPanel', () => ({ RateLimitConfigPanel: () => null }));
vi.mock('@/components/security/AuditLogDashboard', () => ({ AuditLogDashboard: () => null }));
vi.mock('@/components/security/QuarantinePanel', () => ({ QuarantinePanel: () => null }));
vi.mock('@/hooks/system/useSecurityPushNotifications', () => ({ useSecurityPushNotifications: () => undefined }));

import { ContactsView } from '@/components/contacts/ContactsView';
import { CRM360ExplorerView } from '@/components/crm360/CRM360ExplorerView';
import { ScheduleCalendarView } from '@/components/schedule/ScheduleCalendarView';
import { SecurityView } from '@/components/security/SecurityView';

/** Prova que a navegação ficou no roteador (nenhum reload de página inteira). */
function RotaAtual() {
  return <span data-testid="rota-atual">{useLocation().pathname}</span>;
}

function montarEm(rota: string, ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[rota]}>
        {ui}
        <RotaAtual />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function montar(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Exige o cabeçalho compartilhado: `h1` com o nome e a trilha `Gestão > folha`. */
function exigirCabecalho(nome: string, folha: string) {
  expect(screen.getByRole('heading', { level: 1, name: nome })).toBeInTheDocument();
  const trilha = screen.getByRole('navigation', { name: 'breadcrumb' });
  expect(within(trilha).getByText('Gestão')).toBeInTheDocument();
  expect(within(trilha).getByText(folha)).toBeInTheDocument();
}

describe('cabeçalho do grupo — trilha consistente (Gestão > X)', () => {
  it('Contatos NÃO tem cabeçalho visual: só o título `sr-only`, sem trilha', () => {
    const { container } = montar(<ContactsView />);

    // Sem PageHeader: nenhum <header> e nenhuma trilha de breadcrumb no topo.
    expect(container.querySelector('header')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();

    // O nome do módulo continua sendo anunciado, mas fora do fluxo visual.
    const titulo = screen.getByRole('heading', { level: 1, name: 'Contatos' });
    expect(titulo).toHaveClass('sr-only');
  });

  it('CRM 360° usa o PageHeader compartilhado (antes: `<h1>` próprio com badge)', () => {
    montar(<CRM360ExplorerView />);
    exigirCabecalho('CRM 360° Explorer', 'CRM 360°');
  });

  it('Agendamentos usa o PageHeader compartilhado (antes: título dentro do CardHeader)', () => {
    montar(<ScheduleCalendarView />);
    exigirCabecalho('Agendamentos', 'Agendamentos');
  });
});

describe('navegação dos cards admin da Central de Segurança', () => {
  it('usa o roteador (useNavigate) e não força reload com window.location.href', () => {
    montarEm('/seguranca', <SecurityView />);
    // O gatilho da aba Radix ativa no `mousedown` (botão 0).
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Admin' }), { button: 0 });

    fireEvent.click(screen.getByRole('button', { name: /Ver Dashboard/ }));
    expect(screen.getByTestId('rota-atual')).toHaveTextContent('/admin/rate-limit');

    fireEvent.click(screen.getByRole('button', { name: /Gerenciar Roles/ }));
    expect(screen.getByTestId('rota-atual')).toHaveTextContent('/admin/roles');

    // Se fosse `window.location.href`, o jsdom teria tentado recarregar a página.
    expect(window.location.pathname).toBe('/');
  });
});
