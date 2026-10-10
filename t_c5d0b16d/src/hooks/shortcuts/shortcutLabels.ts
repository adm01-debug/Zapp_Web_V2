/**
 * Etapa 84 — rótulos de atalhos carregados sob demanda.
 *
 * Este módulo é *eager-safe*: tipos e uma função pura, sem nenhuma string de
 * UI. Os textos dos 7 atalhos de Tarefas vivem em `taskShortcutLabels.ts`, que
 * só é alcançado por `import()` dinâmico — assim eles saem do grafo de entrada
 * (budget `initial-js`) e continuam sendo exibidos no painel de ajuda e na tela
 * de atalhos quando o usuário abre cada um.
 */

/** Rótulo textual de um atalho: o que o usuário lê na lista. */
export interface ShortcutLabel {
  name: string;
  description: string;
}

/** Mínimo que `aplicarRotulos` precisa enxergar de um binding. */
export interface Rotulavel {
  id: string;
  name?: string;
  description?: string;
}

/**
 * Mescla os rótulos carregados nos bindings do registry.
 *
 * Pura e determinística: não altera um atalho que já tem `name` (os 30 atalhos
 * globais continuam com os textos inline) e devolve o próprio array quando os
 * rótulos ainda não chegaram (`null`) — quem chega depois re-renderiza com nome.
 */
export function aplicarRotulos<T extends Rotulavel>(
  shortcuts: T[],
  labels: Record<string, ShortcutLabel> | null,
): T[] {
  if (!labels) return shortcuts;
  return shortcuts.map((shortcut) => {
    if (shortcut.name) return shortcut;
    const label = labels[shortcut.id];
    return label
      ? { ...shortcut, name: label.name, description: label.description }
      : shortcut;
  });
}
