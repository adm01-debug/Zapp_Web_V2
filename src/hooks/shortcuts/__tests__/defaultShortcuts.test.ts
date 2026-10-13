/**
 * Contrato dos atalhos padrão (`src/hooks/shortcuts/defaultShortcuts.ts`): id único,
 * nenhuma combinação repetida no mesmo escopo (contando `alternateKeys`, que também casam)
 * e vocabulário fechado de categoria/modificador/escopo. O comportamento do registry
 * (escopo valendo só em `?view=tasks|pipeline`) é provado em
 * `src/hooks/__tests__/useGlobalKeyboardShortcuts.test.tsx`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, TASKS_VIEWS } from '../defaultShortcuts';
import type { ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';

const CATEGORIAS = ['chat', 'navigation', 'actions', 'selection'];
const MODIFICADORES = ['ctrlKey', 'shiftKey', 'altKey'] as const;

const grupoDeEscopo = (s: ShortcutBinding) => (s.scope ? s.scope.join(',') : 'global');

/** Assinatura de cada combinação que o registry tenta casar (inclui alternateKeys). */
function combos(s: ShortcutBinding): string[] {
  const mods = MODIFICADORES.filter((m) => s.defaultModifiers[m]).join('+') || 'none';
  return [s.defaultKey, ...(s.alternateKeys ?? [])].map((k) => `${grupoDeEscopo(s)}:${mods}:${k.toLowerCase()}`);
}

describe('identidade dos atalhos', () => {
  it('não tem id repetido', () => {
    const ids = DEFAULT_SHORTCUTS.map((s) => s.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('todo atalho tem tecla padrão utilizável', () => {
    for (const s of DEFAULT_SHORTCUTS) expect(s.defaultKey.trim(), s.id).not.toBe('');
  });

  it('usa só categorias e modificadores do vocabulário', () => {
    for (const s of DEFAULT_SHORTCUTS) {
      expect(CATEGORIAS, s.id).toContain(s.category);
      for (const chave of Object.keys(s.defaultModifiers)) {
        expect(MODIFICADORES as readonly string[], `${s.id}.${chave}`).toContain(chave);
      }
    }
  });

  it('só o módulo de Tarefas usa escopo, e o escopo é o declarado', () => {
    for (const s of DEFAULT_SHORTCUTS) {
      if (!s.scope) continue;
      expect(s.scope, s.id).toEqual([...TASKS_VIEWS]);
    }
  });
});

describe('atalhos anunciados têm tratador (t_8e895114)', () => {
  it('a lista global é exatamente a dos atalhos que têm ação', () => {
    // O painel de ajuda da inbox e a tela de configurações mostram esta lista
    // como verdade. Cada id abaixo tem tratador:
    //   `global-search`, `open-tasks-tab`, `show-shortcuts-help`, `toggle-sidebar`,
    //   `go-to-inbox`, `go-to-dashboard`, `refresh-data` e `transfer-chat` em
    //   `defaultActions` de useGlobalKeyboardShortcuts (testado lá);
    //   `send-message` (Ctrl+Enter) e `clear-selection` (Escape) nos listeners
    //   do compositor (ChatPanel) e da lista (RealtimeInboxView).
    // Um atalho novo aqui sem tratador quebra este teste de propósito.
    const anunciados = DEFAULT_SHORTCUTS.filter((s) => !s.scope)
      .map((s) => s.id)
      .sort();
    expect(anunciados).toEqual([
      'clear-selection',
      'global-search',
      'go-to-dashboard',
      'go-to-inbox',
      'open-tasks-tab',
      'refresh-data',
      'send-message',
      'show-shortcuts-help',
      'toggle-sidebar',
      'transfer-chat',
    ]);
  });
});

describe('conflitos de combinação dentro do mesmo escopo', () => {
  it('nenhuma combinação (tecla + modificadores + escopo) se repete', () => {
    const donos = new Map<string, string>();
    const conflitos: string[] = [];
    for (const s of DEFAULT_SHORTCUTS) {
      for (const combo of combos(s)) {
        const dono = donos.get(combo);
        if (dono) conflitos.push(`${combo} → ${dono} e ${s.id}`);
        else donos.set(combo, s.id);
      }
    }
    expect(conflitos, `combinações em conflito:\n${conflitos.join('\n')}`).toEqual([]);
  });

  it('o escopo é o que separa combos iguais entre o global e o módulo de Tarefas', () => {
    // O módulo de Tarefas é o único dono das teclas PURAS (n, 1, 2, 3, /, e, x,
    // Delete, ?); os globais usam Ctrl/Alt — só `clear-selection` (Escape) fica
    // sem modificador. Antes de t_8e895114 havia colisão de `none:/` e
    // `none:delete` com o módulo; com os atalhos anunciados sem ação fora da
    // lista, a invariante passou a ser "nenhum combo compartilhado" — se um
    // global voltar a ocupar uma tecla pura do módulo, este teste acusa.
    const semGrupo = (s: ShortcutBinding) => combos(s).map((c) => c.split(':').slice(1).join(':'));
    const globais = new Set(DEFAULT_SHORTCUTS.filter((s) => !s.scope).flatMap(semGrupo));
    const compartilhadas = DEFAULT_SHORTCUTS.filter((s) => s.scope)
      .flatMap(semGrupo)
      .filter((c) => globais.has(c));
    expect([...new Set(compartilhadas)].sort()).toEqual([]);
  });
});
