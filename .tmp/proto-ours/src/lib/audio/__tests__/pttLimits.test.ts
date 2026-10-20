/**
 * PE-24 — limites de PTT (WhatsApp/Evolution): 16 MB e 16 min, mínimo 0.5 s.
 * A validação roda ANTES do upload; aqui provamos cada borda e a robustez
 * quando o navegador não consegue medir a duração (jsdom, codec desconhecido).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_PTT_DURATION_SEC,
  MAX_PTT_SIZE_BYTES,
  MIN_PTT_DURATION_SEC,
  PROBE_TIMEOUT_MS,
  probeAudioDuration,
  validatePttBlob,
} from '@/lib/audio/pttLimits';

const originalCreateElement = document.createElement.bind(document);

/** Substitui o <audio> do probe: dispara loadedmetadata com a duração pedida. */
function stubAudioElement(duration: number, opts: { neverFires?: boolean } = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const element = {
    preload: '',
    src: '',
    duration,
    addEventListener: (type: string, cb: () => void) => {
      (listeners[type] ||= []).push(cb);
    },
    removeEventListener: (type: string, cb: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((fn) => fn !== cb);
    },
  };
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'audio') {
      if (!opts.neverFires) {
        queueMicrotask(() => (listeners.loadedmetadata ?? []).forEach((cb) => cb()));
      }
      return element as unknown as HTMLElement;
    }
    return originalCreateElement(tag);
  }) as typeof document.createElement);
  return element;
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:ptt'),
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

describe('validatePttBlob — bordas dos limites de PTT (PE-24)', () => {
  it('recusa blob vazio sem nem tentar medir a duração', async () => {
    const result = await validatePttBlob(new Blob([]));

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Áudio vazio. Tente gravar novamente.');
    expect(URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('recusa acima de 16 MB pelo tamanho, sem medir a duração', async () => {
    const grande = { size: MAX_PTT_SIZE_BYTES + 1, type: 'audio/webm' } as Blob;

    const result = await validatePttBlob(grande);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('muito grande');
    expect(result.message).toContain('16.0 MB');
    expect(URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('aceita exatamente 16 MB (a borda não é recusada)', async () => {
    stubAudioElement(60);
    const naBorda = { size: MAX_PTT_SIZE_BYTES, type: 'audio/webm' } as Blob;

    await expect(validatePttBlob(naBorda)).resolves.toEqual({ ok: true, durationSec: 60 });
  });

  it('recusa gravação mais curta que 0.5 s (toque acidental)', async () => {
    stubAudioElement(MIN_PTT_DURATION_SEC - 0.1);

    const result = await validatePttBlob(new Blob(['a']));

    expect(result.ok).toBe(false);
    expect(result.durationSec).toBeCloseTo(0.4);
    expect(result.message).toBe('Áudio muito curto. Mantenha o botão pressionado para gravar.');
  });

  it('aceita exatamente 0.5 s (a borda não é recusada)', async () => {
    stubAudioElement(MIN_PTT_DURATION_SEC);

    await expect(validatePttBlob(new Blob(['a']))).resolves.toEqual({ ok: true, durationSec: 0.5 });
  });

  it('recusa áudio acima de 16 min com o motivo e a duração medida', async () => {
    stubAudioElement(MAX_PTT_DURATION_SEC + 1);

    const result = await validatePttBlob(new Blob(['a']));

    expect(result.ok).toBe(false);
    expect(result.durationSec).toBe(MAX_PTT_DURATION_SEC + 1);
    expect(result.message).toBe('Áudio muito longo (16m 1s). Limite: 16m 0s.');
  });

  it('aceita exatamente 16 min (a borda não é recusada)', async () => {
    stubAudioElement(MAX_PTT_DURATION_SEC);

    await expect(validatePttBlob(new Blob(['a']))).resolves.toEqual({
      ok: true,
      durationSec: MAX_PTT_DURATION_SEC,
    });
  });
});

describe('probeAudioDuration — ambientes sem medição (PE-24)', () => {
  it('devolve undefined quando não há blob URL (jsdom/SSR) e não bloqueia o áudio', async () => {
    delete (URL as unknown as Record<string, unknown>).createObjectURL;

    await expect(probeAudioDuration(new Blob(['a']))).resolves.toBeUndefined();
    // Duração desconhecida NÃO é áudio inválido: o tamanho dentro do limite passa.
    await expect(validatePttBlob(new Blob(['a']))).resolves.toEqual({ ok: true, durationSec: undefined });
  });

  it('devolve undefined quando o blob URL falha ao ser criado', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => {
        throw new Error('sem blob URL');
      }),
      configurable: true,
    });

    await expect(probeAudioDuration(new Blob(['a']))).resolves.toBeUndefined();
  });

  it('desiste pela rede de segurança quando o <audio> nunca responde', async () => {
    vi.useFakeTimers();
    stubAudioElement(0, { neverFires: true });

    const promessa = probeAudioDuration(new Blob(['a']));
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);

    await expect(promessa).resolves.toBeUndefined();
  });
});
