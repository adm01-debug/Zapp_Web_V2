import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTeamChatDraft } from '@/hooks/chat/useTeamChatDraft';

// R2-AUTH-010: o rascunho do Team Chat não pode atravessar contas no mesmo
// navegador. O perfil é trocado via este objeto hoisted entre renders.
const authState = vi.hoisted(() => ({
  profile: { id: 'user-a' } as { id: string } | null,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: authState.profile }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: vi.fn() } },
}));

const onFileSent = vi.fn();

function renderDraft(conversationId: string, text: string, setText: (t: string) => void = vi.fn()) {
  return renderHook(
    (props: { conversationId: string; text: string }) =>
      useTeamChatDraft({ conversationId: props.conversationId, text: props.text, setText, onFileSent }),
    { initialProps: { conversationId, text } },
  );
}

beforeEach(() => {
  localStorage.clear();
  authState.profile = { id: 'user-a' };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTeamChatDraft — isolamento de rascunho (R2-AUTH-010)', () => {
  it('salva o rascunho numa chave escopada pelo usuário', () => {
    renderDraft('conv-1', 'rascunho sigiloso');
    act(() => { vi.advanceTimersByTime(600); });

    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.includes('user-a') && k.includes('conv-1'))).toBe(true);
    // nenhuma chave de rascunho pode ficar sem o dono
    expect(keys.some((k) => k.startsWith('team_draft_'))).toBe(false);
  });

  it('restaura o rascunho da própria conta ao reabrir a conversa', () => {
    const first = renderDraft('conv-1', 'rascunho do A');
    act(() => { vi.advanceTimersByTime(600); });
    first.unmount();

    const setText = vi.fn();
    renderDraft('conv-1', '', setText);
    expect(setText).toHaveBeenCalledWith('rascunho do A');
  });

  it('não restaura para outra conta o rascunho salvo pelo usuário anterior', () => {
    // conta A digita e o autosave grava
    const first = renderDraft('conv-1', 'segredo da conta A');
    act(() => { vi.advanceTimersByTime(600); });
    first.unmount();

    // troca de conta no mesmo navegador
    authState.profile = { id: 'user-b' };
    const setTextB = vi.fn();
    renderDraft('conv-1', '', setTextB);
    expect(setTextB).not.toHaveBeenCalled();
  });

  it('remove rascunhos legados gravados sem escopo de usuário', () => {
    localStorage.setItem('team_draft_conv-1', 'rascunho de antes da correção');
    localStorage.setItem('team_draft_conv-2', 'outro legado');

    const setText = vi.fn();
    renderDraft('conv-1', '', setText);

    expect(localStorage.getItem('team_draft_conv-1')).toBeNull();
    expect(localStorage.getItem('team_draft_conv-2')).toBeNull();
    // e o conteúdo legado não pode aparecer na caixa de outro usuário
    expect(setText).not.toHaveBeenCalled();
  });

  it('clearDraft impede que o rascunho volte ao reabrir', () => {
    const hook = renderDraft('conv-1', 'rascunho qualquer');
    act(() => { vi.advanceTimersByTime(600); });

    act(() => { hook.result.current.clearDraft(); });
    hook.unmount();

    const setText = vi.fn();
    renderDraft('conv-1', '', setText);
    expect(setText).not.toHaveBeenCalled();
  });
});
