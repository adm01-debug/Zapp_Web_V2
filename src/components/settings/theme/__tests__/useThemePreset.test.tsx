import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';
import { useThemePreset } from '../useThemePreset';
import { STORAGE_KEY } from '../presets';

// SK01 — o autosave só pode marcar como salvo o que a persistência confirmou.
// A falha de cota é simulada no `Storage.prototype.setItem` (como em
// `theme-storage.test.ts`), preservando o `saveThemeConfig` real: o booleano
// `false` vem do caminho de produção, não de um mock da função.

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn() }),
}));

const setItemOriginal = Storage.prototype.setItem;

function quebrarPersistencia() {
  Storage.prototype.setItem = function setItemQuebrado() {
    throw new DOMException('QuotaExceededError', 'QuotaExceededError');
  };
}

function restaurarPersistencia() {
  Storage.prototype.setItem = setItemOriginal;
}

function semearStorage(preset: string, borderRadius: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 6, preset, borderRadius }));
}

function lidoDoStorage(): { preset?: string; borderRadius?: number } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { preset?: string; borderRadius?: number }) : null;
}

describe('useThemePreset — persistência do autosave (SK01)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.presetId;
  });

  afterEach(() => {
    restaurarPersistencia();
  });

  it('falha do autosave mantém a skin em memória, preserva o storage anterior, mostra erro e conserva a pendência', () => {
    semearStorage('corporate', 14);
    const { result } = renderHook(() => useThemePreset());
    expect(result.current.hasUnsavedChanges).toBe(false);

    quebrarPersistencia();
    act(() => {
      result.current.applyPreset('gx-hackerman');
    });

    // A skin continua aplicada em memória/tela.
    expect(result.current.config).toEqual({ preset: 'gx-hackerman', borderRadius: 10 });
    expect(document.documentElement.dataset.presetId).toBe('gx-hackerman');

    // O storage anterior não foi sobrescrito.
    expect(lidoDoStorage()).toMatchObject({ preset: 'corporate', borderRadius: 14 });

    // Erro, nunca sucesso.
    expect(toast.error).toHaveBeenCalledWith('Não foi possível salvar o tema', expect.any(Object));
    expect(toast.success).not.toHaveBeenCalled();

    // Pendência conservada.
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it('gravação posterior bem-sucedida confirma o estado salvo e limpa a pendência', () => {
    semearStorage('corporate', 14);
    const { result } = renderHook(() => useThemePreset());

    quebrarPersistencia();
    act(() => {
      result.current.applyPreset('gx-hackerman');
    });
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(lidoDoStorage()).toMatchObject({ preset: 'corporate', borderRadius: 14 });

    restaurarPersistencia();
    act(() => {
      result.current.applyPreset('ocean');
    });

    expect(result.current.config).toEqual({ preset: 'ocean', borderRadius: 14 });
    expect(lidoDoStorage()).toMatchObject({ preset: 'ocean', borderRadius: 14 });
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('Tema "Oceano" aplicado!');
  });

  it('reset com falha de persistência não declara sucesso nem limpa a pendência; sucesso confirma o estado salvo', () => {
    const { result } = renderHook(() => useThemePreset());

    act(() => {
      result.current.applyPreset('gx-hackerman');
    });
    expect(result.current.hasUnsavedChanges).toBe(false);

    // Zera os espiões do autosave anterior para medir só o reset.
    vi.clearAllMocks();
    quebrarPersistencia();
    act(() => {
      result.current.handleReset();
    });

    // Volta ao padrão em memória, mas sem confirmar gravação.
    expect(result.current.config).toEqual({ preset: 'corporate', borderRadius: 14 });
    expect(toast.error).toHaveBeenCalledWith('Não foi possível salvar o tema', expect.any(Object));
    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.hasUnsavedChanges).toBe(true);

    restaurarPersistencia();
    act(() => {
      result.current.handleReset();
    });

    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('Tema restaurado ao padrão');
  });
});
