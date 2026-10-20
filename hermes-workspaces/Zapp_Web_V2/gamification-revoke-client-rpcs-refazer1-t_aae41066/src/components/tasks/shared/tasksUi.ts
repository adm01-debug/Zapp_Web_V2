import { createContext, useContext } from 'react';

/** Densidade de exibição das superfícies do módulo (D2: Confortável / Compacta). */
export type TasksDensity = 'comfortable' | 'compact';

/**
 * O estado de UI do módulo de Tarefas num lugar só: qual item está
 * selecionado, se o painel (Sheet) está aberto, se o modal de criação está
 * aberto e a densidade.
 *
 * Existe para Lista, Quadro, Agenda, painel e modal lerem o MESMO estado, sem
 * cada nova superfície reabrir `TasksModule.tsx` para acrescentar mais uma
 * `useState`. O provider (componente) mora em `TasksUiContext.tsx`.
 */
export interface TasksUi {
  selectedId: string | null;
  openPanel: (id: string) => void;
  closePanel: () => void;
  /** Derivado de `selectedId !== null` — painel aberto é painel com item. */
  panelOpen: boolean;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  density: TasksDensity;
  setDensity: (density: TasksDensity) => void;
}

export const TasksUiContext = createContext<TasksUi | null>(null);

/** Lê o estado de UI. Fora do provider, falha alto em vez de entregar `null`. */
export function useTasksUi(): TasksUi {
  const ctx = useContext(TasksUiContext);
  if (!ctx) throw new Error('useTasksUi precisa de <TasksUiProvider> acima.');
  return ctx;
}

/** Como `useTasksUi`, mas devolve `null` fora do provider (uso opcional). */
export function useTasksUiOptional(): TasksUi | null {
  return useContext(TasksUiContext);
}
