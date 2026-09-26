import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { rulesToPostgrest } from '@/hooks/integrations/useTalkXSegments';

describe('rulesToPostgrest', () => {
  it('fails closed instead of dropping an unknown rule', () => {
    expect(() => rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field: 'unknown_field', op: 'eq', value: 'restricted' },
      ] }],
    } as never)).toThrow('Regra de segmento inválida');
  });

  it('keeps a valid rule as a PostgREST filter', () => {
    expect(rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field: 'company', op: 'eq', value: 'Acme' },
      ] }],
    })).toBe('company.eq."Acme"');
  });

  // js/incomplete-sanitization: um valor terminado em backslash nao pode
  // "engolir" a aspa de fechamento do filtro PostgREST. Sem escapar \
  // primeiro, quoted('Acme\\') produzia "Acme\" (4 chars: aspa, A, c, m, e,
  // barra, aspa — a ultima aspa e interpretada como escapada, nao como
  // fechamento), deixando a string do filtro aberta.
  it('escapes a trailing backslash before quoting, so the filter string cannot stay open', () => {
    const filtro = rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field: 'company', op: 'eq', value: 'Acme\\' },
      ] }],
    });
    expect(filtro).toBe('company.eq."Acme\\\\"');
    // A string entre aspas precisa terminar em backslash ESCAPADO (par),
    // nunca em um numero impar de backslashes antes da aspa de fechamento.
    const semAspaFinal = filtro!.slice(0, -1);
    const barrasNoFinal = semAspaFinal.length - semAspaFinal.replace(/\\+$/, '').length;
    expect(barrasNoFinal % 2).toBe(0);
  });

  it('escapes a trailing backslash before quoting inside contains/ilike (esc + quoted)', () => {
    // contains passa por DUAS camadas de escape (esc para o padrao LIKE,
    // quoted para a string do filtro) — 1 backslash de entrada sai como 4
    // (cada camada dobra), nunca um numero impar antes do fechamento.
    const filtro = rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field: 'company', op: 'contains', value: 'Acme\\' },
      ] }],
    });
    expect(filtro).toBe('company.ilike."*Acme\\\\\\\\*"');
    const antesDoAsterisco = filtro!.slice(0, filtro!.lastIndexOf('*'));
    const barras = antesDoAsterisco.length - antesDoAsterisco.replace(/\\+$/, '').length;
    expect(barras % 2).toBe(0);
  });
});
