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

import type { Invitation, Inviter, Session, UserAgent } from 'sip.js';

import { CallEngine } from '../CallEngine';
import type { CallEngineSink, EngineStatus } from '../CallEngine';
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
    onBusyHere: vi.fn(),
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

  override async invite(
    _inviter: Inviter,
    _onFinalReject?: (codigo: number | undefined) => void,
  ): Promise<void> { /* o INVITE real não interessa aqui */ }
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
 * T11 — o registro da chamada precisa do Call-ID do SIP e do mesmo id do
 * provider. Isso obriga o `createInviter` a vir ANTES do `sink.create`: até o
 * T10 o registro era disparado primeiro (fire-and-forget) e o Call-ID não
 * existia. As asserções abaixo provam o payload e a ORDEM.
 */
describe('CallEngine — Call-ID e sessionId no registro (T11)', () => {
  it('create recebe o sessionId do provider e o Call-ID da sessão SIP', async () => {
    const ordem: string[] = [];
    class AdapterComOrdem extends SipCallAdapter {
      override async isDialable(): Promise<boolean> { return true; }
      override async createInviter(): Promise<Inviter> {
        ordem.push('createInviter');
        return { id: 'sip-call-7', ...sessionWithTrack(fakeAudioTrack(true)) } as unknown as Inviter;
      }
      override async invite(): Promise<void> { ordem.push('invite'); }
    }
    const sink = fakeSink({
      create: vi.fn(async () => { ordem.push('create'); return 'linha-1'; }),
    });
    const engine = new CallEngine(new AdapterComOrdem(), sink);

    await engine.makeCall('11999992048', fakeUa(), true, 'sessao-1');

    expect(sink.create).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'outbound',
      contactPhone: '11999992048',
      sessionId: 'sessao-1',
      providerCallId: 'sip-call-7',
    }));
    // createInviter → create (Call-ID já existe) → invite (não bloqueia a discagem).
    expect(ordem).toEqual(['createInviter', 'create', 'invite']);
  });

  it('handleInvitation passa o Call-ID do convite como providerCallId', async () => {
    const sink = fakeSink();
    const engine = new CallEngine(new TestAdapter(), sink);
    const invitation = {
      id: 'sip-invite-9',
      state: 'Initial',
      stateChange: { addListener: vi.fn() },
      remoteIdentity: { uri: { user: '5511988887777' }, displayName: '' },
    } as unknown as Invitation;

    engine.handleInvitation(invitation);

    expect(sink.create).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'inbound',
      contactPhone: '5511988887777',
      providerCallId: 'sip-invite-9',
    }));
  });
});
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

// ─── T12: o código SIP final chega pelo `onReject` do INVITE ────────────────

type RespostaFinal = { message: { statusCode: number | undefined } };

/** Inviter dublê: o `invite` responde o final com o código combinado. */
function inviterQueRejeitaCom(statusCode: number | undefined): Inviter {
  return {
    invite: async (opcoes: { requestDelegate?: { onReject?: (resposta: RespostaFinal) => void } }) => {
      opcoes.requestDelegate?.onReject?.({ message: { statusCode } });
    },
  } as unknown as Inviter;
}

/** Inviter dublê que só registra o delegate (o teste dispara o `onReject`). */
function inviterComDelegate() {
  let responder: ((resposta: RespostaFinal) => void) | undefined;
  const inviter = {
    invite: async (opcoes: { requestDelegate?: { onReject?: (resposta: RespostaFinal) => void } }) => {
      responder = opcoes.requestDelegate?.onReject;
    },
  } as unknown as Inviter;
  return { inviter, responder: () => responder };
}

describe('SipCallAdapter.invite (T12)', () => {
  it('entrega o código da resposta final negativa (486) ao callback', async () => {
    // sip.js 0.21 não expõe `lastResponse` no Inviter: o único caminho para o
    // código é o delegate da transação — sem este callback, `end_reason` nunca
    // saberia distinguir 486 (ocupado) de 480 (não atendida).
    const adapter = new SipCallAdapter();
    const codigos: Array<number | undefined> = [];

    await adapter.invite(inviterQueRejeitaCom(486), (codigo) => codigos.push(codigo));

    expect(codigos).toEqual([486]);
  });

  it('resposta sem statusCode chega como undefined (e não lança)', async () => {
    const adapter = new SipCallAdapter();
    const recebidos: Array<number | undefined> = [];

    await expect(adapter.invite(inviterQueRejeitaCom(undefined), (codigo) => recebidos.push(codigo)))
      .resolves.toBeUndefined();

    expect(recebidos).toEqual([undefined]);
  });

  it('sem callback o INVITE segue igual: nada observa a resposta e nada lança', async () => {
    const adapter = new SipCallAdapter();

    await expect(adapter.invite(inviterQueRejeitaCom(480))).resolves.toBeUndefined();

    // Com o callback opcional ausente, o delegate do adapter engole a resposta.
    const semCallback = inviterComDelegate();
    await expect(adapter.invite(semCallback.inviter)).resolves.toBeUndefined();
    expect(() => semCallback.responder()?.({ message: { statusCode: 480 } })).not.toThrow();
  });
});

// ─── T12: desfecho fino no motor (bandeiras + código SIP) ───────────────────

describe('CallEngine — desfecho do fim (T12)', () => {
  /** Deixa a cadeia do sink (`callIdPromise.then`) rodar. */
  async function escoar(voltas = 5): Promise<void> {
    for (let i = 0; i < voltas; i += 1) await Promise.resolve();
  }

  /** Adapter que guarda o callback do INVITE para simular a resposta final. */
  class AdapterComResposta extends TestAdapter {
    private responder: ((codigo: number | undefined) => void) | null = null;

    override async invite(_inviter: Inviter, onFinalReject?: (codigo: number | undefined) => void): Promise<void> {
      this.responder = onFinalReject ?? null;
    }

    finalizarCom(codigo: number | undefined): void { this.responder?.(codigo); }
  }

  /** Sessão de saída cancelável (o `hangUp` de uma saída chama `cancel`). */
  function sessaoCancelavel() {
    return { ...sessionWithTrack(fakeAudioTrack(true)), cancel: vi.fn() };
  }

  /** Disca e devolve o motor já com a sessão no ar + o atalho de Terminated. */
  async function discar(adapter: TestAdapter, sink: CallEngineSink, numero = '11999992048') {
    const engine = new CallEngine(adapter, sink);
    const sessao = sessaoCancelavel();
    adapter.inviter = sessao;
    await engine.makeCall(numero, fakeUa(), true, 'sessao-1');
    const terminar = () => engine.handleStateChange(
      'Terminated',
      sessao as unknown as Session,
      numero,
      'outbound',
    );
    return { engine, sessao, terminar };
  }

  it('desligamento local: a bandeira vence o adapter e o fim sai hangup_local', async () => {
    const adapter = new TestAdapter();
    const sink = fakeSink();
    const { engine, sessao, terminar } = await discar(adapter, sink);

    engine.hangUp();
    expect(sessao.cancel).toHaveBeenCalledTimes(1);

    terminar();
    await escoar();
    expect(sink.onFinished).toHaveBeenCalledWith('call-1', null, { endedBy: 'hangup_local', sipCode: null });
  });

  it('fim sem ação nossa (o outro lado desligou) sai hangup_remote', async () => {
    const adapter = new TestAdapter();
    const sink = fakeSink();
    const { terminar } = await discar(adapter, sink);

    terminar();
    await escoar();
    expect(sink.onFinished).toHaveBeenCalledWith('call-1', null, { endedBy: 'hangup_remote', sipCode: null });
  });

  it('o código do `onReject` (486) entra no desfecho', async () => {
    const adapter = new AdapterComResposta();
    const sink = fakeSink();
    const { terminar } = await discar(adapter, sink);

    // A resposta final do INVITE chega ANTES do Terminated (é a ordem real).
    adapter.finalizarCom(486);
    terminar();
    await escoar();
    expect(sink.onFinished).toHaveBeenCalledWith('call-1', null, { endedBy: 'hangup_remote', sipCode: 486 });
  });

  it('resposta sem código vira `sipCode: null` (nunca undefined/NaN)', async () => {
    const adapter = new AdapterComResposta();
    const sink = fakeSink();
    const { terminar } = await discar(adapter, sink);

    adapter.finalizarCom(undefined);
    terminar();
    await escoar();
    expect(sink.onFinished).toHaveBeenCalledWith('call-1', null, { endedBy: 'hangup_remote', sipCode: null });
  });

  it('a recusa (reject) vence: o fim sai `reject`, não hangup_remote', async () => {
    const sink = fakeSink();
    const engine = new CallEngine(new TestAdapter(), sink);
    const convite = {
      id: 'convite-1',
      state: 'Initial',
      stateChange: { addListener: vi.fn() },
      remoteIdentity: { uri: { user: '5511988887777' }, displayName: '' },
      reject: vi.fn().mockResolvedValue(undefined),
    } as unknown as Invitation;

    engine.handleInvitation(convite);
    await engine.reject();
    engine.handleStateChange('Terminated', convite as unknown as Session, '5511988887777', 'inbound');
    await escoar();
    expect(sink.onFinished).toHaveBeenCalledWith('call-1', null, { endedBy: 'reject', sipCode: null });
  });

  it('bandeira/código não vazam para a chamada seguinte', async () => {
    vi.useFakeTimers();
    const adapter = new AdapterComResposta();
    const sink = fakeSink();
    const engine = new CallEngine(adapter, sink);

    // 1ª chamada: desligada por nós, com 486 da resposta (não pode contaminar).
    adapter.inviter = sessaoCancelavel();
    await engine.makeCall('111', fakeUa(), true);
    adapter.finalizarCom(486);
    engine.hangUp();
    engine.handleStateChange('Terminated', adapter.inviter as unknown as Session, '111', 'outbound');
    await escoar();
    expect(sink.onFinished).toHaveBeenLastCalledWith('call-1', null, { endedBy: 'hangup_local', sipCode: 486 });

    // Volta a `idle` (IDLE_RESET_MS) antes da 2ª.
    vi.advanceTimersByTime(2000);
    expect(engine.isBusy).toBe(false);

    // 2ª chamada: o remoto encerra — nada da anterior pode sobrar.
    adapter.inviter = sessaoCancelavel();
    await engine.makeCall('222', fakeUa(), true);
    engine.handleStateChange('Terminated', adapter.inviter as unknown as Session, '222', 'outbound');
    await escoar();
    expect(sink.onFinished).toHaveBeenLastCalledWith('call-1', null, { endedBy: 'hangup_remote', sipCode: null });
    vi.useRealTimers();
  });

  it('falha ao discar sai como failure (o Terminated nunca chega nesse caminho)', async () => {
    class AdapterQueFalha extends TestAdapter {
      override async invite(): Promise<void> { throw new Error('transporte caiu'); }
    }
    const adapter = new AdapterQueFalha();
    // A sessão existe (o Inviter é criado antes do registro): o que falha é o
    // INVITE — é este o caminho em que o Terminated nunca chega.
    adapter.inviter = sessaoCancelavel();
    const sink = fakeSink();
    const engine = new CallEngine(adapter, sink);

    await engine.makeCall('11999992048', fakeUa(), true);
    await escoar();
    expect(sink.onFinished).toHaveBeenCalledWith('call-1', null, { endedBy: 'failure', sipCode: null });
    expect(sink.onError).toHaveBeenCalledWith(expect.stringContaining('Erro ao ligar'));
  });

  it('atendida: a duração sai JUNTO do desfecho', async () => {
    vi.stubGlobal('MediaStream', class { addTrack() { /* dublê */ } });
    const adapter = new TestAdapter();
    const sink = fakeSink();
    const sessao = {
      ...sessaoCancelavel(),
      sessionDescriptionHandler: {
        peerConnection: {
          getSenders: () => [{ track: fakeAudioTrack(true) }],
          getReceivers: () => [],
        },
      },
    };
    adapter.inviter = sessao;
    const engine = new CallEngine(adapter, sink);

    await engine.makeCall('11999992048', fakeUa(), true);
    engine.handleStateChange('Established', sessao as unknown as Session, '11999992048', 'outbound');
    engine.hangUp();
    engine.handleStateChange('Terminated', sessao as unknown as Session, '11999992048', 'outbound');
    await escoar();

    expect(sink.onFinished).toHaveBeenCalledWith('call-1', expect.any(Number), { endedBy: 'hangup_local', sipCode: null });
    vi.unstubAllGlobals();
  });
});

// ─── D1: watchdog do INVITE sem resposta final ─────────────────────────────

describe('CallEngine — watchdog do INVITE (D1)', () => {
  /** Deixa a cadeia do sink (`callIdPromise.then`) rodar. */
  async function escoar(voltas = 5): Promise<void> {
    for (let i = 0; i < voltas; i += 1) await Promise.resolve();
  }

  function sessaoCancelavel() {
    return { ...sessionWithTrack(fakeAudioTrack(true)), cancel: vi.fn() };
  }

  /** Adapter que não toca em mídia (o watchdog não é sobre áudio). */
  class AdapterSemMidia extends TestAdapter {
    override attachRemoteAudio(): null { return null; }
  }

  it('sem Terminated, o watchdog encerra em timeout e libera a linha', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new TestAdapter();
      adapter.inviter = sessaoCancelavel();
      const sink = fakeSink();
      const engine = new CallEngine(adapter, sink);

      await engine.makeCall('11999992048', fakeUa(), true, 'sessao-1');
      expect(engine.isBusy).toBe(true);

      // O INVITE nunca recebe resposta final: nada dispara onFinished sozinho.
      vi.advanceTimersByTime(40000);
      await escoar();

      expect(sink.onFinished).toHaveBeenCalledWith('call-1', null, { endedBy: 'timeout', sipCode: null });
      expect(sink.onStatus).toHaveBeenCalledWith('ended');

      // IDLE_RESET_MS depois: a linha volta a aceitar discagem.
      vi.advanceTimersByTime(2000);
      await escoar();
      expect(engine.isBusy).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('um Terminated tardio após o watchdog não reemite onFinished', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new TestAdapter();
      const sessao = sessaoCancelavel();
      adapter.inviter = sessao;
      const sink = fakeSink();
      const engine = new CallEngine(adapter, sink);

      await engine.makeCall('11999992048', fakeUa(), true, 'sessao-1');
      vi.advanceTimersByTime(40000);
      await escoar();
      expect(sink.onFinished).toHaveBeenCalledTimes(1);

      engine.handleStateChange('Terminated', sessao as unknown as Session, '11999992048', 'outbound');
      await escoar();
      expect(sink.onFinished).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a resposta final (Established) desarma o watchdog: conversa longa não é derrubada', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new AdapterSemMidia();
      const sessao = sessaoCancelavel();
      adapter.inviter = sessao;
      const sink = fakeSink();
      const engine = new CallEngine(adapter, sink);

      await engine.makeCall('11999992048', fakeUa(), true, 'sessao-1');
      engine.handleStateChange('Established', sessao as unknown as Session, '11999992048', 'outbound');

      vi.advanceTimersByTime(60000);
      await escoar();

      expect(sink.onFinished).not.toHaveBeenCalled();
      expect(sink.onTerminated).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── D4: ordem do desfecho (onFinished antes de setStatus('ended')) ─────────

describe('CallEngine — ordem do desfecho (D4)', () => {
  async function escoar(voltas = 5): Promise<void> {
    for (let i = 0; i < voltas; i += 1) await Promise.resolve();
  }

  it('onFinished chega ANTES de setStatus(ended)', async () => {
    const ordem: string[] = [];
    const sink = fakeSink({
      onStatus: vi.fn((status: EngineStatus) => { ordem.push(`status:${status}`); }),
      onFinished: vi.fn(() => { ordem.push('onFinished'); }),
    });
    const adapter = new TestAdapter();
    const sessao = { ...sessionWithTrack(fakeAudioTrack(true)), cancel: vi.fn() };
    adapter.inviter = sessao;
    const engine = new CallEngine(adapter, sink);

    await engine.makeCall('11999992048', fakeUa(), true, 'sessao-1');
    engine.handleStateChange('Terminated', sessao as unknown as Session, '11999992048', 'outbound');
    await escoar();

    expect(ordem).toContain('onFinished');
    expect(ordem).toContain('status:ended');
    expect(ordem.indexOf('onFinished')).toBeLessThan(ordem.indexOf('status:ended'));
  });
});

// ─── Linha ocupada: a 2ª chamada não pode ser silenciosa nem derrubar a atual ─

describe('CallEngine — linha ocupada (busy here)', () => {
  /** Adapter real com o `reject` contabilizado (o 486 é a prova da recusa). */
  class AdapterContando extends TestAdapter {
    recusas: Array<number | undefined> = [];

    override async reject(_invitation: Invitation, code?: number): Promise<void> {
      this.recusas.push(code);
    }
  }

  it('2º INVITE com a sessão ativa: recusa 486, avisa o sink (onBusyHere) e não toca a sessão em curso', async () => {
    const adapter = new AdapterContando();
    adapter.inviter = { ...sessionWithTrack(fakeAudioTrack(true)), cancel: vi.fn() };
    const sink = fakeSink();
    const engine = new CallEngine(adapter, sink);

    // Chamada em curso (ela NÃO pode cair).
    await engine.makeCall('11999992048', fakeUa(), true, 'sessao-1');
    const statusAntes = vi.mocked(sink.onStatus).mock.calls.length;
    const sessaoAntes = vi.mocked(sink.onSession).mock.calls.length;
    const criarAntes = vi.mocked(sink.create).mock.calls.length;

    // Segunda chamada chegando com a linha ocupada.
    const segundoConvite = {
      id: 'sip-invite-2',
      state: 'Initial',
      stateChange: { addListener: vi.fn() },
      remoteIdentity: { uri: { user: '5511977776666' }, displayName: '' },
    } as unknown as Invitation;

    engine.handleInvitation(segundoConvite);

    // (a) recusou com 486.
    expect(adapter.recusas).toEqual([486]);
    // (b) o sink foi avisado com o número remoto do convite.
    expect(sink.onBusyHere).toHaveBeenCalledTimes(1);
    expect(sink.onBusyHere).toHaveBeenCalledWith('5511977776666');
    // A sessão em curso não foi alterada: mesmo status, nenhum evento novo.
    expect(engine.isBusy).toBe(true);
    expect(vi.mocked(sink.onStatus).mock.calls.length).toBe(statusAntes);
    expect(vi.mocked(sink.onSession).mock.calls.length).toBe(sessaoAntes);
    // Nada de registro novo para a 2ª chamada (o sink cria o dela).
    expect(vi.mocked(sink.create).mock.calls.length).toBe(criarAntes);
  });
});

// ─── R2-CALL-001: evento tardio da sessão anterior não altera a próxima ─────

/**
 * O defeito da auditoria (item 75): a sessão A morre para o motor (watchdog do
 * INVITE), mas o adapter segue com o listener vivo. Quando o evento de A chega
 * DEPOIS de B começar, `handleStateChange` não confere de quem é o evento:
 * `Terminated` de A encerra B, `Established` de A marca B como atendida e anexa
 * o áudio de A. Aqui os eventos são disparados pelo **listener de verdade**
 * (`stateChange.addListener`) — o caminho de produção, não uma chamada direta.
 */
describe('CallEngine — cerca de sessão (R2-CALL-001)', () => {
  async function escoar(voltas = 8): Promise<void> {
    for (let i = 0; i < voltas; i += 1) await Promise.resolve();
  }

  type Listener = (state: string) => void;

  /** Sessão dublê que GUARDA o listener — é por ele que o evento tardio chega. */
  function sessaoObservavel(id: string) {
    const listeners: Listener[] = [];
    const session = {
      id,
      state: 'Initial',
      stateChange: { addListener: (fn: Listener) => { listeners.push(fn); } },
      remoteIdentity: { uri: { user: '5511988887777' }, displayName: '' },
      cancel: vi.fn(),
      bye: vi.fn(),
    };
    return { session, disparar: (state: string) => { listeners.forEach((fn) => fn(state)); } };
  }

  /** Adapter real com o áudio contabilizado (o `Established` tardio o acionava). */
  class AdapterCerca extends TestAdapter {
    readonly audioRemoto = vi.fn((): null => null);
    override attachRemoteAudio(): null { return this.audioRemoto(); }
  }

  it('Established/Terminated tardios de A não atendem, não anexam áudio nem encerram B', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new AdapterCerca();
      const a = sessaoObservavel('sip-A');
      adapter.inviter = a.session;
      const sink = fakeSink({
        create: vi.fn()
          .mockResolvedValueOnce('call-A')
          .mockResolvedValueOnce('call-B'),
      });
      const engine = new CallEngine(adapter, sink);

      // A disca e NUNCA recebe resposta final: o watchdog encerra como timeout.
      await engine.makeCall('111', fakeUa(), true, 'sessao-A');
      vi.advanceTimersByTime(40000);
      await escoar();
      expect(sink.onFinished).toHaveBeenLastCalledWith('call-A', null, { endedBy: 'timeout', sipCode: null });

      // A linha volta a `idle` e B começa — a sessão de A segue com listener vivo.
      vi.advanceTimersByTime(2000);
      await escoar();
      const b = sessaoObservavel('sip-B');
      adapter.inviter = b.session;
      await engine.makeCall('222', fakeUa(), true, 'sessao-B');
      expect(engine.isBusy).toBe(true);

      const terminadosAntes = vi.mocked(sink.onTerminated).mock.calls.length;
      const finalizadosAntes = vi.mocked(sink.onFinished).mock.calls.length;
      const audioAntes = adapter.audioRemoto.mock.calls.length;

      // Eventos TARDIOS de A, agora com B no ar (inclusive repetidos).
      a.disparar('Established');
      a.disparar('Terminated');
      a.disparar('Terminated');
      await escoar();

      expect(sink.onEstablished).not.toHaveBeenCalled();
      expect(adapter.audioRemoto.mock.calls.length).toBe(audioAntes);
      expect(vi.mocked(sink.onTerminated).mock.calls.length).toBe(terminadosAntes);
      expect(vi.mocked(sink.onFinished).mock.calls.length).toBe(finalizadosAntes);
      expect(engine.isBusy).toBe(true);

      // A cerca não é um mudo: a sessão CORRENTE continua respondendo normalmente.
      b.disparar('Terminated');
      await escoar();
      expect(sink.onFinished).toHaveBeenLastCalledWith('call-B', null, { endedBy: 'hangup_remote', sipCode: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('evento tardio de A com o motor ocioso é ignorado (não ressuscita a chamada)', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new AdapterCerca();
      const a = sessaoObservavel('sip-A');
      adapter.inviter = a.session;
      const sink = fakeSink();
      const engine = new CallEngine(adapter, sink);

      await engine.makeCall('111', fakeUa(), true, 'sessao-A');
      vi.advanceTimersByTime(40000);
      await escoar();
      vi.advanceTimersByTime(2000);
      await escoar();
      expect(engine.isBusy).toBe(false);

      const statusAntes = vi.mocked(sink.onStatus).mock.calls.length;
      a.disparar('Established');
      a.disparar('Terminated');
      await escoar();

      expect(engine.isBusy).toBe(false);
      expect(vi.mocked(sink.onStatus).mock.calls.length).toBe(statusAntes);
      expect(sink.onEstablished).not.toHaveBeenCalled();
      expect(vi.mocked(sink.onFinished).mock.calls.length).toBe(1); // só o timeout de A
    } finally {
      vi.useRealTimers();
    }
  });

  it('o watchdog encerra o transporte no adapter (a sessão órfã viva era a fonte do evento tardio)', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new AdapterCerca();
      const a = sessaoObservavel('sip-A');
      adapter.inviter = a.session;
      const sink = fakeSink({ create: vi.fn(async () => 'call-A') });
      const engine = new CallEngine(adapter, sink);

      await engine.makeCall('111', fakeUa(), true, 'sessao-A');
      expect(a.session.cancel).not.toHaveBeenCalled();

      vi.advanceTimersByTime(40000);
      await escoar();

      expect(a.session.cancel).toHaveBeenCalledTimes(1);
      expect(sink.onFinished).toHaveBeenLastCalledWith('call-A', null, { endedBy: 'timeout', sipCode: null });
    } finally {
      vi.useRealTimers();
    }
  });
});
