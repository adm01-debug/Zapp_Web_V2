import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HZ5-08 — colar imagem no Chat interno ia direto para o storage, sem o limite
 * de `MAX_TEAM_CHAT_FILE_SIZE`. Aqui a fronteira mockada é o upload e o toast:
 * uma imagem grande tem de ser recusada ANTES do upload.
 */
const h = vi.hoisted(() => ({
  profile: { id: 'user-a' } as { id: string } | null,
  upload: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: h.profile }) }));

vi.mock('@/hooks/team-chat/uploadTeamMedia', () => ({
  uploadTeamMedia: (...args: unknown[]) => h.upload(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: vi.fn() } } }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => h.toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import { useTeamChatDraft } from '@/hooks/chat/useTeamChatDraft';
import { MAX_TEAM_CHAT_FILE_SIZE } from '@/lib/teamChatRules';

const onFileSent = vi.fn();

function arquivoComTamanho(size: number, type = 'image/png'): File {
  const file = new File(['x'], 'colada.png', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function eventoDeColagem(file: File) {
  return {
    preventDefault: vi.fn(),
    clipboardData: { items: [{ type: file.type, getAsFile: () => file }] },
  } as unknown as React.ClipboardEvent;
}

function renderDraft() {
  return renderHook(() =>
    useTeamChatDraft({ conversationId: 'conv-1', text: '', setText: vi.fn(), onFileSent }),
  );
}

beforeEach(() => {
  localStorage.clear();
  h.profile = { id: 'user-a' };
  h.upload.mockReset();
  h.toastError.mockReset();
  onFileSent.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useTeamChatDraft — colar imagem valida tamanho (HZ5-08)', () => {
  it('recusa imagem acima do limite com toast e sem upload', async () => {
    const grande = arquivoComTamanho(MAX_TEAM_CHAT_FILE_SIZE + 1);
    const { result } = renderDraft();

    await act(async () => { await result.current.handlePaste(eventoDeColagem(grande)); });

    expect(h.upload).not.toHaveBeenCalled();
    expect(onFileSent).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith('Imagem muito grande. Máximo: 10MB');
  });

  it('envia a imagem dentro do limite', async () => {
    h.upload.mockResolvedValue({ mediaPath: 'caminho/colada.png' });
    const pequena = arquivoComTamanho(1024);
    const { result } = renderDraft();

    await act(async () => { await result.current.handlePaste(eventoDeColagem(pequena)); });

    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.toastError).not.toHaveBeenCalled();
    expect(onFileSent).toHaveBeenCalledWith('caminho/colada.png', 'image', '📋 Imagem colada');
  });
});
