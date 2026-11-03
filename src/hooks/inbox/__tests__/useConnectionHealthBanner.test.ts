import { describe, expect, it } from 'vitest';
import { classifyConnectionHealth, connectionBannerText } from '../useConnectionHealthBanner';

describe('regra dos três níveis — aviso na caixa de mensagem (regras.md §4.2)', () => {
  it('conexão saudável: sem aviso', () => {
    expect(classifyConnectionHealth({ status: 'connected', health_status: 'healthy', health_reason: null }).level).toBe('ok');
    expect(classifyConnectionHealth(null).level).toBe('ok');
  });

  it('nível 0 (queda rápida ou degradada): amarelo, avisa que o envio falha (não há fila offline)', () => {
    const b = classifyConnectionHealth({ status: 'disconnected', health_status: 'disconnected', health_reason: null });
    expect(b.level).toBe('warn');
    expect(connectionBannerText(b, false)).toMatch(/envio vai falhar/);
    expect(classifyConnectionHealth({ status: 'connected', health_status: 'degraded', health_reason: null }).level).toBe('warn');
  });

  it('nível 1 (precisa de QR): vermelho; agente "avise o admin", admin "gere na tela Conexões"', () => {
    const b = classifyConnectionHealth({ status: 'disconnected', health_status: 'disconnected', health_reason: 'Reconexão automática esgotada — gere um novo QR Code na tela Conexões.' });
    expect(b.level).toBe('down');
    expect(connectionBannerText(b, false)).toMatch(/Avise o admin/);
    expect(connectionBannerText(b, false)).not.toMatch(/Gere um novo/);
    expect(connectionBannerText(b, true)).toMatch(/Gere um novo na tela Conexões/);
  });
});
