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
    div: ({ children, ...rest }: any) => <div>{children}</div>,
    span: ({ children, ...rest }: any) => <span>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock tooltip
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <span>{children}</span>,
}));

describe('VoiceDictationButton', () => {
  it('renders when speech is supported', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('returns null when not supported', async () => {
    const { useSpeechToText } = await import('@/hooks/communication/useSpeechToText');
    (useSpeechToText as any).mockReturnValueOnce({
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
