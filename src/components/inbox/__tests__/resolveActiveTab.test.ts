/**
 * Regressão do defeito medido em produção em 03/10 (item 6 do S41): a aba preferida
 * era **persistida** em `localStorage` e **não restaurada** — caía em `chat` no
 * instante em que o usuário abria qualquer conversa.
 */
import { describe, it, expect } from 'vitest';
import { resolverAbaAtiva } from '@/components/inbox/resolveActiveTab';

describe('resolverAbaAtiva', () => {
  it('preferência restaurada vale com nenhuma conversa aberta', () => {
    expect(resolverAbaAtiva({ contactId: null, tab: 'orders', restaurada: true }, null)).toBe('orders');
  });

  it('preferência restaurada vale na PRIMEIRA conversa aberta (o defeito medido)', () => {
    // Antes da correção isto devolvia 'chat': a preferência era ancorada em
    // `contactId: null` e morria assim que um contato era selecionado.
    expect(resolverAbaAtiva({ contactId: null, tab: 'orders', restaurada: true }, 'contato-1')).toBe('orders');
  });

  it('aba escolhida nesta sessão fica ancorada no contato que a escolheu', () => {
    expect(resolverAbaAtiva({ contactId: 'contato-1', tab: 'history', restaurada: false }, 'contato-1')).toBe('history');
  });

  it('trocar de conversa volta para chat (comportamento deliberado preservado)', () => {
    expect(resolverAbaAtiva({ contactId: 'contato-1', tab: 'history', restaurada: false }, 'contato-2')).toBe('chat');
  });

  it('preferência restaurada também vale para a Journey, não só para SalesView', () => {
    expect(resolverAbaAtiva({ contactId: null, tab: 'history', restaurada: true }, 'contato-9')).toBe('history');
  });
});
