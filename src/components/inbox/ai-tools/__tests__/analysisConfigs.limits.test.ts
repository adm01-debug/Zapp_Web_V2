import { describe, it, expect } from 'vitest';
import {
  AI_CONTEXT_LIMITS,
  AI_PROXY_CONTENT_LIMIT,
  isPeriodCoveredByWindow,
  limitAnalysisContext,
  limitAiTexts,
  readAiErrorEnvelope,
} from '../analysisConfigs';

/**
 * Janela de contexto da IA: o servidor recusa com 422 acima de 200 mensagens /
 * 5000 chars por mensagem / 120000 no total e NUNCA trunca
 * (supabase/functions/_shared/schemas.ts, CONTEXT_LIMITS). O recorte é do
 * cliente — é isto que impede conversa longa de quebrar a análise.
 */

const mensagem = (i: number, content = `mensagem ${i}`) => ({
  id: `m${i}`,
  sender: 'contact' as const,
  content,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
});

describe('limitAnalysisContext — tetos do servidor (CONTEXT_LIMITS)', () => {
  it('com 250 mensagens envia as ÚLTIMAS 200 e conta as 50 de fora', () => {
    const janela = limitAnalysisContext(Array.from({ length: 250 }, (_, i) => mensagem(i)));

    expect(janela.messages).toHaveLength(AI_CONTEXT_LIMITS.maxMessages);
    expect(janela.messages[0].id).toBe('m50');
    expect(janela.messages[janela.messages.length - 1].id).toBe('m249');
    expect(janela.omitted).toBe(50);
    expect(janela.total).toBe(250);
  });

  it('corta cada texto em 5000 caracteres e não muta a entrada', () => {
    const original = 'a'.repeat(12000);
    const entrada = [mensagem(0), mensagem(1, original)];
    const janela = limitAnalysisContext(entrada);

    expect(janela.messages[1].content).toHaveLength(AI_CONTEXT_LIMITS.maxSingleMessageChars);
    expect(janela.omitted).toBe(0);
    expect(entrada[1].content).toHaveLength(12000);
  });

  it('reduz a janela até caber no teto agregado de caracteres', () => {
    const janela = limitAnalysisContext(Array.from({ length: 100 }, (_, i) => mensagem(i, 'x'.repeat(2000))));
    const total = janela.messages.reduce((soma, m) => soma + (m.content?.length ?? 0), 0);

    expect(total).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.maxTotalChars);
    expect(janela.messages).toHaveLength(60); // 60 × 2000 = 120000
    expect(janela.messages[janela.messages.length - 1].id).toBe('m99');
    expect(janela.omitted).toBe(40);
  });

  it('mantém a ordem original (mais antigas antes das recentes)', () => {
    const janela = limitAnalysisContext([mensagem(0), mensagem(1), mensagem(2)]);

    expect(janela.messages.map((m) => m.id)).toEqual(['m0', 'm1', 'm2']);
    expect(janela.omitted).toBe(0);
  });
});

describe('limitAiTexts — teto de UMA mensagem do ai-proxy (50000 chars)', () => {
  it('mantém apenas o que cabe e informa quantos textos ficaram de fora', () => {
    const janela = limitAiTexts(['a'.repeat(40000), 'b'.repeat(30000)], AI_PROXY_CONTENT_LIMIT);

    expect(janela.texts).toHaveLength(1);
    expect(janela.texts[0][0]).toBe('b');
    expect(janela.omitted).toBe(1);
    expect(janela.total).toBe(2);
  });

  it('conta o separador \\n no orçamento (é o que vai no corpo)', () => {
    const janela = limitAiTexts(Array.from({ length: 50 }, () => 'y'.repeat(1000)), 10000);
    const concatenado = janela.texts.join('\n');

    expect(concatenado.length).toBeLessThanOrEqual(10000);
    expect(janela.omitted).toBe(50 - janela.texts.length);
  });

  it('não perde um texto único que já cabe inteiro', () => {
    const janela = limitAiTexts(['z'.repeat(60000)], AI_PROXY_CONTENT_LIMIT);

    expect(janela.texts).toHaveLength(1);
    expect(janela.omitted).toBe(0);
  });

  it('com strings vazias no meio o comprimento final é o do texto unido com \\n', () => {
    // 50 + 1 + 0 + 1 + 0 + 1 + 48 = 101: o separador de cada item conta,
    // inclusive o das strings vazias — é o que vai no corpo do `ai-proxy`.
    const textos = ['a'.repeat(50), '', '', 'b'.repeat(48)];
    const janela = limitAiTexts(textos, 101);

    expect(janela.texts.join('\n')).toHaveLength(101);
    expect(janela.omitted).toBe(0);
    expect(janela.total).toBe(4);
  });

  it('com strings vazias no meio o corte mantém o sufixo mais recente que cabe', () => {
    const textos = ['a'.repeat(50), '', '', 'b'.repeat(48)];
    const cortada = limitAiTexts(textos, 100);
    const concatenado = cortada.texts.join('\n');

    expect(concatenado.length).toBeLessThanOrEqual(100);
    expect(cortada.omitted).toBe(1);
    expect(cortada.texts[cortada.texts.length - 1]).toBe('b'.repeat(48));
  });
});

describe('isPeriodCoveredByWindow — só grava period_days com o período inteiro na janela', () => {
  const agora = Date.parse('2026-10-14T12:00:00.000Z');
  const emDias = (d: number) => new Date(agora - d * 86_400_000).toISOString();

  it('sem histórico mais antigo não carregado a janela é o histórico inteiro', () => {
    expect(isPeriodCoveredByWindow([{ created_at: emDias(3) }], 7, false, agora)).toBe(true);
  });

  it('com histórico mais antigo, só cobre se a janela alcança o início do período', () => {
    // janela começa há 10 dias, período de 7: o período inteiro está dentro dela
    expect(isPeriodCoveredByWindow([{ created_at: emDias(10) }, { created_at: emDias(1) }], 7, true, agora)).toBe(true);
    // janela começa há 2 dias, período de 7: faltam 5 dias que ninguém analisou
    expect(isPeriodCoveredByWindow([{ created_at: emDias(2) }, { created_at: emDias(1) }], 7, true, agora)).toBe(false);
  });

  it('período sem dias (todos/última interação) nunca é gravado', () => {
    expect(isPeriodCoveredByWindow([{ created_at: emDias(1) }], null, false, agora)).toBe(false);
  });

  it('a janela cortada pelo teto de caracteres conta pelo começo dela, não do período', () => {
    // recorte agregado: a janela enviada começa há 1 dia, o período pedido é de 7
    const janelaCortada = [{ created_at: emDias(1) }, { created_at: emDias(0.5) }];
    expect(isPeriodCoveredByWindow(janelaCortada, 7, true, agora)).toBe(false);
    expect(isPeriodCoveredByWindow(janelaCortada, 1, true, agora)).toBe(true);
  });

  it('lista vazia nunca cobre o período pedido (nada foi analisado)', () => {
    // Sem a guarda, a lista vazia com hasOlderMessages=false retornava true e
    // gravava period_days sem nenhuma mensagem analisada.
    expect(isPeriodCoveredByWindow([], 7, false, agora)).toBe(false);
    expect(isPeriodCoveredByWindow([], 7, true, agora)).toBe(false);
  });

  it('sem nenhuma data válida não há como provar cobertura', () => {
    expect(isPeriodCoveredByWindow([{ created_at: 'não-é-data' }, {}], 7, true, agora)).toBe(false);
  });
});

describe('readAiErrorEnvelope — o 422 do servidor vira mensagem ao usuário', () => {
  const resposta = (body: unknown, jsonQuebrado = false) => ({
    clone: () => ({
      json: async () => {
        if (jsonQuebrado) throw new Error('sem json');
        return body;
      },
    }),
  });

  it('lê { error: { code, message, fields } } (422 de validação)', async () => {
    const envelope = await readAiErrorEnvelope({
      context: resposta({
        error: { code: 'VALIDATION_ERROR', message: 'Payload inválido: um ou mais campos falharam na validação.', fields: [] },
      }),
    });

    expect(envelope).toEqual({ status: 'error', error: 'Payload inválido: um ou mais campos falharam na validação.' });
  });

  it('mantém o envelope das capacidades de IA (capability + status)', async () => {
    const envelope = await readAiErrorEnvelope({
      context: resposta({ capability: 'analysis', status: 'error', error: 'sem provedor' }),
    });

    expect(envelope).toMatchObject({ capability: 'analysis', status: 'error', error: 'sem provedor' });
  });

  it('corpo sem JSON devolve null (sem inventar mensagem)', async () => {
    expect(await readAiErrorEnvelope({ context: resposta(null, true) })).toBeNull();
    expect(await readAiErrorEnvelope(new Error('sem context'))).toBeNull();
  });
});
