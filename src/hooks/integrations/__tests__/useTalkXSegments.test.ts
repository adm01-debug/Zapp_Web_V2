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

  it('lead_origin, lead_score e risk_score ficam "em breve": nada grava/calcula essas colunas e o filtro seria morto', () => {
    expect(RULE_FIELDS.filter((f) => f.comingSoon).map((f) => f.value).sort()).toEqual(['lead_origin', 'lead_score', 'real_sector', 'real_uf', 'risk_score']);
  });

  it('nao oferece "contem" para uuid: ilike em coluna uuid e erro do Postgres', () => {
    const opsUuid = (RULE_OPS.uuid ?? []).map((o) => o.value);
    expect(opsUuid).toContain('eq');
    expect(opsUuid).toContain('neq');
    expect(opsUuid).not.toContain('contains');
    expect(opsUuid).not.toContain('not_contains');
  });
});

// Ponte Singu (recon t_0ed9b4f1): setor de atividade REAL (companies.ramo_atividade) e UF REAL
// (company_addresses.estado is_primary) entram no catalogo como kind enum com igualdade EXATA.
// O valor gravado e a string crua que a Edge leva ao Singu — por isso o campo NAO traz `options`
// (a lista de ramos/UFs vem da RPC, nao de uma constante do front) e a UI cai na caixa de texto.
// company/city/state continuam sendo texto livre: os segmentos ja salvos dependem deles.
describe('RULE_FIELDS — setor e UF reais (ponte Singu)', () => {
  const byField = Object.fromEntries(RULE_FIELDS.map((f) => [f.value, f]));

  it('expoe real_sector e real_uf como kind enum na categoria basico', () => {
    expect(byField.real_sector).toMatchObject({ kind: 'enum', category: 'basico' });
    expect(byField.real_uf).toMatchObject({ kind: 'enum', category: 'basico' });
    expect(byField.real_sector.label.length).toBeGreaterThan(0);
    expect(byField.real_uf.label.length).toBeGreaterThan(0);
  });

  it('real_uf tem rotulo distinto do "UF" de texto livre (nao confunde os dois no seletor)', () => {
    expect(byField.real_uf.label).not.toBe(byField.state.label);
  });

  it('os dois campos usam igualdade exata (enum: eq/neq/is_empty), nunca "contem"', () => {
    const opsEnum = RULE_OPS.enum.map((o) => o.value);
    expect(opsEnum).toEqual(expect.arrayContaining(['eq', 'neq', 'is_empty']));
    expect(opsEnum).not.toContain('contains');
    expect(opsEnum).not.toContain('not_contains');
  });

  it('nao muta os campos de texto livre usados por segmentos salvos', () => {
    expect(byField.company).toMatchObject({ label: 'Empresa', kind: 'text', category: 'basico' });
    expect(byField.city).toMatchObject({ label: 'Cidade', kind: 'text', category: 'basico' });
    expect(byField.state).toMatchObject({ label: 'UF', kind: 'text', category: 'basico' });
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
    // lead_score/risk_score dizem a verdade em isRuleComplete (regra completa e
    // bem descrita para o catálogo v2); o bloqueio do filtro morto é SÓ no
    // caminho que executa/publica (splitRules + rulesToPostgrest + validação).
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
    // "Em breve" diz a verdade aqui (completo e bem descrito); o filtro morto é
    // barrado SÓ em splitRules/rulesToPostgrest/validação, sem quebrar o v2.
    expect(isRuleComplete(regra('lead_score', 'is_set', ''))).toBe(true);
    expect(isRuleComplete(regra('lead_score', 'is_empty', ''))).toBe(true);
    expect(isRuleComplete(regra('lead_score', 'eq', '0'))).toBe(true);
    expect(isRuleComplete(regra('risk_score', 'is_set', ''))).toBe(true);
    expect(isRuleComplete(regra('risk_score', 'eq', '0'))).toBe(true);
  });

  it('lead_score/risk_score são "em breve": completos mas fora da estimativa/PostgREST (falha fechada)', () => {
    expect(RULE_FIELDS.find((f) => f.value === 'lead_score')?.comingSoon).toBe(true);
    expect(RULE_FIELDS.find((f) => f.value === 'risk_score')?.comingSoon).toBe(true);
    // Separa os conceitos: a regra é completa e bem descrita (não quebra o v2),
    // mas nunca executa/publica.
    expect(isRuleComplete({ id: 'r1', field: 'lead_score', op: 'eq', value: '80' } as never)).toBe(true);
    expect(isRuleComplete({ id: 'r1', field: 'risk_score', op: 'eq', value: '10' } as never)).toBe(true);
    expect(() => rulesToPostgrest({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'lead_score', op: 'eq', value: '80' },
      ] }],
    } as never)).toThrow('Regra de segmento inválida');
    const { complete, incompleteCount } = splitRules({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'lead_score', op: 'eq', value: '80' },
      ] }],
    });
    expect(incompleteCount).toBe(1);
    expect(rulesToPostgrest(complete)).toBeNull();
  });

  // t_bbe423a7 — contacts.lead_origin: nenhum fluxo de criação do Zapp grava a coluna (o contato
  // derivado do WhatsApp carrega a origem só na projeção em memória, não na linha do banco) e o
  // Zapp não edita contatos em massa. Filtrar por origem devolveria sempre vazio → fica "em breve".
  it('lead_origin fica "em breve": regra completa mas fora da estimativa/PostgREST (falha fechada)', () => {
    expect(RULE_FIELDS.find((f) => f.value === 'lead_origin')?.comingSoon).toBe(true);
    expect(isRuleComplete(regra('lead_origin', 'eq', 'whatsapp'))).toBe(true);
    expect(() => rulesToPostgrest({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'lead_origin', op: 'eq', value: 'whatsapp' },
      ] }],
    } as never)).toThrow('Regra de segmento inválida');
    const { complete, incompleteCount } = splitRules({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'lead_origin', op: 'eq', value: 'whatsapp' },
      ] }],
    });
    expect(incompleteCount).toBe(1);
    expect(rulesToPostgrest(complete)).toBeNull();
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

// t_124005a8 (refazer 2) — real_sector e real_uf vivem na ponte Singu
// (companies.ramo_atividade e company_addresses.estado com is_primary = true) e
// chegam ao motor como contact_ids pré-resolvidos (p_contact_ids). Enquanto o
// front não faz essa pré-resolução, a resolução FALHA FECHADA: erro explícito,
// nunca um payload sem a regra — que devolveria mais contatos do que a
// audiência pedida.
describe('real_sector/real_uf (ponte Singu): resolução falha fechada', () => {
  const rpcMock = () => supabase.rpc as unknown as ReturnType<typeof vi.fn>;

  it('rulesToPostgrest falha fechado para real_sector e real_uf', () => {
    for (const field of ['real_sector', 'real_uf']) {
      expect(() => rulesToPostgrest({
        groups: [{ id: 'g', match: 'and', rules: [
          { id: 'r1', field, op: 'eq', value: 'x' },
        ] }],
      } as never)).toThrow('Regra de segmento inválida');
    }
  });

  it('real_* comingSoon são excluídos pelo splitRules (não entram no conjunto executável)', () => {
    const { complete, incompleteCount } = splitRules({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'real_sector', op: 'eq', value: 'Varejo' },
        { id: 'r2', field: 'real_uf', op: 'eq', value: 'SP' },
        { id: 'r3', field: 'city', op: 'eq', value: '' },
      ] }],
    } as never);
    expect(incompleteCount).toBe(3);
    expect(complete.groups).toHaveLength(0);
  });

  it('countAudience rejeita real_sector e não manda regra nenhuma ao motor', async () => {
    const rpc = rpcMock();
    rpc.mockClear();
    await expect(countAudience({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: 'Acme' },
        { id: 'r2', field: 'real_sector', op: 'eq', value: 'Varejo' },
      ] }],
    } as never)).rejects.toThrow(/real_sector.*p_contact_ids/);
    // Nada foi enviado: sem a regra, "company eq Acme" sozinha traria MAIS gente.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('resolveAudience rejeita real_uf e não manda regra nenhuma ao motor', async () => {
    const rpc = rpcMock();
    rpc.mockClear();
    await expect(resolveAudience({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: 'Acme' },
        { id: 'r2', field: 'real_uf', op: 'eq', value: 'SP' },
      ] }],
    } as never, 5)).rejects.toThrow(/real_uf.*p_contact_ids/);
    expect(rpc).not.toHaveBeenCalled();
  });

  // O defeito da rodada anterior: o grupo ficava vazio e o payload saía como
  // groups: [] — que o motor lê como "sem filtro" (base inteira), não como zero.
  it('grupo só com real_* não vira groups: [] (o motor leria base inteira)', async () => {
    const rpc = rpcMock();
    rpc.mockClear();
    await expect(countAudience({
      groups: [{ id: 'g', match: 'or', rules: [
        { id: 'r1', field: 'real_uf', op: 'eq', value: 'SP' },
      ] }],
      join: 'or',
    } as never)).rejects.toThrow(/real_uf/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('nao descarta em silencio regra em branco nem campo desconhecido (a RPC rejeita)', async () => {
    const rpc = rpcMock();
    rpc.mockClear();
    await countAudience({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'city', op: 'eq', value: '' },
        { id: 'r2', field: 'campo_inexistente', op: 'eq', value: 'x' },
      ] }],
    } as never);
    const payload = (rpc.mock.calls[0] as unknown[])[1] as { p_rules: { groups: { rules: unknown[] }[] } };
    expect(payload.p_rules.groups[0].rules).toHaveLength(2);
  });
});

// t_124005a8 item 2 do cartao — o segmento salvo com os campos ANTIGOS (texto
// livre company/city/state) tem de resolver exatamente como resolvia antes.
describe('regressão: segmento antigo (company/city/state) resolve como antes', () => {
  const antigas = {
    groups: [{ id: 'g', match: 'and', rules: [
      { id: 'r1', field: 'company', op: 'eq', value: 'Acme' },
      { id: 'r2', field: 'city', op: 'contains', value: 'Paulo' },
      { id: 'r3', field: 'state', op: 'eq', value: 'SP' },
    ] }],
  } as never;

  it('o payload da RPC é o mesmo de antes: só groups, sem join e sem regra perdida', async () => {
    const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    rpc.mockClear();
    await countAudience(antigas);
    const payload = (rpc.mock.calls[0] as unknown[])[1] as { p_rules: unknown };
    expect(payload.p_rules).toEqual({
      groups: [{ id: 'g', match: 'and', rules: [
        { id: 'r1', field: 'company', op: 'eq', value: 'Acme' },
        { id: 'r2', field: 'city', op: 'contains', value: 'Paulo' },
        { id: 'r3', field: 'state', op: 'eq', value: 'SP' },
      ] }],
    });
    expect(Object.keys(payload.p_rules as object)).toEqual(['groups']);
  });

  it('e o filtro PostgREST do mesmo segmento continua igual ao de antes', () => {
    expect(rulesToPostgrest(antigas)).toBe('and(company.eq."Acme",city.ilike."*Paulo*",state.eq."SP")');
  });
});
