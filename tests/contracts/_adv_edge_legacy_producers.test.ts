/**
 * ADVERSARIAL (item c) — varredura em TODAS as edge functions por
 * (i) PRODUTORES de vocabulário legado (token EN servindo de valor de saída) e
 * (ii) usos restantes do regex antigo `/\{[\s\S]*\}/`.
 *
 * Este arquivo é um RATCHET: ele pina o inventário medido da árvore atual. Se
 * alguém introduzir (ou remover) uma ocorrência, o teste falha e obriga a
 * atualizar o mapa — que é a lista de trabalho da revisão.
 *
 * Medição de origem: 139 arquivos .ts em supabase/functions, 5 ocorrências.
 * 01/10 (T15): 143 — o +1 é o `get-sip-password/index.test.ts` (teste da
 * função), que não produz nenhum token legado nem usa o regex antigo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const EDGE = resolve(ROOT, 'supabase/functions');

/** Remove comentários: o texto que DOCUMENTA o defeito cita os literais. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

const PRODUCER_PATTERNS = [
  { id: 'sentiment-value', re: /(?:^|[\s{,.(])(?:ai_)?sentiment(?:Score)?\s*[:=]\s*['"](positive|neutral|negative|critical|very_negative|very_positive)['"]/g },
  { id: 'sentiment-fallback', re: /(?:ai_)?sentiment[^\n]{0,60}(?:\|\||\?\?)\s*['"](positive|neutral|negative|critical|very_negative|very_positive)['"]/g },
  { id: 'priority-fallback', re: /(?:ai_)?priority[^\n]{0,60}(?:\|\||\?\?)\s*['"](low|normal|medium|high|urgent|critical)['"]/g },
  { id: 'urgency-value', re: /urgency\s*[:=]\s*['"](low|normal|medium|high|urgent|critical|critica)['"]/g },
  { id: 'p_sentiment-fallback', re: /p_sentiment[^\n]{0,40}(?:\|\||\?\?)\s*['"](positive|neutral|negative|critical)['"]/g },
  { id: 'eq-token', re: /(?:ai_)?sentiment\s*={2,3}\s*['"](positive|neutral|negative|critical|very_negative)['"]/g },
  { id: 'in-token', re: /\.in\(\s*['"]ai_sentiment['"][^\n]*/g },
] as const;

const OLD_REGEX = /\[\\s\\S\]\*|\[\\s\\S\]\+/;

function scan() {
  const hits: Array<{ id: string; file: string; line: number; text: string }> = [];
  for (const file of tsFiles(EDGE)) {
    const src = stripComments(readFileSync(file, 'utf8'));
    src.split('\n').forEach((line, i) => {
      for (const { id, re } of PRODUCER_PATTERNS) {
        re.lastIndex = 0;
        if (re.test(line)) hits.push({ id, file: file.slice(ROOT.length + 1), line: i + 1, text: line.trim().slice(0, 160) });
      }
      if (OLD_REGEX.test(line)) hits.push({ id: 'regex-antigo', file: file.slice(ROOT.length + 1), line: i + 1, text: line.trim().slice(0, 160) });
    });
  }
  return hits;
}

/**
 * Inventário MEDIDO (arquivo → ids de ocorrência). Qualquer mudança aqui é
 * intencional e precisa passar por revisão.
 */
const INVENTARIO: Record<string, string[]> = {
  'supabase/functions/ai-classify-tickets/index.ts': ['priority-fallback'],
  'supabase/functions/ai-suggest-reply/index.ts': ['regex-antigo'],
  'supabase/functions/voice-copilot-action/index.ts': ['in-token'],
};

/** Os 4 arquivos que o Bloco 03 migrou: NÃO podem produzir token legado. */
const MIGRADAS = [
  'supabase/functions/ai-auto-tag/index.ts',
  'supabase/functions/chatbot-l1/index.ts',
  'supabase/functions/ai-conversation-analysis/index.ts',
  'supabase/functions/ai-conversation-summary/index.ts',
];

const hits = scan();
const porArquivo = hits.reduce<Record<string, string[]>>((acc, h) => {
  (acc[h.file] ??= []).push(h.id);
  return acc;
}, {});

describe('(c.1) inventário completo de produtores legados / regex antigo', () => {
  it('143 arquivos .ts varridos e o inventário bate com o mapa pinado', () => {
    expect(tsFiles(EDGE).length).toBe(143);
    const normalizado = Object.fromEntries(
      Object.entries(porArquivo).map(([k, v]) => [k, [...v].sort()]),
    );
    expect(normalizado).toEqual(INVENTARIO);
    expect(hits.length).toBe(3);
  });

  it('as funções MIGRADAS não produzem nenhum token legado', () => {
    for (const arquivo of MIGRADAS) {
      expect(porArquivo[arquivo], `${arquivo} voltou a produzir vocabulário legado`).toBeUndefined();
    }
  });
});

describe('(c.2) DEFEITOS reais ainda presentes na árvore', () => {
  it('ai-suggest-reply usa o regex antigo e NÃO migrou para parseJsonObject', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/ai-suggest-reply/index.ts'), 'utf8');
    expect(src).toMatch(/\(content as string\)\.match\(\/\\{\[\\s\\S\]\*\\}\/\)/);
    expect(src).not.toContain('parseJsonObject');
  });

  it('ai-suggest-reply ainda FABRICA 3 sugestões quando o parse falha (200 com dado inventado)', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/ai-suggest-reply/index.ts'), 'utf8');
    expect(src).toMatch(/catch \{[\s\S]{0,400}Entendi sua solicitação/);
    expect(src).toMatch(/return jsonResponse\(suggestions, 200, req\)/);
  });

  it('crm-integration NÃO envia "neutral" inventado ao CRM (corrigido no PR-1)', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/crm-integration/index.ts'), 'utf8');
    expect(src).not.toMatch(/p_sentiment:\s*payload\.sentiment \|\| 'neutral'/);
    expect(src).toMatch(/sentimentForExternalCrm/);
  });

  it('voice-copilot-action NÃO usa mais vocabulário EN extinto (corrigido no PR-1)', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/voice-copilot-action/index.ts'), 'utf8');
    expect(src).not.toMatch(/\['negative', 'very_negative'\]/);
    expect(src).toMatch(/\['negativo', 'critico'\]/);
  });

  it('ai-classify-tickets inventa prioridade "low" quando a categoria é desconhecida', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/ai-classify-tickets/index.ts'), 'utf8');
    expect(src).toMatch(/PRIORITY_RULES\[category\] \|\| "low"/);
  });
});

describe('(c.3) o regex antigo está morto nos pontos migrados', () => {
  it('ai-json.ts é o único lar da extração, e o comentário é a única outra menção', () => {
    const ocorrencias = tsFiles(EDGE).filter((f) => readFileSync(f, 'utf8').includes('[\\s\\S]*'));
    expect(ocorrencias.map((f) => f.slice(ROOT.length + 1)).sort()).toEqual([
      'supabase/functions/_shared/ai-json.ts',
      'supabase/functions/ai-suggest-reply/index.ts',
    ]);
  });

  it('ai-auto-tag e chatbot-l1 usam parseJsonObject (não regex)', () => {
    for (const arquivo of ['supabase/functions/ai-auto-tag/index.ts', 'supabase/functions/chatbot-l1/index.ts']) {
      const src = readFileSync(resolve(ROOT, arquivo), 'utf8');
      expect(src).toContain('parseJsonObject');
      expect(src).toContain("from \"../_shared/ai-json.ts\"");
      expect(src).not.toMatch(/\.match\(\/\\{/);
    }
  });

  it('as duas funções de conversa extraem pelo pipeline (parseJsonObject)', () => {
    for (const arquivo of [
      'supabase/functions/ai-conversation-analysis/index.ts',
      'supabase/functions/ai-conversation-summary/index.ts',
    ]) {
      const src = readFileSync(resolve(ROOT, arquivo), 'utf8');
      expect(src).toContain('parseJsonObject');
      expect(src).not.toMatch(/\.match\(\/\\{/);
    }
  });
});
