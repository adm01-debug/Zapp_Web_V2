/**
 * PE-22 (CRM360 · painel de estatísticas do contato).
 *
 * `ContactService.fetchStats` montava o painel com QUATRO consultas e o tempo
 * de resposta saía de `messages` com `.order('created_at',{ascending:true})
 * .limit(200)` — as 200 mensagens MAIS ANTIGAS do contato, ignorando o resto do
 * histórico e enviesando a média (e o rótulo da tela dizia "200 primeiras msgs").
 *
 * A correção troca tudo por UMA chamada à RPC `contact_response_stats`
 * (migration 20261013230002), que mede os pares contato→agente sobre o
 * histórico inteiro e calcula a variação por janela no banco.
 *
 * O que se prova aqui:
 *  - a RPC é chamada UMA vez, com `p_contact_id`;
 *  - a linha devolvida vira o MESMO contrato de objeto de antes (7 campos);
 *  - nenhuma consulta PostgREST sobra em `messages`/`conversation_sla`/`csat_surveys`
 *    (em especial nenhum `.limit(200)` que recriasse o viés);
 *  - conjunto VAZIO (contato não visível para o usuário — RLS dentro da RPC)
 *    responde zeros, sem lançar;
 *  - erro da RPC é propagado (ìf error throw), não engolido;
 *  - média/CSAT nulos viram 0 / null como antes.
 *
 * A fronteira dublada é o cliente Supabase (rede/banco), nunca o alvo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from, rpc: h.rpc },
}));

import { ContactService } from '@/services/contact.service';

const CONTACT_ID = '5f1e0000-0000-0000-0000-0000000000ab';

/** Linha completa como a RPC devolve (todos os 13 campos do `returns table`). */
const LINHA = {
  total_messages: 70_543,
  total_conversations: 42,
  messages_recent: 3_000,
  messages_previous: 2_000,
  messages_change_percent: 50,
  conversations_recent: 20,
  conversations_previous: 25,
  conversations_change_percent: -20,
  response_samples: 987,
  avg_response_minutes: 45.75,
  median_response_minutes: 12.5,
  csat_average: 4.6,
  csat_count: 31,
};

beforeEach(() => {
  h.from.mockReset();
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: [LINHA], error: null });
});

describe('ContactService.fetchStats — uma RPC só', () => {
  it('chama a RPC contact_response_stats UMA vez, com p_contact_id', async () => {
    await ContactService.fetchStats(CONTACT_ID);

    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('contact_response_stats', { p_contact_id: CONTACT_ID });
  });

  it('não sobra consulta PostgREST (em especial o messages.limit(200) do viés antigo)', async () => {
    await ContactService.fetchStats(CONTACT_ID);

    expect(h.from).not.toHaveBeenCalled();
  });

  it('mapeia a linha da RPC para o MESMO contrato de 7 campos de antes', async () => {
    const stats = await ContactService.fetchStats(CONTACT_ID);

    expect(Object.keys(stats).sort()).toEqual(
      [
        'avgResponseTimeMinutes',
        'conversationsChangePercent',
        'csatAverage',
        'csatCount',
        'messagesChangePercent',
        'totalConversations',
        'totalMessages',
      ].sort(),
    );

    expect(stats).toEqual({
      totalMessages: 70_543,
      avgResponseTimeMinutes: 45.75,
      totalConversations: 42,
      messagesChangePercent: 50,
      conversationsChangePercent: -20,
      csatAverage: 4.6,
      csatCount: 31,
    });
  });

  it('a média alimentada é a da RPC (histórico inteiro), não recalculada das 200 primeiras', async () => {
    // A RPC respondeu 45.75 min medidos sobre 987 pares: o serviço NÃO pode
    // devolver outro número (nem re-arredondar, nem recalcular de amostra).
    const stats = await ContactService.fetchStats(CONTACT_ID);

    expect(stats.avgResponseTimeMinutes).toBe(45.75);
  });

  it('conjunto VAZIO (contato não visível na RPC) responde zeros em vez de lançar', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });

    await expect(ContactService.fetchStats(CONTACT_ID)).resolves.toEqual({
      totalMessages: 0,
      avgResponseTimeMinutes: 0,
      totalConversations: 0,
      messagesChangePercent: null,
      conversationsChangePercent: null,
      csatAverage: null,
      csatCount: 0,
    });
  });

  it('janela anterior zerada devolve variação NULL (mesmo contrato do windowChangePercent)', async () => {
    h.rpc.mockResolvedValue({
      data: [{ ...LINHA, messages_change_percent: null, conversations_change_percent: null }],
      error: null,
    });

    const stats = await ContactService.fetchStats(CONTACT_ID);

    expect(stats.messagesChangePercent).toBeNull();
    expect(stats.conversationsChangePercent).toBeNull();
  });

  it('sem amostra de resposta (NULL) a média cai em 0 e o CSAT sem notas fica null', async () => {
    h.rpc.mockResolvedValue({
      data: [{ ...LINHA, avg_response_minutes: null, csat_average: null, csat_count: 0 }],
      error: null,
    });

    const stats = await ContactService.fetchStats(CONTACT_ID);

    expect(stats.avgResponseTimeMinutes).toBe(0);
    expect(stats.csatAverage).toBeNull();
    expect(stats.csatCount).toBe(0);
  });

  it('erro da RPC é propagado (o painel mostra o estado de erro, não zeros falsos)', async () => {
    const erro = { code: '42501', message: 'permission denied for function contact_response_stats' };
    h.rpc.mockResolvedValue({ data: null, error: erro });

    await expect(ContactService.fetchStats(CONTACT_ID)).rejects.toBe(erro);
  });
});
