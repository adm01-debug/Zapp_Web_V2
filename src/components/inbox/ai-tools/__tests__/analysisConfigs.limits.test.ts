import { describe, it, expect } from 'vitest';
import {
  AI_CONTEXT_LIMITS,
  AI_PROXY_CONTENT_LIMIT,
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
