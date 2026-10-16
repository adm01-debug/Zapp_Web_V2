import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VoiceDictationButton } from '@/components/mobile/VoiceDictationButton';

// Só a moldura visual é mockada (framer-motion/tooltip). O componente REAL e o
// hook REAL (useSpeechToText) ficam de pé: é o indicador deles que está sob teste.

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
    span: ({ children }: { children?: import('react').ReactNode }) => <span>{children}</span>,
  },
  AnimatePresence: ({ children }: { children?: import('react').ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: import('react').ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: import('react').ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: import('react').ReactNode }) => <span>{children}</span>,
}));

interface MockRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
}

const instances: MockRecognition[] = [];

class MockSpeechRecognition implements MockRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  start = vi.fn();
  // No navegador o encerramento chega DEPOIS de stop(): não é síncrono.
  stop = vi.fn();

  constructor() {
    instances.push(this);
  }
}

describe('VoiceDictationButton — troca de sessão de ditado', () => {
  let originalSR: unknown;

  beforeEach(() => {
    instances.length = 0;
    originalSR = (window as unknown as Record<string, unknown>).SpeechRecognition;
    (window as unknown as Record<string, unknown>).SpeechRecognition = MockSpeechRecognition;
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
  });

  afterEach(() => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = originalSR;
    vi.restoreAllMocks();
  });

  it('o evento final do ditado anterior não desliga o indicador da nova sessão', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />);

    // 1) ditado A começa
    fireEvent.click(screen.getByLabelText('Ditar mensagem'));
    expect(instances).toHaveLength(1);
    expect(screen.getByLabelText('Parar ditado')).toBeInTheDocument();

    // 2) operador encerra A — o evento final dele ainda não chegou
    fireEvent.click(screen.getByLabelText('Parar ditado'));
    expect(instances[0].stop).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Ditar mensagem')).toBeInTheDocument();

    // 3) nova sessão B começa antes do evento final de A chegar
    fireEvent.click(screen.getByLabelText('Ditar mensagem'));
    expect(instances).toHaveLength(2);
    expect(screen.getByLabelText('Parar ditado')).toBeInTheDocument();

    // 4) chega agora, atrasado, o evento final do ditado ANTERIOR
    act(() => {
      instances[0].onend?.();
    });

    // o indicador da sessão B (vigente) tem de continuar ligado
    expect(screen.getByLabelText('Parar ditado')).toBeInTheDocument();
  });

  it('o erro do ditado anterior não desliga o indicador da nova sessão', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Ditar mensagem'));
    fireEvent.click(screen.getByLabelText('Parar ditado'));
    fireEvent.click(screen.getByLabelText('Ditar mensagem'));

    expect(instances).toHaveLength(2);
    expect(screen.getByLabelText('Parar ditado')).toBeInTheDocument();

    // erro atrasado da sessão antiga
    act(() => {
      instances[0].onerror?.({ error: 'aborted' });
    });

    expect(screen.getByLabelText('Parar ditado')).toBeInTheDocument();
  });

  it('o evento final da sessão VIGENTE ainda desliga o indicador', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Ditar mensagem'));
    expect(screen.getByLabelText('Parar ditado')).toBeInTheDocument();

    // fim natural do ditado atual (silêncio, por exemplo)
    act(() => {
      instances[0].onend?.();
    });

    expect(screen.getByLabelText('Ditar mensagem')).toBeInTheDocument();
  });
});
