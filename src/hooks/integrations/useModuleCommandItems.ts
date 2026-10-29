import { useMemo, createElement } from 'react';
import type { CommandItem } from '@/components/ui/command-palette-data';
import { useUserRole } from '@/hooks/system/useUserRole';
import { NavigationService } from '@/services/navigation.service';

/**
 * Módulos do produto como comandos de navegação do ⌘K, já filtrados pelo papel e
 * pelas permissões do usuário (mesmo `filterNavItems` da barra lateral): quem não
 * enxerga o módulo no menu também não o encontra na paleta. Escolher o comando
 * leva direto ao módulo (`onNavigate(id)`), sem passar por outra tela, e grava o
 * módulo em `zapp-recent-modules` — o grupo "Recentes" da paleta única.
 */

const RECENT_MODULES_KEY = 'zapp-recent-modules';
const MAX_RECENT_MODULES = 5;

/** Ids de módulo gravados, na ordem mais-recente-primeiro (E17: id morto cai aqui e é descartado na leitura). */
export function getRecentModuleIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_MODULES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Grava o módulo escolhido no topo dos recentes (deduplica, máximo 5). */
export function pushRecentModuleId(moduleId: string): void {
  try {
    const list = getRecentModuleIds().filter((id) => id !== moduleId);
    list.unshift(moduleId);
    localStorage.setItem(RECENT_MODULES_KEY, JSON.stringify(list.slice(0, MAX_RECENT_MODULES)));
  } catch {
    /* ambiente sem localStorage — o recente não persiste, o que não é erro */
  }
}
export function useModuleCommandItems(onNavigate: (view: string) => void): CommandItem[] {
  const { roles, permissions } = useUserRole();

  return useMemo(() => {
    const items = [
      ...NavigationService.getPrimaryNav(),
      ...NavigationService.getGroups().flatMap((g) => g.items),
      ...NavigationService.getAdvancedNav(),
    ];
    const visiveis = NavigationService.filterNavItems(items, roles, permissions);
    const vistos = new Set<string>();

    return visiveis.flatMap((item): CommandItem[] => {
      if (vistos.has(item.id)) return [];
      vistos.add(item.id);
      return [{
        id: `module-${item.id}`,
        title: item.label,
        description: 'Ir para o módulo',
        icon: createElement(item.icon, { className: 'h-4 w-4' }),
        category: 'navigation',
        keywords: [item.id],
        action: () => { pushRecentModuleId(item.id); onNavigate(item.id); },
      }];
    });
  }, [roles, permissions, onNavigate]);
}
