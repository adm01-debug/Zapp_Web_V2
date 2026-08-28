import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePrefetchOnHover } from '@/hooks/ui/usePrefetchOnHover';

export interface NavItemConfig {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  badge?: number;
}

const SHORTCUT_MAP: Record<string, string> = {
  inbox: '⌘1',
  dashboard: '⌘2',
};

interface SidebarNavItemProps {
  item: NavItemConfig;
  currentView: string;
  onViewChange: (v: string) => void;
  badge?: number;
  collapsed?: boolean;
  onToggleFavorite?: (id: string) => void;
  isFavorite?: boolean;
}

export const SidebarNavItem = React.memo(function SidebarNavItem({ item, currentView, onViewChange, badge, collapsed = true, onToggleFavorite, isFavorite }: SidebarNavItemProps) {
  const Icon = item.icon;
  const isActive = currentView === item.id;
  const shortcut = item.shortcut || SHORTCUT_MAP[item.id];
  const badgeCount = badge ?? item.badge;
  const { prefetch } = usePrefetchOnHover();

  const handleMouseEnter = useCallback(() => {
    if (!isActive) prefetch(item.id);
  }, [isActive, item.id, prefetch]);

  const button = (
    <button
      data-tour={item.id}
      onClick={() => onViewChange(item.id)}
      onMouseEnter={handleMouseEnter}
      aria-label={badgeCount ? `${item.label} (${badgeCount} não lidas)` : item.label}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative rounded-full flex items-center gap-2.5 transition-all duration-200 ease-out group/item',
        collapsed ? 'w-[38px] h-[38px] justify-center' : 'w-full h-[36px] px-3 rounded-xl',
        isActive
          ? 'text-secondary-foreground'
          : 'text-sidebar-foreground/80 hover:bg-muted/60 hover:text-foreground active:scale-[0.97]'
      )}
    >
      {isActive && (
        <>
          <div
            className={cn(
              'absolute inset-0 bg-secondary/20 border border-secondary/30 shadow-glow-secondary-sm transition-all duration-300 ease-out',
              collapsed ? 'rounded-full' : 'rounded-xl'
            )}
          />
          {/* Active indicator bar — highly visible in collapsed mode */}
          <div className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-primary transition-all duration-200',
            collapsed ? 'h-5 -left-[11px]' : 'h-4 -left-[8px]'
          )} />
        </>
      )}
      <Icon className={cn(
        'w-[18px] h-[18px] relative z-10 shrink-0 transition-transform duration-150',
        !isActive && 'group-hover/item:scale-110'
      )} />
      {!collapsed && (
        <span className="relative z-10 text-[13px] font-medium truncate">{item.label}</span>
      )}
      {!collapsed && onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id); }}
          className={cn(
            'relative z-20 ml-auto w-5 h-5 rounded flex items-center justify-center transition-all opacity-0 group-hover/item:opacity-100',
            isFavorite ? 'opacity-100 text-warning' : 'text-muted-foreground hover:text-warning'
          )}
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        >
          <Star className={cn('w-3 h-3', isFavorite && 'fill-warning')} />
        </button>
      )}
      {badgeCount != null && badgeCount > 0 && (
        <span
          className={cn(
            'z-20 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none shadow-sm animate-scale-in',
            collapsed ? 'absolute -top-0.5 -right-0.5' : 'relative',
            !collapsed && !onToggleFavorite && 'ml-auto'
          )}
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="bg-popover border-border text-xs font-medium flex items-center gap-2">
          <span>{item.label}</span>
          {shortcut && (
            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
});
