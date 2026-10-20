import { describe, expect, it } from 'vitest';
import * as S from '../../supabase/functions/_shared/schemas.ts';

/**
 * Contrato do contexto de conversa (IA-024).
 *
 * O defeito original: o frontend monta as mensagens com `id`, `type`,
 * `created_at` e manda `periodDays` no corpo, mas o schema antigo só conhecia
 * `sender`/`content`/`created_at`/`message_type` — o zod descartava o resto em
 * SILÊNCIO, e não havia teto agregado (só teto por campo e por quantidade).
 */

const msg = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  sender: 'cliente',
  content: 'oi',
  type: 'text',
  created_at: '2026-09-30T10:00:00.000Z',
  ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  messages: Array.from({ length: 5 }, () => msg()),
  contactName: 'Cliente Teste',
  contactId: 'ec423650-6718-4279-8ee8-50b3c833bdce',
  periodDays: 7,
  ...over,
});

describe('IA-024 · campos do frontend não desaparecem', () => {
  it('aceita e PRESERVA id, type, created_at, mediaUrl e periodDays', () => {
    const parsed = S.AiConversationAnalysisSchema.safeParse(payload({
      messages: [
        msg({ id: 'abc', type: 'image', mediaUrl: 'https://exemplo/x.png' }),
        msg(), msg(), msg(), msg(),
      ],
    }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const data = parsed.data as { messages: Array<Record<string, unknown>>; periodDays?: number };
    expect(data.messages[0].id).toBe('abc');
    expect(data.messages[0].type).toBe('image');
    expect(data.messages[0].mediaUrl).toBe('https://exemplo/x.png');
    expect(data.messages[0].created_at).toBe('2026-09-30T10:00:00.000Z');
    expect(data.periodDays).toBe(7);
  });

  it('continua aceitando o legado `message_type`', () => {
    const parsed = S.MessageSchema.safeParse({ sender: 'cliente', content: 'oi', message_type: 'text' });
    expect(parsed.success).toBe(true);
  });

  it('aceita o recorte de período do frontend (1..365) e recusa o absurdo', () => {
    expect(S.AiConversationAnalysisSchema.safeParse(payload({ periodDays: 30 })).success).toBe(true);
    expect(S.AiConversationAnalysisSchema.safeParse(payload({ periodDays: 0 })).success).toBe(false);
    expect(S.AiConversationAnalysisSchema.safeParse(payload({ periodDays: 999 })).success).toBe(false);
  });

  it('periodDays é opcional (payload antigo do front continua válido)', () => {
    const semPeriodo = payload();
    delete (semPeriodo as Record<string, unknown>).periodDays;
    expect(S.AiConversationAnalysisSchema.safeParse(semPeriodo).success).toBe(true);
    expect(S.AiConversationSummarySchema.safeParse(semPeriodo).success).toBe(true);
  });
});

describe('IA-024 · teto agregado com rejeição explícita (sem truncamento silencioso)', () => {
  const mensagemGrande = () => msg({ content: 'x'.repeat(5000) });

  it('contexto acima do limite agregado é REJEITADO com mensagem clara', () => {
    const grande = payload({ messages: Array.from({ length: 30 }, mensagemGrande) }); // 150.000 chars
    const parsed = S.AiConversationAnalysisSchema.safeParse(grande);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const texto = parsed.error.issues.map((i) => i.message).join(' ');
    expect(texto).toContain('limite agregado');
    expect(texto).toContain(String(S.CONTEXT_LIMITS.maxTotalChars));
    expect(parsed.error.issues.some((i) => i.path[0] === 'messages')).toBe(true);
  });

  it('as duas capacidades de conversa usam o mesmo teto', () => {
    const grande = payload({ messages: Array.from({ length: 30 }, mensagemGrande) });
    expect(S.AiConversationSummarySchema.safeParse(grande).success).toBe(false);
  });

  it('dentro do teto passa (cada mensagem no limite de 5.000)', () => {
    const noLimite = payload({ messages: Array.from({ length: 20 }, mensagemGrande) }); // 100.000 chars
    expect(S.AiConversationAnalysisSchema.safeParse(noLimite).success).toBe(true);
  });

  it('mensagem individual acima de 5.000 continua barrada pelo limite por campo', () => {
    expect(S.MessageSchema.safeParse(msg({ content: 'x'.repeat(5001) })).success).toBe(false);
  });
});

describe('IA-024 · medição do contexto (versão + recorte) usada no envelope', () => {
  it('mede mensagens, caracteres e período', () => {
    const budget = S.measureConversationContext(
      [{ content: 'abc' }, { content: 'de' }, {}],
      7,
    );
    expect(budget).toEqual({
      version: S.CONTEXT_CONTRACT_VERSION,
      messageCount: 3,
      totalChars: 5,
      periodDays: 7,
    });
  });

  it('sem período informado, o contexto diz null (não inventa um recorte)', () => {
    expect(S.measureConversationContext([{ content: 'a' }]).periodDays).toBeNull();
  });
});
