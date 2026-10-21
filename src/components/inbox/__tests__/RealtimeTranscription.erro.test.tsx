/**
 * Doc 11 (achado G12) — transcrição em tempo real:
 *  • o "Ouvindo..." e o texto parcial precisam ser anunciados (aria-live) —
 *    o operador cego não enxergava que a captura estava ativa;
 *  • 401 de SESSÃO e chave inválida da ElevenLabs davam a MESMA frase ("Chave
 *    da ElevenLabs inválida"), mandando o operador mexer na chave quando o que
 *    venceu foi a sessão dele.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const { invoke, toastErro } = vi.hoisted(() => ({ invoke: vi.fn(), toastErro: vi.fn() }));
const { scribe } = vi.hoisted(() => ({ scribe: { conectado: false, parcial: '' } }));

vi.mock('sonner', () => ({ toast: { error: toastErro, success: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock('@elevenlabs/react', () => ({
  CommitStrategy: { VAD: 'vad' },
  useScribe: () => ({
    isConnected: scribe.conectado,
    partialTranscript: scribe.parcial,
    committedTranscripts: [] as string[],
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

import { RealtimeTranscription } from '../RealtimeTranscription';

/** Corpo de resposta da Edge, como o `functions.invoke` entrega: dentro de `error.context`. */
const comCorpo = (corpo: { error: string }) => ({
  data: null,
  error: {
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => corpo },
  },
});

async function tentarIniciar() {
  render(<RealtimeTranscription />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /STT em Tempo Real/ }));
  });
}

describe('G12 — erros e anúncios da transcrição em tempo real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scribe.conectado = false;
    scribe.parcial = '';
  });

  it('401 de SESSÃO manda entrar de novo, não mexer na chave', async () => {
    invoke.mockResolvedValue(comCorpo({ error: 'Missing Authorization' }));

    await tentarIniciar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/Sessão expirada/);
    expect(alerta).not.toHaveTextContent(/Chave da ElevenLabs inválida/);
    expect(toastErro).toHaveBeenCalledWith(expect.stringMatching(/Sessão expirada/));
  });

  it('chave inválida da ElevenLabs continua com a orientação certa', async () => {
    invoke.mockResolvedValue(comCorpo({ error: 'Invalid ElevenLabs API key' }));

    await tentarIniciar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/Chave da ElevenLabs inválida/);
  });

  it('"Ouvindo..." e o texto parcial são anunciados (aria-live=polite)', async () => {
    scribe.conectado = true;
    scribe.parcial = 'bom dia, tudo';

    await act(async () => { render(<RealtimeTranscription />); });

    await waitFor(() => expect(screen.getByText('Ouvindo...')).toBeInTheDocument());
    expect(screen.getByText('Ouvindo...').closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByText(/bom dia, tudo/).getAttribute('aria-live')).toBe('polite');
  });
});
