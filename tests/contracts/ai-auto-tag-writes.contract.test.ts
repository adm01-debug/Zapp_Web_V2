import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrato de ESCRITA do `ai-auto-tag` (Bloco 03 / IA-025, IA-028).
 *
 * Estes testes leem o FONTE da Edge Function — não a executam — para travar as
 * decisões de integridade que o código antigo violava:
 *   - dividia a troca de etiquetas em `delete().eq('contact_id')` + `insert()`,
 *     dois awaits que ignoravam `{ error }` (não atômico, apagava etiqueta humana);
 *   - inventava sentimento/prioridade com fallback (`|| 'neutral'`, `|| 'normal'`);
 *   - coagia a confiança com `Number(...) || 0` (0 inventado para o que o modelo
 *     não mediu).
 */
const FONTE = 'supabase/functions/ai-auto-tag/index.ts';
const read = (path: string) => readFileSync(path, 'utf8');
/** Remove as linhas de `import` para não confundir import com chamada. */
const semImports = (source: string) => source.replace(/^import[\s\S]*?;\s*$/gm, '');

describe('ai-auto-tag · contrato de escrita (IA-025/IA-028)', () => {
  const bruto = read(FONTE);
  const corpo = semImports(bruto);

  it('não inventa sentimento/prioridade com fallback `|| neutral` / `|| normal`', () => {
    expect(bruto).not.toMatch(/\|\|\s*['"]neutral['"]/);
    expect(bruto).not.toMatch(/\|\|\s*['"]normal['"]/);
    expect(corpo).not.toMatch(/\|\|\s*['"]neutral['"]/);
    expect(corpo).not.toMatch(/\|\|\s*['"]normal['"]/);
  });

  it('valida a saída do modelo com o contrato AutoTagOutput + parseModelOutput', () => {
    expect(corpo).toContain('parseModelOutput(');
    expect(corpo).toContain('AutoTagOutput');
  });

  it('normaliza sentimento e prioridade antes de gravar em contacts', () => {
    expect(corpo).toContain('normalizeSentiment(');
    expect(corpo).toContain('normalizeOperationalPriority(');
    // escreve no contato só o valor canônico da normalização
    expect(corpo).toMatch(/updateData\.ai_sentiment\s*=\s*updatedSentiment\.value/);
    expect(corpo).toMatch(/updateData\.ai_priority\s*=\s*updatedPriority\.value/);
  });

  it('usa o RPC transacional replace_ai_conversation_tags', () => {
    expect(corpo).toContain('replace_ai_conversation_tags');
    expect(corpo).toContain("await supabase.rpc('replace_ai_conversation_tags'");
  });

  it('não voltou ao par delete + insert solto em ai_conversation_tags', () => {
    expect(corpo).not.toMatch(/\.from\(\s*['"]ai_conversation_tags['"]\s*\)\s*\.delete\(\)/);
    expect(corpo).not.toMatch(/\.from\(\s*['"]ai_conversation_tags['"]\s*\)\s*\.insert\(/);
  });

  it('trata o erro do RPC (não ignora { error })', () => {
    expect(corpo).toMatch(/error:\s*tagsError/);
    expect(corpo).toMatch(/if\s*\(\s*tagsError\s*\)/);
  });

  it('passa a confiança por normalizeScore na escala ratio 0-1', () => {
    expect(corpo).toContain('normalizeScore(');
    expect(corpo).toMatch(/min:\s*0,\s*max:\s*1/);
    expect(corpo).toMatch(/scale:\s*'ratio'/);
    // ausente vira null (a coluna aceita); nada de `|| 0`
    expect(corpo).not.toMatch(/Number\(\s*t(?:ag)?\.confidence\s*\)\s*\|\|\s*0/);
  });

  it('devolve 502 com buildAiEnvelope quando o contrato não bate', () => {
    expect(corpo).toContain('buildAiEnvelope(');
    expect(corpo).toMatch(/status:\s*'error'/);
    expect(corpo).toMatch(/\)\s*,\s*502,\s*req\)/);
  });

  it('mantém a chave `tags` no topo da resposta além do envelope (front)', () => {
    const idxRetorno = corpo.lastIndexOf('return jsonResponse(');
    const idxEnvelope = corpo.lastIndexOf('buildAiEnvelope(');
    expect(idxRetorno).toBeGreaterThan(-1);
    expect(idxEnvelope).toBeGreaterThan(idxRetorno);
    // `tags` no MESMO objeto do retorno, e não só dentro de `data`
    expect(corpo.slice(idxRetorno)).toMatch(/^\s*tags:/m);
  });
});
