import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  LEGACY_START_CALL_EVENT,
  START_CALL_EVENT,
  dispatchStartCall,
  isStartCallPayload,
  onStartCall,
  toStartCallPayload,
} from '../events';
import type { StartCallPayload } from '../events';

const PHONE = '+5511999992048';

const COMPLETO: StartCallPayload = {
  channel: 'whatsapp',
  phone: '+55 (11) 99999-2048',
  contactId: 'ct-1',
  name: 'Ana Souza',
  connectionId: 'conn-9',
  source: 'inbox',
  autoDial: false,
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Assina e devolve o coletor + cleanup, para não vazar listener entre testes. */
function assinar(): { recebidos: StartCallPayload[]; limpar: () => void } {
  const recebidos: StartCallPayload[] = [];
  const limpar = onStartCall((payload) => recebidos.push(payload));
  return { recebidos, limpar };
}

describe('events — constantes do contrato', () => {
  it('usa os nomes de evento do Apêndice D (novo) e do legado', () => {
    expect(START_CALL_EVENT).toBe('zapp:start-call');
    expect(LEGACY_START_CALL_EVENT).toBe('start-voip-call');
  });
});

describe('events — round-trip de dispatchStartCall/onStartCall', () => {
  it('emite CustomEvent tipado em document e entrega o payload intacto', () => {
    const { recebidos, limpar } = assinar();
    const espiaoNoDocumento = vi.fn();
    document.addEventListener(START_CALL_EVENT, espiaoNoDocumento);

    dispatchStartCall(COMPLETO);

    // prova que o evento sai em `document`, com o nome e o detail exatos
    expect(espiaoNoDocumento).toHaveBeenCalledTimes(1);
    const emitido = espiaoNoDocumento.mock.calls[0][0];
    expect(emitido.type).toBe('zapp:start-call');
    expect(emitido.detail).toBe(COMPLETO);

    // prova o round-trip ponta a ponta
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toEqual(COMPLETO);
    expect(recebidos[0]).toMatchObject({
      channel: 'whatsapp',
      phone: '+55 (11) 99999-2048',
      contactId: 'ct-1',
      name: 'Ana Souza',
      connectionId: 'conn-9',
      source: 'inbox',
      autoDial: false,
    });
    expect(console.warn).not.toHaveBeenCalled();

    document.removeEventListener(START_CALL_EVENT, espiaoNoDocumento);
    limpar();
  });

  it('não inventa campos no payload mínimo (telefone vai como veio)', () => {
    const { recebidos, limpar } = assinar();

    dispatchStartCall({ channel: 'voip', phone: PHONE, source: 'contacts' });

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toEqual({ channel: 'voip', phone: PHONE, source: 'contacts' });
    expect('autoDial' in recebidos[0]).toBe(false);
    expect('contactId' in recebidos[0]).toBe(false);
    expect('connectionId' in recebidos[0]).toBe(false);
    limpar();
  });

  it('preserva autoDial true do "Ligar de volta" do histórico', () => {
    const { recebidos, limpar } = assinar();

    dispatchStartCall({ channel: 'voip', phone: PHONE, source: 'history', autoDial: true });

    expect(recebidos).toEqual([{ channel: 'voip', phone: PHONE, source: 'history', autoDial: true }]);
    limpar();
  });

  it('entrega o mesmo payload para vários handlers', () => {
    const a: StartCallPayload[] = [];
    const b: StartCallPayload[] = [];
    const limparA = onStartCall((p) => a.push(p));
    const limparB = onStartCall((p) => b.push(p));

    dispatchStartCall(COMPLETO);

    expect(a).toEqual([COMPLETO]);
    expect(b).toEqual([COMPLETO]);
    limparA();
    limparB();
  });

  it('ignora e avisa quando o detail do evento novo é inválido', () => {
    const { recebidos, limpar } = assinar();

    document.dispatchEvent(new CustomEvent(START_CALL_EVENT, { detail: { channel: 'voip', phone: '', source: 'inbox' } }));
    document.dispatchEvent(new CustomEvent(START_CALL_EVENT, { detail: { channel: 'telegrama', phone: PHONE, source: 'inbox' } }));
    document.dispatchEvent(new CustomEvent(START_CALL_EVENT, { detail: { channel: 'voip', phone: PHONE, source: 'fax' } }));
    document.dispatchEvent(new CustomEvent(START_CALL_EVENT, { detail: null }));

    expect(recebidos).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(4);
    expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain('zapp:start-call');
    limpar();
  });
});

describe('events — compatibilidade com o evento legado start-voip-call', () => {
  it('converte { phone, name } em StartCallPayload com canal voip e origem inbox', () => {
    const { recebidos, limpar } = assinar();

    // o emissor real (ContactActionButtons) dispara em `window`
    window.dispatchEvent(new CustomEvent(LEGACY_START_CALL_EVENT, { detail: { phone: PHONE, name: 'Ana Souza' } }));

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toEqual({
      channel: 'voip',
      phone: PHONE,
      name: 'Ana Souza',
      source: 'inbox',
      autoDial: false,
    });
    expect(console.warn).not.toHaveBeenCalled();
    limpar();
  });

  it('converte sem nome, mantendo o telefone como veio', () => {
    const { recebidos, limpar } = assinar();

    window.dispatchEvent(new CustomEvent(LEGACY_START_CALL_EVENT, { detail: { phone: '+55 (11) 98888-7777' } }));

    expect(recebidos).toEqual([{ channel: 'voip', phone: '+55 (11) 98888-7777', source: 'inbox', autoDial: false }]);
    limpar();
  });

  it('ignora e avisa detail legado sem telefone utilizável', () => {
    const { recebidos, limpar } = assinar();

    window.dispatchEvent(new CustomEvent(LEGACY_START_CALL_EVENT, { detail: { name: 'Sem telefone' } }));
    window.dispatchEvent(new CustomEvent(LEGACY_START_CALL_EVENT, { detail: { phone: 5511999992048 } }));
    window.dispatchEvent(new CustomEvent(LEGACY_START_CALL_EVENT, { detail: null }));

    expect(recebidos).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain('start-voip-call');
    limpar();
  });

  it('aceita os dois eventos na mesma assinatura', () => {
    const { recebidos, limpar } = assinar();

    dispatchStartCall({ channel: 'voip', phone: PHONE, source: 'other' });
    window.dispatchEvent(new CustomEvent(LEGACY_START_CALL_EVENT, { detail: { phone: '+5511977776666' } }));

    expect(recebidos).toEqual([
      { channel: 'voip', phone: PHONE, source: 'other' },
      { channel: 'voip', phone: '+5511977776666', source: 'inbox', autoDial: false },
    ]);
    limpar();
  });

  it('não reage a nomes de evento parecidos', () => {
    const { recebidos, limpar } = assinar();

    window.dispatchEvent(new CustomEvent('start-voip-call-legado', { detail: { phone: PHONE } }));
    document.dispatchEvent(new CustomEvent('zapp:start-call-v2', { detail: { channel: 'voip', phone: PHONE, source: 'inbox' } }));

    expect(recebidos).toEqual([]);
    limpar();
  });
});

describe('events — cleanup', () => {
  it('remove os dois listeners e é idempotente', () => {
    const { recebidos, limpar } = assinar();

    dispatchStartCall(COMPLETO);
    window.dispatchEvent(new CustomEvent(LEGACY_START_CALL_EVENT, { detail: { phone: PHONE } }));
    expect(recebidos).toHaveLength(2);

    limpar();
    expect(() => limpar()).not.toThrow();

    dispatchStartCall(COMPLETO);
    window.dispatchEvent(new CustomEvent(LEGACY_START_CALL_EVENT, { detail: { phone: PHONE } }));
    expect(recebidos).toHaveLength(2);
  });

  it('o cleanup de uma assinatura não derruba a outra', () => {
    const a = assinar();
    const b = assinar();

    a.limpar();
    dispatchStartCall(COMPLETO);

    expect(a.recebidos).toEqual([]);
    expect(b.recebidos).toEqual([COMPLETO]);
    b.limpar();
  });
});

describe('events — toStartCallPayload / isStartCallPayload', () => {
  it('converte o detail legado', () => {
    expect(toStartCallPayload({ phone: PHONE, name: 'Ana' })).toEqual({
      channel: 'voip',
      phone: PHONE,
      name: 'Ana',
      source: 'inbox',
      autoDial: false,
    });
    expect(toStartCallPayload({ phone: PHONE })).toEqual({
      channel: 'voip',
      phone: PHONE,
      source: 'inbox',
      autoDial: false,
    });
    // telefone "como veio": sem normalização nem trim
    expect(toStartCallPayload({ phone: '+55 (11) 99999-2048' })?.phone).toBe('+55 (11) 99999-2048');
    expect(toStartCallPayload({ phone: PHONE, name: '' })?.name).toBeUndefined();
  });

  it('recusa detail legado sem telefone string não vazio', () => {
    expect(toStartCallPayload(null)).toBeNull();
    expect(toStartCallPayload(undefined)).toBeNull();
    expect(toStartCallPayload('+5511999992048')).toBeNull();
    expect(toStartCallPayload({})).toBeNull();
    expect(toStartCallPayload({ phone: '' })).toBeNull();
    expect(toStartCallPayload({ phone: 5511999992048 })).toBeNull();
  });

  it('valida o payload novo', () => {
    expect(isStartCallPayload({ channel: 'voip', phone: PHONE, source: 'inbox' })).toBe(true);
    expect(isStartCallPayload({ channel: 'whatsapp', phone: PHONE, source: 'history', autoDial: true })).toBe(true);
    expect(isStartCallPayload({ channel: 'voip', phone: '', source: 'inbox' })).toBe(false);
    expect(isStartCallPayload({ channel: 'telegrama', phone: PHONE, source: 'inbox' })).toBe(false);
    expect(isStartCallPayload({ channel: 'voip', phone: PHONE, source: 'fax' })).toBe(false);
    expect(isStartCallPayload({ phone: PHONE, source: 'inbox' })).toBe(false);
    expect(isStartCallPayload(null)).toBe(false);
    expect(isStartCallPayload(42)).toBe(false);
  });
});
