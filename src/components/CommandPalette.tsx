import { useState, useCallback, useMemo } from 'react';
import { Clock } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
 import { sidebarGroups, primaryNav, advancedNav } from '@/components/layout/sidebarNavConfig';
 import { useUserRole } from '@/hooks/system/useUserRole';
 import { NavigationService } from '@/services/navigation.service';
import type { NavItemConfig } from '@/components/layout/SidebarNavItem';

interface CommandPaletteProps {
  onNavigate: (view: string) => void;
}

const RECENT_KEY = 'zapp-recent-modules';
const MAX_RECENT = 5;

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function pushRecent(id: string) {
  const list = getRecent().filter(r => r !== id);
  list.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

 export function CommandPalette({ onNavigate }: CommandPaletteProps) {
   const { roles, permissions } = useUserRole();
 
   const filteredGroups = useMemo(() => {
     const groups = [
       { label: 'Principal', items: primaryNav },
       ...sidebarGroups,
       { label: 'Avançado', items: advancedNav },
     ];
     return groups.map(g => ({
       ...g,
       items: NavigationService.filterNavItems(g.items, roles, permissions)
     })).filter(g => g.items.length > 0);
   }, [roles, permissions]);
 
   const allItems = useMemo(() => filteredGroups.flatMap(g => g.items), [filteredGroups]);
 
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  // R2-INF-035: o estado da paleta e o Ctrl/Cmd+K passaram a ser do
  // GlobalKeyboardProvider (dono único). Os dois ouvintes que existiam aqui — o
  // `keydown` próprio e o `open-global-search` — abriam ESTA paleta de módulos em
  // paralelo à paleta rica (`ui/command-palette`), cada uma por um caminho
  // diferente do mesmo atalho. Sem eles este componente não abre mais sozinho; as
  // telas principais seguem na paleta rica (`defaultNavigationCommands`).
  const handleOpenChange = (next: boolean) => {
    if (next) setRecent(getRecent());
    setOpen(next);
  };

   const recentItems = useMemo(
     () => recent.map(id => allItems.find(i => i.id === id)).filter((i): i is NonNullable<typeof i> => Boolean(i)),
     [recent, allItems]
   );

  const select = (id: string) => {
    pushRecent(id);
    onNavigate(id);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Buscar módulo… (ex: tarefas, chatbot)" />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>Nenhum módulo encontrado.</CommandEmpty>

        {recentItems.length > 0 && (
          <>
            <CommandGroup heading="Recentes">
              {recentItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem key={`recent-${item.id}`} onSelect={() => select(item.id)} className="gap-2 cursor-pointer">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

         {filteredGroups.map((group, i) => (
          <div key={group.label}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group.label}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem key={item.id} onSelect={() => select(item.id)} className="gap-2 cursor-pointer">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-3xs text-muted-foreground font-mono">#{item.id}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
