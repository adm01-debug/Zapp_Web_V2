import { describe, expect, it, vi } from 'vitest';
import type { SegmentRules } from '@/hooks/integrations/useTalkXSegments';

// O reducer entra pela via real (`useTalkXSegments` traz o motor de regras e o
// client do Supabase): o client é substituído por um stub vazio, porque o teste
// não fala com o banco — só prova o histórico de edição.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) },
}));

import {
  COALESCE_MS,
  HISTORY_LIMIT,
  builderContent,
  createBuilderState,
  isDirty,
  ruleFromField,
  segmentBuilderReducer,
  type SegmentBuilderAction,
  type SegmentBuilderState,
} from '../segments/segmentBuilderReducer';

// X099 — o construtor de segmentos passa a ter histórico: dez edições desfeitas
// uma a uma voltam ao estado inicial; refazer morre depois de uma edição nova;
// "Limpar tudo" (que antes apagava sem volta) é desfazível; a digitação do mesmo
// campo vale um passo e a pilha para em 50.
// Vermelho antes do fix: não existia reducer nenhum (o construtor usava setState
// solto), então nem `past`/`future` havia para conferir.

const rulesWith = (): SegmentRules => ({ groups: [{ id: 'g1', match: 'and', rules: [] }] });

const initialState = (): SegmentBuilderState => createBuilderState({ name: 'Base', description: '', rules: rulesWith() });

function run(state: SegmentBuilderState, actions: SegmentBuilderAction[]): SegmentBuilderState {
  return actions.reduce(segmentBuilderReducer, state);
}

/** As dez edições usadas na prova de desfazer: uma por ação do plano. */
const DEZ_EDICOES: SegmentBuilderAction[] = [
  { type: 'name', value: 'Base A', at: 1 },
  { type: 'description', value: 'clientes VIP', at: 2 },
  { type: 'addGroup', match: 'or', id: 'g2' },
  { type: 'addRule', groupId: 'g1', rule: { id: 'r1', field: 'tags', op: 'contains', value: 'VIP' } },
  { type: 'updateRule', groupId: 'g1', ruleId: 'r1', patch: { value: 'OURO' }, at: 3 },
  { type: 'setMatch', id: 'g2', match: 'and' },
  { type: 'addRule', groupId: 'g2', rule: { id: 'r2', field: 'city', op: 'eq', value: 'São Paulo' } },
  { type: 'duplicateGroup', id: 'g1' },
  { type: 'removeRule', groupId: 'g2', ruleId: 'r2' },
  { type: 'clear' },
];

describe('segmentBuilderReducer · desfazer/refazer (X099)', () => {
  it('10 edições e 10 desfazer voltam ao estado inicial (igualdade profunda)', () => {
    const base = initialState();
    let state = run(base, DEZ_EDICOES);

    expect(state.past).toHaveLength(10);
    expect(builderContent(state)).not.toEqual(builderContent(base));

    for (let i = 0; i < 10; i += 1) state = segmentBuilderReducer(state, { type: 'undo' });

    expect(builderContent(state)).toEqual(builderContent(base));
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(10);
    expect(isDirty(state)).toBe(false);
  });

  it('refazer é descartado depois de uma edição nova', () => {
    let state = run(initialState(), [
      { type: 'name', value: 'Base A', at: 1 },
      { type: 'description', value: 'descrição', at: 2 },
    ]);
    state = segmentBuilderReducer(state, { type: 'undo' });
    expect(state.future).toHaveLength(1);

    state = segmentBuilderReducer(state, { type: 'setMatch', id: 'g1', match: 'or' });
    expect(state.future).toHaveLength(0);
    expect(segmentBuilderReducer(state, { type: 'redo' })).toBe(state);
  });

  it('limpar + desfazer restaura as condições', () => {
    const comCondicao = run(initialState(), [
      { type: 'addRule', groupId: 'g1', rule: { id: 'r1', field: 'tags', op: 'contains', value: 'VIP' } },
    ]);
    const limpo = segmentBuilderReducer(comCondicao, { type: 'clear' });
    expect(limpo.rules.groups.flatMap((g) => g.rules)).toHaveLength(0);

    const voltou = segmentBuilderReducer(limpo, { type: 'undo' });
    expect(builderContent(voltou)).toEqual(builderContent(comCondicao));
    expect(voltou.rules.groups.flatMap((g) => g.rules)[0]?.value).toBe('VIP');
  });

  it('limpar sem nada para limpar não gasta passo nem marca alteração pendente', () => {
    const base = initialState();
    const depois = segmentBuilderReducer(base, { type: 'clear' });
    expect(depois).toBe(base);
    expect(isDirty(depois)).toBe(false);
  });

  it('junta a digitação do mesmo campo em um passo só', () => {
    let state = createBuilderState({ name: '', description: '', rules: rulesWith() });
    state = segmentBuilderReducer(state, { type: 'name', value: 'S', at: 1000 });
    state = segmentBuilderReducer(state, { type: 'name', value: 'Se', at: 1200 });
    state = segmentBuilderReducer(state, { type: 'name', value: 'Seg', at: 1400 });
    expect(state.past).toHaveLength(1);

    // Uma pausa maior que a janela começa um passo novo.
    state = segmentBuilderReducer(state, { type: 'name', value: 'Segmento', at: 1400 + COALESCE_MS + 1 });
    expect(state.past).toHaveLength(2);

    expect(segmentBuilderReducer(state, { type: 'undo' }).name).toBe('Seg');
    expect(segmentBuilderReducer(segmentBuilderReducer(state, { type: 'undo' }), { type: 'undo' }).name).toBe('');
  });

  it('a pilha para em 50 passos', () => {
    let state = createBuilderState({ name: '', description: '', rules: rulesWith() });
    for (let i = 1; i <= 60; i += 1) {
      state = segmentBuilderReducer(state, { type: 'name', value: `n${i}`, at: i * (COALESCE_MS + 1) });
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });

  it('duplicar grupo copia as condições com ids novos, logo depois da origem', () => {
    const state = run(initialState(), [
      { type: 'addRule', groupId: 'g1', rule: { id: 'r1', field: 'tags', op: 'contains', value: 'VIP' } },
      { type: 'duplicateGroup', id: 'g1' },
    ]);
    expect(state.rules.groups).toHaveLength(2);
    expect(state.rules.groups[0]?.id).toBe('g1');
    const copia = state.rules.groups[1];
    expect(copia?.id).not.toBe('g1');
    expect(copia?.rules[0]?.value).toBe('VIP');
    expect(copia?.rules[0]?.id).not.toBe('r1');
    expect(state.activeGroupId).toBe(copia?.id);

    // E o desfazer tira a cópia inteira.
    expect(segmentBuilderReducer(state, { type: 'undo' }).rules.groups).toHaveLength(1);
  });

  it('remover grupo nunca deixa a tela sem grupo', () => {
    const comDois = run(initialState(), [{ type: 'addGroup', match: 'and', id: 'g2' }]);
    const semG2 = segmentBuilderReducer(comDois, { type: 'removeGroup', id: 'g2' });
    expect(semG2.rules.groups.map((g) => g.id)).toEqual(['g1']);
    expect(semG2.activeGroupId).toBeNull();

    const semNenhum = segmentBuilderReducer(semG2, { type: 'removeGroup', id: 'g1' });
    expect(semNenhum.rules.groups).toHaveLength(1);
    expect(semNenhum.rules.groups[0]?.rules).toHaveLength(0);
  });

  it('carregar substitui o conteúdo e zera o histórico', () => {
    const sujo = run(initialState(), [{ type: 'name', value: 'Mudou', at: 1 }]);
    expect(isDirty(sujo)).toBe(true);

    const carregado = segmentBuilderReducer(sujo, { type: 'load', content: { name: 'Do banco', description: 'vinda do banco', rules: rulesWith() } });
    expect(carregado.past).toHaveLength(0);
    expect(carregado.future).toHaveLength(0);
    expect(carregado.baseline.name).toBe('Do banco');
    expect(isDirty(carregado)).toBe(false);
  });

  it('trocar o grupo ativo não gasta passo de histórico', () => {
    const state = run(initialState(), [{ type: 'activateGroup', id: 'g1' }]);
    expect(state.past).toHaveLength(0);
    expect(state.activeGroupId).toBe('g1');
  });

  it('a condição do catálogo nasce com o operador do tipo do campo', () => {
    expect(ruleFromField('tags')).toMatchObject({ field: 'tags', op: 'contains', value: '' });
    expect(ruleFromField('updated_at')).toMatchObject({ field: 'updated_at', op: 'in_last_days' });
    expect(ruleFromField('contact_type').value).not.toBe('');
  });
});
