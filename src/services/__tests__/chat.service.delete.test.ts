/**
 * PE-20 / cartao t_fef320c8 — caminho UNICO de exclusao de mensagem.
 *
 * Antes havia 4 UPDATEs diretos espalhados (chat.service, useFilesActions,
 * MessageHoverToolbar, MessageContextActions) com
 * `.update({ is_deleted: true, content: '[Mensagem apagada]' })`: o texto
 * original era sobrescrito e a autorizacao nao existia (qualquer agente
 * reescrevia mensagem recebida).
 *
 * Contrato estrutural exigido agora: a marcacao sai por UMA chamada —
 * `supabase.rpc('delete_message', { p_message_id })` — e nenhum ponto de tela
 * escreve na tabela `messages` (o `from` do supabase fica proibido no caminho).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '@/services/chat.service';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  fromCalls: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      mocks.fromCalls.push(table);
      throw new Error(`escrita inesperada na tabela: ${table}`);
    },
  },
}));

describe('ChatService.deleteMessage — caminho unico da RPC delete_message (PE-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromCalls.length = 0;
  });

  it('chama a RPC com p_message_id e NAO escreve na tabela messages', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    const result = await ChatService.deleteMessage('m-1');

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('delete_message', { p_message_id: 'm-1' });
    expect(mocks.fromCalls).toEqual([]);
    expect(result).toEqual({ data: true, error: null });
  });

  it('rejeicao do banco volta como { error } para a tela decidir (nao lanca)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'message_not_deletable', code: '42501' },
    });

    const { error } = (await ChatService.deleteMessage('m-2')) as {
      error: { code?: string } | null;
    };

    expect(error?.code).toBe('42501');
    expect(mocks.fromCalls).toEqual([]);
  });
});
