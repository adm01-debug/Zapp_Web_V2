import { WorkItemCardSkeleton } from './WorkItemCardSkeleton';

/**
 * Etapa 53: esqueleto de carregamento da coluna do Quadro — três cartões
 * enquanto o `useMyWorkItems` responde, no lugar de dois montados ad hoc.
 */
export function BoardColumnSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 3 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}
    </div>
  );
}
