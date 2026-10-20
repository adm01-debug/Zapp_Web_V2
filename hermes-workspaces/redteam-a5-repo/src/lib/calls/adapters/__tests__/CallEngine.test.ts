/**
 * T18 do plano de finalização: mute pelas tracks e DTMF só com a chamada
 * estabelecida.
 *
 * O defeito que este arquivo existe para travar: a versão herdada do
 * `useSipClient` fazia `track.enabled = isMuted`, ou seja, deixava a track
 * **habilitada** quando o usuário se marcava como mudo — microfone aberto com o
 * botão aceso. Aqui o motor é exercitado com o adapter **real** (só as duas
 * idas ao `sip.js` são dubladas), então a asserção é sobre a track de verdade.
 */

import { describe, expect, it, vi } from 'vitest';

import type { Inviter, Session, UserAgent } from 'sip.js';

import { CallEngine } from '../CallEngine';
import type { CallEngineSink } from '../CallEngine';
import { SipCallAdapter } from '../SipCallAdapter';

function fakeAudioTrack(enabled = true) {
  return { kind: 'audio', enabled } as unknown as MediaStreamTrack;
}

function fakeSession(options: { state?: string; senders?: { track: unknown; dtmf?: unknown }[] } = {}) {
  const senders = options.senders ?? [];
  return {
    state: options.state ?? 'Established',
    sessionDescriptionHandler: { peerConnection: { getSenders: () => senders } },
  } as unknown as Session;
}

function fakeUa(): UserAgent {
  return { configuration: { uri: { host: 'test.local' } } } as unknown as UserAgent;
}

function fakeSink(overrides: Partial<CallEngineSink> = {}): CallEngineSink {
  return {
    onStatus: vi.fn(),
    onSession: vi.fn(),
    onEstablished: vi.fn(),
    onTerminated: vi.fn(),
    onMuted: vi.fn(),
    onError: vi.fn(),
    create: vi.fn(async () => 'call-1'),
    onAnswered: vi.fn(),
    onFinished: vi.fn(),
    ...overrides,
  };
}

/** Adapter real; só o que iria ao sip.js vira dublê. */
class TestAdapter extends SipCallAdapter {
  inviter!: unknown;

  override hostOf(): string { return 'test.local'; }

  override async isDialable(): Promise<boolean> { return true; }

  override async createInviter(): Promise<Inviter> { return this.inviter as Inviter; }

  override async invite(): Promise<void> { /* o INVITE real não interessa aqui */ }
}

/** Sessão dublê que carrega a track de áudio a ser inspecionada. */
function sessionWithTrack(track: MediaStreamTrack, state = 'Initial') {
  return {
    state,
    stateChange: { addListener: vi.fn() },
    sessionDescriptionHandler: { peerConnection: { getSenders: () => [{ track }] } },
  };
}

describe('SipCallAdapter.setMuted (T18)', () => {
  it('muteia a track de áudio e devolve o estado LIDO (não o pedido)', () => {
    const track = fakeAudioTrack(true);
    const adapter = new SipCallAdapter();

    expect(adapter.setMuted(fakeSession({ senders: [{ track }] }), true)).toBe(true);
    expect(track.enabled).toBe(false);
  });

  it('desmuta a track e devolve o estado lido', () => {
    const track = fakeAudioTrack(false);
    const adapter = new SipCallAdapter();

    expect(adapter.setMuted(fakeSession({ senders: [{ track }] }), false)).toBe(false);
    expect(track.enabled).toBe(true);
  });

  it('sem mídia devolve null, para o chamador decidir pela intenção', () => {
    const adapter = new SipCallAdapter();

    expect(adapter.setMuted(fakeSession({ senders: [] }), true)).toBeNull();
    expect(adapter.setMuted({ state: 'Established' } as unknown as Session, true)).toBeNull();
  });

  it('não encosta em track que não é de áudio', () => {
    const video = { kind: 'video', enabled: true };
    const adapter = new SipCallAdapter();

    expect(adapter.setMuted(fakeSession({ senders: [{ track: video }] }), true)).toBeNull();
    expect(video.enabled).toBe(true);
  });
});

describe('SipCallAdapter.sendDTMF (T18)', () => {
  it('envia o dígito quando a sessão está estabelecida', () => {
    const insertDTMF = vi.fn();
    const adapter = new SipCallAdapter();
    const session = fakeSession({
      senders: [{ track: fakeAudioTrack(true), dtmf: { insertDTMF } }],
    });

    expect(adapter.sendDTMF(session, '5')).toBe(true);
    expect(insertDTMF).toHaveBeenCalledWith('5', 100, 70);
  });

  it('fora de Established é no-op com warn (tecla apertada durante o toque)', () => {
    const insertDTMF = vi.fn();
    const warn = vi.fn();
    const adapter = new SipCallAdapter({ error: vi.fn(), warn });
    const session = fakeSession({
      state: 'Ringing',
      senders: [{ track: fakeAudioTrack(true), dtmf: { insertDTMF } }],
    });

    expect(adapter.sendDTMF(session, '5')).toBe(false);
    expect(insertDTMF).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('só vale estabelecida');
  });

  it('sem sender de áudio devolve false', () => {
    const adapter = new SipCallAdapter();
    expect(adapter.sendDTMF(fakeSession({ senders: [] }), '5')).toBe(false);
  });
});

describe('CallEngine.toggleMute (T18 — aceite)', () => {
  it('toggleMute → track.enabled === false, e o sink recebe o estado lido', async () => {
    const track = fakeAudioTrack(true);
    const adapter = new TestAdapter({ error: vi.fn(), warn: vi.fn() });
    adapter.inviter = sessionWithTrack(track);
    const sink = fakeSink();
    const engine = new CallEngine(adapter, sink);

    await engine.makeCall('11999992048', fakeUa(), true);
    engine.toggleMute();
    expect(track.enabled).toBe(false);
    expect(sink.onMuted).toHaveBeenLastCalledWith(true);

    engine.toggleMute();
    expect(track.enabled).toBe(true);
    expect(sink.onMuted).toHaveBeenLastCalledWith(false);
  });

  it('toggleMute sem sessão é no-op', () => {
    const sink = fakeSink();
    const engine = new CallEngine(new TestAdapter(), sink);

    engine.toggleMute();
    expect(sink.onMuted).not.toHaveBeenCalled();
  });
});

/**
 * Os quatro casos abaixo fecham mutações que **sobreviveram** à suíte na
 * auditoria adversarial de 29/09 — ou seja, o código estava certo mas nenhum
 * teste o defendia. Cada um foi escrito depois de ver o mutante passar.
 */
describe('CallEngine — lacunas que a auditoria adversarial expôs', () => {
  it('toggleMute reporta o estado LIDO da track, não a intenção', async () => {
    // Track que RECUSA a escrita: continua habilitada depois do pedido de mute.
    // Sem o valor lido, o botão mostraria "mudo" com o microfone aberto.
    const teimosa = {
      kind: 'audio',
      get enabled() { return true; },
      set enabled(_valor: boolean) { /* recusa a escrita */ },
    } as unknown as MediaStreamTrack;
    const adapter = new TestAdapter({ error: vi.fn(), warn: vi.fn() });
    adapter.inviter = sessionWithTrack(teimosa);
    const sink = fakeSink();
    const engine = new CallEngine(adapter, sink);

    await engine.makeCall('11999992048', fakeUa(), true);
    engine.toggleMute();

    expect(sink.onMuted).toHaveBeenLastCalledWith(false); // o lido, não a intenção
    expect(teimosa.enabled).toBe(true); // a track de fato não mudou
  });

  it('Terminated notifica o sink (o fim da chamada não pode ser silencioso)', async () => {
    const adapter = new TestAdapter();
    const session = sessionWithTrack(fakeAudioTrack(true));
    adapter.inviter = session;
    const sink = fakeSink();
    const engine = new CallEngine(adapter, sink);

    await engine.makeCall('11999992048', fakeUa(), true);
    engine.handleStateChange(
      'Terminated',
      session as unknown as Session,
      '11999992048',
      'outbound',
    );

    expect(sink.onTerminated).toHaveBeenCalledTimes(1);
  });

  it('dispose() descarta o áudio remoto do DOM', async () => {
    vi.stubGlobal('MediaStream', class { addTrack() { /* dublê */ } });
    const adapter = new TestAdapter();
    const inviter = {
      ...sessionWithTrack(fakeAudioTrack(true)),
      sessionDescriptionHandler: {
        peerConnection: {
          getSenders: () => [{ track: fakeAudioTrack(true) }],
          getReceivers: () => [],
        },
      },
    };
    adapter.inviter = inviter;
    const sink = fakeSink();
    const engine = new CallEngine(adapter, sink);

    await engine.makeCall('11999992048', fakeUa(), true);
    adapter.attachRemoteAudio(inviter as unknown as Session);
    expect(document.getElementById('sip-remote-audio')).not.toBeNull();

    engine.dispose();
    expect(document.getElementById('sip-remote-audio')).toBeNull();
    vi.unstubAllGlobals();
  });
});
