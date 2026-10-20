import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaPreviewDialog } from '../MediaPreviewDialog';
import type { MediaItem } from '../mediaUtils';

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => ({}),
}));

type Preview = MediaItem & { displayName: string };

const IMAGE = (id: string, name: string): Preview => ({
  id, url: `https://signed.test/${id}.png`, type: 'image', filename: `${id}-original.png`,
  created_at: '2026-01-10T10:00:00.000Z', caption: null, displayName: name,
});

const ITEMS: Preview[] = [IMAGE('a', 'Foto A'), IMAGE('b', 'Foto B'), IMAGE('c', 'Foto C')];

function renderViewer(initial: Preview, items?: Preview[]) {
  function Harness() {
    const [item, setItem] = useState<MediaItem & { displayName?: string }>(initial);
    return <MediaPreviewDialog item={item} open onOpenChange={() => {}} items={items} onNavigate={setItem} />;
  }
  return render(<Harness />);
}

beforeEach(() => vi.clearAllMocks());

describe('MediaPreviewDialog (etapa 30 — visualizador único e navegável)', () => {
  it('título = displayName e nome técnico no DialogDescription', () => {
    renderViewer(ITEMS[1], ITEMS);
    const dialog = screen.getByRole('dialog', { name: 'Foto B' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('b-original.png')).toBeInTheDocument();
  });

  it('abrir o 2º de 3: Próximo vai ao 3º, Anterior volta ao 2º', () => {
    renderViewer(ITEMS[1], ITEMS);
    expect(screen.getByRole('dialog', { name: 'Foto B' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('dialog', { name: 'Foto C' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('dialog', { name: 'Foto B' })).toBeInTheDocument();
  });

  it('setas ← → percorrem a coleção filtrada', () => {
    renderViewer(ITEMS[1], ITEMS);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Foto C' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'Foto B' })).toBeInTheDocument();
  });

  it('Anterior desabilitado no primeiro e Próximo no último item', () => {
    const first = renderViewer(ITEMS[0], ITEMS);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    first.unmount();

    renderViewer(ITEMS[2], ITEMS);
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeDisabled();
  });

  it('devolve o foco ao gatilho ao fechar', async () => {
    function FocusHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>abrir</button>
          {open && <MediaPreviewDialog item={ITEMS[0]} open={open} onOpenChange={setOpen} />}
        </>
      );
    }
    render(<FocusHarness />);
    const abrir = screen.getByRole('button', { name: 'abrir' });
    abrir.focus();
    fireEvent.click(abrir);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(abrir));
  });

  it('não tem botão de download nem de abrir em nova aba no cabeçalho; áudio com nodownload', () => {
    const audio: Preview = { ...IMAGE('a', 'Recado'), type: 'audio', url: 'https://signed.test/a.ogg', filename: 'a.ogg' };
    renderViewer(audio);
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const el = document.querySelector('audio');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('controlslist')).toBe('nodownload');
  });

  it('o X do cabeçalho fecha a janela', () => {
    function CloseHarness() {
      const [open, setOpen] = useState(true);
      return <MediaPreviewDialog item={ITEMS[0]} open={open} onOpenChange={setOpen} />;
    }
    render(<CloseHarness />);
    expect(screen.getByRole('dialog', { name: 'Foto A' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('MediaPreviewDialog (V01 — janela menor: -40% largura, -20% altura)', () => {
  // A largura vem de classe arbitraria do Tailwind; o `DialogContent` base traz `max-w-lg`
  // e `max-h-[calc(100dvh-2rem)]`. O `cn` (tailwind-merge) tem de deixar as classes daqui vencerem.
  it('largura ~538px com teto da tela e o base max-w-lg descartado', () => {
    renderViewer(ITEMS[0], ITEMS);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-w-[min(538px,calc(100vw_-_2rem))]');
    expect(dialog.className).not.toContain('max-w-4xl');
    expect(dialog.className).not.toContain('max-w-lg');
  });

  it('altura máxima 64vh (80vh - 20%) e o base do dialog descartado', () => {
    renderViewer(ITEMS[0], ITEMS);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-h-[64vh]');
    expect(dialog.className).not.toContain('max-h-[80vh]');
    expect(dialog.className).not.toContain('max-h-[calc(100dvh-2rem)]');
  });

  it('imagem aparece inteira (object-contain) com altura máxima 56vh dentro da área de 320px', () => {
    renderViewer(ITEMS[0], ITEMS);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.className).toContain('max-w-full');
    expect(img?.className).toContain('max-h-[56vh]');
    expect(img?.className).toContain('object-contain');
    expect(img?.parentElement?.className).toContain('min-h-[320px]');
  });

  it('vídeo também baixa a altura máxima para 56vh', () => {
    const video: Preview = { ...IMAGE('v', 'clipe'), type: 'video', filename: 'clipe.mp4', url: 'https://signed.test/clipe.mp4' };
    renderViewer(video);
    const el = document.querySelector('video');
    expect(el).not.toBeNull();
    expect(el?.className).toContain('max-h-[56vh]');
    expect(el?.className).not.toContain('max-h-[70vh]');
  });

  it('figurinha (type sticker) abre como imagem e também respeita 56vh', () => {
    const sticker: Preview = { ...IMAGE('s', 'figurinha'), type: 'sticker', filename: 's.webp', url: 'https://signed.test/s.webp' };
    renderViewer(sticker);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.className).toContain('max-h-[56vh]');
    expect(img?.className).not.toContain('max-h-[70vh]');
    expect(img?.className).toContain('object-contain');
  });

  it('PDF (iframe) com 56vh de altura', () => {
    const pdf: Preview = { ...IMAGE('d', 'contrato.pdf'), type: 'document', filename: 'contrato.pdf', url: 'https://signed.test/contrato.pdf' };
    renderViewer(pdf);
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.className).toContain('h-[56vh]');
    expect(iframe?.parentElement?.className).toContain('min-h-[320px]');
  });
});

describe('MediaPreviewDialog (etapa 29 — caminho de leitura do documento)', () => {
  it('PDF abre dentro do ZAPP em <iframe> com URL assinada e #toolbar=0', () => {
    const pdf: Preview = { ...IMAGE('d', 'contrato.pdf'), type: 'document', filename: 'contrato.pdf', url: 'https://signed.test/contrato.pdf' };
    renderViewer(pdf);
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://signed.test/contrato.pdf#toolbar=0');
    expect(iframe?.getAttribute('title')).toBe('contrato.pdf');
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument();
  });

  it('planilha (.xlsx) mostra ícone + nome + "Abrir" com noopener', () => {
    const xlsx: Preview = { ...IMAGE('e', 'planilha.xlsx'), type: 'document', filename: 'planilha.xlsx', url: 'https://signed.test/planilha.xlsx' };
    renderViewer(xlsx);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(abrir);
    expect(openSpy).toHaveBeenCalledWith('https://signed.test/planilha.xlsx', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('imagem, vídeo e áudio continuam só internos (sem "Abrir")', () => {
    (['image', 'video', 'audio'] as const).forEach((type) => {
      const item: Preview = { ...IMAGE('x', 'midia'), type, url: `https://signed.test/m.${type}` };
      const { unmount } = renderViewer(item);
      expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument();
      unmount();
    });
  });
});
