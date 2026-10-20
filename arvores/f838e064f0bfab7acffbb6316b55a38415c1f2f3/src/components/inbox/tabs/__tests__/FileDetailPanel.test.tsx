import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * SL-083 (G4 e G5) — painel de detalhes do arquivo.
 *
 * A evidência do defeito antigo é `FileDetailPanel.tsx:27`, que escrevia
 * `resolvedUrl || item.url` (a URL ASSINADA, temporária) na área de transferência e
 * assinava um objeto por painel. O que este teste trava:
 * - G4: o painel não tem "Copiar link" e nada vai para a área de transferência;
 * - G5: o painel lê a assinatura EM LOTE (`item.signedUrl`) e NÃO pede assinatura
 *   individual enquanto a semente vale; quando a URL em lote falha, renova UMA vez
 *   pelo locator durável (`item.url`) — o mesmo contrato da miniatura (R2-INB-059).
 *
 * O resolver é o REAL (sem mock de `useResolvedStorageUrl`); só o cliente do Storage e o
 * logger são mockados, igual a `FileThumb.assinatura-em-lote.test.tsx`.
 */
const storageMocks = vi.hoisted(() => ({ from: vi.fn(), createSignedUrl: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: storageMocks.from } },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { FileDetailContent } from '../FileDetailPanel';
import { PRODUCTION_SUPABASE_URL } from '@/config/supabase';

const ORIGIN = new URL(PRODUCTION_SUPABASE_URL).origin;
const LOCATOR = `${ORIGIN}/storage/v1/object/public/whatsapp-media/c/planilha.png`;
const BATCH = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/planilha.png?token=batch`;
const FRESH = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/planilha.png?token=fresh`;

function mediaItem(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'a1', url: LOCATOR, type: 'image', filename: 'planilha.png', displayName: 'planilha.png',
    extension: 'png', senderLabel: 'Atendente', created_at: '2026-01-10T10:00:00.000Z', caption: null,
    mimetype: 'image/png', size: 1200, meta: null, sender: 'agent',
    signedUrl: BATCH, expiresAt: Date.now() + 3_600_000, ...overrides,
  };
}

function renderPanel(overrides: Partial<ContactMediaItem> = {}) {
  const props = {
    item: mediaItem(overrides),
    contactName: 'Ana Cliente',
    onClose: vi.fn(),
    onRequestDelete: vi.fn(),
  };
  return { ...render(<FileDetailContent {...props} />), props };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.from.mockReturnValue({ createSignedUrl: storageMocks.createSignedUrl });
  storageMocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: FRESH }, error: null });
});

describe('FileDetailContent — SL-083 (G4/G5)', () => {
  it('G5: mostra a URL assinada em lote sem pedir assinatura individual', () => {
    const { container } = renderPanel();

    expect(container.querySelector('img')).toHaveAttribute('src', BATCH);
    expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('G5: quando a URL em lote falha, renova UMA vez pelo locator durável', async () => {
    const { container } = renderPanel();

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    await waitFor(() => expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1));
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('c/planilha.png', 3600);
  });

  it('G4: não oferece "Copiar link" e nada escreve na área de transferência', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { props } = renderPanel();
    // Percorre TODAS as ações do painel (as desabilitadas não disparam handler).
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);

    expect(screen.queryByText(/Copiar link/i)).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
    // "Excluir" continua PEDINDO a exclusão ao dono do estado (nunca apaga sozinho).
    expect(props.onRequestDelete).toHaveBeenCalledTimes(1);
  });
});
