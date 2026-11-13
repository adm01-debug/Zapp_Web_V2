import { describe, expect, it, vi } from 'vitest';
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

describe('surfaceWhatsAppDisconnected (ponto único de tradução no serviço de envio)', () => {
  it('erro de conexão caída vira WhatsAppDisconnectedError amigável e avisa UMA vez', async () => {
    const { surfaceWhatsAppDisconnected, WhatsAppDisconnectedError } = await import('../sendConnection');
    const notify = vi.fn();
    const original = { message: 'contact_whatsapp_connection_disconnected', code: '22023' };
    const out = surfaceWhatsAppDisconnected(original, notify);
    expect(out).toBeInstanceOf(WhatsAppDisconnectedError);
    expect((out as Error).message).toBe(WHATSAPP_DISCONNECTED_DESCRIPTION);
    expect(describeWhatsAppDisconnected(out)).toBe(WHATSAPP_DISCONNECTED_DESCRIPTION);
    expect(notify).toHaveBeenCalledTimes(1);
    // Já traduzido: não avisa de novo.
    expect(surfaceWhatsAppDisconnected(out, notify)).toBe(out);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('recusa da edge (instance_unavailable) também vira o aviso', async () => {
    const { surfaceWhatsAppDisconnected } = await import('../sendConnection');
    const notify = vi.fn();
    surfaceWhatsAppDisconnected(new Error('A conexão do WhatsApp está desconectada. Reconecte a instância e tente de novo.'), notify);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('outros erros voltam intactos e sem aviso', async () => {
    const { surfaceWhatsAppDisconnected } = await import('../sendConnection');
    const notify = vi.fn();
    const erro = new Error('rede caiu');
    expect(surfaceWhatsAppDisconnected(erro, notify)).toBe(erro);
    expect(notify).not.toHaveBeenCalled();
  });
});
