import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceChanger } from '../VoiceChanger';

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon',
}));
vi.mock('@/lib/edgeAuthHeaders', () => ({ edgeAuthHeaders: async () => ({}) }));
vi.mock('@/lib/mediaVolumeElement', () => ({ attachMediaVolume: () => () => {} }));
vi.mock('@/components/inbox/VoiceSelector', () => ({
  ELEVENLABS_VOICES: [{ id: 'v1', name: 'Voz Teste', description: 'desc', gender: 'female' }],
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: AnyProps) => <div>{children}</div>,
  PopoverTrigger: ({ children }: AnyProps) => <>{children}</>,
  PopoverContent: ({ children }: AnyProps) => <div>{children}</div>,
}));
vi.mock('framer-motion', () => {
  const passthrough =
    (tag: 'div' | 'button') =>
    ({ children, ...props }: AnyProps) => {
      const Tag = tag;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <Tag {...(props as any)}>{children}</Tag>;
    };
  return {
    motion: { div: passthrough('div'), button: passthrough('button') },
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

describe('VoiceChanger — botão de prévia com nome acessível (A11Y-13)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['a']) })));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:convertido' }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLMediaElement.prototype as any).play = vi.fn(async () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('nomeia o botão de ouvir/parar a prévia da voz convertida', async () => {
    render(<VoiceChanger audioBlob={new Blob(['x'])} onVoiceChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Voz Teste/ }));

    const botao = await screen.findByRole('button', { name: /prévia da voz/ });
    expect(botao).toBeInTheDocument();
  });
});
