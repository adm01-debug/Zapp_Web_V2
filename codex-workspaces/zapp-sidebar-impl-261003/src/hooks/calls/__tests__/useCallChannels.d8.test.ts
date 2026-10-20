import { describe, it, expect } from 'vitest';
import { capacidadesPorCanal } from '../useCallChannels';
import { describeReason } from '@/lib/calls/capabilities';

/**
 * Caso do agente comum (decisão D8): a RLS de `whatsapp_connections` não devolve
 * linha para quem não é admin/supervisor, então o canal tem de aparecer como
 * INDISPONÍVEL e explicar o motivo — e não fingir que não existe conexão.
 */
const ENTRADA_BASE = { sipStatus: 'registered', sipReason: null, micReason: null } as const;

describe('uso do canal WhatsApp sob RLS (D8)', () => {
  it('agente comum: sem linha visível e sem permissão -> restrito a supervisores', () => {
    const { whatsapp } = capacidadesPorCanal({
      ...ENTRADA_BASE,
      sipStatus: 'registered',
      whatsapp: [],
      podeVerWhatsApp: false,
    });
    expect(whatsapp.reason).toBe('whatsapp_restrito_supervisores');
    expect(whatsapp.canReceive).toBe(false);
    expect(whatsapp.canDial).toBe(false);
  });

  it('admin/supervisor: sem linha visível -> continua "indisponivel" (nada mudou)', () => {
    const { whatsapp } = capacidadesPorCanal({
      ...ENTRADA_BASE,
      sipStatus: 'registered',
      whatsapp: [],
      podeVerWhatsApp: true,
    });
    expect(whatsapp.reason).toBe('whatsapp_unavailable');
  });

  it('sem o campo (quem já usava o mapper) o comportamento é o antigo', () => {
    const { whatsapp } = capacidadesPorCanal({
      ...ENTRADA_BASE,
      sipStatus: 'registered',
      whatsapp: null,
    });
    expect(whatsapp.reason).toBe('whatsapp_unavailable');
  });

  it('o texto na tela é exatamente o combinado no D8', () => {
    expect(describeReason('whatsapp_restrito_supervisores')).toBe('Disponível para supervisores');
  });

  it('com linha conectada visível, a permissão não interfere na capacidade de receber', () => {
    const { whatsapp } = capacidadesPorCanal({
      ...ENTRADA_BASE,
      sipStatus: 'registered',
      whatsapp: [{ name: 'Promo Brindes WhatsApp', status: 'connected', is_default: true }],
      podeVerWhatsApp: false,
    });
    expect(whatsapp.canReceive).toBe(true);
    expect(whatsapp.reason).toBe('whatsapp_no_outbound');
  });
});
