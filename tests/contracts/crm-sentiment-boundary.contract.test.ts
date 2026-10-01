import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contrato da fronteira de sentimento do edge `crm-integration`.
 *
 * O banco é canônico em pt-BR (`positivo`/`neutro`/`negativo`/`critico`, ou
 * NULL = ausência — IA-021). O CRM EXTERNO fala inglês
 * (`positive`/`neutral`/`negative`, ver docs/CRM360_TECHNICAL_DOCS.md). A
 * tradução PT→EN acontece SÓ nesta borda de saída.
 *
 * Defeito fechado: `p_sentiment: payload.sentiment || 'neutral'` (index.ts:171
 * na base). O `||` fazia '' virar 'neutral' (INVENTAVA sentimento) e, quando
 * havia sentimento, mandava o token pt-BR cru para o domínio EN do CRM.
 *
 * Este teste segura dois lados:
 *   1. comportamento de `sentimentForExternalCrm` (mapa, ausência e lixo);
 *   2. a FRONTEIRA no fonte: o literal inventado não pode voltar e o call site
 *      precisa passar pelo resolvedor.
 *
 * O `vi.mock` da URL do esm.sh substitui o import Deno do SDK; sem ele o
 * vite-node tentaria resolver `https://…`. `Deno` só é tocado dentro de
 * funções, então a importação do módulo é segura em Node.
 */
vi.mock('https://esm.sh/@supabase/supabase-js@2.87.1', () => ({
  createClient: () => ({ rpc: async () => ({ data: null, error: null }) }),
}));

const { sentimentForExternalCrm, buildSyncInteractionArgs } = await import(
  '../../supabase/functions/crm-integration/index.ts'
);

const FONTE = 'supabase/functions/crm-integration/index.ts';
const source = readFileSync(FONTE, 'utf8');

/** Comentários fora antes de varrer o fonte: a doc cita o literal do defeito. */
const semComentarios = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

describe('sentimentForExternalCrm — mapa canônico pt-BR → domínio EN do CRM', () => {
  const MAPA_ESPERADO: Readonly<Record<string, string>> = {
    positivo: 'positive',
    neutro: 'neutral',
    negativo: 'negative',
    critico: 'critical',
  };

  it.each(Object.entries(MAPA_ESPERADO))('%s → %s', (ptBR, en) => {
    expect(sentimentForExternalCrm(ptBR)).toBe(en);
  });

  it('cobre exatamente os 4 canônicos (nem a mais, nem a menos)', () => {
    const bloco = source.match(/CRM_SENTIMENT_BY_CANONICAL[^{]*\{([\s\S]*?)\};/);
    expect(bloco, 'o mapa não foi encontrado no fonte').not.toBeNull();
    const extraido = Object.fromEntries(
      Array.from((bloco as RegExpMatchArray)[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g))
        .map(([, chave, valor]) => [chave, valor]),
    );
    expect(extraido).toEqual(MAPA_ESPERADO);
  });

  it('aceita variação de caixa/espaço do valor canônico', () => {
    expect(sentimentForExternalCrm('  Positivo ')).toBe('positive');
    expect(sentimentForExternalCrm('CRITICO')).toBe('critical');
  });
});

describe('ausência não vira token — nunca inventa sentimento', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  // `undefined` é o que chega quando a chave foi OMITIDA do payload
  // (jsonb_strip_nulls na origem); `null`/'' são ausência explícita.
  it.each([null, undefined, '', '   '] as const)('%j → null (sem log)', (vazio) => {
    expect(sentimentForExternalCrm(vazio)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("nenhum caminho produce a string 'neutral' a partir do vazio", () => {
    for (const vazio of [null, undefined, '', '   ']) {
      expect(sentimentForExternalCrm(vazio)).not.toBe('neutral');
    }
  });

  it('o valor ausente resolve para null e a CHAVE é OMITIDA no parâmetro do CRM', () => {
    // A resolução continua devolvendo `null` (ausência representável no nosso lado).
    // Quem OMITE é `buildSyncInteractionArgs`: a RPC externa vive no banco do CRM e
    // daqui não há como provar que aceita `NULL` — omitir deixa o default do CRM
    // decidir o que "não informado" significa, em vez de sobrescrever a coluna.
    expect(sentimentForExternalCrm(undefined)).toBeNull();
  });
});

describe('valor fora do vocabulário → ausência + log (conservador)', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  // Lixo plausível no banco: inclui o legado de INTENSIDADE que o vocabulário
  // canônico deliberadamente NÃO mapeia (`very_negative`) e tipos errados.
  it.each(['very_negative', 'very_positive', 'positiva', 'urgente', 'aleatorio', 42, {}, ['x']])(
    '%j → null + log estruturado',
    (lixo) => {
      expect(sentimentForExternalCrm(lixo)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      const payloadLog = JSON.parse(warn.mock.calls[0][0] as string);
      expect(payloadLog.event).toBe('crm_sentiment_out_of_vocabulary');
    },
  );
});

describe('a fronteira no FONTE do edge não volta a fabricar sentimento', () => {
  it("não existe mais o literal inventado `|| 'neutral'`", () => {
    expect(semComentarios).not.toMatch(/\|\|\s*'neutral'/);
    expect(semComentarios).not.toMatch(/sentiment[^\n]*\|\|\s*'neutral'/);
  });

  it('o call site de sync_interaction_from_zapp passa pelo construtor de argumentos', () => {
    expect(semComentarios).toMatch(/buildSyncInteractionArgs\(row, payload\)/);
    expect(semComentarios).not.toMatch(/p_sentiment:\s*sentimentForExternalCrm\(/);
  });

  it("o único 'neutral' no fonte está no mapa de SAÍDA, atrás de um canônico", () => {
    // O token EN 'neutral' só pode aparecer como valor do mapa, nunca inventado.
    const ocorrencias = Array.from(semComentarios.matchAll(/'neutral'/g));
    expect(ocorrencias.length).toBeGreaterThanOrEqual(1);
    expect(semComentarios).toMatch(/neutro:\s*'neutral'/);
    // E não existe default/fallback textual de sentimento em lugar nenhum.
    expect(semComentarios).not.toMatch(/p_sentiment:\s*payload\.sentiment/);
  });
});

describe('buildSyncInteractionArgs — sem sentimento a chave é OMITIDA (nunca `null`)', () => {
  const row = { normalized_phone: '11988776655', idempotency_key: 'closure:abc' };

  it('com sentimento canônico: manda o token EN do CRM, com os 11 parâmetros', () => {
    const args = buildSyncInteractionArgs(row, { sentiment: 'negativo' });
    expect(args.p_sentiment).toBe('negative');
    expect(Object.keys(args)).toHaveLength(11);
  });

  it.each([undefined, null, '', '   ', 'very_negative', 'aleatorio'])(
    'sem sentimento (%j): p_sentiment NÃO existe no objeto enviado ao CRM',
    (raw) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const args = buildSyncInteractionArgs(row, { sentiment: raw });
      expect('p_sentiment' in args).toBe(false);
      expect(Object.keys(args)).toHaveLength(10);
      warn.mockRestore();
    },
  );

  it('lixo no banco não derruba a chamada: omite e registra o motivo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const args = buildSyncInteractionArgs(row, { sentiment: 'very_negative' });
    expect('p_sentiment' in args).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('crm_sentiment_out_of_vocabulary'));
    warn.mockRestore();
  });

  it('os demais parâmetros seguem intactos e a identidade vem da linha da fila', () => {
    const args = buildSyncInteractionArgs(row, { channel: 'whatsapp', direction: 'inbound' });
    expect(args.p_phone).toBe('11988776655');
    expect(args.p_zapp_conversation_id).toBe('closure:abc');
    expect(args).toMatchObject({
      p_channel: 'whatsapp',
      p_direction: 'inbound',
      p_conteudo: null,
      p_message_count: 0,
    });
  });
});
