import { describe, it, expect } from 'vitest';
import { eventText } from '../useRecentConversationEvents';

describe('eventText', () => {
  it('assign: "Assumiu conversa com {contato}"', () => {
    expect(eventText('assign', 'João Silva', undefined, undefined)).toBe('Assumiu conversa com João Silva');
  });
  it('unassign: "Liberou conversa"', () => {
    expect(eventText('unassign', 'João Silva', undefined, undefined)).toBe('Liberou conversa');
  });
  it('transfer: "Transferiu para {agente}"', () => {
    expect(eventText('transfer', 'João Silva', 'Maria Costa', undefined)).toBe('Transferiu para Maria Costa');
  });
  it('transfer sem nome do agente: usa fallback "agente"', () => {
    expect(eventText('transfer', 'João Silva', undefined, undefined)).toBe('Transferiu para agente');
  });
  it('queue_transfer: "Transferiu para {fila}"', () => {
    expect(eventText('queue_transfer', 'João Silva', undefined, 'Comercial')).toBe('Transferiu para Comercial');
  });
  it('overload_reassign: "Reatribuição automática"', () => {
    expect(eventText('overload_reassign', 'João Silva', undefined, undefined)).toBe('Reatribuição automática');
  });
  it('absence_reassign: "Reatribuição automática"', () => {
    expect(eventText('absence_reassign', 'João Silva', undefined, undefined)).toBe('Reatribuição automática');
  });
  it('tipo desconhecido: retorna o próprio event_type como fallback honesto', () => {
    expect(eventText('unknown_type', 'João Silva', undefined, undefined)).toBe('unknown_type');
  });
});
