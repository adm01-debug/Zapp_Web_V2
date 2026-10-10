import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { useTeamChatPanel } from '@/components/team-chat/useTeamChatPanel';
import { useTeamChatDraft } from '@/hooks/chat/useTeamChatDraft';
import { TeamFileUploader } from '@/components/team-chat/TeamFileUploader';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import {
  buildTeamMediaPath,
  sanitizeExtension,
  uploadTeamMedia,
} from '@/hooks/team-chat/uploadTeamMedia';

// R2-DB-020: os três produtores de mídia do Team Chat precisam gravar o locator
// privado canônico <profile_id>/<conversation_id>/<uuid>.<ext> no bucket privado
// `team-chat-files` e persistir media_bucket + media_path — nunca URL pública.

const storageMocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));
const authState = vi.hoisted(() => ({
  profile: { id: 'profile-1' } as { id: string } | null,
}));
const sendMutateAsync = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: storageMocks.storageFrom },
    from: vi.fn(),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: authState.profile }),
}));

vi.mock('@/hooks/chat/useTeamChat', () => ({
  useSendTeamMessage: () => ({ mutateAsync: sendMutateAsync, isPending: false }),
  useDeleteTeamMessage: () => ({ mutateAsync: vi.fn() }),
  useEditTeamMessage: () => ({ mutateAsync: vi.fn() }),
  useToggleMuteConversation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
    isPlaying: false,
    currentMessageId: null,
    voiceId: 'v1',
    setVoiceId: vi.fn(),
    speed: 1,
    setSpeed: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: {}, isLoading: false }),
}));

vi.mock('@/hooks/team-chat/useTeamChatMutations', () => ({
  useRenameConversation: () => ({ mutateAsync: vi.fn() }),
  useRemoveConversationMember: () => ({ mutateAsync: vi.fn() }),
  useLeaveConversation: () => ({ mutateAsync: vi.fn() }),
  useDeleteConversation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/team-chat/useTeamMessages', () => ({
  useTeamMessages: () => ({ messages: [], isLoading: false }),
}));

vi.mock('@/hooks/team-chat/useTeamMessageReactions', () => ({
  useTeamMessageReactions: () => ({}),
}));

vi.mock('sonner', () => ({
  toast: { error: toastError, success: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

const CONV = { id: 'conv-1' } as TeamConversation;

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function mockStorageSuccess(): void {
  storageMocks.storageFrom.mockReturnValue({
    upload: storageMocks.upload,
    getPublicUrl: storageMocks.getPublicUrl,
  });
  storageMocks.upload.mockImplementation(async (path: string) => ({ data: { path }, error: null }));
  storageMocks.getPublicUrl.mockReturnValue({
    data: { publicUrl: 'https://x/storage/v1/object/public/team-chat-files/fake' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.profile = { id: 'profile-1' };
  sendMutateAsync.mockResolvedValue({});
  mockStorageSuccess();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:fake'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('produtores de mídia do Team Chat — locator privado canônico (R2-DB-020)', () => {
  it('áudio: grava <profile>/<conversa>/<uuid>.webm e persiste bucket+path sem URL pública', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    const { result } = renderHook(() => useTeamChatPanel(CONV));

    await act(async () => {
      await result.current.handleAudioSend(blob);
    });

    expect(storageMocks.storageFrom).toHaveBeenCalledWith('team-chat-files');
    const path = storageMocks.upload.mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^profile-1/conv-1/${UUID_RE}\\.webm$`));
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled();

    expect(sendMutateAsync).toHaveBeenCalledTimes(1);
    const payload = sendMutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.mediaBucket).toBe('team-chat-files');
    expect(payload.mediaPath).toBe(path);
    expect(payload.mediaType).toBe('audio');
    expect(payload).not.toHaveProperty('mediaUrl');
  });

  it('arquivo: grava <profile>/<conversa>/<uuid>.pdf e passa o path (não URL pública) ao onFileSent', async () => {
    const onFileSent = vi.fn();
    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' });
    render(<TeamFileUploader conversationId="conv-1" onFileSent={onFileSent} />);

    const input = screen.getByLabelText('Selecionar arquivo para enviar') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(storageMocks.upload).toHaveBeenCalled());

    expect(storageMocks.storageFrom).toHaveBeenCalledWith('team-chat-files');
    const path = storageMocks.upload.mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^profile-1/conv-1/${UUID_RE}\\.pdf$`));
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled();
    expect(onFileSent).toHaveBeenCalledWith(path, 'document', 'report.pdf');
  });

  it('colar imagem: grava <profile>/<conversa>/<uuid>.png e passa o path (não URL pública) ao onFileSent', async () => {
    const onFileSent = vi.fn();
    const file = new File(['x'], 'pasted.png', { type: 'image/png' });
    const { result } = renderHook(() =>
      useTeamChatDraft({ conversationId: 'conv-1', text: '', setText: vi.fn(), onFileSent }),
    );

    const event = {
      clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ReactClipboardEvent;

    await act(async () => {
      await result.current.handlePaste(event);
    });

    expect(storageMocks.storageFrom).toHaveBeenCalledWith('team-chat-files');
    const path = storageMocks.upload.mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^profile-1/conv-1/${UUID_RE}\\.png$`));
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled();
    expect(onFileSent).toHaveBeenCalledWith(path, 'image', '📋 Imagem colada');
  });

  it('handleFileSent: persiste mediaBucket + mediaPath (nunca mediaUrl)', async () => {
    const { result } = renderHook(() => useTeamChatPanel(CONV));

    await act(async () => {
      await result.current.handleFileSent('profile-1/conv-1/uuid.pdf', 'document', 'report.pdf');
    });

    const payload = sendMutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.mediaBucket).toBe('team-chat-files');
    expect(payload.mediaPath).toBe('profile-1/conv-1/uuid.pdf');
    expect(payload.mediaType).toBe('document');
    expect(payload.content).toBe('report.pdf');
    expect(payload).not.toHaveProperty('mediaUrl');
  });

  it('áudio: erro no upload não anuncia o envio', async () => {
    storageMocks.upload.mockRejectedValueOnce(new Error('upload failed'));
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    const { result } = renderHook(() => useTeamChatPanel(CONV));

    await act(async () => {
      await result.current.handleAudioSend(blob);
    });

    expect(sendMutateAsync).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Erro ao enviar áudio');
  });
});

describe('uploadTeamMedia (helper) — casos adversariais', () => {
  it('monta <profile>/<conversa>/<uuid>.<ext> e nega sem profile/conversa', () => {
    expect(buildTeamMediaPath(null, 'conv-1', 'pdf')).toBeNull();
    expect(buildTeamMediaPath('profile-1', null, 'pdf')).toBeNull();
    expect(buildTeamMediaPath(undefined, 'conv-1', 'pdf')).toBeNull();
    expect(buildTeamMediaPath('profile-1', 'conv-1', 'pdf')).toMatch(
      new RegExp(`^profile-1/conv-1/${UUID_RE}\\.pdf$`),
    );
  });

  it('extensão inválida é saneada para bin', () => {
    expect(sanitizeExtension('pdf')).toBe('pdf');
    expect(sanitizeExtension('PDF')).toBe('pdf');
    expect(sanitizeExtension('webm')).toBe('webm');
    expect(sanitizeExtension('😀')).toBe('bin');
    expect(sanitizeExtension('')).toBe('bin');
    expect(sanitizeExtension('.tar.gz')).toBe('bin');
  });

  it('sem profile/conversa aborta SEM tocar no storage', async () => {
    const locator = await uploadTeamMedia({
      profileId: null,
      conversationId: 'conv-1',
      file: new Blob(['x']),
      extension: 'pdf',
      contentType: 'application/pdf',
    });
    expect(locator).toBeNull();
    expect(storageMocks.storageFrom).not.toHaveBeenCalled();
  });

  it('erro do upload é relançado (não devolve locator)', async () => {
    storageMocks.upload.mockRejectedValueOnce(new Error('upload failed'));
    await expect(
      uploadTeamMedia({
        profileId: 'profile-1',
        conversationId: 'conv-1',
        file: new Blob(['x']),
        extension: 'pdf',
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow('upload failed');
  });
});
