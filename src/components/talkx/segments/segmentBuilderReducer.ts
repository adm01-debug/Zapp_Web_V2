import {
  RULE_FIELDS,
  RULE_OPS,
  emptyRules,
  newRule,
  type RuleOp,
  type SegmentRule,
  type SegmentRules,
  type RuleField,
} from '@/hooks/integrations/useTalkXSegments';

/**
 * X099 — estado do construtor de segmentos com desfazer/refazer.
 *
 * O construtor vivia dentro de `TalkXSegments.tsx` e cada edição era um `setState`
 * sem volta: errar o valor de uma condição custava refazer o grupo à mão, e
 * "Limpar tudo" apagava o trabalho sem aviso. Aqui cada edição vira um passo de
 * histórico (50 no máximo, como pede o plano) e a digitação do MESMO campo é
 * juntada em um passo só — sem isso "Segmento VIP" gastaria onze passos e o
 * desfazer deixaria de ser útil na prática.
 *
 * O reducer é puro (sem React, sem data/hora escondida): `at` chega pela ação
 * para que a junção da digitação seja determinística em teste.
 */
export const HISTORY_LIMIT = 50;
export const COALESCE_MS = 800;

/** Conteúdo do construtor: é o que vai para o banco, sem histórico nem foco. */
export interface SegmentBuilderContent {
  name: string;
  description: string;
  rules: SegmentRules;
}

export interface SegmentBuilderState extends SegmentBuilderContent {
  /** Grupo que recebe o clique/arraste do catálogo de filtros. */
  activeGroupId: string | null;
  /** Conteúdo carregado — base para saber se há alteração pendente. */
  baseline: SegmentBuilderContent;
  past: SegmentBuilderContent[];
  future: SegmentBuilderContent[];
  lastEditKey: string | null;
  lastEditAt: number;
}

export type SegmentBuilderAction =
  | { type: 'load'; content?: Partial<SegmentBuilderContent> }
  | { type: 'name'; value: string; at?: number }
  | { type: 'description'; value: string; at?: number }
  | { type: 'addGroup'; match: 'and' | 'or'; id?: string }
  | { type: 'removeGroup'; id: string }
  | { type: 'duplicateGroup'; id: string }
  | { type: 'setMatch'; id: string; match: 'and' | 'or' }
  | { type: 'addRule'; groupId: string; rule?: SegmentRule }
  | { type: 'removeRule'; groupId: string; ruleId: string }
  | { type: 'updateRule'; groupId: string; ruleId: string; patch: Partial<SegmentRule>; at?: number }
  | { type: 'clear' }
  | { type: 'activateGroup'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Condição a partir de um campo do catálogo: mantém o preset que a tela já dava
 * (primeiro operador do tipo do campo e, em campo de opções, o primeiro valor).
 */
export function ruleFromField(field: RuleField): SegmentRule {
  const def = RULE_FIELDS.find((f) => f.value === field);
  const op = (RULE_OPS[def?.kind ?? 'text']?.[0]?.value ?? 'eq') as RuleOp;
  return { id: newId(), field, op, value: def?.options?.[0] ?? '' };
}

export function builderContent(state: SegmentBuilderState): SegmentBuilderContent {
  return { name: state.name, description: state.description, rules: state.rules };
}

/** Mesmo conteúdo? Compara também a ordem das condições (ela é o que o banco grava). */
export function sameContent(a: SegmentBuilderContent, b: SegmentBuilderContent): boolean {
  if (a.name !== b.name || a.description !== b.description) return false;
  const ag = a.rules?.groups ?? [];
  const bg = b.rules?.groups ?? [];
  if (ag.length !== bg.length) return false;
  return ag.every((g, i) => {
    const h = bg[i];
    if (!h || g.id !== h.id || g.match !== h.match || g.rules.length !== h.rules.length) return false;
    return g.rules.every((r, j) => {
      const s = h.rules[j];
      return !!s && r.id === s.id && r.field === s.field && r.op === s.op && r.value === s.value;
    });
  });
}

export function createBuilderState(input: Partial<SegmentBuilderContent> = {}): SegmentBuilderState {
  const content: SegmentBuilderContent = {
    name: input.name ?? '',
    description: input.description ?? '',
    rules: input.rules ?? emptyRules(),
  };
  return {
    ...content,
    activeGroupId: content.rules.groups[content.rules.groups.length - 1]?.id ?? null,
    baseline: content,
    past: [],
    future: [],
    lastEditKey: null,
    lastEditAt: 0,
  };
}

/** Alteração pendente em relação ao que foi carregado (rascunho sujo). */
export function isDirty(state: SegmentBuilderState): boolean {
  return !sameContent(state.baseline, builderContent(state));
}

/** Um passo no histórico: no máximo 50, o mais antigo sai primeiro. */
function pushPast(past: SegmentBuilderContent[], snapshot: SegmentBuilderContent): SegmentBuilderContent[] {
  return [...past, snapshot].slice(-HISTORY_LIMIT);
}

function applyEdit(
  state: SegmentBuilderState,
  next: Partial<SegmentBuilderContent>,
  editKey: string,
  at: number,
): SegmentBuilderState {
  const current = builderContent(state);
  const target: SegmentBuilderContent = { ...current, ...next };
  if (sameContent(current, target)) return state;
  const coalesce = state.lastEditKey === editKey && at - state.lastEditAt <= COALESCE_MS;
  return {
    ...state,
    ...target,
    past: coalesce ? state.past : pushPast(state.past, current),
    future: [],
    lastEditKey: editKey,
    lastEditAt: at,
  };
}

export function segmentBuilderReducer(state: SegmentBuilderState, action: SegmentBuilderAction): SegmentBuilderState {
  switch (action.type) {
    case 'load': {
      const next = createBuilderState({ ...builderContent(state), ...action.content });
      return next;
    }
    case 'name':
      return applyEdit(state, { name: action.value }, 'name', action.at ?? Date.now());
    case 'description':
      return applyEdit(state, { description: action.value }, 'description', action.at ?? Date.now());
    case 'addGroup': {
      const id = action.id ?? newId();
      const groups = [...state.rules.groups, { id, match: action.match, rules: [] }];
      return { ...state, rules: { groups }, activeGroupId: id, past: pushPast(state.past, builderContent(state)), future: [], lastEditKey: null, lastEditAt: 0 };
    }
    case 'removeGroup': {
      const kept = state.rules.groups.filter((g) => g.id !== action.id);
      // Nunca fica sem grupo: a tela perde o lugar de adicionar condição.
      const groups = kept.length > 0 ? kept : [{ id: newId(), match: 'and' as const, rules: [] }];
      return {
        ...state,
        rules: { groups },
        activeGroupId: state.activeGroupId === action.id ? null : state.activeGroupId,
        past: pushPast(state.past, builderContent(state)),
        future: [],
        lastEditKey: null,
        lastEditAt: 0,
      };
    }
    case 'duplicateGroup': {
      const source = state.rules.groups.find((g) => g.id === action.id);
      if (!source) return state;
      const copy = {
        id: newId(),
        match: source.match,
        rules: source.rules.map((r) => ({ ...r, id: newId() })),
      };
      const index = state.rules.groups.findIndex((g) => g.id === action.id);
      const groups = [...state.rules.groups];
      groups.splice(index + 1, 0, copy);
      return { ...state, rules: { groups }, activeGroupId: copy.id, past: pushPast(state.past, builderContent(state)), future: [], lastEditKey: null, lastEditAt: 0 };
    }
    case 'setMatch': {
      const groups = state.rules.groups.map((g) => (g.id === action.id ? { ...g, match: action.match } : g));
      return { ...state, rules: { groups }, past: pushPast(state.past, builderContent(state)), future: [], lastEditKey: null, lastEditAt: 0 };
    }
    case 'addRule': {
      const groups = state.rules.groups.map((g) =>
        g.id === action.groupId ? { ...g, rules: [...g.rules, action.rule ?? newRule()] } : g,
      );
      return { ...state, rules: { groups }, activeGroupId: action.groupId, past: pushPast(state.past, builderContent(state)), future: [], lastEditKey: null, lastEditAt: 0 };
    }
    case 'removeRule': {
      const groups = state.rules.groups.map((g) =>
        g.id === action.groupId ? { ...g, rules: g.rules.filter((r) => r.id !== action.ruleId) } : g,
      );
      return { ...state, rules: { groups }, past: pushPast(state.past, builderContent(state)), future: [], lastEditKey: null, lastEditAt: 0 };
    }
    case 'updateRule': {
      const groups = state.rules.groups.map((g) =>
        g.id === action.groupId
          ? { ...g, rules: g.rules.map((r) => (r.id === action.ruleId ? { ...r, ...action.patch } : r)) }
          : g,
      );
      const keys = Object.keys(action.patch).sort().join(',');
      return applyEdit(state, { rules: { groups } }, `rule:${action.groupId}:${action.ruleId}:${keys}`, action.at ?? Date.now());
    }
    case 'clear': {
      // Já sem condição nenhuma: um passo aqui marcaria "alteração pendente"
      // (e o aviso de sair) por uma tela que não mudou.
      if (state.rules.groups.every((g) => g.rules.length === 0)) return state;
      const fresh = emptyRules();
      return {
        ...state,
        rules: fresh,
        activeGroupId: fresh.groups[0]?.id ?? null,
        past: pushPast(state.past, builderContent(state)),
        future: [],
        lastEditKey: null,
        lastEditAt: 0,
      };
    }
    case 'activateGroup':
      return { ...state, activeGroupId: action.id };
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      const future = [...state.future, builderContent(state)].slice(-HISTORY_LIMIT);
      return { ...state, ...previous, past: state.past.slice(0, -1), future, lastEditKey: null, lastEditAt: 0 };
    }
    case 'redo': {
      const next = state.future[state.future.length - 1];
      if (!next) return state;
      const past = pushPast(state.past, builderContent(state));
      return { ...state, ...next, past, future: state.future.slice(0, -1), lastEditKey: null, lastEditAt: 0 };
    }
    default:
      return state;
  }
}
