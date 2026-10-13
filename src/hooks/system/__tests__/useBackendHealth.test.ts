import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkSupabaseReachable,
  createBackendHealthMonitor,
} from '@/hooks/system/useBackendHealth';

/**
 * Cartao "avisos globais de conexao degradada e de servidor fora do ar /
 * restaurado" — item 2.
 *
 * Antes desta entrega nao existia nenhuma checagem de backend no front: o unico
 * sinal era `navigator.onLine` (offline-indicator/useNetworkStatus), que segue
 * `true` com o Supabase fora do ar. Estes testes provam a cadencia (30 s), o
 * recuo exponencial, a pausa com a aba oculta e o aviso de recuperacao.
 */
describe('useBackendHealth (monitor de servidor)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checa na hora ao assinar e reporta up', async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const monitor = createBackendHealthMonitor({
      check,
      baseIntervalMs: 30_000,
      maxIntervalMs: 240_000,
    });
    const unsubscribe = monitor.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    expect(monitor.getSnapshot().status).toBe('up');
    expect(monitor.getSnapshot().failures).toBe(0);
    unsubscribe();
  });

  it('marca down e recua 30s -> 60s -> 120s -> 240s (teto) enquanto falha', async () => {
    const check = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const monitor = createBackendHealthMonitor({
      check,
      baseIntervalMs: 30_000,
      maxIntervalMs: 240_000,
      isHidden: () => false,
    });
    const unsubscribe = monitor.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    expect(monitor.getSnapshot().status).toBe('down');
    expect(monitor.getSnapshot().failures).toBe(1);

    // 1a falha -> proxima tentativa em 30 s (cadencia normal)
    await vi.advanceTimersByTimeAsync(29_999);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);

    // 2a falha -> 60 s
    await vi.advanceTimersByTimeAsync(59_999);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(3);

    // 3a falha -> 120 s
    await vi.advanceTimersByTimeAsync(120_000);
    expect(check).toHaveBeenCalledTimes(4);

    // 4a falha -> 240 s, e o teto segura daqui em diante
    await vi.advanceTimersByTimeAsync(240_000);
    expect(check).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(240_000);
    expect(check).toHaveBeenCalledTimes(6);

    expect(monitor.getSnapshot().failures).toBe(6);
    unsubscribe();
  });

  it('volta para a cadencia de 30s e avisa "Conexao restaurada" na recuperacao', async () => {
    const check = vi.fn().mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValue(undefined);
    const monitor = createBackendHealthMonitor({
      check,
      baseIntervalMs: 30_000,
      maxIntervalMs: 240_000,
      restoredNoticeMs: 6_000,
      isHidden: () => false,
    });
    const unsubscribe = monitor.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getSnapshot().status).toBe('down');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(monitor.getSnapshot().status).toBe('up');
    expect(monitor.getSnapshot().failures).toBe(0);
    expect(monitor.getSnapshot().restoredAt).not.toBeNull();

    // proxima checagem volta aos 30 s
    await vi.advanceTimersByTimeAsync(30_000);
    expect(check).toHaveBeenCalledTimes(3);

    // o aviso sai sozinho depois do tempo de exibicao
    await vi.advanceTimersByTimeAsync(6_000);
    expect(monitor.getSnapshot().restoredAt).toBeNull();
    unsubscribe();
  });

  it('pausa com a aba oculta e checa de novo ao voltar visivel', async () => {
    let hidden = true;
    let notifyVisibility: () => void = () => {};
    const check = vi.fn().mockResolvedValue(undefined);
    const monitor = createBackendHealthMonitor({
      check,
      baseIntervalMs: 30_000,
      isHidden: () => hidden,
      onVisibilityChange: (listener) => {
        notifyVisibility = listener;
        return () => {
          notifyVisibility = () => {};
        };
      },
    });
    const unsubscribe = monitor.subscribe(() => {});

    // assinou com a aba oculta: nada de timer de fundo (nao ha requisicao)
    await vi.advanceTimersByTimeAsync(180_000);
    expect(check).not.toHaveBeenCalled();

    hidden = false;
    notifyVisibility();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    expect(monitor.getSnapshot().status).toBe('up');

    // e volta a agendar normalmente
    await vi.advanceTimersByTimeAsync(30_000);
    expect(check).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('"Tentar agora" checa imediatamente, sem esperar o proximo tick', async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const monitor = createBackendHealthMonitor({ check, baseIntervalMs: 30_000, isHidden: () => false });
    const unsubscribe = monitor.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await monitor.checkNow();
    expect(check).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('para tudo (sem timer) quando perde o ultimo consumidor', async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const monitor = createBackendHealthMonitor({ check, baseIntervalMs: 30_000, isHidden: () => false });
    const unsubscribe = monitor.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    unsubscribe();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(check).toHaveBeenCalledTimes(1);
  });
});

/**
 * Regra de classificacao da resposta — o ponto onde um erro de RLS/HTTP viraria
 * "servidor fora do ar" sem ser. So 5xx (ou erro de transporte) conta.
 */
describe('checkSupabaseReachable (consulta minima)', () => {
  it('GET no /auth/v1/health com cache desligado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);

    await checkSupabaseReachable(fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/v1\/health$/);
    expect(init.method).toBe('GET');
    expect(init.cache).toBe('no-store');
  });

  it('4xx = o servidor respondeu (nao e queda)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(checkSupabaseReachable(fetchImpl as unknown as typeof fetch)).resolves.toBeUndefined();
  });

  it('5xx = servidor indisponivel', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(checkSupabaseReachable(fetchImpl as unknown as typeof fetch)).rejects.toThrow('HTTP 503');
  });

  it('erro de transporte (sem resposta) propaga como falha', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(checkSupabaseReachable(fetchImpl as unknown as typeof fetch)).rejects.toThrow('Failed to fetch');
  });
});
