import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * R2-INB-059 — a miniatura recebe uma URL assinada em lote (etapa 10) e, quando essa URL
 * falha, precisa renovar a assinatura pelo locator (`item.url`). O teste usa o resolver REAL
 * (sem o mock global de `useResolvedStorageUrl`) e o cliente do Storage mockado.
 */
const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: storageMocks.from } },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { FileThumb } from '../FileThumb';
import { PRODUCTION_SUPABASE_URL } from '@/config/supabase';

const ORIGIN = new URL(PRODUCTION_SUPABASE_URL).origin;
const LOCATOR = `${ORIGIN}/storage/v1/object/public/whatsapp-media/c/planilha.png`;
const BATCH = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/planilha.png?token=batch`;
const FRESH = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/planilha.png?token=fresh`;
const RENEWED_AGAIN = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/planilha.png?token=again`;

function base(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'x', url: LOCATOR, type: 'image', filename: 'planilha.png', displayName: 'planilha.png',
    extension: 'png', senderLabel: null, created_at: '2026-01-10T10:00:00.000Z', caption: null,
    mimetype: 'image/png', size: null, meta: null, sender: 'contact',
    signedUrl: BATCH, expiresAt: Date.now() + 3_600_000, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.from.mockReturnValue({ createSignedUrl: storageMocks.createSignedUrl });
  storageMocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: FRESH },
    error: null,
  });
});

describe('FileThumb — renovação da assinatura em lote (R2-INB-059)', () => {
  it('mostra a URL em lote sem pedir outra assinatura', () => {
    const { container } = render(<FileThumb item={base()} size="row" />);

    expect(container.querySelector('img')).toHaveAttribute('src', BATCH);
    expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('renova pelo locator quando a URL em lote falha e troca o src da miniatura', async () => {
    const { container } = render(<FileThumb item={base()} size="row" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('src', FRESH),
    );
    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('c/planilha.png', 3600);
    expect(screen.queryByTitle('Prévia indisponível')).not.toBeInTheDocument();
  });

  it('nao repete o refresh quando a URL renovada tambem falha', async () => {
    const { container } = render(<FileThumb item={base()} size="row" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('src', FRESH),
    );

    storageMocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: RENEWED_AGAIN }, error: null });
    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    await screen.findByTitle('Prévia indisponível');
    expect(container.querySelector('img')).toBeNull();
    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1);
  });
});
