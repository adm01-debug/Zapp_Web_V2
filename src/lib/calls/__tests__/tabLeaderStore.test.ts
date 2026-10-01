import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeBroadcastChannel } from '@/test/fakeBroadcastChannel';

/**
 * Eleição de aba líder da sessão de chamadas: TTL, heartbeat, jitter de boot,
 * ausência de canal e devolução de liderança.
 *
 * O store é singleton de módulo, então cada cenário reimporta o módulo
 * (`vi.resetModules()`) para nascer com estado limpo — mesmo padrão de
 * `mediaVolumeStore.test.ts`. O relógio é falso para que jitter, TTL e
 * heartbeat avancem de forma determinística.
 */
type StoreModule = typeof import('@/lib/calls/tabLeaderStore');

const CHANNEL_NAME = 'zapp-call-session';
const LOCK_KEY = 'zapp.call.tab-leader';
/** Mesmo teto do jitter de boot: avançar isso sempre dispara o claim pendente. */
const JITTER_MS = 120;
const HEARTBEAT_MS = 3_000;
const TTL_MS = 10_000;

async function freshStore(): Promise<StoreModule> {
  vi.resetModules();
  return import('@/lib/calls/tabLeaderStore');
}

function readLock(): { tabId: string; expiresAt: number } | null {
  const raw = window.localStorage.getItem(LOCK_KEY);
  return raw ? (JSON.parse(raw) as { tabId: string; expiresAt: number }) : null;
}

describe('tabLeaderStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    window.localStorage.clear();
    FakeBroadcastChannel.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a primeira aba assume e grava o lock com expiresAt no futuro', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const store = await freshStore();
    store.subscribe(vi.fn());

    store.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);

    expect(store.isLeader()).toBe(true);
    expect(store.getSnapshot().role).toBe('leader');

    const lock = readLock();
    expect(lock?.tabId).toBe(store.getSnapshot().tabId);
    expect(lock?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('com lock vivo de outra aba, a nova vira follower e conhece leaderId', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    const tabA = await freshStore();
    tabA.subscribe(vi.fn());
    tabA.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    expect(tabA.isLeader()).toBe(true);

    const tabB = await freshStore();
    tabB.subscribe(vi.fn());
    tabB.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);

    expect(tabB.isLeader()).toBe(false);
    expect(tabB.getSnapshot().role).toBe('follower');
    expect(tabB.getSnapshot().leaderId).toBe(tabA.getSnapshot().tabId);
  });

  it('lock expirado deixa a sobrevivente assumir (TTL)', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    // Aba líder que morreu sem avisar: lock no passado.
    window.localStorage.setItem(
      LOCK_KEY,
      JSON.stringify({ tabId: 'aba-morta', expiresAt: Date.now() - 1 }),
    );

    const store = await freshStore();
    store.subscribe(vi.fn());
    store.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);

    expect(store.isLeader()).toBe(true);
    expect(readLock()?.tabId).toBe(store.getSnapshot().tabId);
  });

  it('a líder renova o lock no heartbeat e publica HEARTBEAT', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    const store = await freshStore();
    const heard: Array<{ type?: string; at?: number; expiresAt?: number }> = [];
    const ear = new FakeBroadcastChannel(CHANNEL_NAME);
    ear.onmessage = (event) => heard.push(event.data as { type?: string; expiresAt?: number });

    store.subscribe(vi.fn());
    store.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);

    const claim = heard.find((message) => message.type === 'CLAIM');
    expect(claim).toBeDefined();
    const firstExpiry = store.getSnapshot().expiresAt as number;
    expect(firstExpiry).toBe((claim?.at as number) + TTL_MS);
    expect(readLock()?.expiresAt).toBe(firstExpiry);

    vi.advanceTimersByTime(HEARTBEAT_MS);

    const renewedExpiry = store.getSnapshot().expiresAt as number;
    expect(renewedExpiry).toBeGreaterThan(firstExpiry);
    expect(readLock()?.expiresAt).toBe(renewedExpiry);

    const heartbeat = heard.find((message) => message.type === 'HEARTBEAT');
    expect(heartbeat).toBeDefined();
    expect(heartbeat?.expiresAt).toBe(renewedExpiry);
  });

  it('RELEASE devolve a liderança para a seguidora', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    const tabA = await freshStore();
    const tabB = await freshStore();
    tabA.subscribe(vi.fn());
    tabB.subscribe(vi.fn());

    tabA.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    expect(tabA.isLeader()).toBe(true);

    tabB.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    expect(tabB.isLeader()).toBe(false);
    expect(tabB.getSnapshot().leaderId).toBe(tabA.getSnapshot().tabId);

    tabA.releaseLeadership();
    expect(tabA.isLeader()).toBe(false);

    vi.advanceTimersByTime(JITTER_MS);
    expect(tabB.isLeader()).toBe(true);
    expect(readLock()?.tabId).toBe(tabB.getSnapshot().tabId);
  });

  it('corrida de boot: duas abas reivindicando juntas produzem exatamente uma líder', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    const tabA = await freshStore();
    const tabB = await freshStore();
    tabA.subscribe(vi.fn());
    tabB.subscribe(vi.fn());

    tabA.claimLeadership();
    tabB.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);

    const leaders = [tabA, tabB].filter((tab) => tab.isLeader());
    expect(leaders).toHaveLength(1);

    const leader = leaders[0];
    const follower = leader === tabA ? tabB : tabA;
    expect(follower.getSnapshot().leaderId).toBe(leader.getSnapshot().tabId);
  });

  it('sem BroadcastChannel a aba assume líder (modo aba única)', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const store = await freshStore();
    store.subscribe(vi.fn());

    store.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);

    expect(store.isLeader()).toBe(true);
  });

  it('BroadcastChannel que lança não trava o app: a aba assume líder', async () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('canal bloqueado');
        }
      },
    );
    const store = await freshStore();
    store.subscribe(vi.fn());

    store.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);

    expect(store.isLeader()).toBe(true);
  });

  it('subscribe notifica quando o papel muda e para depois do unsubscribe', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const store = await freshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();

    store.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.releaseLeadership();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('preserva a identidade do snapshot quando nada muda', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const store = await freshStore();
    const beforeClaim = store.getSnapshot();

    store.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    const afterClaim = store.getSnapshot();
    expect(afterClaim).not.toBe(beforeClaim);

    // Já é líder: reivindicar de novo é no-op e não troca a referência.
    store.claimLeadership();
    expect(store.getSnapshot()).toBe(afterClaim);
  });

  /**
   * T20(B) — a líder morre SEM avisar (crash/aba fechada no meio): ninguém
   * publica RELEASE. O lock vence no localStorage, mas isso só salva alguém se
   * a seguidora consultar o TTL — é o tick dela que a promove. Sem a promoção
   * no tick, B fica seguidora para sempre e a linha fica sem registro.
   */
  it('a aba líder morre sem avisar: a seguidora assume sozinha depois do TTL', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    // Instrumenta o relógio para saber QUAL intervalo pertence a QUAL aba: é
    // assim que se "mata" a líder (limpa o tick dela) sem tocar na seguidora.
    const intervalIds: Array<ReturnType<typeof setInterval>> = [];
    const realSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((...args: Parameters<typeof setInterval>) => {
      const id = realSetInterval(...args);
      intervalIds.push(id);
      return id;
    }) as typeof setInterval);

    // A sobe, reivindica e vira líder; o lock dela expira em (agora + TTL).
    const tabA = await freshStore();
    tabA.subscribe(vi.fn());
    tabA.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    expect(tabA.isLeader()).toBe(true);
    const lockDaA = readLock();
    expect(lockDaA?.tabId).toBe(tabA.getSnapshot().tabId);

    // B sobe depois e é seguidora: conhece a líder e o vencimento do lock.
    const tabB = await freshStore();
    tabB.subscribe(vi.fn());
    tabB.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    expect(tabB.isLeader()).toBe(false);
    expect(tabB.getSnapshot().leaderId).toBe(tabA.getSnapshot().tabId);

    // A morre sem avisar: o tick dela para; nenhum RELEASE é publicado.
    // intervalIds[0] é o tick de A, [1] é o de B (ordem dos subscribe).
    expect(intervalIds.length).toBeGreaterThanOrEqual(2);
    clearInterval(intervalIds[0]);

    // Prova de que A silenciou: passado o heartbeat, o lock NÃO foi renovado.
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(readLock()?.expiresAt).toBe(lockDaA?.expiresAt);
    expect(tabB.isLeader()).toBe(false);

    // Passado o TTL, a seguidora assume sozinha e grava o lock com o id dela.
    vi.advanceTimersByTime(TTL_MS + HEARTBEAT_MS);
    expect(tabB.isLeader()).toBe(true);
    expect(tabB.getSnapshot().role).toBe('leader');
    expect(readLock()?.tabId).toBe(tabB.getSnapshot().tabId);
  });
});
