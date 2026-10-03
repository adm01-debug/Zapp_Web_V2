// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceDictationButton } from '@/components/mobile/VoiceDictationButton';

// Mock useSpeechToText
const mockToggleListening = vi.fn();
vi.mock('@/hooks/communication/useSpeechToText', () => ({
  useSpeechToText: vi.fn(() => ({
    isListening: false,
    isSupported: true,
    transcript: '',
    startListening: vi.fn(),
    stopListening: vi.fn(),
    toggleListening: mockToggleListening,
  })),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: import("react").ReactNode } & Record<string, unknown>) => <div>{children}</div>,
    span: ({ children, ...rest }: { children?: import("react").ReactNode } & Record<string, unknown>) => <span>{children}</span>,
  },
  AnimatePresence: ({ children }: { children?: import("react").ReactNode }) => <>{children}</>,
}));

// Mock tooltip
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: import("react").ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: import("react").ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: import("react").ReactNode }) => <span>{children}</span>,
}));

describe('VoiceDictationButton', () => {
  it('renders when speech is supported', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('returns null when not supported', async () => {
    const { useSpeechToText } = await import('@/hooks/communication/useSpeechToText');
    (useSpeechToText as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      isListening: false,
      isSupported: false,
      transcript: '',
      startListening: vi.fn(),
      stopListening: vi.fn(),
      toggleListening: vi.fn(),
    });

    const { container } = render(<VoiceDictationButton onTranscript={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('has correct aria-label when idle', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />);
    expect(screen.getByLabelText('Ditar mensagem')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
