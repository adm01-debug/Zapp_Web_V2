import { describe, expect, it } from 'vitest';
import {
  describeWhatsAppDisconnected,
  isTestFixtureConnection,
  withoutTestFixtureConnections,
  WHATSAPP_DISCONNECTED_DESCRIPTION,
} from '../sendConnection';

describe('conexão de teste do E2E nunca é candidata a envio (P0-1)', () => {
  it('reconhece pelo instance_id e pelo nome', () => {
    expect(isTestFixtureConnection({ instance_id: 'E2E_FIXTURE', name: 'Qualquer' })).toBe(true);
    expect(isTestFixtureConnection({ instance_id: 'outra', name: '[E2E] Conexão WhatsApp Teste' })).toBe(true);
    expect(isTestFixtureConnection({ instance_id: 'PRINCIPAL', name: 'Comercial' })).toBe(false);
    expect(isTestFixtureConnection(null)).toBe(false);
  });

  it('filtra a lista preservando a ordem das reais', () => {
    const lista = [
      { id: 'a', instance_id: 'E2E_FIXTURE', name: '[E2E] Conexão WhatsApp Teste' },
      { id: 'b', instance_id: 'PRINCIPAL', name: 'Comercial' },
      { id: 'c', instance_id: 'SUPORTE', name: 'Suporte' },
    ];
    expect(withoutTestFixtureConnections(lista).map((c) => c.id)).toEqual(['b', 'c']);
    expect(withoutTestFixtureConnections(null)).toEqual([]);
  });
});

describe('describeWhatsAppDisconnected', () => {
  it('traduz os códigos de conexão fora do ar', () => {
    expect(describeWhatsAppDisconnected({ message: 'contact_whatsapp_connection_disconnected', code: '22023' }))
      .toBe(WHATSAPP_DISCONNECTED_DESCRIPTION);
    expect(describeWhatsAppDisconnected(new Error('no_connected_whatsapp_connection'))).toMatch(/Nenhuma conexão/);
    expect(describeWhatsAppDisconnected('selected_whatsapp_connection_unavailable')).toBe(WHATSAPP_DISCONNECTED_DESCRIPTION);
  });

  it('ignora outros erros', () => {
    expect(describeWhatsAppDisconnected(new Error('rede caiu'))).toBeNull();
    expect(describeWhatsAppDisconnected(null)).toBeNull();
    expect(describeWhatsAppDisconnected(42)).toBeNull();
  });
});
