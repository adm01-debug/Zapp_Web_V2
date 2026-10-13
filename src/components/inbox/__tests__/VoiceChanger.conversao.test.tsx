import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceChanger } from '../VoiceChanger';
import { ELEVENLABS_VOICES } from '../VoiceSelector';
import { toast } from 'sonner';

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://local.supabase.test',
  SUPABASE_ANON_KEY: 'anon',
}));
vi.mock('@/lib/edgeAuthHeaders', () => ({ edgeAuthHeaders: async () => ({ Authorization: 'Bearer x' }) }));
vi.mock('@/lib/mediaVolumeElement', () => ({ attachMediaVolume: () => () => {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const fetchMock = vi.fn();

describe('VoiceChanger — conversão de voz e confirmação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:conv');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    // jsdom não implementa play(); a conversão termina com o áudio "tocando".
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  function okResponse() {
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob(['audio'], { type: 'audio/webm' }),
      json: async () => ({}),
    };
  }

  async function abrirEConverter() {
    const onVoiceChanged = vi.fn();
    render(<VoiceChanger audioBlob={new Blob(['x'])} onVoiceChanged={onVoiceChanged} />);
    fireEvent.click(screen.getByTitle('Alterar voz com IA'));

    const voz = ELEVENLABS_VOICES[0];
    fireEvent.click(screen.getByRole('button', { name: (n: string) => n.includes(voz.name) }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    return onVoiceChanged;
  }

  it('chama a Edge Function elevenlabs-sts com o id da voz escolhida', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await abrirEConverter();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://local.supabase.test/functions/v1/elevenlabs-sts',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('mostra a prévia e entrega o áudio convertido ao confirmar', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const onVoiceChanged = await abrirEConverter();

    fireEvent.click(screen.getByRole('button', { name: /Usar esta voz/ }));

    await waitFor(() => expect(onVoiceChanged).toHaveBeenCalledTimes(1));
    expect(onVoiceChanged.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it('avisa quando a conversão falha e não libera a prévia', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Voz indisponível' }) });
    render(<VoiceChanger audioBlob={new Blob(['x'])} onVoiceChanged={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Alterar voz com IA'));
    fireEvent.click(screen.getByRole('button', { name: (n: string) => n.includes(ELEVENLABS_VOICES[0].name) }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao converter voz: Voz indisponível'));
    expect(screen.queryByRole('button', { name: /Usar esta voz/ })).not.toBeInTheDocument();
  });
});
