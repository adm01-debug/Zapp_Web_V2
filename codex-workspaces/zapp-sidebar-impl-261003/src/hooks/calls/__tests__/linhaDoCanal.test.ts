import { describe, it, expect } from 'vitest';
import {
  linhaDoCanal,
  rotuloLinhaWhatsApp,
  capacidadesPorCanal,
  type WhatsappConnectionRow,
} from '../useCallChannels';

/**
 * T30 — linha de origem.
 *
 * Regra: a linha da CONVERSA prevalece sobre a `is_default`; fora do inbox (sem
 * `connectionId`) vale a `is_default`. Linha `[E2E]` nunca conta, nem quando o id
 * casa. Leitura registrada pelo executor: a linha da conversa prevalece QUANDO
 * resolve — se ela não vier (RLS, ou conversa de linha apagada), o canal cai na
 * `is_default` em vez de mentir "sem linha".
 */
const daConversa: WhatsappConnectionRow = { id: 'linha-da-conversa', name: 'Comercial', status: 'connected', is_default: false };
const defaultDaCasa: WhatsappConnectionRow = { id: 'linha-default', name: 'Promo Brindes WhatsApp', status: 'connected', is_default: true };
const e2e: WhatsappConnectionRow = { id: 'linha-e2e', name: '[E2E] Conexão WhatsApp Teste', status: 'connected', is_default: true };

describe('linhaDoCanal (T30)', () => {
  it('a linha da conversa prevalece sobre a is_default', () => {
    expect(linhaDoCanal([daConversa, defaultDaCasa], 'linha-da-conversa')).toBe(daConversa);
  });

  it('fora do inbox (sem connectionId) vale a is_default', () => {
    expect(linhaDoCanal([daConversa, defaultDaCasa], null)).toBe(defaultDaCasa);
    expect(linhaDoCanal([daConversa, defaultDaCasa])).toBe(defaultDaCasa);
  });

  it('connectionId que nao resolve cai na is_default (nao inventa "sem linha")', () => {
    expect(linhaDoCanal([daConversa, defaultDaCasa], 'linha-que-sumiu')).toBe(defaultDaCasa);
  });

  it('linha [E2E] nunca conta, nem casando o id nem sendo default', () => {
    expect(linhaDoCanal([e2e], 'linha-e2e')).toBeNull();
    expect(linhaDoCanal([e2e], null)).toBeNull();
    expect(linhaDoCanal([e2e, daConversa], 'linha-e2e')).toBeNull();
  });

  it('sem candidatas devolve null', () => {
    expect(linhaDoCanal([], null)).toBeNull();
    expect(linhaDoCanal(null, 'qualquer')).toBeNull();
  });
});

describe('rotuloLinhaWhatsApp (T30)', () => {
  it('com linha visivel: "pela linha <nome>"', () => {
    expect(rotuloLinhaWhatsApp(defaultDaCasa)).toBe('pela linha Promo Brindes WhatsApp');
  });

  it('D8: agente comum nao ve o nome, ve o motivo', () => {
    expect(rotuloLinhaWhatsApp(null, false)).toBe('Disponível para supervisores');
    // nem se a linha chegasse por engano: sem permissao o nome nao sai
    expect(rotuloLinhaWhatsApp(defaultDaCasa, false)).toBe('Disponível para supervisores');
  });

  it('sem linha (e com permissao) nao inventa nome', () => {
    expect(rotuloLinhaWhatsApp(null, true)).toBe('Sem linha de WhatsApp');
    expect(rotuloLinhaWhatsApp({ id: 'x', name: null }, true)).toBe('Sem linha de WhatsApp');
  });
});

describe('capacidadesPorCanal com linha da conversa (T30)', () => {
  const base = { sipStatus: 'idle' as const, sipReason: null, micReason: null };

  it('o canal segue a linha da CONVERSA, nao a default', () => {
    const desconectada: WhatsappConnectionRow = { id: 'linha-da-conversa', name: 'Comercial', status: 'disconnected', is_default: false };
    const { whatsapp } = capacidadesPorCanal({ ...base, whatsapp: [desconectada, defaultDaCasa], connectionId: 'linha-da-conversa', podeVerWhatsApp: true });
    expect(whatsapp.canReceive).toBe(false);
    expect(whatsapp.reason).toBe('whatsapp_no_outbound');
  });

  it('com a linha da conversa conectada, recebe', () => {
    const { whatsapp } = capacidadesPorCanal({ ...base, whatsapp: [daConversa, defaultDaCasa], connectionId: 'linha-da-conversa', podeVerWhatsApp: true });
    expect(whatsapp.canReceive).toBe(true);
  });

  it('D8: agente comum sem linha visivel recebe o motivo, nao "indisponivel"', () => {
    const { whatsapp } = capacidadesPorCanal({ ...base, whatsapp: [], podeVerWhatsApp: false });
    expect(whatsapp.reason).toBe('whatsapp_restrito_supervisores');
    expect(whatsapp.canReceive).toBe(false);
  });

  it('fora do inbox (sem connectionId) o comportamento antigo segue', () => {
    const { whatsapp } = capacidadesPorCanal({ ...base, whatsapp: [daConversa, defaultDaCasa], podeVerWhatsApp: true });
    expect(whatsapp.canReceive).toBe(true);
  });
});
