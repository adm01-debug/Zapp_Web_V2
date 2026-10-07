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

  /**
   * R2-CALL-003 — a líder SUSPENSA pelo navegador retoma sem ceder à nova
   * líder: o tick atrasado dela chama `renewLeadership()`, que regravava o
   * lock com o tabId ANTIGO por cima do dono vigente — duas líderes ao mesmo
   * tempo renovando o lock em alternância.
   *
   * "Suspender" aqui é `clearInterval` no tick de A (o navegador congela o
   * timer); "retomar" é chamar o callback capturado à mão (o tick atrasado
   * que o navegador entrega quando a aba volta). A correção faz o tick de
   * renovação reler o lock: se outra aba assumiu, a retomada vira seguidora
   * em vez de regravar por cima.
   */
  it('a líder suspensa retoma e NÃO retoma a liderança: vira seguidora da nova líder', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    // Guarda id E callback de cada intervalo: o id suspende a aba
    // (clearInterval) e o callback a retoma (tick atrasado disparado à mão).
    const ticks: Array<{ id: ReturnType<typeof setInterval>; callback: () => void }> = [];
    const realSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((...args: Parameters<typeof setInterval>) => {
      const id = realSetInterval(...args);
      ticks.push({ id, callback: args[0] as () => void });
      return id;
    }) as typeof setInterval);

    // A sobe, reivindica e vira líder; ticks[0] é o relógio dela.
    const tabA = await freshStore();
    tabA.subscribe(vi.fn());
    tabA.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    expect(tabA.isLeader()).toBe(true);

    // B sobe depois e vira seguidora de A; ticks[1] é o relógio dela.
    const tabB = await freshStore();
    tabB.subscribe(vi.fn());
    tabB.claimLeadership();
    vi.advanceTimersByTime(JITTER_MS);
    expect(tabB.isLeader()).toBe(false);
    expect(tabB.getSnapshot().leaderId).toBe(tabA.getSnapshot().tabId);
    expect(ticks.length).toBeGreaterThanOrEqual(2);

    // O navegador suspende A: o tick dela para de rodar, sem RELEASE.
    clearInterval(ticks[0].id);

    // O lock de A vence e B assume pelo caminho normal (TTL + releitura).
    vi.advanceTimersByTime(TTL_MS + HEARTBEAT_MS);
    expect(tabB.isLeader()).toBe(true);
    const lockDaB = readLock();
    expect(lockDaB?.tabId).toBe(tabB.getSnapshot().tabId);

    // O navegador retoma A: o tick atrasado dela finalmente dispara.
    ticks[0].callback();

    // A NÃO retoma a liderança: vira seguidora de B e não regrava o lock.
    expect(tabA.isLeader()).toBe(false);
    expect(tabA.getSnapshot().role).toBe('follower');
    expect(tabA.getSnapshot().leaderId).toBe(tabB.getSnapshot().tabId);
    expect(readLock()?.tabId).toBe(tabB.getSnapshot().tabId);
    expect(readLock()?.expiresAt).toBe(lockDaB?.expiresAt);
    expect([tabA, tabB].filter((tab) => tab.isLeader())).toHaveLength(1);
  });

  it('sorteia o jitter de boot por crypto.getRandomValues (nao por Math.random)', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const store = await freshStore();
    store.subscribe(vi.fn());

    const espiao = vi.spyOn(globalThis.crypto, 'getRandomValues');
    store.claimLeadership();

    expect(espiao.mock.calls.length).toBeGreaterThanOrEqual(1);

    vi.advanceTimersByTime(JITTER_MS);
    expect(store.isLeader()).toBe(true);
  });

  /**
   * O `Math.random()` que sobra neste arquivo e o id da aba, e ele fica de fora
   * de proposito: e o ULTIMO recurso de `generateTabId()` para quando o navegador
   * nao expoe `crypto.randomUUID` — e a fonte segura (`crypto.getRandomValues`,
   * por tras de `secureRandomFloat`) lanca exatamente nesse cenario. O id nasce no
   * topo do modulo (`const tabId = generateTabId()`), entao um throw aqui derruba
   * o modulo e a eleicao de aba inteira. Este teste e a guarda: sem crypto
   * nenhum, o modulo tem de carregar e o id continuar no formato `tab-...`.
   */
  it('sem crypto (bloqueado pelo navegador) o modulo ainda carrega e o id preserva o prefixo tab-', async () => {
    vi.stubGlobal('crypto', undefined);

    const store = await freshStore();

    expect(store.getSnapshot().tabId).toMatch(/^tab-/);
  });
});
