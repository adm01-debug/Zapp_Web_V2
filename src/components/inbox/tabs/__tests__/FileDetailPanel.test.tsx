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

import { FileDetailContent, FileDetailPanel } from '../FileDetailPanel';
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

function renderContent(overrides: Partial<ContactMediaItem> = {}) {
  const props = {
    item: mediaItem(overrides),
    contactName: 'Ana Cliente',
    onClose: vi.fn(),
    onRequestDelete: vi.fn(),
  };
  return { ...render(<FileDetailContent {...props} />), props };
}

function renderPanel(item: ContactMediaItem) {
  const props = { item, contactName: 'Ana Cliente', onClose: vi.fn(), onRequestDelete: vi.fn() };
  return { ...render(<FileDetailPanel {...props} />), props };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.from.mockReturnValue({ createSignedUrl: storageMocks.createSignedUrl });
  storageMocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: FRESH }, error: null });
});

describe('FileDetailContent — SL-083 (G4/G5)', () => {
  it('G5: mostra a URL assinada em lote sem pedir assinatura individual', () => {
    const { container } = renderContent();

    expect(container.querySelector('img')).toHaveAttribute('src', BATCH);
    expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('G5: quando a URL em lote falha, renova UMA vez pelo locator durável', async () => {
    const { container } = renderContent();

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    await waitFor(() => expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1));
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('c/planilha.png', 3600);
  });

  it('G4: não oferece "Copiar link" e nada escreve na área de transferência', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { props } = renderContent();
    // Percorre TODAS as ações do painel (as desabilitadas não disparam handler).
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);

    expect(screen.queryByText(/Copiar link/i)).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
    // "Excluir" continua PEDINDO a exclusão ao dono do estado (nunca apaga sozinho).
    expect(props.onRequestDelete).toHaveBeenCalledTimes(1);
  });
});

describe('FileDetailContent — R2-INB-060', () => {
  it('mostra a imagem de B depois de a imagem de A falhar no mesmo painel, sem desmontar', () => {
    const imagemA = mediaItem({ id: 'a1', signedUrl: `${BATCH}-a`, displayName: 'foto-a.png', filename: 'IMG-1.jpg' });
    const imagemB = mediaItem({ id: 'b2', signedUrl: `${BATCH}-b`, displayName: 'foto-b.png', filename: 'IMG-2.jpg' });
    const { container, rerender, props } = renderPanel(imagemA);
    const imgA = container.querySelector('img');
    expect(imgA).not.toBeNull();
    expect(imgA).toHaveAttribute('src', `${BATCH}-a`);

    // A falha (URL expirada/objeto ausente) e o placeholder de erro entra no lugar.
    fireEvent.error(imgA as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();

    // O usuário seleciona o arquivo B na lista: mesma instância, nova prop `item`.
    rerender(<FileDetailPanel {...props} item={imagemB} />);

    const imgB = container.querySelector('img');
    expect(imgB).not.toBeNull();
    expect(imgB).toHaveAttribute('src', `${BATCH}-b`);
    expect(imgB).toHaveAttribute('alt', 'foto-b.png');
    // O resto dos detalhes também tem de acompanhar o novo arquivo.
    expect(screen.getByText('foto-b.png')).toBeInTheDocument();
    expect(screen.queryByText('foto-a.png')).not.toBeInTheDocument();
  });

  it('a renovação bem-sucedida da URL reapresenta a imagem do mesmo arquivo', () => {
    const expirada = mediaItem({ id: 'c3', displayName: 'foto-c.png', signedUrl: `${BATCH}-expirada` });
    const renovada = { ...expirada, signedUrl: `${FRESH}-renovada` };
    const { container, rerender, props } = renderPanel(expirada);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', `${BATCH}-expirada`);

    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    // O resolvedor terminou o refresh e a consulta entregou uma URL assinada nova.
    rerender(<FileDetailPanel {...props} item={renovada} />);

    expect(container.querySelector('img')).toHaveAttribute('src', `${FRESH}-renovada`);
  });

  it('a mesma URL que falhou continua com o placeholder (o erro não é esquecido a cada render)', () => {
    const imagemA = mediaItem({ id: 'a1', signedUrl: `${BATCH}-a`, displayName: 'foto-a.png' });
    const { container, rerender, props } = renderPanel(imagemA);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    rerender(<FileDetailPanel {...props} />);

    expect(container.querySelector('img')).toBeNull();
  });
});
