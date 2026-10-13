/**
 * Contrato dos hooks de escopo de SLA (paridade com o `sla-rules-staletime-contract`
 * da V3): o prazo aplicável vem da RPC do banco, as leituras de escopo têm
 * `staleTime` declarado (nada de cache infinito) e o filtro por UUID só passa id
 * válido — id corrompido derruba a consulta inteira no PostgREST.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const fonte = (arquivo: string) => readFileSync(resolve(testDir, '..', arquivo), 'utf8');

describe('contrato — hooks de escopo com staleTime declarado', () => {
  for (const arquivo of [
    'useApplicableSLA.ts',
    'useSLARulesCounts.ts',
    'useSLAScopeNames.ts',
    'useSLAScopeOptions.ts',
  ]) {
    it(`${arquivo} declara staleTime (não congela o cache)`, () => {
      const src = fonte(arquivo);
      expect(src).toContain('staleTime:');
      expect(src).not.toContain('staleTime: Infinity');
    });
  }
});

describe('contrato — prazo de 1ª resposta resolvido pela RPC (nunca montado no cliente)', () => {
  it('useApplicableSLA chama resolve_applicable_sla', () => {
    expect(fonte('useApplicableSLA.ts')).toContain("supabase.rpc('resolve_applicable_sla'");
  });

  it('useApplicableSLA não lê sla_rules para o prazo de 1ª resposta', () => {
    // A única leitura de `sla_rules` aqui é o id -> prazo de RESOLUÇÃO (linha do
    // tempo); a hierarquia de 1ª resposta não é montada no cliente.
    const src = fonte('useApplicableSLA.ts');
    expect(src).not.toContain('first_response_minutes, contact_id');
    expect(src).not.toContain('resolveHierarchy');
  });
});

describe('contrato — escopo por UUID validado antes do filtro', () => {
  it('useSLAScopeNames valida o id antes do `.in`', () => {
    const src = fonte('useSLAScopeNames.ts');
    expect(src).toContain('isValidUUID');
    expect(src).toContain('.filter(isValidUUID)');
  });
});
