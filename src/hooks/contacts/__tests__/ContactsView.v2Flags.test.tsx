import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CT-005 — ponto de leitura da chave `contacts.v2` no módulo Contatos.
 *
 * O cartão limita o diff a `src/hooks/` e ao ponto de leitura em
 * `ContactsView.tsx`, então este teste (que monta a tela) mora junto do hook.
 *
 * Monta a ContactsView REAL com os componentes de área trocados por marcadores:
 * a única coisa trocada é a fonte do dado (as linhas de `feature_flags` e o
 * usuário logado). O caminho é o de produção — linha na tabela → `useFeatureFlag`
 * → `useContactsV2Flags` → ponto de leitura — e prova o critério de pronto: com
 * todas as áreas desligadas a tela é a atual, inteira, e o elemento raiz do
 * módulo publica que nenhuma área está ligada. Hoje nenhuma área tem tela v2
 * (elas chegam a partir de CT-006), então ligar as áreas também não tira nem
 * troca nenhuma peça da tela — o que muda é só o que o módulo publica.
 */

interface LinhaFlag {
  key: string;
  enabled: boolean;
  description: null;
  updated_at: string;
}

/** Áreas do módulo, na ordem canônica. */
const AREAS = ['toolbar', 'cards', 'detalhe', 'empresa', 'edicao', 'protecao'];

const linha = (key: string, enabled: boolean): LinhaFlag => ({
  key,
  enabled,
  description: null,
  updated_at: '2026-10-08T00:00:00Z',
});

/** Linhas da tabela: chave geral ligada e só as áreas indicadas ligadas. */
const linhas = (...areasLigadas: string[]): LinhaFlag[] => [
  linha('contacts.v2', true),
  ...AREAS.map((area) => linha(`contacts.v2.${area}`, areasLigadas.includes(area))),
];

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    rows: [] as LinhaFlag[],
    areas: {
      dialogs: fn(),
      merge: fn(),
      compare: fn(),
      bulkTag: fn(),
      stats: fn(),
      tabs: fn(),
      toolbar: fn(),
      results: fn(),
      content: fn(),
      detail: fn(),
      bulkActions: fn(),
      crm: fn(),
    },
    estado: {
      viewMode: 'grid' as const,
      setViewMode: fn(),
      gridColumns: 3,
      setGridColumns: fn(),
      isMergeOpen: false,
      setIsMergeOpen: fn(),
      isCompareOpen: false,
      setIsCompareOpen: fn(),
      groupByCompany: false,
      setGroupByCompany: fn(),
      isBulkTagOpen: false,
      setIsBulkTagOpen: fn(),
      detailContact: {
        id: 'contato-1',
        name: 'Cliente de teste',
        phone: '5511999999999',
        created_at: '2026-10-08T00:00:00Z',
      },
      setDetailContact: fn(),
      handleApplyPreset: fn(),
      handleToggleSelect: fn(),
      handleSelectAll: fn(),
      handleContactClick: fn(),
      crud: {
        contacts: [] as unknown[],
        totalCount: 0,
        loading: false,
        hasMore: false,
        contactCountByType: {} as Record<string, number>,
        uniqueCompanies: [] as string[],
        uniqueJobTitles: [] as string[],
        uniqueTags: [] as string[],
        searchInput: '',
        debouncedSearch: '',
        handleSearchChange: fn(),
        clearSearch: fn(),
        activeTab: 'all',
        setActiveTab: fn(),
        filterCompany: '',
        setFilterCompany: fn(),
        filterJobTitle: '',
        setFilterJobTitle: fn(),
        filterTag: '',
        setFilterTag: fn(),
        filterDateRange: '',
        setFilterDateRange: fn(),
        sortBy: 'name',
        setSortBy: fn(),
        showLegacy: false,
        setShowLegacy: fn(),
        activeFiltersCount: 0,
        clearFilters: fn(),
        page: 1,
        setPage: fn(),
        pageSize: 20,
        loadMore: fn(),
        loadPrevious: fn(),
        refetch: fn(),
        profile: null,
        scrollContainerRef: { current: null },
        isSubmitting: false,
        deleteTarget: null,
        setDeleteTarget: fn(),
        showSuccess: false,
        setShowSuccess: fn(),
        isAddDialogOpen: false,
        setIsAddDialogOpen: fn(),
        isEditDialogOpen: false,
        setIsEditDialogOpen: fn(),
        editingContact: null,
        showFilters: false,
        setShowFilters: fn(),
        isCRMSearchOpen: false,
        setIsCRMSearchOpen: fn(),
        selectedIds: [] as string[],
        setSelectedIds: fn(),
        newContact: {},
        openContactChat: fn(),
        handleAddContact: fn(),
        handleEditContact: fn(),
        handleDeleteContact: fn(),
        openEditDialog: fn(),
        handleCancelForm: fn(),
        handleNewContactChange: fn(),
        handleEditContactChange: fn(),
        invalidateContactAggregates: fn(),
      },
    },
  };
});

// Só a fonte do dado é trocada: as linhas de `feature_flags` e quem está logado.
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'usuario-teste' } }) }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: h.rows, error: null }),
      }),
    }),
  },
}));

vi.mock('@/components/contacts/useContactsViewState', () => ({ useContactsViewState: () => h.estado }));
vi.mock('@/components/contacts/contactPermissions', () => ({
  canChangeSelectedContactsType: () => true,
  canDeleteSelectedContacts: () => true,
  canMergeContacts: () => true,
}));
vi.mock('@/hooks/crm/useExternalContact360Batch', () => ({ useExternalContact360Batch: () => ({ lookup: () => null }) }));
vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({ useCRMAdminAccess: () => true }));
vi.mock('@/components/ui/scroll-to-top', () => ({ ScrollToTopButton: () => null }));
vi.mock('@/contexts/LayoutScrollContext', () => ({ useLayoutScroll: () => ({ current: null }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: false }) }));

vi.mock('@/components/contacts/ContactDialogs', () => ({ ContactDialogs: (p: unknown) => h.areas.dialogs(p) }));
vi.mock('@/components/contacts/ContactMergeDialog', () => ({ ContactMergeDialog: (p: unknown) => h.areas.merge(p) }));
vi.mock('@/components/contacts/ContactCompareDialog', () => ({ ContactCompareDialog: (p: unknown) => h.areas.compare(p) }));
vi.mock('@/components/contacts/ContactBulkTagDialog', () => ({ ContactBulkTagDialog: (p: unknown) => h.areas.bulkTag(p) }));
vi.mock('@/components/contacts/ContactStatsCards', () => ({ ContactStatsCards: (p: unknown) => h.areas.stats(p) }));
vi.mock('@/components/contacts/ContactTypeTabs', () => ({ ContactTypeTabs: (p: unknown) => h.areas.tabs(p) }));
vi.mock('@/components/contacts/ContactToolbar', () => ({ ContactToolbar: (p: unknown) => h.areas.toolbar(p) }));
vi.mock('@/components/contacts/ContactResultsSummary', () => ({ ContactResultsSummary: (p: unknown) => h.areas.results(p) }));
vi.mock('@/components/contacts/ContactContentArea', () => ({ ContactContentArea: (p: unknown) => h.areas.content(p) }));
vi.mock('@/components/contacts/ContactDetailPanel', () => ({ ContactDetailPanel: (p: unknown) => h.areas.detail(p) }));
vi.mock('@/components/contacts/BulkActionsBar', () => ({ BulkActionsBar: (p: unknown) => h.areas.bulkActions(p) }));
vi.mock('@/components/contacts/ContactCRMDialog', () => ({ ContactCRMDialog: (p: unknown) => h.areas.crm(p) }));

import { ContactsView } from '@/components/contacts/ContactsView';

/** Áreas da tela atual, na ordem em que o módulo as monta. */
const TELA_ATUAL = [
  'area-dialogs',
  'area-merge',
  'area-compare',
  'area-bulk-tag',
  'area-stats',
  'area-tabs',
  'area-toolbar',
  'area-results',
  'area-content',
  'area-detail',
  'area-bulk-actions',
];

/** Marca cada área com um elemento, para ler a tela montada. */
function marcarAreas() {
  const mapa: [Mock, string][] = [
    [h.areas.dialogs, 'area-dialogs'],
    [h.areas.merge, 'area-merge'],
    [h.areas.compare, 'area-compare'],
    [h.areas.bulkTag, 'area-bulk-tag'],
    [h.areas.stats, 'area-stats'],
    [h.areas.tabs, 'area-tabs'],
    [h.areas.toolbar, 'area-toolbar'],
    [h.areas.results, 'area-results'],
    [h.areas.content, 'area-content'],
    [h.areas.detail, 'area-detail'],
    [h.areas.bulkActions, 'area-bulk-actions'],
  ];
  for (const [spy, id] of mapa) {
    spy.mockImplementation(() => <span data-testid={id} />);
  }
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function areasNaTela(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'));
}

function areasLigadasPublicadas(container: HTMLElement) {
  const raiz = container.querySelector('[data-contacts-v2]');
  expect(raiz).not.toBeNull();
  return (raiz?.getAttribute('data-contacts-v2') ?? '').split(' ').filter(Boolean);
}

async function montarModulo(container: HTMLElement, publicadas: string[]) {
  await waitFor(() => expect(areasLigadasPublicadas(container)).toEqual(publicadas));
}

beforeEach(() => {
  h.rows = linhas();
  marcarAreas();
});

describe('ContactsView — chave contacts.v2 desligada', () => {
  it('monta a tela atual inteira e publica que nenhuma área está ligada', async () => {
    const { container } = render(<ContactsView />, { wrapper: createWrapper() });

    await montarModulo(container, []);
    expect(areasNaTela(container)).toEqual(TELA_ATUAL);
  });
});

describe('ContactsView — chave contacts.v2 com áreas ligadas', () => {
  it('nenhuma peça da tela sai ou troca (as telas v2 chegam em CT-006+) e as áreas ligadas ficam publicadas', async () => {
    h.rows = linhas(...AREAS);
    const { container } = render(<ContactsView />, { wrapper: createWrapper() });

    await montarModulo(container, AREAS);
    expect(areasNaTela(container)).toEqual(TELA_ATUAL);
  });

  it('cada sub-chave responde por si: só a área ligada na tabela aparece publicada', async () => {
    h.rows = linhas('cards');
    const { container } = render(<ContactsView />, { wrapper: createWrapper() });

    await montarModulo(container, ['cards']);
    expect(areasNaTela(container)).toEqual(TELA_ATUAL);
  });
});
