import { describe, it, expect } from 'vitest';

import {
  REASON_LABEL,
  describeReason,
  type CapabilityReason,
  type ChannelCapability,
} from '../capabilities';

describe('describeReason — linguagem operacional pt-BR', () => {
  const required: [CapabilityReason, string][] = [
    ['voip_unavailable', 'Linha VoIP indisponível'],
    ['voip_reconnecting', 'Reconectando…'],
    ['mic_blocked', 'Microfone bloqueado'],
    ['whatsapp_no_outbound', 'Ligação por WhatsApp não disponível nesta linha'],
    ['line_in_use_other_user', 'Linha em uso por outro usuário'],
  ];

  for (const [reason, label] of required) {
    it(`${reason} → "${label}"`, () => {
      expect(describeReason(reason)).toBe(label);
    });
  }

  it('devolve null quando não há motivo', () => {
    expect(describeReason(null)).toBeNull();
    expect(describeReason(undefined)).toBeNull();
  });

  it('todo motivo tem rótulo não vazio e sem jargão técnico', () => {
    const jargon = ['SIP', 'WSS', 'WebSocket', 'Supabase', 'RTP', 'codec', 'proxy'];
    for (const reason of Object.keys(REASON_LABEL) as CapabilityReason[]) {
      const label = describeReason(reason);
      expect(label, `motivo: ${reason}`).not.toBeNull();
      if (label === null) continue;
      expect(label.length).toBeGreaterThan(0);
      for (const term of jargon) {
        expect(label.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });

  it('motivo desconhecido em runtime → null (nunca inventa frase)', () => {
    expect(describeReason('algo_que_nao_existe' as CapabilityReason)).toBeNull();
  });
});

describe('ChannelCapability', () => {
  it('representa a linha WhatsApp só-recebidas do plano (D2 = a)', () => {
    const capability: ChannelCapability = {
      channel: 'whatsapp',
      canDial: false,
      canReceive: true,
      canRecord: false,
      canReject: false,
      reason: 'whatsapp_no_outbound',
    };
    expect(capability.canDial).toBe(false);
    expect(capability.canReceive).toBe(true);
    expect(describeReason(capability.reason)).toBe(
      'Ligação por WhatsApp não disponível nesta linha',
    );
  });

  it('representa a linha VoIP indisponível', () => {
    const capability: ChannelCapability = {
      channel: 'voip',
      canDial: false,
      canReceive: true,
      canRecord: false,
      canReject: true,
      reason: 'voip_unavailable',
    };
    expect(describeReason(capability.reason)).toBe('Linha VoIP indisponível');
  });

  it('capacidade boa não precisa de motivo', () => {
    const capability: ChannelCapability = {
      channel: 'voip',
      canDial: true,
      canReceive: true,
      canRecord: true,
      canReject: true,
    };
    expect(capability.reason).toBeUndefined();
    expect(describeReason(capability.reason)).toBeNull();
  });
});
