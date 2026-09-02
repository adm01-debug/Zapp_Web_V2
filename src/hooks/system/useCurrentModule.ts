import { useMemo } from 'react';
import { primaryNav, communicationNav, automationNav, salesNav, connectionsNav, analyticsNav, systemNav, inDevelopmentNav } from '@/components/layout/sidebarNavConfig';
import type { NavItemConfig } from '@/components/layout/SidebarNavItem';

const allGroups: { label: string; items: readonly NavItemConfig[] }[] = [
  { label: '', items: primaryNav },
  { label: 'Comunicação', items: communicationNav },
  { label: 'Automação & IA', items: automationNav },
  { label: 'Vendas & CRM', items: salesNav },
  { label: 'Conexões', items: connectionsNav },
  { label: 'Analytics', items: analyticsNav },
  { label: 'Sistema', items: systemNav }, { label: 'Em Desenvolvimento', items: inDevelopmentNav },
];

export function useCurrentModule(viewId: string) {
  return useMemo(() => {
    for (const group of allGroups) {
      const item = group.items.find((i) => i.id === viewId);
      if (item) {
        return {
          id: item.id,
          label: item.label,
          icon: item.icon,
          group: group.label || null,
        };
      }
    }
    return { id: viewId, label: viewId, icon: null, group: null };
  }, [viewId]);
}
