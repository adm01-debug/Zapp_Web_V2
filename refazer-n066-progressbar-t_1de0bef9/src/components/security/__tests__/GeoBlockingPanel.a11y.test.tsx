import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * t_a07d8dd9 — botões só de ícone do GeoBlockingPanel sem nome acessível (axe `button-name`) e
 * abas whitelist/blacklist que não usavam painel (TabsTrigger sem TabsContent correspondente).
 * Evidência da auditoria (docs/audits/AUDITORIA_A11Y_MOBILE_CONFIG_ADMIN_SHELL_2026-10-07.md:51).
 *
 * O hook é substituído por um dublê com ESTADO de verdade: a aba só troca se o dublê
 * realmente mudar o `activeTab`, que é o que o TabsContent observa.
 */
vi.mock('@/hooks/system/useGeoBlocking', async () => {
  const React = await import('react');
  const { vi } = await import('vitest');
  const allowed = [
    { id: 'c-1', country_code: 'BR', country_name: 'Brasil', created_at: '2026-10-01T00:00:00.000Z' },
    { id: 'c-2', country_code: 'AR', country_name: 'Argentina', created_at: '2026-10-01T00:00:00.000Z' },
  ];
  const blocked = [
    { id: 'c-3', country_code: 'CN', country_name: 'China', created_at: '2026-10-01T00:00:00.000Z' },
  ];
  return {
    useGeoBlocking: () => {
      const [activeTab, setActiveTab] = React.useState<'whitelist' | 'blacklist'>('whitelist');
      const [dialogOpen, setDialogOpen] = React.useState(false);
      const [selectedCountry, setSelectedCountry] = React.useState('');
      const [countryToRemove, setCountryToRemove] = React.useState<unknown>(null);
      return {
        settings: { id: 's-1', mode: 'disabled' },
        allowedCountries: allowed,
        blockedCountries: blocked,
        loading: false,
        dialogOpen,
        setDialogOpen,
        selectedCountry,
        setSelectedCountry,
        countryToRemove,
        setCountryToRemove,
        activeTab,
        setActiveTab,
        handleModeChange: vi.fn(),
        handleAddCountry: vi.fn(),
        handleRemoveCountry: vi.fn(),
      };
    },
  };
});

import { GeoBlockingPanel } from '../GeoBlockingPanel';

describe('a11y: botão de remover país com nome acessível', () => {
  it('o botão de remover país tem nome acessível em cada linha', () => {
    render(<GeoBlockingPanel />);
    expect(screen.getAllByRole('button', { name: 'Remover país' })).toHaveLength(2);
  });
});

describe('abas whitelist/blacklist usam painel (TabsContent)', () => {
  it('a busca aparece e filtra tanto na whitelist quanto na blacklist', async () => {
    render(<GeoBlockingPanel />);

    // --- whitelist (aba inicial) ---
    // cada aba é um painel (role=tabpanel) que contém a busca
    const painelWhitelist = screen.getByRole('tabpanel');
    const buscaWhitelist = screen.getByPlaceholderText('Buscar país...');
    expect(painelWhitelist).toContainElement(buscaWhitelist);
    expect(screen.getByText('Brasil')).toBeInTheDocument();
    fireEvent.change(buscaWhitelist, { target: { value: 'Brasil' } });
    expect(screen.getByText('Brasil')).toBeInTheDocument();
    // busca que não casa com a whitelist cai no estado vazio
    fireEvent.change(buscaWhitelist, { target: { value: 'China' } });
    await waitFor(() => expect(screen.getByText('Nenhum país encontrado')).toBeInTheDocument());
    fireEvent.change(buscaWhitelist, { target: { value: '' } });

    // --- blacklist: o painel troca, a busca continua na tela e funcional ---
    // Radix Tabs só ativa a aba no `mousedown` (não no `click` puro).
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Blacklist/ }));
    const buscaBlacklist = screen.getByPlaceholderText('Buscar país...');
    expect(screen.getByRole('tabpanel')).toContainElement(buscaBlacklist);
    expect(screen.getByText('China')).toBeInTheDocument();
    fireEvent.change(buscaBlacklist, { target: { value: 'Chi' } });
    expect(screen.getByText('China')).toBeInTheDocument();
    // busca que não casa com a blacklist cai no estado vazio
    fireEvent.change(buscaBlacklist, { target: { value: 'Brasil' } });
    await waitFor(() => expect(screen.getByText('Nenhum país encontrado')).toBeInTheDocument());
  });
});
