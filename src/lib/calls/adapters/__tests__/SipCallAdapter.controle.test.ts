/**
 * Transporte SIP dos controles da chamada — SL-018: espera (re-INVITE com
 * `hold`) e transferência (REFER cego e assistido).
 *
 * O adapter **real** é exercitado; só o `sip.js`, que ele importa de forma
 * dinâmica, vira dublê. Assim a asserção é sobre a opção que o sip.js receberia
 * de verdade, e não sobre um fetcher inventado pelo teste.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from 'sip.js';

import { SipCallAdapter } from '../SipCallAdapter';

const { makeURI } = vi.hoisted(() => ({
  makeURI: vi.fn((uri: string) => ({ uri })),
}));

vi.mock('sip.js', () => ({
  UserAgent: { makeURI },
}));

// O dublê do `sip.js` é um só para o arquivo inteiro: sem zerar entre os casos,
// a contagem de `makeURI` de um caso vaza para o seguinte.
beforeEach(() => {
  makeURI.mockClear();
});

/** Sessão mínima do sip.js: o que o adapter toca é `state`, `localIdentity`, `invite` e `refer`. */
function sessao(options: { state?: string; id?: string; host?: string } = {}) {
  const invite = vi.fn(async () => undefined);
  const refer = vi.fn(async () => undefined);
  return {
    session: {
      id: options.id ?? 'call-1',
      state: options.state ?? 'Established',
      localIdentity: { uri: { host: options.host ?? 'bitrixphone.com' } },
      invite,
      refer,
    } as unknown as Session,
    invite,
    refer,
  };
}

describe('SipCallAdapter.setHold (SL-018)', () => {
  it('manda o re-INVITE com `hold: true` e devolve true', async () => {
    const { session, invite } = sessao();
    const adapter = new SipCallAdapter();

    await expect(adapter.setHold(session, true)).resolves.toBe(true);

    expect(invite).toHaveBeenCalledTimes(1);
    expect(invite).toHaveBeenCalledWith({ sessionDescriptionHandlerOptions: { hold: true } });
  });

  it('retomar manda o MESMO re-INVITE com `hold: false` (a mídia volta a sendrecv)', async () => {
    const { session, invite } = sessao();
    const adapter = new SipCallAdapter();

    await expect(adapter.setHold(session, false)).resolves.toBe(true);

    expect(invite).toHaveBeenCalledWith({ sessionDescriptionHandlerOptions: { hold: false } });
  });

  it('sessão ainda não estabelecida é ignorada sem tocar no transporte', async () => {
    const { session, invite } = sessao({ state: 'Establishing' });
    const adapter = new SipCallAdapter();

    await expect(adapter.setHold(session, true)).resolves.toBe(false);

    expect(invite).not.toHaveBeenCalled();
  });

  it('re-INVITE que rejeita devolve false (não sobe pelo clique do botão)', async () => {
    const { session, invite } = sessao();
    invite.mockRejectedValueOnce(new Error('re-INVITE recusado'));
    const adapter = new SipCallAdapter();

    await expect(adapter.setHold(session, true)).resolves.toBe(false);
  });
});

describe('SipCallAdapter.refer (SL-018)', () => {
  it('transferência cega monta o destino no domínio da própria linha e manda o REFER', async () => {
    const { session, refer } = sessao({ host: 'bitrixphone.com' });
    const adapter = new SipCallAdapter();

    await expect(adapter.refer(session, '2001')).resolves.toBe(true);

    expect(makeURI).toHaveBeenCalledWith('sip:2001@bitrixphone.com');
    expect(refer).toHaveBeenCalledTimes(1);
    expect(refer).toHaveBeenCalledWith({ uri: 'sip:2001@bitrixphone.com' });
  });

  it('transferência assistida manda a SESSÃO em consulta (REFER com Replaces)', async () => {
    const { session, refer } = sessao({ id: 'call-1' });
    const { session: consulta } = sessao({ id: 'call-2' });
    const adapter = new SipCallAdapter();

    await expect(adapter.refer(session, consulta)).resolves.toBe(true);

    expect(refer).toHaveBeenCalledWith(consulta);
    expect(makeURI).not.toHaveBeenCalled();
  });

  it('destino que não forma URI não chega a mandar REFER', async () => {
    const { session, refer } = sessao();
    makeURI.mockReturnValueOnce(undefined as unknown as { uri: string });
    const adapter = new SipCallAdapter();

    await expect(adapter.refer(session, '??')).resolves.toBe(false);

    expect(refer).not.toHaveBeenCalled();
  });

  it('sessão não estabelecida é ignorada sem tocar no transporte', async () => {
    const { session, refer } = sessao({ state: 'Terminated' });
    const adapter = new SipCallAdapter();

    await expect(adapter.refer(session, '2001')).resolves.toBe(false);

    expect(refer).not.toHaveBeenCalled();
  });

  it('REFER que rejeita devolve false', async () => {
    const { session, refer } = sessao();
    refer.mockRejectedValueOnce(new Error('central recusou'));
    const adapter = new SipCallAdapter();

    await expect(adapter.refer(session, '2001')).resolves.toBe(false);
  });
});
