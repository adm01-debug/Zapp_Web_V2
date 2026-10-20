/**
 * N-061 — barra de progresso do envio em massa sem nome acessível.
 * Evidência da recusa: axe `aria-progressbar-name` [serious] no passo
 * "Enviando produto…" do CatalogBulkSendDialog (`role="progressbar"` sem
 * `aria-label`/`aria-labelledby`). O leitor anuncia a % sem contexto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CatalogBulkSendDialog } from '../CatalogBulkSendDialog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import type { ContactResult } from '../useSendProduct';

const mockToast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: mockToast }));

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockSendOutboundMessage = vi.hoisted(() => vi.fn());
vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: (...args: unknown[]) => mockSendOutboundMessage(...args),
}));

const mockLogCatalogSendEvent = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogContactSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useCatalogContactSearch')>();
  return { ...actual, logCatalogSendEvent: (...args: unknown[]) => mockLogCatalogSendEvent(...args) };
});

const mockRecentSends = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogRecentSends', () => ({
  useCatalogRecentSends: (...args: unknown[]) => mockRecentSends(...args),
  CATALOG_SEND_EVENTS_KEY: ['catalog-send-events'],
}));

const mockReadiness = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogSendReadiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useCatalogSendReadiness')>();
  return { ...actual, useCatalogSendReadiness: (...args: unknown[]) => mockReadiness(...args) };
});

const SELECTED_CONTACT: ContactResult = {
  id: 'c1', name: 'Contato Teste', phone: '+55 (41) 9 9999-8888', avatar_url: null,
};

vi.mock('../useSendProduct', () => ({
  useContactSearch: () => ({
    contactSearch: '',
    setContactSearch: vi.fn(),
    contactResults: [],
    searchingContacts: false,
    selectedContact: SELECTED_CONTACT,
    setSelectedContact: vi.fn(),
    resetContactSelection: vi.fn(),
  }),
}));

const product = (o: Partial<ExternalProduct>): ExternalProduct => ({
  id: 'p1', name: 'Produto Teste', sku: 'SKU-1', sale_price: 10,
  primary_image_url: null, primary_image_fallback_url: null, is_stockout: false,
  ...o,
} as unknown as ExternalProduct);

/** Trava o envio no passo "sending" para a barra ficar visível na tela. */
const travarEnvioNoPassoSending = () => {
  mockSendOutboundMessage.mockReturnValue(new Promise(() => {}));
};

const renderDialogTravado = () => {
  travarEnvioNoPassoSending();
  render(
    <CatalogBulkSendDialog
      products={[product({ id: 'p1' }), product({ id: 'p2' })]}
      open
      onOpenChange={vi.fn()}
      onSent={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar Contato' }));
  fireEvent.click(screen.getByText('Enviar para Contato Teste'));
};

beforeEach(() => {
  mockToast.success.mockReset();
  mockToast.warning.mockReset();
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  mockSendOutboundMessage.mockReset();
  mockLogCatalogSendEvent.mockReset();
  mockLogCatalogSendEvent.mockResolvedValue(undefined);
  mockRecentSends.mockReset();
  mockRecentSends.mockReturnValue({ recent: [], topSent: [], isLoading: false, hasData: false });
  mockReadiness.mockReset();
  mockReadiness.mockReturnValue({
    checking: false, blocked: false, reason: null, unavailable: false, retry: vi.fn(),
  });
});

describe('N-061 — nome acessível da barra de progresso do envio em massa', () => {
  it('a barra do passo "enviando" tem nome acessível', async () => {
    renderDialogTravado();
    expect(await screen.findByRole('progressbar', { name: 'Envio em massa' })).toBeInTheDocument();
  });

  it('axe não acusa progressbar sem nome (regra aria-progressbar-name)', async () => {
    renderDialogTravado();
    await screen.findByRole('progressbar');
    // O diálogo monta em portal (document.body): o container do render não
    // contém a barra; o axe precisa varrer o body para enxergá-la.
    const results = await axe(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.filter((v) => v.id === 'aria-progressbar-name')).toEqual([]);
  });
});
