import { describe, it, expect, vi } from 'vitest';

// O mapeamento puro não toca banco nem React: os mocks cortam o grafo pesado
// (client Supabase + provider com motor SIP) para o teste exercitar só a regra.
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/providers/CallSessionProvider', () => ({ useCallSession: vi.fn() }));

import {
  capacidadesPorCanal,
  ehLinhaE2E,
  type CapacidadesEntrada,
  type WhatsappConnectionRow,
} from '../useCallChannels';

/** Conexão real, conectada e marcada como padrão. */
const CONEXAO_CONECTADA: WhatsappConnectionRow = {
  name: 'Linha Comercial',
  status: 'connected',
  is_default: true,
};

/** Conexão real, padrão, mas desconectada. */
const CONEXAO_DESCONECTADA: WhatsappConnectionRow = {
  name: 'Linha Comercial',
  status: 'disconnected',
  is_default: true,
};

/** Conexão criada por teste E2E — nunca deve virar linha real. */
const CONEXAO_E2E: WhatsappConnectionRow = {
  name: '[E2E] linha de teste',
  status: 'connected',
  is_default: true,
};

/** Conexão conectada, mas NÃO é a padrão. */
const CONEXAO_NAO_DEFAULT: WhatsappConnectionRow = {
  name: 'Outra linha',
  status: 'connected',
  is_default: false,
};

/** Monta a entrada do mapeamento com os padrões de uma linha VoIP saudável. */
function entrada(over: Partial<CapacidadesEntrada> = {}): CapacidadesEntrada {
  return { sipStatus: 'registered', sipReason: null, micReason: null, whatsapp: [], ...over };
}

describe('capacidadesPorCanal — VoIP', () => {
  it('registrado e sem problema de microfone: disca, recebe e recusa', () => {
    const { voip } = capacidadesPorCanal(entrada({ sipStatus: 'registered' }));

    expect(voip).toEqual({
      channel: 'voip',
      canDial: true,
      canReceive: true,
      canRecord: false,
      canReject: true,
    });
    expect(voip.reason).toBeUndefined();
  });

  it('reconectando: não disca nem recebe, motivo "Reconectando…"', () => {
    const { voip } = capacidadesPorCanal(entrada({ sipStatus: 'reconnecting' }));

    expect(voip).toEqual({
      channel: 'voip',
      canDial: false,
      canReceive: false,
      canRecord: false,
      canReject: false,
      reason: 'voip_reconnecting',
    });
  });

  it('conectando cai na mesma família de reconexão', () => {
    const { voip } = capacidadesPorCanal(entrada({ sipStatus: 'connecting' }));
    expect(voip.reason).toBe('voip_reconnecting');
    expect(voip.canDial).toBe(false);
  });

  it('indisponível: motivo "Linha VoIP indisponível"', () => {
    const { voip } = capacidadesPorCanal(entrada({ sipStatus: 'unavailable' }));
    expect(voip.reason).toBe('voip_unavailable');
    expect(voip.canDial).toBe(false);
    expect(voip.canReceive).toBe(false);
  });

  it('idle: telefone não configurado nesta conta', () => {
    const { voip } = capacidadesPorCanal(entrada({ sipStatus: 'idle' }));
    expect(voip.reason).toBe('voip_not_configured');
    expect(voip.canDial).toBe(false);
  });

  it.each([
    ['mic_blocked' as const],
    ['mic_missing' as const],
    ['mic_busy' as const],
  ])('microfone travado (%s) tem precedência e ainda permite recusar', (micReason) => {
    const { voip } = capacidadesPorCanal(
      entrada({ sipStatus: 'registered', micReason }),
    );

    expect(voip).toEqual({
      channel: 'voip',
      canDial: false,
      canReceive: false,
      canRecord: false,
      canReject: true,
      reason: micReason,
    });
  });

  it('microfone com motivo não mapeado (unknown) também trava a discagem', () => {
    // `motivoDoMicrofone` pode devolver `unknown` para causas não classificadas;
    // tratar só os três motivos conhecidos faria o canal mentir "disca".
    const { voip } = capacidadesPorCanal(
      entrada({ sipStatus: 'registered', micReason: 'unknown' }),
    );

    expect(voip.canDial).toBe(false);
    expect(voip.canReceive).toBe(false);
    expect(voip.reason).toBe('unknown');
  });

  it('microfone travado com a linha fora do ar não oferece recusar', () => {
    // Recusar não precisa de microfone, mas precisa de LINHA: sem registro não
    // existe chamada tocando para recusar.
    const { voip } = capacidadesPorCanal(
      entrada({ sipStatus: 'unavailable', micReason: 'mic_blocked' }),
    );

    expect(voip.canDial).toBe(false);
    expect(voip.canReject).toBe(false);
    expect(voip.reason).toBe('mic_blocked');
  });

  it('motivo específico do SIP (linha em outra aba) prevalece sobre o genérico do status', () => {
    const { voip } = capacidadesPorCanal(
      entrada({ sipStatus: 'idle', sipReason: 'line_in_use_other_tab' }),
    );
    expect(voip.reason).toBe('line_in_use_other_tab');
  });

  it('canRecord é sempre false, em qualquer status', () => {
    for (const sipStatus of ['idle', 'connecting', 'registered', 'reconnecting', 'unavailable'] as const) {
      const { voip } = capacidadesPorCanal(entrada({ sipStatus }));
      expect(voip.canRecord, `status: ${sipStatus}`).toBe(false);
    }
  });
});

describe('capacidadesPorCanal — WhatsApp', () => {
  it('conexão padrão conectada: somente-recebidas (whatsapp_no_outbound)', () => {
    const { whatsapp } = capacidadesPorCanal(entrada({ whatsapp: [CONEXAO_CONECTADA] }));

    expect(whatsapp).toEqual({
      channel: 'whatsapp',
      canDial: false,
      canReceive: true,
      canRecord: false,
      canReject: false,
      reason: 'whatsapp_no_outbound',
    });
  });

  it('conexão padrão desconectada: existe, mas não recebe', () => {
    const { whatsapp } = capacidadesPorCanal(entrada({ whatsapp: [CONEXAO_DESCONECTADA] }));
    expect(whatsapp.canReceive).toBe(false);
    expect(whatsapp.reason).toBe('whatsapp_no_outbound');
  });

  it('linha [E2E] ignorada: comporta-se como sem WhatsApp', () => {
    const { whatsapp } = capacidadesPorCanal(entrada({ whatsapp: [CONEXAO_E2E] }));

    expect(whatsapp.canReceive).toBe(false);
    expect(whatsapp.canDial).toBe(false);
    expect(whatsapp.reason).toBe('whatsapp_unavailable');
  });

  it('conexão não-padrão conectada é ignorada: sem default → indisponível', () => {
    const { whatsapp } = capacidadesPorCanal(entrada({ whatsapp: [CONEXAO_NAO_DEFAULT] }));
    expect(whatsapp.reason).toBe('whatsapp_unavailable');
    expect(whatsapp.canReceive).toBe(false);
  });

  it('default [E2E] com outra linha real não-padrão: continua indisponível (só a default conta)', () => {
    const { whatsapp } = capacidadesPorCanal(
      entrada({ whatsapp: [CONEXAO_E2E, CONEXAO_NAO_DEFAULT] }),
    );
    expect(whatsapp.reason).toBe('whatsapp_unavailable');
  });

  it('sem conexão nenhuma (lista vazia ou nula): WhatsApp indisponível', () => {
    for (const whatsapp of [[], null, undefined] as const) {
      const { whatsapp: cap } = capacidadesPorCanal(entrada({ whatsapp }));
      expect(cap.reason).toBe('whatsapp_unavailable');
      expect(cap.canReceive).toBe(false);
    }
  });
});

describe('ehLinhaE2E — filtro de linha de teste', () => {
  it('reconhece o prefixo [E2E]', () => {
    expect(ehLinhaE2E('[E2E] linha de teste')).toBe(true);
    expect(ehLinhaE2E('[E2E]')).toBe(true);
  });

  it('não confunde linha real nem valor ausente', () => {
    expect(ehLinhaE2E('Linha Comercial')).toBe(false);
    expect(ehLinhaE2E('E2E sem colchetes')).toBe(false);
    expect(ehLinhaE2E(null)).toBe(false);
    expect(ehLinhaE2E(undefined)).toBe(false);
  });
});

describe('capacidadesPorCanal — os dois canais juntos', () => {
  it('registrado com mic ok e default [E2E]: VoIP disca, WhatsApp fica indisponível', () => {
    const { voip, whatsapp } = capacidadesPorCanal(
      entrada({ sipStatus: 'registered', whatsapp: [CONEXAO_E2E, CONEXAO_CONECTADA] }),
    );

    expect(voip.canDial).toBe(true);
    expect(whatsapp.canReceive).toBe(true);
    expect(whatsapp.reason).toBe('whatsapp_no_outbound');
  });
});
