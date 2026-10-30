import { useMemo, useState, type ReactNode } from 'react';
import { TasksUiContext, type TasksDensity, type TasksUi } from './tasksUi';

interface Props {
  children: ReactNode;
  /** Densidade inicial (testes e preferências passam "compact"). */
  initialDensity?: TasksDensity;
}

/**
 * Etapa 069 — provedor do estado de UI do módulo de Tarefas.
 *
 * Envolve a árvore do módulo (`TasksModule`) e é o único lugar que guarda
 * seleção/painel/modal/densidade; as superfícies leem por `useTasksUi()`
 * (`./tasksUi`). O contexto e os hooks ficam no `.ts` irmão de propósito:
 * exportar contexto/hook de arquivo `.tsx` conta dívida NOVA no
 * `react-refresh/only-export-components`, e o lint-ratchet recusa ocorrência
 * nova (mesmo padrão de `workItemLabels.ts`, que saiu do `PriorityChip.tsx`
 * pelo mesmo motivo).
 */
export function TasksUiProvider({ children, initialDensity = 'comfortable' }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [density, setDensity] = useState<TasksDensity>(initialDensity);

  const value = useMemo<TasksUi>(
    () => ({
      selectedId,
      openPanel: (id: string) => setSelectedId(id),
      closePanel: () => setSelectedId(null),
      panelOpen: selectedId !== null,
      modalOpen,
      openModal: () => setModalOpen(true),
      closeModal: () => setModalOpen(false),
      density,
      setDensity,
    }),
    [selectedId, modalOpen, density],
  );

  return <TasksUiContext.Provider value={value}>{children}</TasksUiContext.Provider>;
}
