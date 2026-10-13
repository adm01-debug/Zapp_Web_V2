import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * "Nada de spinner eterno": quando a mídia falha, o preview do vídeo tem que trocar
 * o carregamento por um erro com ação de tentar de novo. Antes, o `onError` só
 * re-resolvia a URL e o spinner (`!isLoaded`) continuava girando para sempre.
 *
 * O teste renderiza o componente REAL (`VideoPreview`) e dispara o `error` do
 * `<video>` — e não um mock que já entrega o estado pronto.
 */
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: null } })) })) },
  },
}));

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { VideoPreview } from '../MediaPreview';

const URL_PUBLICA = 'https://cdn.test/preview.mp4';

describe('erro de carregamento no preview de vídeo', () => {
  it('o erro do <video> troca o spinner pelo aviso com "Tentar de novo"', () => {
    const { container } = render(<VideoPreview url={URL_PUBLICA} isSent={false} />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(container.querySelector('.animate-spin')).not.toBeNull();

    fireEvent.error(video!);

    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar o vídeo');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });

  it('"Tentar de novo" limpa o erro e o vídeo volta a ser montado', () => {
    const { container } = render(<VideoPreview url={URL_PUBLICA} isSent={false} />);

    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('video')).not.toBeNull();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('vídeo que carrega normalmente não mostra aviso nenhum', () => {
    const { container } = render(<VideoPreview url={URL_PUBLICA} isSent={false} />);

    fireEvent.loadedData(container.querySelector('video')!);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});
