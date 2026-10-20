import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
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
  it('usa h1 para o título da página e h2 para o título de seção da tabela, em ordem h1 → h2', () => {
    const { container } = render(<CRM360ExplorerView />);

    // Título da página é h1
    const h1 = container.querySelector('h1');
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('CRM 360° Explorer');

    // O título da seção da tabela deve ser h2 (não h3 — CardTitle antes renderizava h3)
    const h2 = container.querySelector('h2');
    expect(h2).toBeInTheDocument();
    expect(h2).toHaveTextContent('Empresas');

    // Ordem h1 → h2 sem salto de nível (h1 → h3 seria salto; h3 futuro legítimo sob h2 continua passando)
    const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const levels = headings.map((el) => Number(el.tagName.substring(1)));
    expect(levels[0]).toBe(1);
    expect(levels[1]).toBe(2);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
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

  it('o axe não acusa heading-order na tela (h1 → h2)', async () => {
    render(<CRM360ExplorerView />);

    // Mesmo padrão do repo (EvolutionDisconnectBanner, NotificationsPanel):
    // varre o document.body com color-contrast desligado (jsdom não tem layout)
    // e filtra só a regra estrutural que este cartão corrige.
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'heading-order')).toEqual([]);
  });
});
