import type { ShortcutLabel } from './shortcutLabels';

/**
 * Etapa 84 — rótulos dos 7 atalhos do módulo de Tarefas (etapa 77).
 *
 * ATENÇÃO: este arquivo é carregado SOMENTE por `import()` dinâmico (ver
 * `useTaskShortcutLabels`). Ele existe fora do grafo de entrada justamente para
 * que estes textos não pesem no `initial-js`: o binding (tecla, modificadores,
 * categoria, escopo) continua eager em `defaultShortcuts.ts`; só o `name` e a
 * `description` moram aqui.
 *
 * O teste `useTaskShortcutLabels.test.tsx` amarra os dois lados: todo atalho
 * com escopo de Tarefas precisa ter rótulo aqui, e nenhum deles pode voltar a
 * ter `name`/`description` inline.
 */
export const TASK_SHORTCUT_LABELS: Record<string, ShortcutLabel> = {
  'tasks-focus-quickadd': { name: 'Nova tarefa', description: 'Foca o campo de nova tarefa' },
  'tasks-mode': { name: 'Modo das Tarefas', description: 'Troca o modo: Lista (1), Quadro (2), Agenda (3)' },
  'tasks-search': { name: 'Buscar tarefa', description: 'Foca o campo de busca das Tarefas' },
  'tasks-open-sheet': { name: 'Abrir tarefa focada', description: 'Abre o painel da tarefa em foco' },
  'tasks-complete': { name: 'Concluir tarefa focada', description: 'Conclui — ou reabre — a tarefa em foco' },
  'tasks-cancel': { name: 'Cancelar tarefa focada', description: 'Cancela a tarefa em foco, com desfazer' },
  'tasks-help': { name: 'Ajuda de atalhos', description: 'Mostra o painel de atalhos' },
};
