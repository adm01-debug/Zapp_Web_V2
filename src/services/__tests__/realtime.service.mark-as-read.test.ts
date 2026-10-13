/**
 * markMessagesAsRead (src/services/realtime.service.ts).
 *
 * É a marcação de lida da inbox: um UPDATE em `messages` que PRECISA ser filtrado
 * por contato + remetente + ainda-não-lida. Sem os três filtros, abrir uma conversa
 * marcaria como lida a mensagem do AGENTE e a de OUTROS contatos (e o erro de
 * permissão do banco passaria em silêncio, deixando o contador preso).
 *
 * Provo, chamando o serviço real:
 *  - o UPDATE vai para `messages` com `{ is_read: true }` e os três filtros;
 *  - erro do banco é registrado no log e propagado (não vira sucesso silencioso);
 *  - resposta sem erro resolve normalmente.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  logError: vi.fn(),
  chamadas: [] as Array<{ metodo: string; args: unknown[] }>,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from } }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: h.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { RealtimeService } from '../realtime.service';

const CADEIA = ['update', 'eq'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(resultado: { data: unknown; error: unknown }): any {
  // Promise de base: `await supabase.from(...).update(...).eq(...)...` resolve para
  // { data, error } como o builder real do PostgREST.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = Promise.resolve(resultado);
  for (const metodo of CADEIA) {
    b[metodo] = vi.fn((...args: unknown[]) => {
      h.chamadas.push({ metodo, args });
      return b;
    });
  }
  return b;
}

describe('RealtimeService.markMessagesAsRead', () => {
  beforeEach(() => {
    h.chamadas.length = 0;
    h.logError.mockReset();
    h.from.mockReset();
  });

  it('marca como lida filtrando contato, remetente e ainda-não-lida', async () => {
    h.from.mockReturnValue(builder({ data: null, error: null }));

    await RealtimeService.markMessagesAsRead('contato-1');

    expect(h.from).toHaveBeenCalledWith('messages');
    expect(h.chamadas).toEqual([
      { metodo: 'update', args: [{ is_read: true }] },
      { metodo: 'eq', args: ['contact_id', 'contato-1'] },
      { metodo: 'eq', args: ['sender', 'contact'] },
      { metodo: 'eq', args: ['is_read', false] },
    ]);
    expect(h.logError).not.toHaveBeenCalled();
  });

  it('erro do banco é registrado e propagado, não vira sucesso silencioso', async () => {
    const erro = new Error('permission denied for table messages');
    h.from.mockReturnValue(builder({ data: null, error: erro }));

    await expect(RealtimeService.markMessagesAsRead('contato-1')).rejects.toBe(erro);
    expect(h.logError).toHaveBeenCalled();
  });
});
