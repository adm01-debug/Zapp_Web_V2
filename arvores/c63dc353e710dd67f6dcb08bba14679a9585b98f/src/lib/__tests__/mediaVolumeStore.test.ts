import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeBroadcastChannel } from '@/test/fakeBroadcastChannel';

/**
 * E43 — testes do store do volume de mídia: persistência, clamp, curva, mute/unmute
 * preservando o valor, localStorage indisponível e sincronização entre abas.
 *
 * O store é um singleton de módulo, então cada cenário que precisa de estado limpo
 * reimporta o módulo (`vi.resetModules()`), em vez de o módulo de produção carregar
 * API só-para-teste.
 */
type StoreModule = typeof import('@/lib/mediaVolumeStore');

async function freshStore(): Promise<StoreModule> {
  vi.resetModules();
  return import('@/lib/mediaVolumeStore');
}

describe('mediaVolumeStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    FakeBroadcastChannel.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('default e leitura', () => {
    it('nasce com 80 e sem mute (E01)', async () => {
      const store = await freshStore();
      expect(store.getSnapshot()).toEqual({ volume: 80, muted: false });
    });

    it('mantém a identidade do snapshot quando nada muda (exigência do useSyncExternalStore)', async () => {
      const store = await freshStore();
      const before = store.getSnapshot();
      store.setVolume(80);
      store.setMuted(false);
      expect(store.getSnapshot()).toBe(before);
    });
  });

  describe('curva perceptual (E04)', () => {
    it('mapeia a tabela 0→0, 50→0.25, 100→1', async () => {
      const { toGain } = await freshStore();
      expect(toGain(0)).toBe(0);
      expect(toGain(50)).toBe(0.25);
      expect(toGain(100)).toBe(1);
    });

    it('é quadrática e não linear em outros pontos', async () => {
      const { toGain } = await freshStore();
      expect(toGain(25)).toBeCloseTo(0.0625, 10);
      expect(toGain(80)).toBeCloseTo(0.64, 10);
      // linear daria 0.25 em 25 — a curva existe justamente para não dar.
      expect(toGain(25)).not.toBeCloseTo(0.25, 3);
    });
  });

  describe('saneamento (E02/E03)', () => {
    it('volume inválido/fora de faixa no storage cai no default', async () => {
      const { sanitizeStoredVolume } = await freshStore();
      expect(sanitizeStoredVolume('150')).toBe(80);
      expect(sanitizeStoredVolume('-1')).toBe(80);
      expect(sanitizeStoredVolume('abc')).toBe(80);
      expect(sanitizeStoredVolume('')).toBe(80);
      expect(sanitizeStoredVolume(null)).toBe(80);
      expect(sanitizeStoredVolume('50.5')).toBe(80);
      expect(sanitizeStoredVolume('0')).toBe(0);
      expect(sanitizeStoredVolume('100')).toBe(100);
    });

    it('escrita prende no intervalo em vez de cair no default (setas/scroll nas bordas)', async () => {
      const store = await freshStore();
      store.setVolume(150);
      expect(store.getSnapshot().volume).toBe(100);
      store.setVolume(-10);
      expect(store.getSnapshot().volume).toBe(0);
      store.setVolume(37.6);
      expect(store.getSnapshot().volume).toBe(38);
      store.setVolume(Number.NaN);
      expect(store.getSnapshot().volume).toBe(80);
    });

    it('volume corrompido no storage não quebra o app', async () => {
      window.localStorage.setItem('zapp.media.volume', '{"nope":true}');
      window.localStorage.setItem('zapp.media.muted', 'talvez');
      const store = await freshStore();
      expect(store.getSnapshot()).toEqual({ volume: 80, muted: false });
    });

    it('localStorage lançando exceção não quebra o app (aba anônima bloqueada)', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: localStorage bloqueado');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const store = await freshStore();
      expect(store.getSnapshot()).toEqual({ volume: 80, muted: false });
      expect(() => store.setVolume(35)).not.toThrow();
      expect(store.getSnapshot().volume).toBe(35);
    });
  });

  describe('persistência (E02)', () => {
    it('grava os dois valores nas chaves documentadas', async () => {
      const store = await freshStore();
      store.setVolume(45);
      store.setMuted(true);
      expect(window.localStorage.getItem('zapp.media.volume')).toBe('45');
      expect(window.localStorage.getItem('zapp.media.muted')).toBe('true');
    });

    it('sobrevive ao reload (novo módulo lê o que está no storage)', async () => {
      const first = await freshStore();
      first.setVolume(35);
      first.setMuted(true);

      const reloaded = await freshStore();
      expect(reloaded.getSnapshot()).toEqual({ volume: 35, muted: true });
    });
  });

  describe('mute (D4)', () => {
    it('desmutar devolve o volume anterior, não 100 nem 0', async () => {
      const store = await freshStore();
      store.setVolume(40);
      store.toggleMuted();
      expect(store.getSnapshot()).toEqual({ volume: 40, muted: true });

      store.toggleMuted();
      expect(store.getSnapshot()).toEqual({ volume: 40, muted: false });
    });

    it('mudar o volume com a mídia muda mantém o mute ligado', async () => {
      const store = await freshStore();
      store.setMuted(true);
      store.setVolume(90);
      expect(store.getSnapshot()).toEqual({ volume: 90, muted: true });
    });
  });

  describe('subscribers', () => {
    it('notifica uma vez por mudança e para depois do unsubscribe', async () => {
      const store = await freshStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.setVolume(60);
      expect(listener).toHaveBeenCalledTimes(1);

      store.setVolume(60); // mesmo valor: não emite
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      store.setVolume(70);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('sincronização entre abas (E05)', () => {
    it('mudar o volume na aba A reflete na aba B sem reload (BroadcastChannel)', async () => {
      vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

      const tabA = await freshStore();
      const listenerA = vi.fn();
      tabA.subscribe(listenerA);

      const tabB = await freshStore();
      const listenerB = vi.fn();
      tabB.subscribe(listenerB);
      expect(tabB.getSnapshot().volume).toBe(80);

      tabA.setVolume(35);
      expect(tabB.getSnapshot()).toEqual({ volume: 35, muted: false });
      expect(listenerB).toHaveBeenCalled();
      // A aba de origem não recebe eco do próprio postMessage.
      expect(listenerA).toHaveBeenCalledTimes(1);

      tabB.toggleMuted();
      expect(tabA.getSnapshot()).toEqual({ volume: 35, muted: true });
    });

    it('ignora payload inválido vindo de outra aba', async () => {
      vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
      const store = await freshStore();
      store.subscribe(vi.fn());

      const channel = FakeBroadcastChannel.channels.get('zapp-media-volume');
      const peer = channel ? Array.from(channel)[0] : undefined;
      peer?.onmessage?.({ data: { volume: 900, muted: 'sim' } } as MessageEvent);

      expect(store.getSnapshot()).toEqual({ volume: 80, muted: false });
    });

    it('o evento `storage` cobre o fallback sem BroadcastChannel', async () => {
      vi.stubGlobal('BroadcastChannel', undefined);
      const store = await freshStore();
      const listener = vi.fn();
      store.subscribe(listener);

      window.localStorage.setItem('zapp.media.volume', '25');
      window.dispatchEvent(new StorageEvent('storage', { key: 'zapp.media.volume', newValue: '25' }));
      expect(store.getSnapshot().volume).toBe(25);

      window.dispatchEvent(new StorageEvent('storage', { key: 'zapp.media.muted', newValue: 'true' }));
      expect(store.getSnapshot()).toEqual({ volume: 25, muted: true });
      expect(listener).toHaveBeenCalledTimes(2);

      // valor fora de faixa vindo de outra aba é saneado, não aplicado cru
      window.dispatchEvent(new StorageEvent('storage', { key: 'zapp.media.volume', newValue: '999' }));
      expect(store.getSnapshot().volume).toBe(80);
    });
  });
});
