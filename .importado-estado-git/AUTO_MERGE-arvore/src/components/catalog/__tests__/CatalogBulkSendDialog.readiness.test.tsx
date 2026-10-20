/**
 * R2-MOD-008 (item 389 / P2) — pré-validação de envio do catálogo no LOTE.
 *
 * Prova o defeito: o `CatalogBulkSendDialog` nunca conectava
 * `useCatalogSendReadiness` ao seletor de contato — o passo recebia os defaults
 * (`sendBlockedReason = null`, `checkingSendReadiness = false`) e liberava o
 * envio em lote mesmo com o contato suprimido ou com a verificação indisponível.
 * O envio individual já bloqueava nesses dois casos.
 *
 * Aceite do achado:
 * - o lote responde às MESMAS pré-condições do individual para o mesmo
 *   contato/conexão (bloqueio por supressão/sem conexão impede prosseguir);
 * - falha controlada da consulta impede prosseguir e oferece retry com motivo
 *   claro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CatalogBulkSendDialog } from '../CatalogBulkSendDialog';
import { READINESS_UNAVAILABLE_REASON } from '@/hooks/integrations/useCatalogSendReadiness';
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

// A MESMA checagem pré-envio do envio individual — o teste controla a resposta
// e confere que o diálogo do lote a consome e a repassa ao seletor de contato.
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
  id: 'p1', name: 'Produto', sku: 'SKU-1', sale_price: 10,
  primary_image_url: null, primary_image_fallback_url: null, is_stockout: false,
  ...o,
} as unknown as ExternalProduct);

const readiness = (o: Partial<{
  checking: boolean; blocked: boolean; reason: string | null;
  unavailable: boolean; retry: () => void;
}>) => ({
  checking: false, blocked: false, reason: null, unavailable: false, retry: vi.fn(), ...o,
});

/** Anda até o passo de contato do lote. */
const irParaContato = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar Contato' }));
};

const renderDialog = () =>
  render(<CatalogBulkSendDialog products={[product({ id: 'p1' })]} open onOpenChange={vi.fn()} onSent={vi.fn()} />);

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
  mockReadiness.mockReturnValue(readiness({}));
});

describe('R2-MOD-008 — pré-validação de envio no lote do catálogo', () => {
  it('contato suprimido bloqueia o lote com o motivo e sem nenhum POST', () => {
    mockReadiness.mockReturnValue(readiness({
      blocked: true,
      reason: 'Contato na lista de supressão (opt-out/LGPD). Envio bloqueado para este número.',
    }));
    renderDialog();

    irParaContato();

    // Mesma consulta do individual, para o mesmo contato.
    expect(mockReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', phone: SELECTED_CONTACT.phone })
    );
    expect(screen.getByText(/lista de supressão/i)).toBeInTheDocument();
    const enviar = screen.getByText('Enviar para Contato Teste').closest('button');
    expect(enviar).toBeDisabled();

    // Bloqueado, nem o clique forçado dispara mensagem.
    fireEvent.click(enviar as HTMLButtonElement);
    expect(mockSendOutboundMessage).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('verificação indisponível impede prosseguir, explica o motivo e oferece retry', () => {
    const retry = vi.fn();
    mockReadiness.mockReturnValue(readiness({
      blocked: true, reason: READINESS_UNAVAILABLE_REASON, unavailable: true, retry,
    }));
    renderDialog();

    irParaContato();

    expect(screen.getByText(/não foi possível verificar as condições de envio/i)).toBeInTheDocument();
    expect(screen.getByText('Enviar para Contato Teste').closest('button')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('enquanto a checagem roda, o lote não começa o envio', () => {
    mockReadiness.mockReturnValue(readiness({ checking: true }));
    renderDialog();

    irParaContato();

    const enviar = screen.getByText('Enviar para Contato Teste').closest('button');
    expect(enviar).toBeDisabled();
    fireEvent.click(enviar as HTMLButtonElement);
    expect(mockSendOutboundMessage).not.toHaveBeenCalled();
  });

  it('verificação liberada mantém o envio em lote funcionando', async () => {
    mockSendOutboundMessage.mockResolvedValue({ id: 'msg-1' });
    renderDialog();

    irParaContato();
    fireEvent.click(screen.getByText('Enviar para Contato Teste'));

    await waitFor(() => expect(mockSendOutboundMessage).toHaveBeenCalled());
  });
});
