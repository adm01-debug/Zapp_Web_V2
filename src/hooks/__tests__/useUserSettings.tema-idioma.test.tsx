import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// --- banco falso -----------------------------------------------------------
// `linha` é o que o select devolve; `resolver` permite segurar a resposta para
// testar o que acontece quando ela chega depois (corrida).
const banco = {
  linha: null as Record<string, unknown> | null,
  resolver: null as null | (() => void),
  segurar: false,
};

const mockUpsert = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            if (!banco.segurar) {
              return Promise.resolve({ data: banco.linha, error: null });
            }

            return new Promise((resolve) => {
              banco.resolver = () => resolve({ data: banco.linha, error: null });
            });
          },
        }),
      }),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    }),
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useUserSettings } from '@/hooks/system/useUserSettings';
import { useTheme } from '@/hooks/ui/useTheme';
import i18n from '@/i18n';

const LINHA = {
  id: 's1',
  user_id: 'u1',
  theme: 'dark',
  language: 'en-US',
  compact_mode: false,
  tts_voice_id: 'voz-1',
  tts_speed: 1.0,
};

describe('useUserSettings — tema e idioma de verdade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    banco.linha = null;
    banco.resolver = null;
    banco.segurar = false;
    localStorage.clear();
    document.documentElement.className = '';
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('hidrata tema e idioma do banco no login (outro dispositivo, cache local vazio)', async () => {
    banco.linha = LINHA;

    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Tema: passa a valer na interface e no cache que o boot lê.
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(result.current.settings.theme).toBe('dark');

    // Idioma: o banco guarda 'en-US' e o i18n só conhece 'en'.
    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(localStorage.getItem('language')).toBe('en');
  });

  it('trocar o tema muda a interface na hora e deixa o cache pronto para recarregar', async () => {
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ theme: 'light' });
    });

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');

    // "Recarregar": o useTheme lê o localStorage no boot e mantém o que foi escolhido.
    const { result: novoTema } = renderHook(() => useTheme());
    await waitFor(() => expect(novoTema.current.resolvedTheme).toBe('light'));
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('trocar o idioma grava o código normalizado que o boot entende', async () => {
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ language: 'en-US' });
    });

    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(localStorage.getItem('language')).toBe('en');
    // O <Select> continua com o valor da tela (não muda o contrato da aba Aparência).
    expect(result.current.settings.language).toBe('en-US');

    act(() => {
      result.current.updateSettings({ language: 'pt-BR' });
    });

    await waitFor(() => expect(i18n.language).toBe('pt'));
    expect(localStorage.getItem('language')).toBe('pt');
  });

  it('resposta atrasada do banco não desfaz a escolha feita na tela', async () => {
    banco.linha = LINHA; // banco diz 'dark'
    banco.segurar = true;

    const { result } = renderHook(() => useUserSettings());

    await waitFor(() => expect(typeof banco.resolver).toBe('function'));

    act(() => {
      result.current.updateSettings({ theme: 'light' });
    });

    await act(async () => {
      banco.resolver?.();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A escolha do atendente ganha do valor antigo que chegou depois.
    expect(result.current.settings.theme).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('resposta que chega depois do unmount não toca no estado', async () => {
    banco.linha = LINHA;
    banco.segurar = true;

    const { unmount } = renderHook(() => useUserSettings());
    await waitFor(() => expect(typeof banco.resolver).toBe('function'));

    unmount();

    await act(async () => {
      banco.resolver?.();
    });

    // Nada de tema aplicado nem erro de setState fora da árvore.
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('saveSettings não grava browser_notifications_enabled (posse do useNotificationSettings)', async () => {
    banco.linha = LINHA;

    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let salvo: boolean | undefined;
    await act(async () => {
      salvo = await result.current.saveSettings();
    });

    expect(salvo).toBe(true);
    const [payload] = mockUpsert.mock.calls[0] as [Record<string, unknown>];

    // Desligar 'Notificações do Navegador' grava na hora pelo outro hook; este
    // upsert não pode devolver o valor lido no mount.
    expect(payload).not.toHaveProperty('browser_notifications_enabled');
    expect(payload).not.toHaveProperty('sound_enabled');
    expect(payload).not.toHaveProperty('quiet_hours_enabled');

    // O que ESTE hook grava continua indo.
    expect(payload).toMatchObject({
      user_id: 'u1',
      theme: 'dark',
      language: 'en-US',
      compact_mode: false,
      tts_voice_id: 'voz-1',
      tts_speed: 1.0,
    });
  });
});
