import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Search, Moon, Sun, PanelLeftClose, PanelLeftOpen, Star } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/ui/useTheme';
import { useSidebarCollapse } from '@/hooks/ui/useSidebarCollapse';
import { useSidebarFavorites } from '@/hooks/ui/useSidebarFavorites';
import { PushNotificationToggle } from '@/components/notifications/PushNotificationToggle';
import { ScreenProtectionToggle } from '@/components/notifications/ScreenProtectionToggle';
import { SoundMuteToggle } from '@/components/notifications/SoundMuteToggle';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarNavGroup } from './SidebarNavGroup';
import { AgentProfilePopover } from './AgentProfilePopover';
 import { primaryNav, sidebarGroups, advancedNav } from './sidebarNavConfig';
 import { useUserRole } from '@/hooks/system/useUserRole';
 import { NavigationService } from '@/services/navigation.service';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  currentAgent?: { name: string; avatar?: string; status: 'online' | 'away' | 'offline' };
  onLogout?: () => void;
  inboxBadge?: number;
  onStatusChange?: (status: 'online' | 'away' | 'offline') => void;
}

export const Sidebar = React.memo(function Sidebar({ 
  currentView, 
  onViewChange, 
  currentAgent, 
  onLogout, 
  inboxBadge, 
  onStatusChange 
}: SidebarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [statusOpen, setStatusOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapse();
   const { favorites, toggleFavorite, isFavorite } = useSidebarFavorites();
   const { roles } = useUserRole();
 
   const filteredPrimaryNav = useMemo(() => 
     NavigationService.filterNavItems(primaryNav as any, roles),
     [roles]
   );

   const filteredGroups = useMemo(() => 
     sidebarGroups.map(group => ({
       ...group,
       items: NavigationService.filterNavItems(group.items as any, roles)
     })).filter(group => group.items.length > 0),
     [roles]
   );
 
   const allNavItems = useMemo(() => 
     [...primaryNav, ...sidebarGroups.flatMap(g => g.items), ...advancedNav],
     []
   );

   const favoriteItems = useMemo(() => 
     favorites.map(id => allNavItems.find(item => item.id === id)).filter(Boolean) as typeof allNavItems,
     [favorites, allNavItems]
   );

  return (
    <aside id="main-navigation" role="navigation" aria-label="Menu de navegação principal"
      className={cn('flex flex-col h-screen border-r border-border bg-sidebar shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden', collapsed ? 'w-[62px]' : 'w-[220px]')}>

      {/* Logo + Toggle */}
      <div className={cn('flex items-center h-[56px] shrink-0 px-3', collapsed ? 'justify-center' : 'justify-between')}>
        <button onClick={() => onViewChange('inbox')} className="w-[36px] h-[36px] rounded-xl flex items-center justify-center bg-primary hover:bg-primary/90 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none" aria-label="ZAPP — Ir para Inbox">
          <span className="text-primary-foreground font-bold text-sm tracking-tight">Z</span>
        </button>
        {!collapsed && <span className="text-sm font-bold text-foreground tracking-tight ml-2 mr-auto">ZAPP</span>}
        {!collapsed && (
          <Tooltip delayDuration={200}><TooltipTrigger asChild>
            <button onClick={toggle} className="w-[28px] h-[28px] rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none" aria-label="Recolher menu">
              <PanelLeftClose className="w-[15px] h-[15px]" />
            </button>
          </TooltipTrigger><TooltipContent side="right" sideOffset={8} className="text-xs">Recolher <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">⌘B</kbd></TooltipContent></Tooltip>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center my-1">
          <Tooltip delayDuration={200}><TooltipTrigger asChild>
            <button onClick={toggle} className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all border border-border/40 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none" aria-label="Expandir menu">
              <PanelLeftOpen className="w-[16px] h-[16px]" />
            </button>
          </TooltipTrigger><TooltipContent side="right" sideOffset={8} className="text-xs">Expandir <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">⌘B</kbd></TooltipContent></Tooltip>
        </div>
      )}

       <nav className={cn('flex flex-col gap-0.5', collapsed ? 'items-center px-[11px]' : 'px-2')} aria-label="Menu principal">
         <ul role="list" className={cn('flex flex-col gap-0.5 w-full list-none p-0 m-0', collapsed && 'items-center')}>
           {filteredPrimaryNav.map((item) => (
             <li key={item.id}>
               <SidebarNavItem
                 item={item as any}
                 currentView={currentView}
                 onViewChange={onViewChange}
                 badge={item.id === 'inbox' ? inboxBadge : undefined}
                 collapsed={collapsed}
               />
             </li>
           ))}
         </ul>
       </nav>

      {/* Search */}
      <div className={cn('flex my-1.5', collapsed ? 'justify-center px-[11px]' : 'px-2')}>
        <Tooltip delayDuration={200}><TooltipTrigger asChild>
          <button onClick={() => document.dispatchEvent(new CustomEvent('open-global-search'))}
            className={cn('rounded-lg flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all border border-dashed border-border/60 hover:border-border', collapsed ? 'w-[40px] h-[30px] justify-center' : 'w-full h-[32px] px-3')} aria-label="Buscar módulo (Ctrl+K)">
            <Search className="w-[14px] h-[14px] shrink-0" />
            {!collapsed && <span className="text-xs text-muted-foreground">Buscar...</span>}
            {!collapsed && <kbd className="ml-auto px-1 py-0.5 rounded bg-muted text-[9px] font-mono text-muted-foreground">⌘K</kbd>}
          </button>
        </TooltipTrigger>{collapsed && <TooltipContent side="right" sideOffset={8} className="text-xs">Buscar <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">⌘K</kbd></TooltipContent>}</Tooltip>
      </div>

      {/* Favorites */}
      {favoriteItems.length > 0 && (
        <>
          <div className={cn('mx-3 h-px bg-border', collapsed ? 'my-1' : 'my-1.5')} />
          {!collapsed && <div className="px-3 flex items-center gap-1.5"><Star className="w-[10px] h-[10px] text-warning fill-warning" /><span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Favoritos</span></div>}
          <nav className={cn('flex flex-col gap-0.5', collapsed ? 'items-center px-[11px]' : 'px-2')} aria-label="Favoritos">
            <ul role="list" className={cn('flex flex-col gap-0.5 w-full list-none p-0 m-0', collapsed && 'items-center')}>
              {favoriteItems.map((item) => <li key={item.id}><SidebarNavItem item={item} currentView={currentView} onViewChange={onViewChange} collapsed={collapsed} /></li>)}
            </ul>
          </nav>
        </>
      )}

      <div className={cn('mx-3 h-px bg-border', collapsed ? 'my-1' : 'my-1.5')} />

       <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scroll-smooth [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-primary/50">
         <div className={cn('flex flex-col gap-1.5 py-1', collapsed ? 'items-center px-[11px]' : 'px-2')}>
           {filteredGroups.map((group) => (
             <SidebarNavGroup
               key={group.label}
               label={group.label}
               icon={group.icon}
               items={group.items as any}
               currentView={currentView}
               onViewChange={onViewChange}
               collapsed={collapsed}
               onToggleFavorite={toggleFavorite}
               isFavorite={isFavorite}
             />
           ))}
         </div>
       </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-1.5 pt-1.5 pb-3 shrink-0">
        <div className="mx-3 h-px bg-border self-stretch" />
        {!collapsed && <div className="px-3 self-stretch flex items-center gap-1.5 pb-0.5"><span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Controles rápidos</span></div>}
        <div className={cn('flex items-center gap-1 rounded-xl border border-border bg-muted/50 px-1.5 py-1.5 shadow-sm', collapsed ? 'flex-col' : 'flex-row self-stretch mx-2')}>
          <ScreenProtectionToggle className="w-[36px] h-[36px]" />
          <PushNotificationToggle className="w-[36px] h-[36px]" />
          <SoundMuteToggle className="w-[36px] h-[36px]" />
          <Tooltip delayDuration={200}><TooltipTrigger asChild>
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={cn("w-[36px] h-[36px] rounded-lg flex items-center justify-center transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none", isDark && "text-primary")} aria-label={isDark ? 'Modo claro' : 'Modo escuro'}>
              {isDark ? <Sun className="w-[16px] h-[16px]" /> : <Moon className="w-[16px] h-[16px]" />}
            </button>
          </TooltipTrigger><TooltipContent side="right" sideOffset={8} className="text-xs">{isDark ? 'Modo claro' : 'Modo escuro'}</TooltipContent></Tooltip>
        </div>

        {currentAgent && <AgentProfilePopover agent={currentAgent} collapsed={collapsed} statusOpen={statusOpen} onStatusOpenChange={setStatusOpen} onStatusChange={onStatusChange} onViewChange={onViewChange} onLogout={onLogout} />}
      </div>
    </aside>
  );
});
