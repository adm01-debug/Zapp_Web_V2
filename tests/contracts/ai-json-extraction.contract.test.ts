import { describe, expect, it } from 'vitest';
import {
  extractJsonObject,
  parseJsonObject,
} from '../../supabase/functions/_shared/ai-json.ts';

/**
 * Contrato de extração de JSON da saída crua do modelo (IA-025 / S8786).
 *
 * O helper substitui o regex `\{[\s\S]*\}` que o Sonar marcou como backtracking
 * super-linear. A semântica tem de ser EXATAMENTE a do regex guloso: recorta do
 * PRIMEIRO `{` ao ÚLTIMO `}` do texto. Aqui isso é provado caso a caso, sem
 * escrever regex nenhum no teste.
 */

describe('extractJsonObject — recorte guloso (primeiro "{" até o último "}")', () => {
  it('devolve o JSON inteiro quando o texto é só o objeto', () => {
    expect(extractJsonObject('{"sentiment":"positivo"}')).toBe('{"sentiment":"positivo"}');
  });

  it('ignora cercas markdown e prosa ao redor', () => {
    const bruto = 'Claro! Segue a análise:\n```json\n{"sentiment":"negativo"}\n```\nFim.';
    expect(extractJsonObject(bruto)).toBe('{"sentiment":"negativo"}');
  });

  it('preserva objeto aninhado por completo', () => {
    expect(extractJsonObject('x {"a":{"b":{"c":1}}} y')).toBe('{"a":{"b":{"c":1}}}');
  });

  it('recorta do primeiro "{" ao último "}", como o regex guloso fazia', () => {
    expect(extractJsonObject('lixo{"a":1} lixo {"b":2}')).toBe('{"a":1} lixo {"b":2}');
  });

  it('aceita "}" dentro de string do próprio JSON', () => {
    expect(extractJsonObject('{"msg":"use } aqui"}')).toBe('{"msg":"use } aqui"}');
  });

  it('devolve null sem chaves', () => {
    expect(extractJsonObject('sem json nenhum')).toBeNull();
  });

  it('devolve null com "{" sem "}" correspondente', () => {
    expect(extractJsonObject('quebrado {"a":1')).toBeNull();
  });

  it('devolve null para entrada que não é string', () => {
    expect(extractJsonObject(undefined as unknown as string)).toBeNull();
    expect(extractJsonObject(null as unknown as string)).toBeNull();
  });

  it('recorta "{}" vazio (par válido, sem conteúdo)', () => {
    expect(extractJsonObject('{}')).toBe('{}');
  });
});

describe('parseJsonObject — nunca fabrica dado', () => {
  it('devolve o objeto quando o recorte é JSON válido', () => {
    expect(parseJsonObject('```json\n{"a":1,"b":[1,2]}\n```')).toEqual({ a: 1, b: [1, 2] });
  });

  it('devolve null quando o recorte guloso não é JSON válido', () => {
    expect(parseJsonObject('{"a":1} texto {"b":2}')).toBeNull();
  });

  it('devolve null quando não existe objeto no texto', () => {
    expect(parseJsonObject('nada aqui')).toBeNull();
  });

  it('devolve null quando o JSON está truncado', () => {
    expect(parseJsonObject('{"sentiment":"positivo"')).toBeNull();
  });

  it('desembrulha objeto dentro de array (mesmo recorte do regex antigo)', () => {
    // Em `[{"a":1}]` o recorte vai do primeiro `{` ao último `}`, então o array
    // externo é descartado e sobra o objeto — exatamente o que o regex guloso
    // `\{[\s\S]*\}` fazia. O helper não "corrige" a semântica antiga: replica.
    expect(parseJsonObject('[{"a":1}]')).toEqual({ a: 1 });
  });
});
