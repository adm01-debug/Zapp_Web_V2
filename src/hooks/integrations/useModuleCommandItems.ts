import { useMemo, createElement } from 'react';
import type { CommandItem } from '@/components/ui/command-palette-data';
import { useUserRole } from '@/hooks/system/useUserRole';
import { NavigationService } from '@/services/navigation.service';

/**
 * Módulos do produto como comandos de navegação do ⌘K, já filtrados pelo papel e
 * pelas permissões do usuário (mesmo `filterNavItems` da barra lateral): quem não
 * enxerga o módulo no menu também não o encontra na paleta. Escolher o comando
 * leva direto ao módulo (`onNavigate(id)`), sem passar por outra tela.
 */
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
        action: () => onNavigate(item.id),
      }];
    });
  }, [roles, permissions, onNavigate]);
}
