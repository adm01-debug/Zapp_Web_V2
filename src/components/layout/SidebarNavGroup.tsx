import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SidebarNavItem, type NavItemConfig } from './SidebarNavItem';

interface SidebarNavGroupProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: readonly NavItemConfig[];
  currentView: string;
  onViewChange: (v: string) => void;
  defaultOpen?: boolean;
  collapsed?: boolean;
  onToggleFavorite?: (id: string) => void;
  isFavorite?: (id: string) => boolean;
}

export function SidebarNavGroup({ label, icon: GroupIcon, items, currentView, onViewChange, defaultOpen = false, collapsed = true, onToggleFavorite, isFavorite }: SidebarNavGroupProps) {
  const hasActiveItem = items.some(item => item.id === currentView);
  const [isOpen, setIsOpen] = useState(defaultOpen || hasActiveItem);

  useEffect(() => {
    if (hasActiveItem && !isOpen) setIsOpen(true);
  }, [hasActiveItem]);

  const triggerButton = (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        'rounded-lg flex items-center transition-all duration-200 group/trigger',
        collapsed ? 'w-full h-[30px] justify-center gap-0.5' : 'w-full h-[30px] px-2.5 gap-2',
        hasActiveItem
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground'
      )}
      aria-expanded={isOpen}
      aria-label={`${label} — ${isOpen ? 'recolher' : 'expandir'}`}
    >
      <GroupIcon className={cn(
        collapsed ? 'w-[11px] h-[11px]' : 'w-[13px] h-[13px]',
        'shrink-0 transition-colors duration-200'
      )} />
      {!collapsed && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] truncate select-none">
          {label}
        </span>
      )}
      <ChevronRight className={cn(
        'transition-transform duration-250 ease-out shrink-0',
        collapsed ? 'w-[8px] h-[8px]' : 'w-[11px] h-[11px] ml-auto opacity-60 group-hover/trigger:opacity-100',
        isOpen && 'rotate-90'
      )} />
    </button>
  );

  return (
    <div className="flex flex-col w-full border-t border-border/40 first:border-t-0 pt-1.5 mt-0.5 first:mt-0 first:pt-0">
      {collapsed ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="text-xs font-semibold">
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        triggerButton
      )}

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn('flex flex-col w-full overflow-hidden', collapsed && 'items-center')}
            aria-label={label}
          >
            <ul role="list" className={cn(
              'flex flex-col gap-0.5 w-full list-none p-0 m-0 pt-0.5',
              collapsed && 'items-center',
              !collapsed && 'pl-1'
            )}>
              {items.map((item) => (
                <li key={item.id}>
                  <SidebarNavItem
                    item={item}
                    currentView={currentView}
                    onViewChange={onViewChange}
                    collapsed={collapsed}
                    onToggleFavorite={onToggleFavorite}
                    isFavorite={isFavorite?.(item.id)}
                  />
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
