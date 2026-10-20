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

  /**
   * Q02 (S33–S35, D07/B7) — o volume das mídias passa a ser POR USUÁRIO no
   * aparelho, com o valor antigo migrado uma vez e sincronia entre abas.
   *
   * O usuário autenticado é lido da sessão que o `supabase-js` já persiste no
   * `localStorage` (`sb-<ref>-auth-token`) — o mesmo padrão de
   * `e2e/fixtures/e2e-contact.ts`. Sem sessão, vale a chave antiga: é o caminho
   * que mantém os testes de componente (que montam players fora do
   * `AuthProvider`) e o usuário deslogado funcionando como antes.
   */
  describe('volume por usuário no aparelho (S33–S35)', () => {
    const SESSAO = 'sb-testref-auth-token';
    const chaveVolumeDe = (userId: string) => `zapp.media.volume.${userId}`;
    const chaveMudoDe = (userId: string) => `zapp.media.muted.${userId}`;

    /** Sessão falsa no formato que o `supabase-js` grava (só o que o store lê). */
    const sessaoDe = (userId: string | null): void => {
      if (userId === null) {
        window.localStorage.removeItem(SESSAO);
        return;
      }
      window.localStorage.setItem(
        SESSAO,
        JSON.stringify({ access_token: 'token-de-teste', user: { id: userId } }),
      );
    };

    it('S33: lê e grava nas chaves do usuário autenticado', async () => {
      sessaoDe('u1');
      const store = await freshStore();

      store.setVolume(45);
      store.setMuted(true);

      expect(window.localStorage.getItem(chaveVolumeDe('u1'))).toBe('45');
      expect(window.localStorage.getItem(chaveMudoDe('u1'))).toBe('true');
      // com usuário, a chave antiga NÃO é tocada
      expect(window.localStorage.getItem('zapp.media.volume')).toBeNull();
      expect(window.localStorage.getItem('zapp.media.muted')).toBeNull();
    });

    it('S33: sobrevive ao reload nas chaves do usuário', async () => {
      sessaoDe('u1');
      const first = await freshStore();
      first.setVolume(35);
      first.setMuted(true);
      expect(window.localStorage.getItem(chaveVolumeDe('u1'))).toBe('35');

      const reloaded = await freshStore();
      expect(reloaded.getSnapshot()).toEqual({ volume: 35, muted: true });
    });

    it('B7/S33: dois usuários no mesmo navegador não dividem o valor', async () => {
      sessaoDe('u1');
      const doPrimeiro = await freshStore();
      doPrimeiro.setVolume(45);
      doPrimeiro.setMuted(true);

      sessaoDe('u2');
      const doSegundo = await freshStore();
      // o segundo usuário nasce no padrão: não herda o valor do primeiro
      expect(doSegundo.getSnapshot()).toEqual({ volume: 80, muted: false });

      doSegundo.setVolume(20);
      expect(window.localStorage.getItem(chaveVolumeDe('u2'))).toBe('20');
      // e não encosta no valor do primeiro
      expect(window.localStorage.getItem(chaveVolumeDe('u1'))).toBe('45');
    });

    it('S33: usuário trocado na mesma aba adota o estado e as chaves do novo usuário', async () => {
      sessaoDe('u1');
      const store = await freshStore();
      store.setVolume(35);
      expect(store.getSnapshot().volume).toBe(35);

      // troca de usuário sem recarregar a página
      sessaoDe('u2');
      expect(store.getSnapshot()).toEqual({ volume: 80, muted: false });
      store.setVolume(15);
      expect(window.localStorage.getItem(chaveVolumeDe('u2'))).toBe('15');

      // e voltar para o primeiro devolve o valor que ficou guardado para ele
      sessaoDe('u1');
      expect(store.getSnapshot().volume).toBe(35);
    });

    it('S33: sem usuário autenticado vale a chave antiga (sem chave com sufixo nulo)', async () => {
      window.localStorage.setItem('zapp.media.volume', '55');
      const store = await freshStore();
      expect(store.getSnapshot()).toEqual({ volume: 55, muted: false });

      store.setVolume(30);
      expect(window.localStorage.getItem('zapp.media.volume')).toBe('30');
      expect(window.localStorage.getItem('zapp.media.volume.null')).toBeNull();
      expect(window.localStorage.getItem('zapp.media.muted.null')).toBeNull();
    });

    it('S34: migra a chave antiga uma vez e não apaga nada', async () => {
      window.localStorage.setItem('zapp.media.volume', '45');
      window.localStorage.setItem('zapp.media.muted', 'true');
      sessaoDe('u1');

      const store = await freshStore();
      expect(store.getSnapshot()).toEqual({ volume: 45, muted: true });
      expect(window.localStorage.getItem(chaveVolumeDe('u1'))).toBe('45');
      expect(window.localStorage.getItem(chaveMudoDe('u1'))).toBe('true');
      // "marca como migrada", não apaga: as chaves antigas continuam onde estavam
      expect(window.localStorage.getItem('zapp.media.volume')).toBe('45');
      expect(window.localStorage.getItem('zapp.media.muted')).toBe('true');
      expect(window.localStorage.getItem('zapp.media.migrated')).toBe('1');
    });

    it('S34: a migração não repete — o valor antigo não volta nem vaza para o segundo usuário', async () => {
      window.localStorage.setItem('zapp.media.volume', '45');
      sessaoDe('u1');
      await freshStore(); // primeira carga: migra 45 → u1
      expect(window.localStorage.getItem(chaveVolumeDe('u1'))).toBe('45');

      // depois da migração a chave antiga muda e o usuário fica sem valor próprio
      window.localStorage.setItem('zapp.media.volume', '90');
      window.localStorage.removeItem(chaveVolumeDe('u1'));
      sessaoDe('u1');
      expect((await freshStore()).getSnapshot().volume).toBe(80);

      // e o segundo usuário do mesmo navegador também não herda a chave antiga
      sessaoDe('u2');
      expect((await freshStore()).getSnapshot().volume).toBe(80);
      expect(window.localStorage.getItem(chaveVolumeDe('u2'))).toBeNull();
    });

    it('S34: valor próprio do usuário não é sobrescrito pela chave antiga', async () => {
      sessaoDe('u1');
      window.localStorage.setItem(chaveVolumeDe('u1'), '30');
      window.localStorage.setItem('zapp.media.volume', '45');

      expect((await freshStore()).getSnapshot().volume).toBe(30);
      expect(window.localStorage.getItem('zapp.media.volume')).toBe('45');
    });

    it('S33: valores inválidos/NaN/fora de 0–100 na chave do usuário caem no padrão', async () => {
      sessaoDe('u1');
      const casos: Array<[string, number]> = [
        ['999', 80],
        ['-3', 80],
        ['abc', 80],
        ['50.5', 80],
        ['NaN', 80],
        ['', 80],
        ['0', 0],
        ['100', 100],
      ];
      for (const [cru, esperado] of casos) {
        window.localStorage.setItem(chaveVolumeDe('u1'), cru);
        expect((await freshStore()).getSnapshot().volume, `chave do usuário com "${cru}"`).toBe(esperado);
      }
    });

    it('S35: a mensagem de outra aba só vale para o MESMO usuário', async () => {
      vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
      sessaoDe('u1');
      const store = await freshStore();
      const listener = vi.fn();
      store.subscribe(listener);

      const channel = FakeBroadcastChannel.channels.get('zapp-media-volume');
      const peer = channel ? Array.from(channel)[0] : undefined;

      // aba de outra conta (mesmo navegador): o valor dela não é o meu
      peer?.onmessage?.({ data: { userId: 'u2', volume: 10, muted: true } } as MessageEvent);
      expect(store.getSnapshot()).toEqual({ volume: 80, muted: false });
      expect(listener).not.toHaveBeenCalled();

      peer?.onmessage?.({ data: { userId: 'u1', volume: 25, muted: true } } as MessageEvent);
      expect(store.getSnapshot()).toEqual({ volume: 25, muted: true });
      expect(listener).toHaveBeenCalledTimes(1); // uma só: aplicar não reemite em eco
    });

    it('S35: o evento `storage` aplica a chave do usuário e ignora a chave antiga', async () => {
      vi.stubGlobal('BroadcastChannel', undefined);
      sessaoDe('u1');
      const store = await freshStore();
      store.subscribe(vi.fn());

      window.dispatchEvent(new StorageEvent('storage', { key: chaveVolumeDe('u1'), newValue: '25' }));
      expect(store.getSnapshot().volume).toBe(25);

      // com usuário, a chave antiga deixou de ser a fonte
      window.dispatchEvent(new StorageEvent('storage', { key: 'zapp.media.volume', newValue: '90' }));
      expect(store.getSnapshot().volume).toBe(25);

      window.dispatchEvent(new StorageEvent('storage', { key: chaveMudoDe('u1'), newValue: 'true' }));
      expect(store.getSnapshot()).toEqual({ volume: 25, muted: true });

      // valor fora de faixa na chave do usuário é saneado, não aplicado cru
      window.dispatchEvent(new StorageEvent('storage', { key: chaveVolumeDe('u1'), newValue: '999' }));
      expect(store.getSnapshot().volume).toBe(80);
    });

    it('S33: localStorage indisponível não quebra a resolução da identidade', async () => {
      vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
        throw new Error('SecurityError: localStorage bloqueado');
      });

      const store = await freshStore();
      expect(store.getSnapshot()).toEqual({ volume: 80, muted: false });
      expect(() => store.setVolume(35)).not.toThrow();
      expect(store.getSnapshot().volume).toBe(35);
    });
  });
});
