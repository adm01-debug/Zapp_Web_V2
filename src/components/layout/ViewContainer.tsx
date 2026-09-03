import { forwardRef } from 'react';
import { LayoutScrollProvider } from '@/contexts/LayoutScrollContext';
import { useRef } from 'react';

interface ViewContainerProps {
  children: React.ReactNode;
  /** Pass true for views that manage their own full-screen layout (inbox, pipeline…) */
  fullScreen?: boolean;
}

/**
 * Single scroll owner for all standard views.
 * Views rendered inside must be w-full min-w-0 flat containers — no overflow-y-auto at root.
 */
export const ViewContainer = forwardRef<HTMLDivElement, ViewContainerProps>(
  function ViewContainer({ children, fullScreen }, _ref) {
    const scrollRef = useRef<HTMLDivElement>(null);

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
