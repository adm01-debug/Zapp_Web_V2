/**
 * R2-MOD-007 (item 100 / P1) — envio em lote do catálogo.
 *
 * Prova o defeito: `sendSingleProduct` começava `imageOk = true` mesmo sem
 * tentativa de imagem, então a rejeição do único texto enviado (produto sem
 * imagem) virava `partial`, o agregador contava como sucesso e o encerramento
 * limpava a seleção (onSent) mesmo com itens falhados.
 *
 * Aceite do achado:
 * - produto sem imagem + texto rejeitado → failed, zero sucesso, id preservado
 *   para retry (não entra em onSent);
 * - lote misto discrimina enviados, parciais e falhados com contagem e seleção
 *   correspondentes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CatalogBulkSendDialog } from '../CatalogBulkSendDialog';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

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
vi.mock('@/hooks/integrations/useCatalogContactSearch', () => ({
  logCatalogSendEvent: (...args: unknown[]) => mockLogCatalogSendEvent(...args),
}));

// O contato já está escolhido: o teste foca no laço de envio.
vi.mock('../useSendProduct', () => ({
  useContactSearch: () => ({
    contactSearch: '',
    setContactSearch: vi.fn(),
    contactResults: [],
    searchingContacts: false,
    selectedContact: { id: 'c1', name: 'Contato Teste' },
    setSelectedContact: vi.fn(),
    resetContactSelection: vi.fn(),
  }),
}));

// O passo de contato só precisa disparar onSend; o conteúdo dele não é o alvo.
vi.mock('../ContactSelectionStep', () => ({
  ContactSelectionStep: ({ onSend }: { onSend: () => void }) => (
    <button type="button" onClick={onSend}>Enviar lote</button>
  ),
}));

// A mensagem começa com o id do produto: assim o mock de sendOutboundMessage
// distingue cada produto (imagem pelo mediaUrl, texto pelo content).
vi.mock('../sendProductUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sendProductUtils')>();
  return { ...actual, buildMessage: (product: ExternalProduct) => `preco:${product.id}` };
});

const product = (o: Partial<ExternalProduct>): ExternalProduct => ({
  id: 'p1', name: 'Produto', sku: 'SKU-1', sale_price: 10,
  primary_image_url: null, primary_image_fallback_url: null, is_stockout: false,
  ...o,
} as unknown as ExternalProduct);

/** Anda até o passo de contato e dispara o envio do lote. */
const iniciarEnvio = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar Contato' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar lote' }));
};

/**
 * Rejeita as chaves listadas e confirma o resto. As chaves são o mediaUrl
 * (imagem) ou o content `preco:<id>` (texto).
 */
const responderEnvio = (falhas: string[]) => {
  mockSendOutboundMessage.mockImplementation((req: { messageType: string; content: string; mediaUrl?: string }) => {
    const chave = req.messageType === 'image' ? req.mediaUrl ?? '' : req.content;
    return falhas.includes(chave)
      ? Promise.reject(new Error(`falha simulada: ${chave}`))
      : Promise.resolve({ id: `msg-${chave}` });
  });
};

const renderDialog = (products: ExternalProduct[], onSent = vi.fn()) => {
  render(
    <CatalogBulkSendDialog products={products} open onOpenChange={vi.fn()} onSent={onSent} />
  );
  return onSent;
};

beforeEach(() => {
  mockToast.success.mockReset();
  mockToast.warning.mockReset();
  mockToast.error.mockReset();
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  mockSendOutboundMessage.mockReset();
  mockLogCatalogSendEvent.mockReset();
  mockLogCatalogSendEvent.mockResolvedValue(undefined);
});

describe('R2-MOD-007 — resultado do envio em lote do catálogo', () => {
  it('produto sem imagem com texto rejeitado é falha integral: zero sucesso e id não entra em onSent', async () => {
    responderEnvio(['preco:p1']);
    const onSent = renderDialog([product({ id: 'p1', primary_image_url: null })]);

    iniciarEnvio();

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    // Sem imagem só há uma tentativa: a rejeição do texto é falha integral.
    expect(mockSendOutboundMessage).toHaveBeenCalledTimes(1);
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalledTimes(1);
    // Nada concluído → nenhum id removido da seleção (item preservado p/ retry).
    expect(onSent).toHaveBeenCalledWith([]);
  });

  it('lote misto discrimina enviados, parciais e falhados na contagem e na seleção', async () => {
    responderEnvio(['preco:pParcial', 'preco:pFalha']);
    const onSent = renderDialog([
      product({ id: 'pOk', primary_image_url: 'https://x/ok.jpg' }),
      product({ id: 'pParcial', primary_image_url: 'https://x/parcial.jpg' }),
      product({ id: 'pFalha', primary_image_url: null }),
    ]);

    iniciarEnvio();

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    // pOk: imagem+texto ok; pParcial: imagem ok e texto falhou; pFalha: texto falhou.
    expect(mockToast.success).not.toHaveBeenCalled();
    const resumo = mockToast.warning.mock.calls[0]?.[1] as { description?: string } | undefined;
    expect(resumo?.description).toContain('1 enviado');
    expect(resumo?.description).toContain('1 parcial');
    expect(resumo?.description).toContain('1 falha');
    // Só o concluído sai da seleção; parciais e falhados ficam para reenvio.
    expect(onSent).toHaveBeenCalledWith(['pOk']);
  });

  it('lote todo concluído anuncia sucesso e devolve todos os ids', async () => {
    responderEnvio([]);
    const onSent = renderDialog([
      product({ id: 'p1', primary_image_url: 'https://x/1.jpg' }),
      product({ id: 'p2', primary_image_url: 'https://x/2.jpg' }),
    ]);

    iniciarEnvio();

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(mockToast.success).toHaveBeenCalledTimes(1);
    expect(mockToast.warning).not.toHaveBeenCalled();
    expect(onSent).toHaveBeenCalledWith(['p1', 'p2']);
  });
});
