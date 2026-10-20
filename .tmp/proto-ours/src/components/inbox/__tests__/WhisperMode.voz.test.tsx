/**
 * Sussurro por voz — gravar, enviar e ouvir a nota.
 *
 * Prova o contrato da coluna `audio_path` do cartão pai: o caminho enviado ao bucket
 * `audio-messages` é `<uid>/<conversa>/<uuid>` (três UUID, como a constraint
 * `whisper_messages_audio_path_formato` do banco exige), com `content` vazio na linha;
 * que a URL do áudio só é assinada quando o atendente pede para ouvir (o painel lista
 * até 20 notas — assinar todas no mount seria credencial desperdiçada); e que falha de
 * upload não grava a linha do sussurro, avisa e deixa tentar de novo.
 */
import type { ComponentProps, ReactNode } from 'react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WhisperMode } from '../WhisperMode';

const UID_GRAVADOR = '44444444-4444-4444-8444-444444444444';
const CONTATO = '22222222-2222-4222-8222-222222222222';
const AGENTE = '11111111-1111-4111-8111-111111111111';
const UUID_OBJETO = '99999999-9999-4999-8999-999999999999';
const AUDIO_DE_TERCEIRO =
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333';
const CAMINHO_ENVIADO = `${UID_GRAVADOR}/${CONTATO}/${UUID_OBJETO}`;

type MotionDivProps = ComponentProps<'div'> & {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  variants?: unknown;
  transition?: unknown;
};

const h = vi.hoisted(() => {
  const makeChain = () => {
    const result = { data: [], error: null };
    const c: Record<string, unknown> = {
      select: () => c,
      eq: () => c,
      order: () => c,
      limit: () => c,
      in: () => c,
      not: () => c,
      is: () => c,
      range: () => c,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return c;
  };

  const insertMock = vi.fn();
  const uploadMock = vi.fn();
  const createSignedUrlMock = vi.fn();
  const getPublicUrlMock = vi.fn();
  const removeMock = vi.fn();
  const removeStoredObjectMock = vi.fn();
  const storageFromMock = vi.fn(() => ({
    upload: uploadMock,
    createSignedUrl: createSignedUrlMock,
    getPublicUrl: getPublicUrlMock,
    remove: removeMock,
  }));

  const supabase = {
    from: vi.fn(() => ({ ...makeChain(), insert: insertMock })),
    storage: { from: storageFromMock },
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  };

  return {
    reduzido: false,
    insertMock,
    uploadMock,
    createSignedUrlMock,
    getPublicUrlMock,
    removeMock,
    removeStoredObjectMock,
    storageFromMock,
    supabase,
    whispers: [] as Array<Record<string, unknown>>,
    rec: {
      isRecording: false,
      duration: 0,
      audioUrl: null as string | null,
      entregar: false,
      blob: null as Blob | null,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      cancelRecording: vi.fn(),
      formatDuration: (segundos: number) => `0:${String(segundos).padStart(2, '0')}`,
    },
  };
});

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => h.reduzido,
  motion: {
    ...(await importOriginal<typeof import('framer-motion')>()).motion,
    div: ({ children, initial, animate, exit, variants, transition: _transition, ...props }: MotionDivProps) => (
      <div
        data-motion-initial={JSON.stringify(initial ?? null)}
        data-motion-animate={JSON.stringify(animate ?? null)}
        data-motion-exit={JSON.stringify(exit ?? null)}
        data-motion-variants={JSON.stringify(variants ?? null)}
        {...props}
      >
        {children}
      </div>
    ),
  },
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role="tooltip">{children}</div>,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: UID_GRAVADOR },
    profile: { id: 'sup-1', user_id: UID_GRAVADOR, role: 'supervisor', name: 'Supervisor Teste' },
  }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({
    agents: [{ id: AGENTE, user_id: 'u-1', name: 'Ana', activeChats: 1, status: 'online', avatar_url: null }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/storage_object_upload', () => ({
  createStorageObjectId: () => UUID_OBJETO,
  removeStoredObjectBestEffort: (...args: unknown[]) => h.removeStoredObjectMock(...args),
}));

// O gravador é o motor do PE-59/PE-24 (`useAudioRecorder`): aqui ele é controlado por
// `h.rec` para o microfone não existir no jsdom.
vi.mock('@/hooks/communication/useAudioRecorder', () => ({
  useAudioRecorder: (opts?: { onRecordingComplete?: (blob: Blob, url: string) => void }) => {
    useEffect(() => {
      if (h.rec.entregar && h.rec.blob) opts?.onRecordingComplete?.(h.rec.blob, 'blob:previa');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return {
      isRecording: h.rec.isRecording,
      duration: h.rec.duration,
      audioUrl: h.rec.audioUrl,
      startRecording: h.rec.startRecording,
      stopRecording: h.rec.stopRecording,
      cancelRecording: h.rec.cancelRecording,
      uploadAudio: vi.fn(),
      formatDuration: h.rec.formatDuration,
    };
  },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: h.whispers, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

function abrirSussurro() {
  fireEvent.click(screen.getByRole('button', { name: /sussurro/i }));
}

beforeEach(() => {
  h.reduzido = false;
  h.whispers = [];
  h.insertMock.mockReset();
  h.insertMock.mockResolvedValue({ error: null });
  h.uploadMock.mockReset();
  h.uploadMock.mockResolvedValue({ error: null });
  h.createSignedUrlMock.mockReset();
  h.createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://exemplo.supabase.co/assinada?token=abc' }, error: null });
  h.getPublicUrlMock.mockReset();
  h.removeMock.mockReset();
  h.removeMock.mockResolvedValue({ error: null });
  h.removeStoredObjectMock.mockReset();
  h.storageFromMock.mockClear();
  h.rec.isRecording = false;
  h.rec.duration = 0;
  h.rec.audioUrl = null;
  h.rec.entregar = false;
  h.rec.blob = null;
  h.rec.startRecording.mockReset();
  h.rec.stopRecording.mockReset();
  h.rec.cancelRecording.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('WhisperMode — nota de sussurro por voz', () => {
  it('(1) nota com áudio ganha player com nome acessível e só assina a URL quando o atendente pede', async () => {
    h.whispers = [
      { id: 'w1', content: '', sender_id: 'sup-1', is_read: true, created_at: '2026-10-13T12:00:00Z', audio_path: AUDIO_DE_TERCEIRO },
    ];

    render(<WhisperMode contactId={CONTATO} targetAgentId={AGENTE} />);
    abrirSussurro();

    const tocar = await screen.findByRole('button', { name: /tocar nota de sussurro por voz/i });
    expect(tocar).toBeInTheDocument();
    // Assinar no mount gastaria credencial para as 20 notas listadas.
    expect(h.createSignedUrlMock).not.toHaveBeenCalled();

    fireEvent.click(tocar);

    await waitFor(() => expect(h.createSignedUrlMock).toHaveBeenCalledWith(AUDIO_DE_TERCEIRO, 3600));
    expect(h.storageFromMock).toHaveBeenCalledWith('audio-messages');
  });

  it('(2) enviar o áudio sobe para <uid>/<conversa>/<uuid> no bucket e grava a linha com content vazio', async () => {
    h.rec.entregar = true;
    h.rec.blob = new Blob(['audio'], { type: 'audio/webm' });
    h.rec.audioUrl = 'blob:previa';
    h.rec.duration = 4;

    render(<WhisperMode contactId={CONTATO} targetAgentId={AGENTE} />);
    abrirSussurro();

    fireEvent.click(await screen.findByRole('button', { name: /enviar nota de sussurro por voz/i }));

    await waitFor(() => expect(h.uploadMock).toHaveBeenCalledTimes(1));
    expect(h.storageFromMock).toHaveBeenCalledWith('audio-messages');
    expect(h.uploadMock).toHaveBeenCalledWith(CAMINHO_ENVIADO, expect.any(Blob), {
      contentType: 'audio/webm',
      metadata: { duration: 4 },
    });

    await waitFor(() => expect(h.insertMock).toHaveBeenCalledTimes(1));
    expect(h.insertMock).toHaveBeenCalledWith({
      contact_id: CONTATO,
      sender_id: 'sup-1',
      target_agent_id: AGENTE,
      content: '',
      audio_path: CAMINHO_ENVIADO,
    });
  });

  it('(3) falha do upload não grava a linha, avisa e deixa tentar de novo', async () => {
    h.rec.entregar = true;
    h.rec.blob = new Blob(['audio'], { type: 'audio/webm' });
    h.rec.audioUrl = 'blob:previa';
    h.uploadMock.mockResolvedValue({ error: { message: 'network error' } });

    render(<WhisperMode contactId={CONTATO} targetAgentId={AGENTE} />);
    abrirSussurro();

    fireEvent.click(await screen.findByRole('button', { name: /enviar nota de sussurro por voz/i }));

    const faixa = await screen.findByTestId('sussurro-erro');
    expect(faixa).toHaveTextContent(/não foi possível enviar o áudio/i);
    expect(h.insertMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it('(4) o microfone abre o gravador e o cancelamento descarta a captura', async () => {
    const primeira = render(<WhisperMode contactId={CONTATO} targetAgentId={AGENTE} />);
    abrirSussurro();
    fireEvent.click(screen.getByRole('button', { name: /gravar nota de sussurro por voz/i }));
    expect(h.rec.startRecording).toHaveBeenCalledTimes(1);

    h.rec.isRecording = true;
    primeira.rerender(<WhisperMode contactId={CONTATO} targetAgentId={AGENTE} />);
    expect(screen.getByRole('timer', { name: /tempo de gravação do sussurro/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancelar gravação do sussurro/i }));
    expect(h.rec.cancelRecording).toHaveBeenCalledTimes(1);
  });

  it('(5) linha recusada apaga o objeto órfão e mantém a prévia para tentar de novo', async () => {
    h.rec.entregar = true;
    h.rec.blob = new Blob(['audio'], { type: 'audio/webm' });
    h.rec.audioUrl = 'blob:previa';
    h.rec.duration = 2;
    h.insertMock.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });

    render(<WhisperMode contactId={CONTATO} targetAgentId={AGENTE} />);
    abrirSussurro();

    fireEvent.click(await screen.findByRole('button', { name: /enviar nota de sussurro por voz/i }));

    await waitFor(() => expect(h.removeStoredObjectMock).toHaveBeenCalledWith('audio-messages', CAMINHO_ENVIADO));
    expect(h.storageFromMock).toHaveBeenCalledWith('audio-messages');
    expect(await screen.findByTestId('sussurro-erro')).toBeInTheDocument();
    // A prévia fica: o retry reenvia o objeto e tenta a linha de novo.
    expect(screen.getByRole('button', { name: /enviar nota de sussurro por voz/i })).toBeInTheDocument();
  });
});
