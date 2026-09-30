import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactToolbar } from '../ContactToolbar';
import { canMergeContacts } from '../contactPermissions';
import { noop } from './contactDeleteFixtures';

/**
 * O botão "Mesclar" era o ÚLTIMO ponto do módulo de Contatos sem gate: aparecia
 * para qualquer usuário com 2+ contatos selecionados e a recusa só surgia no
 * clique, com `42501` vindo do banco — a RPC `merge_contacts_atomic` exige
 * `is_admin_or_supervisor(auth.uid())` e faz DELETE físico dos contatos
 * secundários (migration `20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql`).
 * O "Excluir" do item, do card, da tabela e do lote já tinha sido corrigido
 * (mesma série).
 *
 * Fonte do dado no front: `useCRMAdminAccess()` → RPC `is_admin_or_supervisor`,
 * o mesmo predicado que o banco usa — nenhuma regra nova é calculada no cliente.
 * `null`/`undefined` (consulta em andamento) NÃO bloqueia, como no resto da
 * série: só esconde quando o servidor diz que não. `canMergeContacts` é o
 * contrato único dessa decisão, por isso o helper abaixo passa a permissão crua
 * do hook por ele.
 */

const SELECAO = [
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
];

/** `adminAccess` é o retorno cru de `useCRMAdminAccess()`: `boolean | null`. */
function toolbarProps(adminAccess: boolean | null | undefined, onMerge = noop) {
  return {
    searchInput: '',
    onSearchChange: noop,
    sortBy: 'name_asc',
    setSortBy: noop,
    showFilters: false,
    setShowFilters: noop,
    activeFiltersCount: 0,
    clearFilters: noop,
    activeTab: 'all',
    filterCompany: '',
    setFilterCompany: noop,
    filterJobTitle: '',
    setFilterJobTitle: noop,
    filterTag: '',
    setFilterTag: noop,
    filterDateRange: '',
    setFilterDateRange: noop,
    uniqueCompanies: [],
    uniqueJobTitles: [],
    uniqueTags: [],
    onApplyPreset: noop,
    groupByCompany: false,
    setGroupByCompany: noop,
    selectedIds: SELECAO,
    onBulkTag: noop,
    onCompare: noop,
    onMerge,
    canMerge: canMergeContacts(adminAccess),
    viewMode: 'list' as const,
    setViewMode: noop,
    gridColumns: 3,
    setGridColumns: noop,
    totalCount: SELECAO.length,
    crmIntegrationEnabled: false,
    onOpenCRM: noop,
  };
}

describe('canMergeContacts', () => {
  it('esconde só quando o servidor diz que não pode (false)', () => {
    expect(canMergeContacts(false)).toBe(false);
  });

  it('mantém disponível quando o servidor confirma (true)', () => {
    expect(canMergeContacts(true)).toBe(true);
  });

  it('mantém disponível enquanto a resposta não chegou (null/undefined)', () => {
    expect(canMergeContacts(null)).toBe(true);
    expect(canMergeContacts(undefined)).toBe(true);
  });
});

describe('ContactToolbar · botão Mesclar', () => {
  it('não oferece Mesclar quando is_admin_or_supervisor responde false (mas mantém Comparar)', () => {
    render(<ContactToolbar {...toolbarProps(false)} />);

    expect(screen.queryByText('Mesclar')).not.toBeInTheDocument();
    expect(screen.getByText('Comparar')).toBeInTheDocument();
  });

  it('oferece Mesclar quando o servidor confirma a permissão e chama onMerge no clique', () => {
    const onMerge = vi.fn();
    render(<ContactToolbar {...toolbarProps(true, onMerge)} />);

    fireEvent.click(screen.getByText('Mesclar'));
    expect(onMerge).toHaveBeenCalledTimes(1);
  });

  it('oferece Mesclar quando a permissão ainda não foi respondida (null) — comportamento anterior', () => {
    render(<ContactToolbar {...toolbarProps(null)} />);

    expect(screen.getByText('Mesclar')).toBeInTheDocument();
  });

  it('não oferece Mesclar com menos de 2 selecionados, mesmo com permissão', () => {
    render(<ContactToolbar {...toolbarProps(true)} selectedIds={[SELECAO[0]]} />);

    expect(screen.queryByText('Mesclar')).not.toBeInTheDocument();
  });
});
