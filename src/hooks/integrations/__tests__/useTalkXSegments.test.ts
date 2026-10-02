import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    // X017 — countAudience/resolveAudience falam com a RPC do motor (X016).
    rpc: vi.fn(async () => ({ data: { eligible: 7, rows: [], has_more: false, next_after: null }, error: null })),
  },
}));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RULE_FIELDS, RULE_OPS, rulesToPostgrest, isRuleComplete, splitRules, countAudience, resolveAudience, type SegmentRule } from '@/hooks/integrations/useTalkXSegments';
import { supabase } from '@/integrations/supabase/client';

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

  it('escapes a trailing backslash before quoting inside contains/ilike', () => {
    const filtro = rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field: 'company', op: 'contains', value: 'Acme\\' },
      ] }],
    });
    expect(filtro).toBe('company.ilike."*Acme\\\\*"');
    const antesDoAsterisco = filtro!.slice(0, filtro!.lastIndexOf('*'));
    const barras = antesDoAsterisco.length - antesDoAsterisco.replace(/\\+$/, '').length;
    expect(barras % 2).toBe(0);
  });

  // Achado do Codex (PR #896): uma camada extra de escape de virgula fazia
  // "Acme, Inc" virar uma busca por "Acme\, Inc" (com barra invertida
  // espuria), que nunca bate com o dado real — excluindo contatos que
  // deveriam entrar no segmento. Virgula dentro de aspas nao precisa de
  // escape para o parser do PostgREST.
  it('does not corrupt a value containing a comma inside contains/ilike', () => {
    const filtro = rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field: 'company', op: 'contains', value: 'Acme, Inc' },
      ] }],
    });
    expect(filtro).toBe('company.ilike."*Acme, Inc*"');
  });
});

// Campos de audiencia reais (city/state/assigned_to/group_category): cada um
// precisa virar filtro na SUA coluna de public.contacts, com os operadores que
// o kind oferece em RULE_OPS. O valor do campo e o nome da coluna, como nos
// campos ja existentes de ruleToFilter.
describe('rulesToPostgrest — campos de audiencia novos', () => {
  const filtroDe = (field: string, op: string, value: string) =>
    rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field, op, value } as never,
      ] }],
    });

  it('city (kind text): igualdade, contem e vazio apontam para a coluna city', () => {
    expect(filtroDe('city', 'eq', 'Sao Paulo')).toBe('city.eq."Sao Paulo"');
    expect(filtroDe('city', 'neq', 'Sao Paulo')).toBe('or(city.is.null,city.neq."Sao Paulo")');
    expect(filtroDe('city', 'contains', 'Sao')).toBe('city.ilike."*Sao*"');
    expect(filtroDe('city', 'is_empty', '')).toBe('or(city.is.null,city.eq.)');
  });

  it('state (kind text): igualdade, contem e preenchido apontam para a coluna state', () => {
    expect(filtroDe('state', 'eq', 'SP')).toBe('state.eq."SP"');
    expect(filtroDe('state', 'contains', 'S')).toBe('state.ilike."*S*"');
    expect(filtroDe('state', 'is_set', '')).toBe('state.not.is.null');
  });

  it('assigned_to (kind uuid): igualdade, preenchido e vazio apontam para a coluna assigned_to', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    expect(filtroDe('assigned_to', 'eq', uuid)).toBe(`assigned_to.eq."${uuid}"`);
    expect(filtroDe('assigned_to', 'neq', uuid)).toBe(`or(assigned_to.is.null,assigned_to.neq."${uuid}")`);
    expect(filtroDe('assigned_to', 'is_set', '')).toBe('assigned_to.not.is.null');
    // Coluna uuid nao compara com string vazia (`eq.`): "vazio" aqui e apenas nulo.
    expect(filtroDe('assigned_to', 'is_empty', '')).toBe('assigned_to.is.null');
  });

  it('group_category (kind enum): igualdade, diferente e vazio apontam para a coluna group_category', () => {
    expect(filtroDe('group_category', 'eq', 'orcamentos')).toBe('group_category.eq."orcamentos"');
    expect(filtroDe('group_category', 'neq', 'aprovacao')).toBe('or(group_category.is.null,group_category.neq."aprovacao")');
    expect(filtroDe('group_category', 'is_empty', '')).toBe('or(group_category.is.null,group_category.eq.)');
  });

  it('expoe os 4 campos novos em RULE_FIELDS com kind/categoria corretos', () => {
    const byField = Object.fromEntries(RULE_FIELDS.map((f) => [f.value, f]));
    expect(byField.city).toMatchObject({ label: 'Cidade', kind: 'text', category: 'basico' });
    expect(byField.state).toMatchObject({ label: 'UF', kind: 'text', category: 'basico' });
    expect(byField.assigned_to).toMatchObject({ label: 'Responsável', kind: 'uuid', category: 'comercial' });
    expect(byField.group_category).toMatchObject({ label: 'Grupo', kind: 'enum', category: 'basico' });
    expect(byField.group_category.options).toEqual(['orcamentos', 'aprovacao', 'os', 'acerto']);
  });

  it('nao oferece "contem" para uuid: ilike em coluna uuid e erro do Postgres', () => {
    const opsUuid = (RULE_OPS.uuid ?? []).map((o) => o.value);
    expect(opsUuid).toContain('eq');
    expect(opsUuid).toContain('neq');
    expect(opsUuid).not.toContain('contains');
    expect(opsUuid).not.toContain('not_contains');
  });
});

// X008 — uma condição em branco precisa ficar de FORA da estimativa, sem derrubar
// o count para 0 nem deixar passar valor inválido para o PostgREST.
const regra = (field: string, op: string, value: string): SegmentRule =>
  ({ id: 'r', field, op, value } as SegmentRule);

describe('isRuleComplete — por tipo de campo', () => {
  it('texto, enum e array exigem valor não vazio', () => {
    expect(isRuleComplete(regra('company', 'eq', 'Acme'))).toBe(true);
    expect(isRuleComplete(regra('company', 'eq', ''))).toBe(false);
    expect(isRuleComplete(regra('company', 'eq', '   '))).toBe(false);
    expect(isRuleComplete(regra('contact_type', 'eq', 'lead'))).toBe(true);
    expect(isRuleComplete(regra('contact_type', 'eq', ''))).toBe(false);
    expect(isRuleComplete(regra('tags', 'contains', 'vip'))).toBe(true);
    expect(isRuleComplete(regra('tags', 'contains', ''))).toBe(false);
  });

  it('número e data exigem valor numérico válido', () => {
    expect(isRuleComplete(regra('lead_score', 'gt', '50'))).toBe(true);
    expect(isRuleComplete(regra('lead_score', 'gt', ''))).toBe(false);
    expect(isRuleComplete(regra('lead_score', 'gt', 'abc'))).toBe(false);
    expect(isRuleComplete(regra('created_at', 'in_last_days', '7'))).toBe(true);
    expect(isRuleComplete(regra('created_at', 'in_last_days', '0'))).toBe(false);
    expect(isRuleComplete(regra('created_at', 'in_last_days', 'abc'))).toBe(false);
  });

  it('is_set/is_empty não exigem valor e campo desconhecido nunca é completo', () => {
    expect(isRuleComplete(regra('email', 'is_set', ''))).toBe(true);
    expect(isRuleComplete(regra('email', 'is_empty', ''))).toBe(true);
    expect(isRuleComplete(regra('unknown_field', 'eq', 'x'))).toBe(false);
  });
});

describe('splitRules — condição incompleta não entra na estimativa', () => {
  it('remove a condição vazia e conta quantas ficaram de fora', () => {
    const { complete, incompleteCount } = splitRules({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: 'Acme' },
        { id: 'r2', field: 'city', op: 'eq', value: '' },
      ] }],
    });
    expect(incompleteCount).toBe(1);
    expect(rulesToPostgrest(complete)).toBe('company.eq."Acme"');
  });

  it('só com condições incompletas a estimativa representa a base inteira', () => {
    const { complete, incompleteCount } = splitRules({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'tags', op: 'contains', value: '' },
      ] }],
    });
    expect(incompleteCount).toBe(1);
    expect(rulesToPostgrest(complete)).toBeNull();
  });

  it('regras completas seguem falhando fechado para campo desconhecido', () => {
    expect(() => rulesToPostgrest({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'unknown_field', op: 'eq', value: 'x' },
      ] }],
    } as never)).toThrow('Regra de segmento inválida');
  });
});

// X017 — o público (contagem e amostra) passa a ser resolvido pela RPC do motor
// (talkx_resolve_audience, X016) em vez do PostgREST consultando public.contacts
// no navegador: o critério de elegível fica no servidor, igual ao snapshot.
describe('X017 — audiência resolvida pela RPC do motor (não mais no navegador)', () => {
  const rules = {
    groups: [{ id: 'g', match: 'and', rules: [{ id: 'r', field: 'company', op: 'eq', value: 'Acme' }] }],
  } as never;

  it('countAudience chama talkx_resolve_audience em modo count e lê `eligible`', async () => {
    const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    rpc.mockClear();
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockClear();

    const total = await countAudience(rules);

    expect(total).toBe(7);
    expect(rpc).toHaveBeenCalledWith('talkx_resolve_audience', expect.objectContaining({ p_mode: 'count' }));
    // O navegador não consulta mais public.contacts para estimar o público.
    expect(supabase.from).not.toHaveBeenCalledWith('contacts');
  });

  it('resolveAudience pagina a RPC (modo page) e devolve as linhas do servidor', async () => {
    const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    rpc.mockClear();
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockClear();
    rpc.mockResolvedValueOnce({
      data: {
        mode: 'page',
        rows: [{ id: 'c1', name: 'Ana', nickname: null, phone: '55119*****', company: 'Acme', avatar_url: null, tags: null }],
        has_more: false,
        next_after: null,
      },
      error: null,
    });

    const rows = await resolveAudience(rules, 5);

    expect(rows.map((r) => r.id)).toEqual(['c1']);
    expect(rpc).toHaveBeenCalledWith('talkx_resolve_audience', expect.objectContaining({ p_mode: 'page', p_limit: 5 }));
    expect(supabase.from).not.toHaveBeenCalledWith('contacts');
  });
});
