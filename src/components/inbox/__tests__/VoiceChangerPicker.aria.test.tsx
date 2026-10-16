import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { VoiceChangerPicker } from '../VoiceChangerPicker';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon',
}));
vi.mock('@/lib/mediaVolumeElement', () => ({ attachMediaVolume: () => () => {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: AnyProps) => <div>{children}</div>,
  PopoverTrigger: ({ children }: AnyProps) => <>{children}</>,
  PopoverContent: ({ children }: AnyProps) => <div>{children}</div>,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: AnyProps) => <>{children}</>,
  TooltipTrigger: ({ children }: AnyProps) => <>{children}</>,
  TooltipContent: ({ children }: AnyProps) => <>{children}</>,
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

describe('VoiceChangerPicker — botões de gravação com nome acessível (A11Y-13)', () => {
  it('nomeia o botão de gravar áudio', () => {
    render(<VoiceChangerPicker onSendAudio={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeInTheDocument();
  });
});
