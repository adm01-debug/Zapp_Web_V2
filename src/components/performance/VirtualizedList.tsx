import React, { useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number, virtualItem: VirtualItem) => React.ReactNode;
  estimateSize?: number | ((index: number) => number);
  overscan?: number;
  className?: string;
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;
  isLoading?: boolean;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  gap?: number;
  horizontal?: boolean;
  getItemKey?: (index: number, item: T) => string | number;
}

export interface VirtualizedListRef {
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

function VirtualizedListInner<T>(
  {
    items,
    renderItem,
    estimateSize = 60,
    overscan = 5,
    className,
    emptyState,
    loadingState,
    isLoading = false,
    onEndReached,
    endReachedThreshold = 0.8,
    gap = 0,
    horizontal = false,
    getItemKey,
  }: VirtualizedListProps<T>,
  ref: React.Ref<VirtualizedListRef>
) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: typeof estimateSize === 'function' ? estimateSize : () => estimateSize,
    overscan,
    horizontal,
    getItemKey: getItemKey ? (index) => getItemKey(index, items[index]) : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Handle infinite scroll
  const handleScroll = useCallback(() => {
    if (!onEndReached || !parentRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    if (scrollPercentage >= endReachedThreshold) {
      onEndReached();
    }
  }, [onEndReached, endReachedThreshold]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number, options) => {
      virtualizer.scrollToIndex(index, options);
    },
    scrollToTop: () => {
      parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    scrollToBottom: () => {
      virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
    },
  }), [virtualizer, items.length]);

  // Empty state
  if (!isLoading && items.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        {emptyState || (
          <p className="text-muted-foreground text-sm">Nenhum item encontrado</p>
        )}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn(
        'overflow-auto',
        horizontal ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden',
        className
      )}
      onScroll={handleScroll}
    >
      <div
        style={{
          [horizontal ? 'width' : 'height']: `${virtualizer.getTotalSize()}px`,
          [horizontal ? 'height' : 'width']: '100%',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="popLayout">
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];
            
            return (
              <motion.div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  [horizontal ? 'width' : 'height']: `${virtualItem.size}px`,
                  transform: horizontal
                    ? `translateX(${virtualItem.start}px)`
                    : `translateY(${virtualItem.start}px)`,
                  ...(gap > 0 && { paddingBottom: `${gap}px` }),
                }}
              >
                {renderItem(item, virtualItem.index, virtualItem)}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Loading indicator for infinite scroll */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-4"
        >
          {loadingState || (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListRef> }
) => React.ReactElement;

// Grid variant
interface VirtualizedGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  columns: number;
  rowHeight: number;
  gap?: number;
  className?: string;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  onEndReached?: () => void;
}

export function VirtualizedGrid<T>({
  items,
  renderItem,
  columns,
  rowHeight,
  gap = 16,
  className,
  emptyState,
  isLoading,
  onEndReached,
}: VirtualizedGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      result.push(items.slice(i, i + columns));
    }
    return result;
  }, [items, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan: 2,
  });

  if (!isLoading && items.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        {emptyState}
      </div>
    );
  }

  return (
    <div ref={parentRef} className={cn('overflow-auto', className)}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${columns}, 1fr)`,
                  gap: `${gap}px`,
                }}
              >
                {row.map((item, colIndex) => (
                  <motion.div
                    key={colIndex}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: colIndex * 0.05 }}
                  >
                    {renderItem(item, virtualRow.index * columns + colIndex)}
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
