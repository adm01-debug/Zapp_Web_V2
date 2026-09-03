import { forwardRef, useEffect, useRef } from 'react';
import { LayoutScrollProvider } from '@/contexts/LayoutScrollContext';

interface ViewContainerProps {
  children: React.ReactNode;
  /** Pass true for views that manage their own full-screen layout (inbox, pipeline…) */
  fullScreen?: boolean;
  /** Current view id — trocar de view volta a rolagem para o topo */
  viewId?: string;
}

/**
 * Single scroll owner for all standard views.
 * Views rendered inside must be w-full min-w-0 flat containers — no overflow-y-auto at root.
 */
export const ViewContainer = forwardRef<HTMLDivElement, ViewContainerProps>(
  function ViewContainer({ children, fullScreen, viewId }, _ref) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // O div rolavel sobrevive a troca de view (so o conteudo e remontado),
    // entao sem isto a view nova abre no scrollTop da anterior.
    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [viewId]);

    if (fullScreen) return <>{children}</>;

    return (
      <LayoutScrollProvider value={scrollRef}>
        <div className="flex flex-col h-full w-full min-w-0 flex-1">
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto p-[var(--layout-gutter)]"
          >
            {children}
          </div>
        </div>
      </LayoutScrollProvider>
    );
  }
);
