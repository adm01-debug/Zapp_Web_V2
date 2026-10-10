/**
 * ADVERSARIAL — inventário MEDIDO dos gaps dos consumidores do vocabulário de IA
 * (Bloco 03 / IA-021..IA-023), pós-merge #1279.
 *
 * Este arquivo NÃO conserta nada: ele MEDE. Cada asserção pina um defeito/gap
 * encontrado na revisão adversarial, lendo o FONTE dos consumidores (front e
 * edge) e o SQL das migrations. A intenção é:
 *   - falhar se o gap for silenciosamente "corrigido" sem atualizar este mapa; e
 *   - servir de lista de trabalho para o plano de correção.
 *
 * Rodar:  bunx vitest run --config vitest.contracts.config.ts tests/contracts/_adv_vocabulary-consumers-gaps.test.ts
 *
 * NÃO versionar junto do Bloco 03 (é artefato de auditoria, não de produto).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

/** Remove comentários: o texto que documenta o defeito cita os literais. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

interface Finding {
  file: string;
  pattern: RegExp;
  what: string;
}

/** Defeitos (comparação morta / ausência → valor). Todos com evidência no fonte. */
const DEFEITOS: readonly Finding[] = [
  {
    file: 'supabase/functions/send-scheduled-report/index.ts',
    pattern: /sentiment_score as number\) \|\| 50/,
    what: 'ausência de nota vira 50 na média do relatório',
  },
  {
    file: 'supabase/functions/send-scheduled-report/index.ts',
    pattern: /customer_satisfaction as number\) \|\| 3/,
    what: 'ausência de CSAT vira 3 (+ toFixed sobre valor inventado)',
  },
  {
    file: 'supabase/functions/sentiment-alert/index.ts',
    pattern: /typeof visibleAnalysis\.sentiment_score === 'number'\s*\n?\s*\?\s*visibleAnalysis\.sentiment_score\s*\n?\s*:\s*50/,
    what: 'análise sem nota vira 50 e é comparada ao threshold (não alerta / alerta errado)',
  },
  {
    file: 'supabase/functions/sentiment-alert/index.ts',
    pattern: /\(analysis\.sentiment_score \?\? 50\) < threshold/,
    what: 'contagem de consecutivas trata ausência como 50',
  },
  {
    file: 'supabase/functions/crm-integration/index.ts',
    pattern: /p_message_count: payload\.message_count \|\| 0/,
    what: 'message_count ausente vira 0 (contagem real de mensagens)',
  },
  {
    file: 'src/components/inbox/AIConversationAssistant.tsx',
    pattern: /analysis\?\.sentiment \|\| 'neutro'/,
    what: "ausência de sentimento vira 'neutro' na UI",
  },
  {
    file: 'src/hooks/chat/useConversationAnalyses.ts',
    pattern: /sum \+ a\.sentiment_score, 0\) \/ recent\.length/,
    what: 'média soma sentiment_score sem guarda: null coagido a 0 dilui a média',
  },
  {
    file: 'src/hooks/chat/useConversationAnalyses.ts',
    pattern: /sentiment_score: number;/,
    what: 'tipo afirma não-nulo para coluna que agora é NULL por DEFAULT',
  },
  {
    file: 'src/hooks/analytics/useGoalNotifications.ts',
    pattern: /agentStats\?\.customer_satisfaction_score \|\| 0/,
    what: 'CSAT ausente vira 0 em meta/notificação',
  },
  {
    file: 'src/hooks/business/useWarRoomData.ts',
    pattern: /Number\(agentStats\?\.customer_satisfaction_score\) \|\| 0/,
    what: 'CSAT ausente vira 0 no war room',
  },
  {
    file: 'src/components/inbox/ai-tools/SentimentTab.tsx',
    pattern: /Math\.max\(item\.sentiment_score, 5\)/,
    what: 'nota NULL vira barra de 5% na evolução (ausência desenhada como dado)',
  },
  {
    file: 'src/components/inbox/ai-tools/HistoryTab.tsx',
    pattern: /\{item\.sentiment_score\}%/,
    what: 'nota NULL renderiza "%" solto em vez de "—"',
  },
  {
    file: 'supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql',
    pattern: /'sentiment', COALESCE\(v_contact\.ai_sentiment, 'neutral'\)/,
    what: 'HISTÓRICO: o texto desta migration antiga permanece (regra 7); a função viva é substituída pela migration A do PR-1',
  },
];

/** Casos em que a chave de mapa/vocabulário ainda é EN num consumidor de IA. */
const CHAVE_EN: readonly Finding[] = [
  {
    file: 'src/hooks/ui/useAmbientColor.ts',
    pattern: /case 'positive':/,
    what: 'switch de sentimento chaveado EN; recebe conversation.sentiment (pt-BR) → sempre neutro',
  },
  {
    file: 'src/components/inbox/SentimentIndicator.tsx',
    pattern: /export type SentimentLevel = 'positive' \| 'neutral' \| 'negative' \| 'critical';/,
    what: 'vocabulário EN local, sem passar pelo canônico (componente sem chamadores hoje)',
  },
  {
    file: 'src/components/contacts/ContactAdvancedFilters.tsx',
    pattern: /value: 'positive', label: 'Positivo'/,
    what: 'opções de filtro EN, mas o prop setFilterSentiment nunca é passado → filtro morto',
  },
  {
    file: 'supabase/functions/voice-agent/index.ts',
    pattern: /VALID_SENTIMENT = new Set\(\['positive', 'negative', 'neutral'\]\)/,
    what: 'enum do tool call em EN (descreve filtro de sentimento do usuário)',
  },
  {
    file: 'src/components/inbox/contact-details/Contact360Helpers.tsx',
    pattern: /sentimentEmoji: Record<string, string> = \{ positive:/,
    what: 'emoji de sentimento das interações do CRM externo chaveado EN',
  },
  {
    file: 'src/components/inbox/chat/ChatHeader.tsx',
    pattern: /briefing\?\.sentiment === 'positive'/,
    what: 'badge do briefing do CRM externo compara EN sem normalizador',
  },
  {
    file: 'src/components/dashboard/AIStatsWidget.tsx',
    pattern: /type SentimentType = 'positive' \| 'negative' \| 'neutral';/,
    what: 'tipo/dataKey EN (consistente com useAIStats, mas herda o contador morto)',
  },
  {
    file: 'src/components/inbox/SentimentIndicator.tsx',
    pattern: /if \(score >= 70\) return 'positive';/,
    what: 'limiares de score → nível EN, duplicando a semântica de faixa fora do canônico',
  },
];

describe('ADVERSARIAL — defeitos de consumidor (comparação morta / ausência → valor)', () => {
  it.each(DEFEITOS)('$file :: $what', ({ file, pattern }) => {
    const source = stripComments(read(file));
    expect(pattern.test(source), `${file} não exibe mais o padrão: ${pattern}`).toBe(true);
  });
});

describe('ADVERSARIAL — chaves de vocabulário EN fora do módulo canônico', () => {
  it.each(CHAVE_EN)('$file :: $what', ({ file, pattern }) => {
    const source = stripComments(read(file));
    expect(pattern.test(source), `${file} não exibe mais o padrão: ${pattern}`).toBe(true);
  });
});

describe('ADVERSARIAL — o guard de contrato do bloco não cobre estes arquivos', () => {
  const guard = read('tests/contracts/ai-vocabulary-consumers.contract.test.ts');

  const AUSENTES_DO_GUARD = [
    'src/hooks/analytics/useAIStats.ts',
    'src/components/inbox/chat/ChatHeader.tsx',
    'src/hooks/ui/useAmbientColor.ts',
    'src/components/inbox/CRMAutoSync.tsx',
    'src/hooks/chat/useConversationAnalyses.ts',
    'src/components/inbox/AIConversationAssistant.tsx',
    'src/components/inbox/ai-tools/HistoryTab.tsx',
    'src/components/inbox/ai-tools/SentimentTab.tsx',
    'src/components/dashboard/AIStatsWidget.tsx',
    'src/components/dashboard/SentimentHelpers.tsx',
    'src/components/dashboard/useSentimentData.ts',
    'src/components/contacts/ContactAdvancedFilters.tsx',
  ];

  it.each(AUSENTES_DO_GUARD)('%s está FORA da lista de consumidores pinados', (path) => {
    expect(guard).not.toContain(path);
  });
});

/**
 * IA-SENTIMENT-001 — defeitos CORRIGIDOS nos consumidores do Dashboard. Saíram
 * do inventário de pendências: agora são ratchets INVERSOS — o padrão defeituoso
 * (comparação com literal EN, `else` que jogava crítico/desconhecido em neutro)
 * não pode voltar. A normalização é pela classe canônica, não por comparação crua.
 */
describe('IA-SENTIMENT-001 — consumidores do Dashboard corrigidos', () => {
  it('useAIStats classifica pela classe canônica em vez do literal EN', () => {
    const src = stripComments(read('src/hooks/analytics/useAIStats.ts'));
    expect(src).toMatch(/classifySentiment\(/);
    expect(src).not.toMatch(/a\.sentiment === 'positive'/);
    expect(src).not.toMatch(/else\s+existing\.neutral\+\+/);
  });

  it('useRecentSentimentAlerts normaliza o sentimento canônico', () => {
    const src = stripComments(read('src/hooks/analytics/useRecentSentimentAlerts.ts'));
    expect(src).toMatch(/normalizeSentiment\(/);
    expect(src).not.toMatch(/r\.sentiment === 'negativo'/);
  });

  it('SentimentHelpers classifica pela classe canônica, sem `else` → neutro', () => {
    const src = stripComments(read('src/components/dashboard/SentimentHelpers.tsx'));
    expect(src).toMatch(/classifySentiment\(/);
    expect(src).not.toMatch(/a\.sentiment === 'negativo'/);
  });
});

/**
 * PR-1 — defeitos CORRIGIDOS. Estas entradas saíram do inventário de pendências:
 * agora são ratchets INVERSOS, o padrão defeituoso não pode voltar.
 */
describe('PR-1 — defeitos corrigidos (o padrão defeituoso não pode voltar)', () => {
  it('voice-copilot-action filtra pelo vocabulário canônico pt-BR', () => {
    const src = stripComments(read('supabase/functions/voice-copilot-action/index.ts'));
    expect(src).not.toMatch(/\['negative',\s*'very_negative'\]/);
    expect(src).toMatch(/\['negativo',\s*'critico'\]/);
  });

  it('crm-integration não inventa "neutral" na fronteira com o CRM', () => {
    const src = stripComments(read('supabase/functions/crm-integration/index.ts'));
    expect(src).not.toMatch(/payload\.sentiment \|\| 'neutral'/);
    expect(src).not.toMatch(/sentiment[^\n]{0,40}\|\|[^\n]{0,10}'neutral'/);
  });

  it('evolutionAdapter não fabrica ai_priority no contato derivado', () => {
    const src = stripComments(read('src/adapters/evolutionAdapter.ts'));
    expect(src).not.toMatch(/ai_priority: 'medium',/);
  });

  it('a função viva do outbox (migration A do PR-1) não usa COALESCE(..., "neutral")', () => {
    const sql = read('supabase/migrations/20260930500000_ai_block03_pr1_drop_defaults_sentiment.sql');
    expect(sql).toMatch(/create or replace function public\.enqueue_crm_sync_from_closure/);
    expect(sql).not.toMatch(/COALESCE\(v_contact\.ai_sentiment, 'neutral'\)/);
  });
});
