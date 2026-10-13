import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RealtimeTranscription } from '../RealtimeTranscription';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const scribe = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
}));

vi.mock('@elevenlabs/react', () => ({
  CommitStrategy: { VAD: 'vad' },
  useScribe: () => ({
    isConnected: scribeState.isConnected,
    partialTranscript: '',
    committedTranscripts: [],
    connect: scribe.connect,
    disconnect: scribe.disconnect,
  }),
}));

const scribeState = vi.hoisted(() => ({ isConnected: false }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const invoke = vi.mocked(supabase.functions.invoke);

describe('RealtimeTranscription — ligar/desligar o STT ao vivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scribeState.isConnected = false;
  });

  it('pede o token à Edge Function e conecta o scribe', async () => {
    invoke.mockResolvedValue({ data: { token: 'tok' }, error: null } as never);
    const onStatusChange = vi.fn();
    render(<RealtimeTranscription onStatusChange={onStatusChange} />);

    fireEvent.click(screen.getByRole('button', { name: /STT em Tempo Real/ }));

    await waitFor(() => expect(scribe.connect).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok' })));
    expect(invoke).toHaveBeenCalledWith('elevenlabs-scribe-token');
    expect(onStatusChange).toHaveBeenCalledWith('connecting');
    expect(toast.success).toHaveBeenCalledWith('Transcrição em tempo real ativada');
  });

  it('vira estado de erro e avisa quando a Edge Function falha', async () => {
    // A Edge Function devolve erro E um token: o diálogo deve parar no erro.
    invoke.mockResolvedValue({ data: { token: 'tok' }, error: { message: 'invalid key' } } as never);
    const onStatusChange = vi.fn();
    render(<RealtimeTranscription onStatusChange={onStatusChange} />);

    fireEvent.click(screen.getByRole('button', { name: /STT em Tempo Real/ }));

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('error'));
    expect(toast.error).toHaveBeenCalledWith('Erro ao iniciar transcrição em tempo real');
    expect(scribe.connect).not.toHaveBeenCalled();
  });

  it('com o scribe conectado mostra Ouvindo e Parar, e desconecta ao clicar', () => {
    scribeState.isConnected = true;
    const onStatusChange = vi.fn();
    render(<RealtimeTranscription onStatusChange={onStatusChange} />);

    expect(screen.getByText('Ouvindo...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Parar STT/ }));

    expect(scribe.disconnect).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('idle');
    expect(toast.info).toHaveBeenCalledWith('Transcrição em tempo real desativada');
  });
});
