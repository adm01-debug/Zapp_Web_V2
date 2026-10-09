/**
 * T09/T18 — superfície do adaptador SIP (`SipCallAdapter`), o transporte do
 * `CallEngine`.
 *
 * O adapter é headless (nada de React, nada de banco): a única fronteira é o
 * MÓDULO `sip.js`, a lib externa que ele carrega por `import()` dinâmico. Essa
 * fronteira entra dublada; o adapter é o código REAL sob teste.
 *
 * Regras travadas aqui:
 * - host da URI de destino vem do UA, e o número é validado ANTES de discar;
 * - o convite negocia SÓ áudio (nunca vídeo);
 * - o número remoto sai da identidade da sessão e nunca vem vazio;
 * - recusa que falha não derruba a tela (registra e segue);
 * - encerramento pelo ESTADO da sessão: `Established` → `bye`, saída pendente →
 *   `cancel`, entrada pendente → `reject`;
 * - um único elemento de áudio remoto na página, reaproveitado e substituído
 *   quando já existe, e descartado no unmount.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Invitation, Inviter, Session, UserAgent } from 'sip.js';

/** Fronteira dublada: o módulo `sip.js` — nunca o `SipCallAdapter`. */
const sipJs = vi.hoisted(() => ({
  makeURI: vi.fn((_uri: string): unknown => ({ uri: 'sip:destino' })),
  inviters: [] as Array<{ args: unknown[] }>,
}));

vi.mock('sip.js', () => ({
  UserAgent: { makeURI: sipJs.makeURI },
  Inviter: class {
    args: unknown[];

    constructor(...args: unknown[]) {
      this.args = args;
      sipJs.inviters.push(this);
    }
  },
}));

import { REMOTE_AUDIO_ID, SipCallAdapter } from '../SipCallAdapter';
import type { AdapterLogger } from '../CallAdapter';

/** Regra de mídia do adapter: só áudio, vídeo nunca é negociado. */
const MIDIA_SO_AUDIO = {
  sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
};

const UA = { configuration: { uri: { host: 'sip.promobrindes.com' } } } as unknown as UserAgent;

/** Logger de fronteira: o adapter nunca lança por falha de log. */
function loggerDuble() {
  const error = vi.fn();
  const warn = vi.fn();
  return { logger: { error, warn } as unknown as AdapterLogger, error, warn };
}

/** Stream dublê: guarda as tracks que o adapter liga no elemento de áudio. */
class FakeMediaStream {
  tracks: unknown[] = [];

  addTrack(track: unknown): void {
    this.tracks.push(track);
  }
}

/** Sessão com acesso a mídia; sem track no receiver = sem áudio remoto. */
function sessaoComMidia(receivers: Array<{ track: unknown }> = [{ track: { id: 'audio-1' } }]) {
  return {
    state: 'Initial',
    sessionDescriptionHandler: { peerConnection: { getReceivers: () => receivers } },
  } as unknown as Session;
}

beforeEach(() => {
  vi.clearAllMocks();
  sipJs.inviters = [];
  // Implementação padrão reposta a cada teste (o `clearAllMocks` mantém a última).
  sipJs.makeURI.mockImplementation((_uri: string) => ({ uri: 'sip:destino' }));
  vi.stubGlobal('MediaStream', FakeMediaStream);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('SipCallAdapter — host, destino e validação do número (T09)', () => {
  it('o host da URI vem do UA, não da sessão', () => {
    const adapter = new SipCallAdapter();
    expect(adapter.hostOf(UA)).toBe('sip.promobrindes.com');
  });

  it('é discável quando a URI resolve, e a URI leva o número com o host do UA', async () => {
    const adapter = new SipCallAdapter();

    await expect(adapter.isDialable(UA, '11999992048')).resolves.toBe(true);
    expect(sipJs.makeURI).toHaveBeenCalledWith('sip:11999992048@sip.promobrindes.com');
  });

  it('número malformado (a URI não resolve) não é discável', async () => {
    sipJs.makeURI.mockReturnValue(undefined);
    const adapter = new SipCallAdapter();

    await expect(adapter.isDialable(UA, '###')).resolves.toBe(false);
  });

  it('cria o Inviter com o destino e SÓ áudio nas opções de mídia', async () => {
    const alvo = { uri: 'sip:11999992048@sip.promobrindes.com' };
    sipJs.makeURI.mockReturnValue(alvo);
    const adapter = new SipCallAdapter();

    const inviter = await adapter.createInviter(UA, '11999992048');

    expect(sipJs.makeURI).toHaveBeenCalledWith('sip:11999992048@sip.promobrindes.com');
    expect(sipJs.inviters).toHaveLength(1);
    expect(sipJs.inviters[0].args).toEqual([UA, alvo, MIDIA_SO_AUDIO]);
    expect(inviter).toBe(sipJs.inviters[0] as unknown as Inviter);
  });

  it('URI inválida lança antes de qualquer convite sair', async () => {
    sipJs.makeURI.mockReturnValue(null);
    const adapter = new SipCallAdapter();

    await expect(adapter.createInviter(UA, 'sem-numero')).rejects.toThrow(
      'URI SIP inválida para sem-numero',
    );
    expect(sipJs.inviters).toHaveLength(0);
  });
});

describe('SipCallAdapter — número remoto e atendimento (T09)', () => {
  it('lê o usuário da identidade remota', () => {
    const adapter = new SipCallAdapter();
    const sessao = { remoteIdentity: { uri: { user: '5511988887777' } } } as unknown as Session;

    expect(adapter.remoteNumberOf(sessao)).toBe('5511988887777');
  });

  it('sem identidade, sem uri ou com usuário vazio devolve "desconhecido"', () => {
    const adapter = new SipCallAdapter();

    expect(adapter.remoteNumberOf({} as unknown as Session)).toBe('desconhecido');
    expect(adapter.remoteNumberOf({ remoteIdentity: {} } as unknown as Session)).toBe('desconhecido');
    expect(
      adapter.remoteNumberOf({ remoteIdentity: { uri: { user: '' } } } as unknown as Session),
    ).toBe('desconhecido');
  });

  it('atende o convite com as mesmas opções de mídia só-áudio', async () => {
    const accept = vi.fn(async () => undefined);
    const convite = { accept } as unknown as Invitation;
    const adapter = new SipCallAdapter();

    await adapter.accept(convite);

    expect(accept).toHaveBeenCalledWith(MIDIA_SO_AUDIO);
  });
});

describe('SipCallAdapter — recusa que nunca derruba a tela (T09)', () => {
  it('sem código recusa sem argumentos', async () => {
    const reject = vi.fn(async () => undefined);
    const convite = { reject } as unknown as Invitation;
    const adapter = new SipCallAdapter();

    await adapter.reject(convite);

    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledWith();
  });

  it('com código entrega o statusCode (486 = ocupado)', async () => {
    const reject = vi.fn(async () => undefined);
    const convite = { reject } as unknown as Invitation;
    const adapter = new SipCallAdapter();

    await adapter.reject(convite, 486);

    expect(reject).toHaveBeenCalledWith({ statusCode: 486 });
  });

  it('recusa que falha só registra — a promise resolve e não lança', async () => {
    const erro = new Error('sem rota para a recusa');
    const reject = vi.fn(() => {
      throw erro;
    });
    const convite = { reject } as unknown as Invitation;
    const { logger, error } = loggerDuble();
    const adapter = new SipCallAdapter(logger);

    await expect(adapter.reject(convite, 486)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Reject error:', erro);
  });
});

describe('SipCallAdapter — encerramento pelo estado da sessão (T09)', () => {
  it('sessão estabelecida desliga por bye (nunca por cancel)', () => {
    const bye = vi.fn();
    const cancel = vi.fn();
    const sessao = { state: 'Established', bye, cancel } as unknown as Session;
    const adapter = new SipCallAdapter();

    adapter.hangup(sessao, 'outbound');

    expect(bye).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('saída ainda não atendida cancela o INVITE pendente', () => {
    const bye = vi.fn();
    const cancel = vi.fn();
    const adapter = new SipCallAdapter();

    // Só os estados em que cancelar faz sentido — o INVITE ainda pode ser
    // cancelado: `Initial` (INVITE no ar) e `Establishing` (negociando).
    // Terminating/Terminated NÃO entram aqui: nesses estados o cancel() do
    // sip.js REJEITA (ver o `it.fails` abaixo); travá-los como contrato seria
    // travar o próprio defeito de produção.
    for (const state of ['Initial', 'Establishing']) {
      adapter.hangup({ state, bye, cancel } as unknown as Session, 'outbound');
    }

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(bye).not.toHaveBeenCalled();
  });

  it('entrada ainda não atendida recusa o convite, sem código', async () => {
    const reject = vi.fn(async () => undefined);
    const convite = { state: 'Initial', reject } as unknown as Invitation;
    const adapter = new SipCallAdapter();

    adapter.hangup(convite as unknown as Session, 'inbound');
    await Promise.resolve();

    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledWith();
  });

  it('falha síncrona do bye não sobe pelo clique de desligar', () => {
    const erro = new Error('bye quebrou');
    const sessao = {
      state: 'Established',
      bye: () => {
        throw erro;
      },
    } as unknown as Session;
    const { logger, error } = loggerDuble();
    const adapter = new SipCallAdapter(logger);

    expect(() => adapter.hangup(sessao, 'outbound')).not.toThrow();
    expect(error).toHaveBeenCalledWith('Hangup error:', erro);
  });

  // DEFEITO DE PRODUÇÃO (não corrigido aqui: este cartão é só de testes).
  // `Inviter.cancel()` REJEITA (promessa) quando o estado da sessão não é
  // Initial/Establishing — sip.js `lib/api/inviter.js:195-198` — e o adapter o
  // chama com `void` (SipCallAdapter.ts:94), então essa rejeição não é tratada:
  // o `try/catch` só pega throw SÍNCRONO. Cenário: um segundo clique em
  // "desligar" numa saída já encerrada — o `bye()` levou a sessão para
  // Terminating/Terminated e o clique seguinte cai no ramo
  // `direction === 'outbound'` → `cancel()` → promessa rejeitada solta.
  //
  // O teste abaixo descreve o comportamento CORRETO (não chamar cancel nesses
  // estados) e por isso está marcado `it.fails`: ele fica vermelho enquanto o
  // defeito existir e passa a valer no dia em que o adapter passar a checar o
  // estado antes de cancelar. O dublê de `cancel` é um `vi.fn()` SÍNCRONO de
  // propósito — um dublê que rejeitasse viraria erro de ARQUIVO no vitest
  // (rejeição não tratada), derrubando a rodada em vez de falhar o teste.
  it.fails(
    'saída em Terminating/Terminated NÃO chama cancel (hoje chama e a rejeição fica solta)',
    () => {
      const bye = vi.fn();
      const cancel = vi.fn();
      const adapter = new SipCallAdapter();

      for (const state of ['Terminating', 'Terminated']) {
        adapter.hangup({ state, bye, cancel } as unknown as Session, 'outbound');
      }

      expect(cancel).not.toHaveBeenCalled();
    },
  );
});

describe('SipCallAdapter — áudio remoto na página (T09)', () => {
  it('sem SessionDescriptionHandler não há áudio a ligar', () => {
    const adapter = new SipCallAdapter();

    expect(adapter.attachRemoteAudio({ state: 'Initial' } as unknown as Session)).toBeNull();
    expect(document.getElementById(REMOTE_AUDIO_ID)).toBeNull();
  });

  it('sem peerConnection não há áudio a ligar', () => {
    const sessao = { sessionDescriptionHandler: {} } as unknown as Session;
    const adapter = new SipCallAdapter();

    expect(adapter.attachRemoteAudio(sessao)).toBeNull();
  });

  it('liga as tracks dos receivers e ignora receiver sem track', () => {
    const t1 = { id: 'audio-1' };
    const t2 = { id: 'audio-2' };
    const adapter = new SipCallAdapter();

    const audio = adapter.attachRemoteAudio(sessaoComMidia([{ track: t1 }, { track: null }, { track: t2 }]));

    expect(audio).not.toBeNull();
    expect(document.getElementById(REMOTE_AUDIO_ID)).toBe(audio);
    expect(audio?.autoplay).toBe(true);
    expect((audio?.srcObject as unknown as FakeMediaStream).tracks).toEqual([t1, t2]);
  });

  it('reaproveita UM único elemento de áudio entre chamadas', () => {
    const adapter = new SipCallAdapter();

    const primeiro = adapter.attachRemoteAudio(sessaoComMidia());
    const segundo = adapter.attachRemoteAudio(sessaoComMidia([{ track: { id: 'audio-2' } }]));

    expect(segundo).toBe(primeiro);
    expect(document.querySelectorAll('audio')).toHaveLength(1);
  });

  it('elemento pré-existente com o mesmo id é substituído, não duplicado', () => {
    const antigo = document.createElement('audio');
    antigo.id = REMOTE_AUDIO_ID;
    document.body.appendChild(antigo);
    const adapter = new SipCallAdapter();

    const audio = adapter.attachRemoteAudio(sessaoComMidia());

    expect(audio).not.toBe(antigo);
    expect(antigo.isConnected).toBe(false);
    expect(document.querySelectorAll('audio')).toHaveLength(1);
  });

  it('unmount descarta o elemento e a próxima chamada cria outro', () => {
    const adapter = new SipCallAdapter();
    const primeiro = adapter.attachRemoteAudio(sessaoComMidia());

    adapter.disposeRemoteAudio();

    expect(document.getElementById(REMOTE_AUDIO_ID)).toBeNull();
    const segundo = adapter.attachRemoteAudio(sessaoComMidia());
    expect(segundo).not.toBe(primeiro);
    expect(document.getElementById(REMOTE_AUDIO_ID)).toBe(segundo);
  });

  it('descartar sem nada ligado é no-op (não lança)', () => {
    const adapter = new SipCallAdapter();
    expect(() => adapter.disposeRemoteAudio()).not.toThrow();
  });
});

/** Sessão com senders: o mute e o DTMF leem as tracks de SAÍDA por aqui. */
function sessaoComSenders(senders: unknown[] = []): Session {
  return {
    state: 'Established',
    sessionDescriptionHandler: { peerConnection: { getSenders: () => senders } },
  } as unknown as Session;
}

describe('SipCallAdapter — mute pelas tracks (T18)', () => {
  it('muteia e desmuta a track de áudio, devolvendo o estado LIDO', () => {
    const track = { kind: 'audio', enabled: true } as unknown as MediaStreamTrack;
    const adapter = new SipCallAdapter();

    expect(adapter.setMuted(sessaoComSenders([{ track }]), true)).toBe(true);
    expect(track.enabled).toBe(false);

    expect(adapter.setMuted(sessaoComSenders([{ track }]), false)).toBe(false);
    expect(track.enabled).toBe(true);
  });

  it('track que recusa a escrita: o retorno é o LIDO, nunca a intenção', () => {
    // Sem o valor lido, o botão mostraria "mudo" com o microfone aberto.
    const teimosa = {
      kind: 'audio',
      get enabled() {
        return true;
      },
      set enabled(_valor: boolean) {
        /* recusa a escrita */
      },
    } as unknown as MediaStreamTrack;
    const adapter = new SipCallAdapter();

    expect(adapter.setMuted(sessaoComSenders([{ track: teimosa }]), true)).toBe(false);
    expect(teimosa.enabled).toBe(true);
  });

  it('não encosta em track que não é de áudio e devolve null sem mídia', () => {
    const video = { kind: 'video', enabled: true };
    const adapter = new SipCallAdapter();

    expect(adapter.setMuted(sessaoComSenders([{ track: video }]), true)).toBeNull();
    expect(video.enabled).toBe(true);
    expect(adapter.setMuted(sessaoComSenders([]), true)).toBeNull();
    expect(adapter.setMuted({ state: 'Established' } as unknown as Session, true)).toBeNull();
  });
});

describe('SipCallAdapter — DTMF só com a chamada estabelecida (T18)', () => {
  it('envia o dígito quando a sessão está estabelecida', () => {
    const insertDTMF = vi.fn();
    const adapter = new SipCallAdapter();
    const sessao = sessaoComSenders([{ track: { kind: 'audio' }, dtmf: { insertDTMF } }]);

    expect(adapter.sendDTMF(sessao, '5')).toBe(true);
    expect(insertDTMF).toHaveBeenCalledWith('5', 100, 70);
  });

  it('tecla apertada durante o toque é no-op com warn', () => {
    const insertDTMF = vi.fn();
    const { logger, warn } = loggerDuble();
    const adapter = new SipCallAdapter(logger);
    const sessao = {
      state: 'Ringing',
      sessionDescriptionHandler: {
        peerConnection: { getSenders: () => [{ track: { kind: 'audio' }, dtmf: { insertDTMF } }] },
      },
    } as unknown as Session;

    expect(adapter.sendDTMF(sessao, '5')).toBe(false);
    expect(insertDTMF).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('só vale estabelecida');
  });

  it('sem sender de áudio, sem dtmf ou sem mídia devolve false', () => {
    const adapter = new SipCallAdapter();

    expect(adapter.sendDTMF(sessaoComSenders([]), '5')).toBe(false);
    expect(adapter.sendDTMF(sessaoComSenders([{ track: { kind: 'video' }, dtmf: {} }]), '5')).toBe(false);
    expect(adapter.sendDTMF(sessaoComSenders([{ track: { kind: 'audio' } }]), '5')).toBe(false);
    expect(adapter.sendDTMF({ state: 'Established' } as unknown as Session, '5')).toBe(false);
  });

  it('falha do navegador no insertDTMF é contida (registra e devolve false)', () => {
    const erro = new Error('DTMF indisponível');
    const { logger, error } = loggerDuble();
    const adapter = new SipCallAdapter(logger);
    const sessao = sessaoComSenders([
      {
        track: { kind: 'audio' },
        dtmf: {
          insertDTMF: () => {
            throw erro;
          },
        },
      },
    ]);

    expect(adapter.sendDTMF(sessao, '5')).toBe(false);
    expect(error).toHaveBeenCalledWith('DTMF error:', erro);
  });
});

describe('SipCallAdapter.invite — o código SIP final (T12)', () => {
  type Resposta = { message: { statusCode: number | undefined } };
  type OpcoesInvite = { requestDelegate?: { onReject?: (resposta: Resposta) => void } };

  /** Inviter dublê que só registra o delegate (é ele que traz o código final). */
  function inviterComDelegate() {
    let responder: ((resposta: Resposta) => void) | undefined;
    const inviter = {
      invite: async (opcoes: OpcoesInvite) => {
        responder = opcoes.requestDelegate?.onReject;
      },
    } as unknown as Inviter;
    return { inviter, responder: () => responder };
  }

  it('entrega o código da resposta final negativa (486 = ocupado) ao callback', async () => {
    // sip.js 0.21 não expõe `lastResponse`: o único caminho para o código é o
    // delegate da transação — sem ele, `end_reason` não distinguiria 486 de 480.
    const codigos: Array<number | undefined> = [];
    const adapter = new SipCallAdapter();
    const { inviter, responder } = inviterComDelegate();

    await adapter.invite(inviter, (codigo) => codigos.push(codigo));
    responder()?.({ message: { statusCode: 486 } });

    expect(codigos).toEqual([486]);
  });

  it('resposta sem statusCode chega como undefined (nunca lança)', async () => {
    const codigos: Array<number | undefined> = [];
    const adapter = new SipCallAdapter();
    const { inviter, responder } = inviterComDelegate();

    await expect(adapter.invite(inviter, (codigo) => codigos.push(codigo))).resolves.toBeUndefined();
    responder()?.({ message: { statusCode: undefined } });

    expect(codigos).toEqual([undefined]);
  });

  it('sem callback o INVITE segue igual: nada observa a resposta', async () => {
    const adapter = new SipCallAdapter();
    const { inviter, responder } = inviterComDelegate();

    await expect(adapter.invite(inviter)).resolves.toBeUndefined();
    expect(() => responder()?.({ message: { statusCode: 480 } })).not.toThrow();
  });
});
