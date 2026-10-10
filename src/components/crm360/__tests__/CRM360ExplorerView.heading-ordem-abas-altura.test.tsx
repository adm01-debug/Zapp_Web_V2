import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CRM360ExplorerView } from '../CRM360ExplorerView';

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: vi.fn(() => ({ isSupervisor: true, loading: false })),
}));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: vi.fn(() => true),
}));

vi.mock('@/components/crm360/CRM360StatsCards', () => ({
  CRM360StatsCards: () => <div data-testid="stats-cards" />,
}));

vi.mock('@/components/crm360/CompanyFormDialog', () => ({
  CompanyFormDialog: () => null,
}));

vi.mock('@/components/crm360/ContactFormDialog', () => ({
  ContactFormDialog: () => null,
}));

vi.mock('@/components/crm360/DataExplorerTable', () => ({
  DataExplorerTable: () => <div data-testid="data-table" />,
}));

describe('CRM360ExplorerView — hierarquia de títulos e altura de toque das abas', () => {
  it('usa h1 para o título da página e h2 para o título de seção da tabela (não h3)', () => {
    const { container } = render(<CRM360ExplorerView />);

    // Título da página é h1
    const h1 = container.querySelector('h1');
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('CRM 360° Explorer');

    // O título da seção da tabela deve ser h2 (não h3 — CardTitle antes renderizava h3)
    const h2 = container.querySelector('h2');
    expect(h2).toBeInTheDocument();
    expect(h2).toHaveTextContent('Empresas');

    // Não deve haver h3 como título de seção da tabela
    const h3InTabSection = container.querySelector('h3');
    expect(h3InTabSection).not.toBeInTheDocument();
  });

  it('TabsTrigger tem min-h-[44px] para alvo de toque mínimo no celular', () => {
    const { container } = render(<CRM360ExplorerView />);

    // Encontra o trigger da aba "Empresas" dentro da tablist
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeInTheDocument();

    const trigger = tablist?.querySelector('[role="tab"]');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('min-h-[44px]');
  });
});