import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * CT-088 (15/10/2026) — o Zapp Web deixa de ter edição em massa de contatos:
 * edição em massa de contatos é feita no Singu.
 *
 * A prova tem dois lados:
 *  1. os arquivos/símbolos da edição em massa saíram do repositório (nenhuma
 *     referência sobra em `src`, o que pega também um importador esquecido);
 *  2. a barra de contatos REAL não oferece mais ação de lote — com 2 contatos
 *     selecionados só aparecem "Comparar" e "Mesclar" (a seleção continua, só
 *     para essas duas ações), e não há mais o botão "Tags (N)".
 *
 * Vermelho antes da mudança: os três arquivos existiam e a barra mostrava
 * "Tags (N)" com 1 selecionado.
 */

vi.mock('@/hooks/contacts/useContactsV2Flags', () => ({
  useContactsV2Flags: () => ({ toolbar: false }),
}));
vi.mock('@/hooks/contacts/useContactSearchV2', () => ({
  useContactSearchV2: () => ({ results: [], loading: false }),
}));
vi.mock('@/components/contacts/ContactSearchWithSuggestions', () => ({
  ContactSearchWithSuggestions: () => null,
}));
vi.mock('@/components/contacts/ContactAdvancedFilters', () => ({ ContactAdvancedFilters: () => null }));
vi.mock('@/components/contacts/FilterPresets', () => ({ FilterPresets: () => null }));
vi.mock('@/components/contacts/ContactViewSwitcher', () => ({ ContactViewSwitcher: () => null }));

import { ContactToolbar } from '../ContactToolbar';

const RAIZ = process.cwd();

const ARQUIVOS_REMOVIDOS = [
  'src/components/contacts/BulkActionsBar.tsx',
  'src/components/contacts/ContactBulkTagDialog.tsx',
  'src/services/contact-bulk.service.ts',
];

const SIMBOLOS_PROIBIDOS = [
  'BulkActionsBar',
  'ContactBulkTagDialog',
  'contact-bulk.service',
  'canDeleteSelectedContacts',
  'canChangeSelectedContactsType',
];

const PASTAS = ['src/components', 'src/features', 'src/hooks', 'src/pages', 'src/services'];

/** Arquivos de código de uma pasta, pulando testes e `node_modules`. */
function arquivosDeCodigo(pasta: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, pasta), { withFileTypes: true })) {
    const rel = `${pasta}/${entrada.name}`;
    if (entrada.isDirectory()) {
      if (entrada.name === '__tests__' || entrada.name === 'node_modules') continue;
      saida.push(...arquivosDeCodigo(rel));
    } else if (/\.(ts|tsx)$/.test(entrada.name) && !/\.test\.(ts|tsx)$/.test(entrada.name)) {
      saida.push(rel);
    }
  }
  return saida;
}

describe('CT-088 — sem edição em massa de contatos (é feita no Singu)', () => {
  it('os três arquivos da edição em massa saíram do repositório', () => {
    for (const arquivo of ARQUIVOS_REMOVIDOS) {
      expect(existsSync(join(RAIZ, arquivo)), `${arquivo} ainda existe`).toBe(false);
    }
  });

  it('nenhum arquivo de src referencia os módulos/símbolos removidos', () => {
    const achados: string[] = [];
    for (const pasta of PASTAS) {
      if (!existsSync(join(RAIZ, pasta))) continue;
      for (const arquivo of arquivosDeCodigo(pasta)) {
        const texto = readFileSync(join(RAIZ, arquivo), 'utf8');
        for (const simbolo of SIMBOLOS_PROIBIDOS) {
          if (texto.includes(simbolo)) achados.push(`${arquivo}: ${simbolo}`);
        }
      }
    }
    expect(achados).toEqual([]);
  });

  it('a barra de contatos não oferece ação de lote: com 2 selecionados só Comparar/Mesclar', () => {
    const props = {
      searchInput: '', onSearchChange: vi.fn(),
      sortBy: 'name_asc', setSortBy: vi.fn(),
      showLegacy: false, setShowLegacy: vi.fn(),
      showFilters: false, setShowFilters: vi.fn(),
      activeFiltersCount: 0, clearFilters: vi.fn(),
      activeTab: 'all',
      filterCompany: '', setFilterCompany: vi.fn(),
      filterJobTitle: '', setFilterJobTitle: vi.fn(),
      filterTag: '', setFilterTag: vi.fn(),
      filterDateRange: '', setFilterDateRange: vi.fn(),
      uniqueCompanies: [], uniqueJobTitles: [], uniqueTags: ['vip'],
      onApplyPreset: vi.fn(),
      groupByCompany: false, setGroupByCompany: vi.fn(),
      selectedIds: ['a', 'b'],
      onCompare: vi.fn(), onMerge: vi.fn(), canMerge: true,
      viewMode: 'grid' as const, setViewMode: vi.fn(),
      gridColumns: 3, setGridColumns: vi.fn(),
      totalCount: 2,
      crmIntegrationEnabled: false, onOpenCRM: vi.fn(),
    };

    render(<ContactToolbar {...props} />);

    expect(screen.queryByRole('button', { name: /tags/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Comparar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mesclar' })).toBeInTheDocument();
  });
});
