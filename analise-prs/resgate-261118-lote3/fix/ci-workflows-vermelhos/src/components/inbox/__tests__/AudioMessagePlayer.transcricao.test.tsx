/**
 * PE-55 / PD-64 — o SERVIDOR é a única fonte da transcrição.
 *
 * O defeito: `AudioMessagePlayer.tsx` gravava `messages.transcription` /
 * `transcription_status` pelo cliente, depois de chamar a Edge. Como a linha de
 * `messages` é gravável por qualquer atendente (PD-64 listava 'transcrição' entre
 * as colunas do cliente), qualquer sessão podia reescrever o texto de qualquer
 * áudio — auditado em 12/10/2026 (plano de paridade V3→V2, PE-55).
 *
 * A Edge `ai-transcribe-audio` passou a gravar `processing` → `completed`/`failed`
 * com service_role e a reusar o texto em re-execução (cartão pai t_dfe3e171). Com
 * isso o cliente só precisa INVOCAR e LER — a prova renderiza o player REAL e
 * confere que `supabase.from('messages')` NÃO é chamado em nenhum caminho, e que
 * o estado mostrado é o verdadeiro (falha visível, nunca preso em "Transcrevendo...").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const { invokeMock, fromMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), fromMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://test.com/audio.webm' } })),
      })),
    },
    functions: { invoke: invokeMock },
    from: fromMock,
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      void whileHover; void whileTap; void initial; void animate; void exit; void transition; void variants;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}));

import { AudioMessagePlayer } from '../AudioMessagePlayer';

const props = { audioUrl: 'https://test.com/audio.webm', messageId: 'msg-1', isSent: false };

describe('PE-55 — o cliente só lê a transcrição; quem grava é o servidor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Cadeia que o código ANTIGO usava: `supabase.from('messages').update(...).eq(...)`.
    fromMock.mockReturnValue({
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    });
  });

  it('não grava `messages` no sucesso (o servidor gravou)', async () => {
    invokeMock.mockResolvedValue({ data: { transcription: 'bom dia, tudo bem?', messageId: 'msg-1' }, error: null });
    render(<AudioMessagePlayer {...props} />);
    fireEvent.click(screen.getByTitle('Transcrever áudio'));
    await waitFor(() => expect(screen.getByText(/bom dia, tudo bem\?/)).toBeInTheDocument());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('não grava `messages` quando a Edge reusa a transcrição já salva', async () => {
    invokeMock.mockResolvedValue({ data: { transcription: 'texto reusado', reused: true, messageId: 'msg-1' }, error: null });
    render(<AudioMessagePlayer {...props} />);
    fireEvent.click(screen.getByTitle('Transcrever áudio'));
    await waitFor(() => expect(screen.getByText(/texto reusado/)).toBeInTheDocument());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('resposta sem texto não deixa o player preso em "Transcrevendo..." — falha visível', async () => {
    invokeMock.mockResolvedValue({ data: { transcription: '', fallback: false }, error: null });
    render(<AudioMessagePlayer {...props} />);
    fireEvent.click(screen.getByTitle('Transcrever áudio'));
    await waitFor(() => expect(screen.getByText('Falhou - Tentar novamente')).toBeInTheDocument());
    expect(screen.queryByText('Transcrevendo...')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('erro da Edge mostra "Falhou - Tentar novamente" e nenhuma escrita', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<AudioMessagePlayer {...props} />);
    fireEvent.click(screen.getByTitle('Transcrever áudio'));
    await waitFor(() => expect(screen.getByText('Falhou - Tentar novamente')).toBeInTheDocument());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('fallback de áudio não suportado mostra falha visível e nenhuma escrita', async () => {
    invokeMock.mockResolvedValue({ data: { fallback: true, errorMessage: 'formato não suportado' }, error: null });
    render(<AudioMessagePlayer {...props} />);
    fireEvent.click(screen.getByTitle('Transcrever áudio'));
    await waitFor(() => expect(screen.getByText('Falhou - Tentar novamente')).toBeInTheDocument());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('uma nova falha não apaga a transcrição já conhecida', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<AudioMessagePlayer {...props} existingTranscription="transcrição anterior" transcriptionStatus="failed" />);
    fireEvent.click(screen.getByText('Falhou - Tentar novamente'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/transcrição anterior/)).toBeInTheDocument());
    expect(fromMock).not.toHaveBeenCalled();
  });
});
